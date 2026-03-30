'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Copy,
  CreditCard,
  FileCheck2,
  FileUp,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import { usePublicSiteConfig } from '@/components/public-site-provider';
import { PublicSiteConfig } from '@/config/public-site';
import {
  downloadPaymentProofRequest,
  listMyInvoicesRequest,
  listMyPaymentsRequest,
  mockPayInvoiceRequest,
  myCustomerProfileRequest,
  submitManualPaymentRequest,
} from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/utils';
import { CustomerRecord, InvoiceRecord, PaymentRecord, StatCardItem } from '@/types';

type PaymentRail = PublicSiteConfig['payments']['manual']['rails'][number];

type ResolvedPaymentRail = PaymentRail & {
  channelKey: string;
  isEnabledResolved: boolean;
  isDefaultResolved: boolean;
  sortOrderResolved: number;
};

const customerCheckoutEnabled =
  process.env.NEXT_PUBLIC_ENABLE_CUSTOMER_MOCK_PAYMENT === 'true';

function resolvePaymentChannelKey(rail: PaymentRail) {
  if (rail.key?.trim()) {
    return rail.key.trim().toUpperCase();
  }

  const source = `${rail.label || ''} ${rail.providerName || ''}`.toLowerCase();

  if (source.includes('momo')) {
    return 'MOMO_QR';
  }

  if (source.includes('vnpay')) {
    return 'VNPAY_QR';
  }

  return 'BANK_TRANSFER';
}

function normalizePaymentRails(rails: PaymentRail[] = []) {
  return [...rails]
    .map<ResolvedPaymentRail>((rail, index) => ({
      ...rail,
      channelKey: resolvePaymentChannelKey(rail),
      isEnabledResolved: rail.isEnabled ?? true,
      isDefaultResolved: rail.isDefault ?? index === 0,
      sortOrderResolved: rail.sortOrder ?? index + 1,
    }))
    .filter((rail) => rail.isEnabledResolved)
    .sort((left, right) => left.sortOrderResolved - right.sortOrderResolved);
}

function gatewayLabel(value?: string | null) {
  if (!value) {
    return '-';
  }

  if (value === 'MANUAL') {
    return 'Đối soát thủ công';
  }

  if (value === 'MOCK') {
    return 'Sandbox nội bộ';
  }

  return value;
}

function paymentMethodLabel(method: string | null | undefined, rails: ResolvedPaymentRail[]) {
  if (!method) {
    return '-';
  }

  return (
    rails.find((item) => item.channelKey === method)?.label ||
    {
      BANK_TRANSFER: 'Chuyển khoản ngân hàng',
      MOMO_QR: 'Ví MoMo',
      VNPAY_QR: 'QR VNPay',
    }[method] ||
    method
  );
}

function paymentStatusLabel(status: PaymentRecord['status']) {
  if (status === 'SUCCESS') {
    return 'Đã xác nhận';
  }

  if (status === 'FAILED') {
    return 'Từ chối';
  }

  if (status === 'REFUNDED') {
    return 'Hoàn tiền';
  }

  return 'Chờ xác nhận';
}

function buildTransferNote(
  template: string,
  invoice: InvoiceRecord | null,
  customerCode?: string | null,
) {
  return template
    .replaceAll('{{invoiceNumber}}', invoice?.invoiceNumber || '')
    .replaceAll('{{customerCode}}', customerCode || '')
    .trim();
}

function buildVietQrUrl({
  rail,
  amount,
  note,
}: {
  rail: ResolvedPaymentRail | null;
  amount: number;
  note: string;
}) {
  if (!rail?.supportsVietQr || !rail.vietQrBankId || !rail.accountNumber || amount <= 0) {
    return '';
  }

  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
    addInfo: note,
    accountName: rail.accountName || '',
  });

  return `https://img.vietqr.io/image/${rail.vietQrBankId}-${rail.accountNumber}-compact2.png?${params.toString()}`;
}

function invoiceOutstanding(invoice: InvoiceRecord | null) {
  if (!invoice) {
    return 0;
  }

  return Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0);
}

function formatReading(value?: number | null) {
  return value != null ? value.toLocaleString('vi-VN') : 'Chưa áp dụng đo chỉ số';
}

function formatUsage(value?: number | null) {
  return value != null ? formatNumber(value, 'kWh') : 'Chưa cập nhật';
}

function nearestDueInvoice(invoices: InvoiceRecord[]) {
  return (
    [...invoices].sort(
      (left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
    )[0] || null
  );
}

export default function CustomerPaymentsPage() {
  const { siteConfig } = usePublicSiteConfig();
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [profile, setProfile] = useState<CustomerRecord | null>(null);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState('');
  const [submittingProof, setSubmittingProof] = useState(false);
  const [proofLoadingId, setProofLoadingId] = useState('');
  const [copiedValue, setCopiedValue] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const paymentRails = useMemo(
    () => normalizePaymentRails(siteConfig.payments.manual.rails || []),
    [siteConfig.payments.manual.rails],
  );

  async function loadData() {
    const [nextInvoices, nextPayments, nextProfile] = await Promise.all([
      listMyInvoicesRequest(),
      listMyPaymentsRequest(),
      myCustomerProfileRequest(),
    ]);

    setInvoices(nextInvoices);
    setPayments(nextPayments);
    setProfile(nextProfile);
    setLoading(false);
  }

  useEffect(() => {
    loadData().catch((requestError) => {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tải dữ liệu thanh toán.',
      );
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!paymentRails.length) {
      setSelectedMethod('');
      return;
    }

    const nextDefault =
      paymentRails.find((rail) => rail.isDefaultResolved) || paymentRails[0];

    setSelectedMethod((current) =>
      paymentRails.some((rail) => rail.channelKey === current)
        ? current
        : nextDefault.channelKey,
    );
  }, [paymentRails]);

  const unpaidInvoices = useMemo(
    () => invoices.filter((invoice) => !['PAID', 'CANCELLED'].includes(invoice.status)),
    [invoices],
  );

  const invoiceLookup = useMemo(
    () => new Map(invoices.map((invoice) => [invoice.id, invoice])),
    [invoices],
  );

  const nearestOpenInvoice = useMemo(() => nearestDueInvoice(unpaidInvoices), [unpaidInvoices]);

  const selectedInvoice = useMemo(
    () =>
      unpaidInvoices.find((invoice) => invoice.id === selectedInvoiceId) ||
      nearestOpenInvoice ||
      null,
    [nearestOpenInvoice, selectedInvoiceId, unpaidInvoices],
  );

  const selectedRail = useMemo(
    () =>
      paymentRails.find((rail) => rail.channelKey === selectedMethod) ||
      paymentRails[0] ||
      null,
    [paymentRails, selectedMethod],
  );

  useEffect(() => {
    if (!selectedInvoice) {
      setSelectedInvoiceId('');
      setManualAmount('');
      return;
    }

    if (selectedInvoice.id !== selectedInvoiceId) {
      setSelectedInvoiceId(selectedInvoice.id);
    }

    setManualAmount(String(invoiceOutstanding(selectedInvoice)));
  }, [selectedInvoice, selectedInvoiceId]);

  const transferNote = useMemo(
    () =>
      selectedRail
        ? buildTransferNote(
            selectedRail.noteTemplate,
            selectedInvoice,
            profile?.customerCode || '',
          )
        : '',
    [profile?.customerCode, selectedInvoice, selectedRail],
  );

  const manualAmountNumber = useMemo(() => {
    const parsed = Number(manualAmount || 0);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : invoiceOutstanding(selectedInvoice);
  }, [manualAmount, selectedInvoice]);

  const stats = useMemo<StatCardItem[]>(() => {
    const outstanding = unpaidInvoices.reduce(
      (total, invoice) => total + invoiceOutstanding(invoice),
      0,
    );
    const pendingProofCount = payments.filter((payment) => payment.status === 'PENDING').length;

    return [
      {
        title: 'Cần thanh toán',
        value: formatCurrency(outstanding),
        subtitle: unpaidInvoices.length
          ? `${unpaidInvoices.length} hóa đơn đang mở`
          : 'Không còn khoản đối soát nào',
        delta: nearestOpenInvoice
          ? `${nearestOpenInvoice.invoiceNumber} • đến hạn ${formatDate(nearestOpenInvoice.dueDate)}`
          : 'Danh mục đã được đối soát',
        trend: outstanding > 0 ? 'neutral' : 'up',
      },
      {
        title: 'Biên lai đã nộp',
        value: String(payments.length),
        subtitle: 'Lịch sử giao dịch và minh chứng được lưu trên hệ thống.',
        delta: pendingProofCount
          ? `${pendingProofCount} giao dịch chờ xác nhận`
          : 'Không có biên lai chờ duyệt',
        trend: pendingProofCount ? 'neutral' : 'up',
      },
      {
        title: 'Kênh thanh toán',
        value: selectedRail?.label || 'Chưa cấu hình',
        subtitle: paymentRails.length
          ? 'Chỉ các kênh đang bật mới hiển thị cho khách hàng.'
          : 'Đội vận hành chưa bật kênh thanh toán nào.',
        delta: selectedRail?.supportsVietQr
          ? 'Có VietQR theo hóa đơn'
          : customerCheckoutEnabled
            ? 'Có thêm sandbox kiểm tra nhanh'
            : 'Đối soát theo biên lai thủ công',
        trend: 'neutral',
      },
    ];
  }, [customerCheckoutEnabled, nearestOpenInvoice, paymentRails.length, payments, selectedRail, unpaidInvoices]);

  async function handleCopy(value: string, label: string) {
    if (!value.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
      setMessage(`Đã sao chép ${label.toLowerCase()}.`);
      setError('');
      window.setTimeout(() => {
        setCopiedValue((current) => (current === label ? '' : current));
      }, 1800);
    } catch {
      setError('Không thể sao chép tự động. Vui lòng copy thủ công.');
    }
  }

  async function handleManualSubmit() {
    if (!selectedInvoice) {
      setError('Chưa có hóa đơn nào để nộp biên lai.');
      return;
    }

    if (!proofFile) {
      setError('Vui lòng chọn ảnh hoặc PDF biên lai trước khi gửi.');
      return;
    }

    if (!selectedRail) {
      setError('Chưa có kênh thanh toán nào được bật.');
      return;
    }

    setSubmittingProof(true);
    setMessage('');
    setError('');

    try {
      await submitManualPaymentRequest({
        invoiceId: selectedInvoice.id,
        method: selectedRail.channelKey,
        amount: manualAmountNumber,
        referenceNote: referenceNote.trim() || undefined,
        proof: proofFile,
      });

      await loadData();
      setProofFile(null);
      setReferenceNote('');
      setMessage(
        `Đã gửi biên lai cho hóa đơn ${selectedInvoice.invoiceNumber}. Đội vận hành sẽ xác nhận sớm nhất.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể gửi biên lai thanh toán.',
      );
    } finally {
      setSubmittingProof(false);
    }
  }

  async function handlePay(invoiceId: string) {
    if (!selectedRail) {
      setError('Chưa có kênh thanh toán nào được bật.');
      return;
    }

    setPayingId(invoiceId);
    setMessage('');
    setError('');

    try {
      await mockPayInvoiceRequest(invoiceId, selectedRail.channelKey);
      await loadData();
      setMessage('Đã ghi nhận thanh toán sandbox thành công.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể xử lý thanh toán.',
      );
    } finally {
      setPayingId('');
    }
  }

  async function handleOpenProof(paymentId: string) {
    setProofLoadingId(paymentId);
    setMessage('');
    setError('');

    try {
      await downloadPaymentProofRequest(paymentId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tải biên lai thanh toán.',
      );
    } finally {
      setProofLoadingId('');
    }
  }

  if (loading) {
    return (
      <SectionCard title="Thanh toán" eyebrow="Giao dịch và đối soát" dark>
        <p className="text-sm text-slate-300">Đang tải dữ liệu thanh toán...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.title} {...item} dark />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <SectionCard
          title="Thanh toán và đối soát thủ công"
          eyebrow="Kênh thanh toán đang bật, QR theo hóa đơn và biên lai đối soát"
          dark
        >
          <div className="grid gap-4">
            <div className="portal-card-soft p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Kênh thanh toán</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Chỉ những kênh đang được đội vận hành bật mới xuất hiện tại đây. Khách hàng có
                    thể quét VietQR với hóa đơn cụ thể hoặc chuyển khoản theo nội dung gợi ý.
                  </p>
                </div>
                <Wallet className="h-5 w-5 text-slate-300" />
              </div>

              {paymentRails.length ? (
                <label className="mt-4 grid gap-2 text-sm text-slate-300">
                  <span>Phương thức thanh toán</span>
                  <select
                    className="portal-field"
                    value={selectedMethod}
                    onChange={(event) => setSelectedMethod(event.target.value)}
                  >
                    {paymentRails.map((rail) => (
                      <option key={rail.channelKey} value={rail.channelKey}>
                        {rail.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="mt-4 rounded-[22px] border border-amber-200/15 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
                  Chưa có kênh thanh toán nào được bật. Vui lòng liên hệ đội vận hành để được hỗ
                  trợ.
                </div>
              )}

              <div className="mt-4 rounded-[22px] border border-amber-200/15 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-white">Đối soát bằng biên lai</p>
                    <p className="mt-1 leading-6 text-slate-300">
                      {siteConfig.payments.manual.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {paymentRails.map((rail) => {
                const isActive = rail.channelKey === selectedMethod;
                const transferContent = buildTransferNote(
                  rail.noteTemplate,
                  selectedInvoice,
                  profile?.customerCode || '',
                );
                const railQrUrl = buildVietQrUrl({
                  rail,
                  amount: manualAmountNumber,
                  note: transferContent,
                });

                return (
                  <div
                    key={rail.channelKey}
                    className={`portal-card-soft p-5 ${isActive ? 'border-amber-200/25 bg-amber-400/10' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {siteConfig.payments.manual.eyebrow}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-white">{rail.label}</h3>
                      </div>
                      {rail.providerName.toLowerCase().includes('momo') ? (
                        <Smartphone className="h-5 w-5 text-slate-300" />
                      ) : railQrUrl ? (
                        <QrCode className="h-5 w-5 text-slate-300" />
                      ) : (
                        <Building2 className="h-5 w-5 text-slate-300" />
                      )}
                    </div>

                    <div className="mt-4 grid gap-3">
                      {[
                        { label: 'Tên đơn vị nhận tiền', value: rail.accountName },
                        {
                          label:
                            rail.providerName.toLowerCase().includes('momo')
                              ? 'Số ví / số điện thoại'
                              : 'Số tài khoản',
                          value: rail.accountNumber,
                        },
                        { label: 'Ngân hàng / nhà cung cấp', value: rail.providerName },
                        { label: 'Chi nhánh / ghi chú', value: rail.branch || 'Không yêu cầu' },
                        { label: 'Nội dung chuyển khoản', value: transferContent || 'Chưa có mẫu' },
                      ].map((item) => (
                        <div
                          key={`${rail.channelKey}-${item.label}`}
                          className="rounded-[20px] border border-white/8 bg-white/[0.04] px-4 py-3"
                        >
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            {item.label}
                          </p>
                          <div className="mt-2 flex items-start justify-between gap-3">
                            <p className="text-sm leading-6 text-white">{item.value}</p>
                            <button
                              type="button"
                              onClick={() => void handleCopy(item.value, item.label)}
                              className="rounded-full border border-white/10 p-2 text-slate-300 transition hover:bg-white/10"
                              aria-label={`Sao chép ${item.label}`}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                          {copiedValue === item.label ? (
                            <p className="mt-2 text-xs text-emerald-200">Đã sao chép.</p>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {railQrUrl ? (
                      <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              VietQR theo hóa đơn
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-300">
                              Quét bằng app ngân hàng để tự điền sẵn số tiền và nội dung chuyển
                              khoản cho {selectedInvoice?.invoiceNumber || 'kỳ đang chọn'}.
                            </p>
                          </div>
                          <QrCode className="h-5 w-5 text-slate-300" />
                        </div>
                        <img
                          src={railQrUrl}
                          alt={`VietQR ${rail.label}`}
                          className="mx-auto mt-4 h-56 w-56 rounded-[22px] border border-white/10 bg-white object-contain p-3"
                        />
                      </div>
                    ) : rail.qrImage ? (
                      <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.04] p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">QR thanh toán</p>
                        <img
                          src={rail.qrImage}
                          alt={`QR ${rail.label}`}
                          className="mx-auto mt-4 h-56 w-56 rounded-[22px] border border-white/10 bg-white object-contain p-3"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {selectedInvoice && selectedRail ? (
              <div className="portal-card-soft p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Hóa đơn ưu tiên thanh toán
                    </p>
                    <h3 className="mt-2 text-xl font-semibold text-white">
                      {selectedInvoice.invoiceNumber}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                      <span>
                        Kỳ {String(selectedInvoice.billingMonth).padStart(2, '0')}/
                        {selectedInvoice.billingYear}
                      </span>
                      <span>Hạn thanh toán {formatDate(selectedInvoice.dueDate)}</span>
                    </div>
                  </div>

                  <StatusPill label={selectedInvoice.status} />
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                  <p>Số dư cần thanh toán: {formatCurrency(invoiceOutstanding(selectedInvoice))}</p>
                  <p>VAT: {selectedInvoice.vatRate != null ? `${selectedInvoice.vatRate}%` : '-'}</p>
                  <p>Đã thanh toán: {formatCurrency(Number(selectedInvoice.paidAmount || 0))}</p>
                  <p>Tổng cộng: {formatCurrency(Number(selectedInvoice.totalAmount || 0))}</p>
                  <p>Điện tiêu thụ: {formatUsage(selectedInvoice.periodMetrics?.loadConsumedKwh)}</p>
                  <p>Nguồn dữ liệu: {selectedInvoice.periodMetrics?.sourceLabel || 'Chưa cập nhật'}</p>
                  <p>Chỉ số cũ: {formatReading(selectedInvoice.periodMetrics?.previousReading)}</p>
                  <p>Chỉ số mới: {formatReading(selectedInvoice.periodMetrics?.currentReading)}</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Hóa đơn cần nộp biên lai</span>
                    <select
                      className="portal-field"
                      value={selectedInvoiceId}
                      onChange={(event) => setSelectedInvoiceId(event.target.value)}
                    >
                      {unpaidInvoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} • {String(invoice.billingMonth).padStart(2, '0')}/
                          {invoice.billingYear}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Số tiền chuyển khoản</span>
                    <input
                      type="number"
                      min="0"
                      className="portal-field"
                      value={manualAmount}
                      onChange={(event) => setManualAmount(event.target.value)}
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                    <span>Nội dung tham chiếu / ghi chú</span>
                    <textarea
                      className="portal-field min-h-[120px]"
                      value={referenceNote}
                      onChange={(event) => setReferenceNote(event.target.value)}
                      placeholder="Ví dụ: đã chuyển khoản từ tài khoản công ty, gửi lúc 09:30."
                    />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-300 md:col-span-2">
                    <span>Biên lai hoặc file xác nhận</span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.pdf"
                      className="portal-field file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white"
                      onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                    />
                    <span className="text-xs text-slate-500">
                      Hỗ trợ JPG, PNG, WEBP hoặc PDF. Dung lượng tối đa 8 MB.
                    </span>
                    {proofFile ? (
                      <span className="text-xs text-emerald-200">Đã chọn: {proofFile.name}</span>
                    ) : null}
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={submittingProof || !selectedInvoice || !proofFile}
                    onClick={() => void handleManualSubmit()}
                  >
                    <FileUp className="h-4 w-4" />
                    {submittingProof ? 'Đang gửi biên lai...' : 'Gửi biên lai thanh toán'}
                  </button>

                  {customerCheckoutEnabled ? (
                    <button
                      type="button"
                      onClick={() => void handlePay(selectedInvoice.id)}
                      className="btn-ghost"
                      disabled={payingId === selectedInvoice.id}
                    >
                      <CreditCard className="h-4 w-4" />
                      {payingId === selectedInvoice.id
                        ? 'Đang xử lý sandbox...'
                        : 'Thanh toán sandbox'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="portal-card-soft p-5">
                <p className="text-base font-semibold text-white">Không có hóa đơn chờ thanh toán</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Danh mục thanh toán đang sạch. Khi có hóa đơn mới, khu vực nộp biên lai sẽ hiện
                  tại đây.
                </p>
              </div>
            )}

            <div className="portal-card-soft p-5">
              <p className="text-sm font-semibold text-white">
                {siteConfig.payments.manual.confirmationTitle}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {siteConfig.payments.manual.confirmationBody}
              </p>
            </div>

            {message ? (
              <div className="rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                {message}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Lịch sử giao dịch"
          eyebrow="Theo dõi minh chứng, đối soát và kết quả xác nhận"
          dark
        >
          <div className="space-y-3">
            {payments.length ? (
              payments.map((payment) => {
                const relatedInvoice = payment.invoice?.id
                  ? invoiceLookup.get(payment.invoice.id) || null
                  : null;
                const reviewLabel = payment.reviewedAt
                  ? formatDateTime(payment.reviewedAt)
                  : 'Chờ đối soát';

                return (
                  <div
                    key={payment.id}
                    className="rounded-[24px] border border-white/8 bg-white/[0.04] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Giao dịch {payment.paymentCode}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-white">
                          {relatedInvoice?.invoiceNumber || 'Biên lai thủ công'}
                        </h3>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                          <span>{paymentMethodLabel(payment.method, paymentRails)}</span>
                          <span>{gatewayLabel(payment.gateway)}</span>
                          <span>{reviewLabel}</span>
                        </div>
                      </div>

                      <StatusPill label={paymentStatusLabel(payment.status)} />
                    </div>

                    <div className="mt-4 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                      <p>Số tiền: {formatCurrency(Number(payment.amount || 0))}</p>
                      <p>
                        Hóa đơn:{' '}
                        {relatedInvoice
                          ? `${relatedInvoice.invoiceNumber} • ${String(relatedInvoice.billingMonth).padStart(2, '0')}/${relatedInvoice.billingYear}`
                          : 'Không gắn hóa đơn'}
                      </p>
                      <p>
                        Thời gian gửi:{' '}
                        {payment.createdAt ? formatDateTime(payment.createdAt) : 'Chưa cập nhật'}
                      </p>
                      <p>Ghi chú chuyển khoản: {payment.referenceNote || 'Không có'}</p>
                      <p>Trạng thái duyệt: {payment.reviewNote || paymentStatusLabel(payment.status)}</p>
                      <p>Tệp minh chứng: {payment.proofOriginalName || 'Không có tệp đính kèm'}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      {payment.proofFileUrl ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={proofLoadingId === payment.id}
                          onClick={() => void handleOpenProof(payment.id)}
                        >
                          <FileCheck2 className="h-4 w-4" />
                          {proofLoadingId === payment.id ? 'Đang tải...' : 'Tải biên lai'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.03] px-4 py-5 text-sm text-slate-400">
                Chưa có giao dịch nào được ghi nhận. Sau khi gửi biên lai, lịch sử đối soát sẽ
                xuất hiện tại đây.
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
