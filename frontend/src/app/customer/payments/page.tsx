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
import { useCustomerTheme } from '@/components/customer-theme-provider';
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
import { cn, formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/utils';
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
    return 'Doi soat thu cong';
  }

  if (value === 'MOCK') {
    return 'Sandbox noi bo';
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
      BANK_TRANSFER: 'Chuyen khoan ngan hang',
      MOMO_QR: 'Vi MoMo',
      VNPAY_QR: 'QR VNPay',
    }[method] ||
    method
  );
}

function paymentStatusLabel(status: PaymentRecord['status']) {
  if (status === 'SUCCESS') {
    return 'Da xac nhan';
  }

  if (status === 'FAILED') {
    return 'Tu choi';
  }

  if (status === 'REFUNDED') {
    return 'Hoan tien';
  }

  return 'Cho xac nhan';
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
  return value != null ? value.toLocaleString('vi-VN') : 'Chua ap dung do chi so';
}

function formatUsage(value?: number | null) {
  return value != null ? formatNumber(value, 'kWh') : 'Chua cap nhat';
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
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';
  const strongText = dark ? 'text-white' : 'text-slate-950';
  const bodyText = dark ? 'text-slate-300' : 'text-slate-600';
  const mutedText = 'text-slate-500';

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
          : 'Khong the tai du lieu thanh toan.',
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
        title: 'Can thanh toan',
        value: formatCurrency(outstanding),
        subtitle: unpaidInvoices.length
          ? `${unpaidInvoices.length} hoa don dang mo`
          : 'Khong con khoan doi soat nao',
        delta: nearestOpenInvoice
          ? `${nearestOpenInvoice.invoiceNumber} · den han ${formatDate(nearestOpenInvoice.dueDate)}`
          : 'Danh muc da duoc doi soat',
        trend: outstanding > 0 ? 'neutral' : 'up',
      },
      {
        title: 'Bien lai da nop',
        value: String(payments.length),
        subtitle: 'Lich su giao dich va minh chung duoc luu tren he thong.',
        delta: pendingProofCount
          ? `${pendingProofCount} giao dich cho xac nhan`
          : 'Khong co bien lai cho duyet',
        trend: pendingProofCount ? 'neutral' : 'up',
      },
      {
        title: 'Kenh thanh toan',
        value: selectedRail?.label || 'Chua cau hinh',
        subtitle: paymentRails.length
          ? 'Chi cac kenh dang bat moi hien thi cho khach hang.'
          : 'Doi van hanh chua bat kenh thanh toan nao.',
        delta: selectedRail?.supportsVietQr
          ? 'Co VietQR theo hoa don'
          : customerCheckoutEnabled
            ? 'Co them sandbox kiem tra nhanh'
            : 'Doi soat theo bien lai thu cong',
        trend: 'neutral',
      },
    ];
  }, [nearestOpenInvoice, paymentRails.length, payments, selectedRail, unpaidInvoices]);

  async function handleCopy(value: string, label: string) {
    if (!value.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(label);
      setMessage(`Da sao chep ${label.toLowerCase()}.`);
      setError('');
      window.setTimeout(() => {
        setCopiedValue((current) => (current === label ? '' : current));
      }, 1800);
    } catch {
      setError('Khong the sao chep tu dong. Vui long copy thu cong.');
    }
  }

  async function handleManualSubmit() {
    if (!selectedInvoice) {
      setError('Chua co hoa don nao de nop bien lai.');
      return;
    }

    if (!proofFile) {
      setError('Vui long chon anh hoac PDF bien lai truoc khi gui.');
      return;
    }

    if (!selectedRail) {
      setError('Chua co kenh thanh toan nao duoc bat.');
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
        `Da gui bien lai cho hoa don ${selectedInvoice.invoiceNumber}. Doi van hanh se xac nhan som nhat.`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Khong the gui bien lai thanh toan.',
      );
    } finally {
      setSubmittingProof(false);
    }
  }

  async function handlePay(invoiceId: string) {
    if (!selectedRail) {
      setError('Chua co kenh thanh toan nao duoc bat.');
      return;
    }

    setPayingId(invoiceId);
    setMessage('');
    setError('');

    try {
      await mockPayInvoiceRequest(invoiceId, selectedRail.channelKey);
      await loadData();
      setMessage('Da ghi nhan thanh toan sandbox thanh cong.');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Khong the xu ly thanh toan.',
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
          : 'Khong the tai bien lai thanh toan.',
      );
    } finally {
      setProofLoadingId('');
    }
  }

  if (loading) {
    return (
      <SectionCard title="Thanh toan" eyebrow="Giao dich va doi soat">
        <p className={cn('text-sm', bodyText)}>Dang tai du lieu thanh toan...</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        {stats.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <SectionCard
          title="Thanh toan va doi soat thu cong"
          eyebrow="Kenh thanh toan dang bat, QR theo hoa don va bien lai doi soat"
        >
          <div className="grid gap-4">
            <div className="customer-soft-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className={cn('text-sm font-semibold', strongText)}>Kenh thanh toan</p>
                  <p className={cn('mt-2 text-sm leading-6', bodyText)}>
                    Chi nhung kenh dang duoc doi van hanh bat moi xuat hien tai day. Khach hang co
                    the quet VietQR voi hoa don cu the hoac chuyen khoan theo noi dung goi y.
                  </p>
                </div>
                <Wallet className={cn('h-5 w-5 shrink-0', mutedText)} />
              </div>

              {paymentRails.length ? (
                <label className={cn('mt-4 grid gap-2 text-sm', bodyText)}>
                  <span>Phuong thuc thanh toan</span>
                  <select
                    className="customer-field"
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
                <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700">
                  Chua co kenh thanh toan nao duoc bat. Vui long lien he doi van hanh de duoc ho tro.
                </div>
              )}

              <div className="mt-4 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4.5 w-4.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Doi soat bang bien lai</p>
                    <p className="mt-1 leading-6">{siteConfig.payments.manual.description}</p>
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
                  amount: Number(manualAmount || invoiceOutstanding(selectedInvoice)),
                  note: transferContent,
                });

                return (
                  <div
                    key={rail.channelKey}
                    className={cn(
                      'customer-soft-card p-5',
                      isActive &&
                        (dark
                          ? 'ring-2 ring-amber-300/25'
                          : 'border border-amber-200 bg-amber-50/80'),
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {siteConfig.payments.manual.eyebrow}
                        </p>
                        <h3 className={cn('mt-2 text-lg font-semibold', strongText)}>{rail.label}</h3>
                      </div>
                      {rail.providerName.toLowerCase().includes('momo') ? (
                        <Smartphone className={cn('h-5 w-5 shrink-0', mutedText)} />
                      ) : railQrUrl ? (
                        <QrCode className={cn('h-5 w-5 shrink-0', mutedText)} />
                      ) : (
                        <Building2 className={cn('h-5 w-5 shrink-0', mutedText)} />
                      )}
                    </div>

                    <div className="mt-4 grid gap-3">
                      {[
                        { label: 'Ten don vi nhan tien', value: rail.accountName },
                        {
                          label:
                            rail.providerName.toLowerCase().includes('momo')
                              ? 'So vi / so dien thoai'
                              : 'So tai khoan',
                          value: rail.accountNumber,
                        },
                        { label: 'Ngan hang / nha cung cap', value: rail.providerName },
                        { label: 'Chi nhanh / ghi chu', value: rail.branch || 'Khong yeu cau' },
                        {
                          label: 'Noi dung chuyen khoan',
                          value: transferContent || 'Chua co mau',
                        },
                      ].map((item) => (
                        <div key={`${rail.channelKey}-${item.label}`} className="customer-soft-card-muted px-4 py-3">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            {item.label}
                          </p>
                          <div className="mt-2 flex items-start justify-between gap-3">
                            <p className={cn('text-sm leading-6', strongText)}>{item.value}</p>
                            <button
                              type="button"
                              onClick={() => void handleCopy(item.value, item.label)}
                              className={cn(
                                'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition',
                                dark
                                  ? 'border-white/10 text-slate-300 hover:bg-white/10'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-100',
                              )}
                              aria-label={`Sao chep ${item.label}`}
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                          {copiedValue === item.label ? (
                            <p className="mt-2 text-xs text-emerald-600">Da sao chep.</p>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {railQrUrl ? (
                      <div className="customer-soft-card-muted mt-4 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              VietQR theo hoa don
                            </p>
                            <p className={cn('mt-2 text-sm leading-6', bodyText)}>
                              Quet bang app ngan hang de tu dien san so tien va noi dung chuyen
                              khoan cho {selectedInvoice?.invoiceNumber || 'ky dang chon'}.
                            </p>
                          </div>
                          <QrCode className={cn('h-5 w-5 shrink-0', mutedText)} />
                        </div>
                        <img
                          src={railQrUrl}
                          alt={`VietQR ${rail.label}`}
                          className="mx-auto mt-4 h-56 w-56 rounded-[22px] border border-slate-200 bg-white object-contain p-3"
                        />
                      </div>
                    ) : rail.qrImage ? (
                      <div className="customer-soft-card-muted mt-4 p-4">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          QR thanh toan
                        </p>
                        <img
                          src={rail.qrImage}
                          alt={`QR ${rail.label}`}
                          className="mx-auto mt-4 h-56 w-56 rounded-[22px] border border-slate-200 bg-white object-contain p-3"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {selectedInvoice && selectedRail ? (
              <div className="customer-soft-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Hoa don uu tien thanh toan
                    </p>
                    <h3 className={cn('mt-2 text-xl font-semibold', strongText)}>
                      {selectedInvoice.invoiceNumber}
                    </h3>
                    <div className={cn('mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm', mutedText)}>
                      <span>
                        Ky {String(selectedInvoice.billingMonth).padStart(2, '0')}/{selectedInvoice.billingYear}
                      </span>
                      <span>Han thanh toan {formatDate(selectedInvoice.dueDate)}</span>
                    </div>
                  </div>

                  <StatusPill label={selectedInvoice.status} />
                </div>

                <div className={cn('mt-4 grid gap-3 text-sm sm:grid-cols-2', bodyText)}>
                  <p>So du can thanh toan: {formatCurrency(invoiceOutstanding(selectedInvoice))}</p>
                  <p>VAT: {selectedInvoice.vatRate != null ? `${selectedInvoice.vatRate}%` : '-'}</p>
                  <p>Da thanh toan: {formatCurrency(Number(selectedInvoice.paidAmount || 0))}</p>
                  <p>Tong cong: {formatCurrency(Number(selectedInvoice.totalAmount || 0))}</p>
                  <p>Dien tieu thu: {formatUsage(selectedInvoice.periodMetrics?.loadConsumedKwh)}</p>
                  <p>Nguon du lieu: {selectedInvoice.periodMetrics?.sourceLabel || 'Chua cap nhat'}</p>
                  <p>Chi so cu: {formatReading(selectedInvoice.periodMetrics?.previousReading)}</p>
                  <p>Chi so moi: {formatReading(selectedInvoice.periodMetrics?.currentReading)}</p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className={cn('grid gap-2 text-sm', bodyText)}>
                    <span>Hoa don can nop bien lai</span>
                    <select
                      className="customer-field"
                      value={selectedInvoiceId}
                      onChange={(event) => setSelectedInvoiceId(event.target.value)}
                    >
                      {unpaidInvoices.map((invoice) => (
                        <option key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} · {String(invoice.billingMonth).padStart(2, '0')}/{invoice.billingYear}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={cn('grid gap-2 text-sm', bodyText)}>
                    <span>So tien chuyen khoan</span>
                    <input
                      type="number"
                      min="0"
                      className="customer-field"
                      value={manualAmount}
                      onChange={(event) => setManualAmount(event.target.value)}
                    />
                  </label>

                  <label className={cn('grid gap-2 text-sm md:col-span-2', bodyText)}>
                    <span>Noi dung tham chieu / ghi chu</span>
                    <textarea
                      className="customer-field min-h-[120px]"
                      value={referenceNote}
                      onChange={(event) => setReferenceNote(event.target.value)}
                      placeholder="Vi du: da chuyen khoan tu tai khoan cong ty, gui luc 09:30."
                    />
                  </label>

                  <label className={cn('grid gap-2 text-sm md:col-span-2', bodyText)}>
                    <span>Bien lai hoac file xac nhan</span>
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.pdf"
                      className="customer-file-input"
                      onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                    />
                    <span className="text-xs text-slate-500">
                      Ho tro JPG, PNG, WEBP hoac PDF. Dung luong toi da 8 MB.
                    </span>
                    {proofFile ? (
                      <span className="text-xs text-emerald-600">Da chon: {proofFile.name}</span>
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
                    {submittingProof ? 'Dang gui bien lai...' : 'Gui bien lai thanh toan'}
                  </button>

                  {customerCheckoutEnabled ? (
                    <button
                      type="button"
                      onClick={() => void handlePay(selectedInvoice.id)}
                      className="btn-secondary-light"
                      disabled={payingId === selectedInvoice.id}
                    >
                      <CreditCard className="h-4 w-4" />
                      {payingId === selectedInvoice.id
                        ? 'Dang xu ly sandbox...'
                        : 'Thanh toan sandbox'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="customer-soft-card p-5">
                <p className={cn('text-base font-semibold', strongText)}>Khong co hoa don cho thanh toan</p>
                <p className={cn('mt-2 text-sm leading-6', bodyText)}>
                  Danh muc thanh toan dang sach. Khi co hoa don moi, khu vuc nop bien lai se hien tai day.
                </p>
              </div>
            )}

            <div className="customer-soft-card p-5">
              <p className={cn('text-sm font-semibold', strongText)}>
                {siteConfig.payments.manual.confirmationTitle}
              </p>
              <p className={cn('mt-2 text-sm leading-6', bodyText)}>
                {siteConfig.payments.manual.confirmationBody}
              </p>
            </div>

            {message ? (
              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Lich su giao dich"
          eyebrow="Theo doi minh chung, doi soat va ket qua xac nhan"
        >
          <div className="space-y-3">
            {payments.length ? (
              payments.map((payment) => {
                const relatedInvoice = payment.invoice?.id
                  ? invoiceLookup.get(payment.invoice.id) || null
                  : null;
                const reviewLabel = payment.reviewedAt
                  ? formatDateTime(payment.reviewedAt)
                  : 'Cho doi soat';

                return (
                  <div key={payment.id} className="customer-soft-card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          Giao dich {payment.paymentCode}
                        </p>
                        <h3 className={cn('mt-2 text-lg font-semibold', strongText)}>
                          {relatedInvoice?.invoiceNumber || 'Bien lai thu cong'}
                        </h3>
                        <div className={cn('mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm', mutedText)}>
                          <span>{paymentMethodLabel(payment.method, paymentRails)}</span>
                          <span>{gatewayLabel(payment.gateway)}</span>
                          <span>{reviewLabel}</span>
                        </div>
                      </div>

                      <StatusPill label={paymentStatusLabel(payment.status)} />
                    </div>

                    <div className={cn('mt-4 grid gap-3 text-sm sm:grid-cols-2', bodyText)}>
                      <p>So tien: {formatCurrency(Number(payment.amount || 0))}</p>
                      <p>
                        Hoa don:{' '}
                        {relatedInvoice
                          ? `${relatedInvoice.invoiceNumber} · ${String(relatedInvoice.billingMonth).padStart(2, '0')}/${relatedInvoice.billingYear}`
                          : 'Khong gan hoa don'}
                      </p>
                      <p>
                        Thoi gian gui:{' '}
                        {payment.createdAt ? formatDateTime(payment.createdAt) : 'Chua cap nhat'}
                      </p>
                      <p>Ghi chu chuyen khoan: {payment.referenceNote || 'Khong co'}</p>
                      <p>Trang thai duyet: {payment.reviewNote || paymentStatusLabel(payment.status)}</p>
                      <p>Tep minh chung: {payment.proofOriginalName || 'Khong co tep dinh kem'}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      {payment.proofFileUrl ? (
                        <button
                          type="button"
                          className="btn-secondary-light"
                          disabled={proofLoadingId === payment.id}
                          onClick={() => void handleOpenProof(payment.id)}
                        >
                          <FileCheck2 className="h-4 w-4" />
                          {proofLoadingId === payment.id ? 'Dang tai...' : 'Tai bien lai'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={cn('customer-soft-card p-5 text-sm leading-6', bodyText)}>
                Chua co giao dich nao duoc ghi nhan. Sau khi gui bien lai, lich su doi soat se xuat hien tai day.
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
