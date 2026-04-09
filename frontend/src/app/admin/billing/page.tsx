'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, FileCheck2, FileDown, ReceiptText, RefreshCw, Send, XCircle } from 'lucide-react';
import { EntityActivityPanel } from '@/components/entity-activity-panel';
import { MonthlyPvBillingTable } from '@/components/monthly-pv-billing-table';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import {
  downloadInvoicePdfRequest,
  downloadPaymentProofRequest,
  generateMonthlyPvBillingInvoiceRequest,
  listAdminSystemsRequest,
  listCustomersRequest,
  listInvoicesRequest,
  listMonthlyPvBillingsRequest,
  listPaymentsRequest,
  listZaloMessageLogsRequest,
  mockPayInvoiceRequest,
  reviewPaymentRequest,
  sendZaloInvoiceNotificationRequest,
  zaloNotificationsStatusRequest,
} from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, formatMonthPeriod, formatNumber } from '@/lib/utils';
import {
  AdminSystemRecord,
  CustomerRecord,
  InvoiceRecord,
  MonthlyPvBillingRecord,
  PaymentRecord,
  StatCardItem,
  ZaloMessageLogRecord,
  ZaloSendResult,
  ZaloNotificationStatus,
} from '@/types';

function parseOptionalInteger(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function ensureArray<T>(value: T[] | null | undefined) {
  return Array.isArray(value) ? value : [];
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

function paymentMethodLabel(method?: string | null) {
  switch (method) {
    case 'BANK_TRANSFER':
      return 'Chuyển khoản ngân hàng';
    case 'MOMO_QR':
      return 'QR MoMo';
    case 'VNPAY_QR':
      return 'QR VNPay';
    default:
      return method || '-';
  }
}

function outstandingInvoiceAmount(record: MonthlyPvBillingRecord) {
  if (!record.invoice) {
    return 0;
  }

  return Math.max(
    Number(record.invoice.totalAmount || 0) - Number(record.invoice.paidAmount || 0),
    0,
  );
}

function isFinalizedInvoiceStatus(status?: InvoiceRecord['status']) {
  return status === 'ISSUED' || status === 'PAID' || status === 'PARTIAL' || status === 'OVERDUE';
}

function canSendZaloForBillingRecord(record: MonthlyPvBillingRecord) {
  if (!record.invoice) {
    return false;
  }

  if (isFinalizedInvoiceStatus(record.invoice.status)) {
    return true;
  }

  return record.dataQualityStatus === 'OK' && record.invoice.status !== 'PENDING_REVIEW';
}

function generateInvoiceButtonLabel(record: MonthlyPvBillingRecord) {
  if (record.invoiceStatus === 'ESTIMATE') {
    return 'Cho cuoi thang';
  }

  if (record.dataQualityStatus === 'MANUAL_OVERRIDE') {
    return 'Phat hanh thu cong';
  }

  if (record.dataQualityStatus === 'OK') {
    return 'Chot hoa don';
  }

  return 'Tao ban nhap';
}

function invoiceGenerateMessage(record: MonthlyPvBillingRecord, invoice: InvoiceRecord) {
  if (invoice.status === 'PENDING_REVIEW') {
    return `Da tao hoa don cho ky ${formatMonthPeriod(record.month, record.year)} o trang thai pending review.`;
  }

  if (invoice.status === 'DRAFT') {
    return `Da tao draft hoa don cho ky ${formatMonthPeriod(record.month, record.year)}.`;
  }

  return `Da phat hanh hoa don ${invoice.invoiceNumber} cho ky ${formatMonthPeriod(record.month, record.year)}.`;
}

function invoiceAlreadyIssuedMessage(record: MonthlyPvBillingRecord, invoice: InvoiceRecord) {
  return `Ky ${formatMonthPeriod(record.month, record.year)} da co hoa don ${invoice.invoiceNumber}, khong tao trung nua.`;
}

function isZaloTemplateConfigured(
  status: ZaloNotificationStatus | null,
  templateType: 'INVOICE' | 'REMINDER' | 'PAID',
) {
  if (!status) {
    return false;
  }

  const nestedStatus = (status as ZaloNotificationStatus & {
    templateIds?: Partial<
      Record<'INVOICE' | 'REMINDER' | 'PAID', { configured?: boolean } | null | undefined>
    >;
  }).templateIds?.[templateType];

  if (typeof nestedStatus?.configured === 'boolean') {
    return nestedStatus.configured;
  }

  switch (templateType) {
    case 'INVOICE':
      return Boolean((status as ZaloNotificationStatus & { templateInvoiceId?: string | null }).templateInvoiceId);
    case 'REMINDER':
      return Boolean((status as ZaloNotificationStatus & { templateReminderId?: string | null }).templateReminderId);
    case 'PAID':
      return Boolean((status as ZaloNotificationStatus & { templatePaidId?: string | null }).templatePaidId);
    default:
      return false;
  }
}

function zaloSendStatusLabel(status: string) {
  switch (status) {
    case 'SENT':
      return 'Da gui';
    case 'DRY_RUN':
      return 'Dry run';
    case 'BLOCKED':
      return 'Bi chan';
    case 'FAILED':
      return 'That bai';
    default:
      return status;
  }
}

function buildZaloValidationMessage(
  result: Pick<ZaloSendResult, 'providerMessage' | 'missingTemplateFields' | 'invalidTemplateFields'>,
) {
  const problems = [
    ...(result.missingTemplateFields || []).map((field) => `thieu ${field}`),
    ...(result.invalidTemplateFields || []).map((field) => `${field} khong dung dinh dang`),
  ];

  if (problems.length) {
    return `Khong the gui Zalo: ${problems.join(', ')}.`;
  }

  return result.providerMessage || 'Khong the gui thong bao Zalo.';
}

export default function AdminBillingPage() {
  const [systems, setSystems] = useState<AdminSystemRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [records, setRecords] = useState<MonthlyPvBillingRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [zaloStatus, setZaloStatus] = useState<ZaloNotificationStatus | null>(null);
  const [zaloLogs, setZaloLogs] = useState<ZaloMessageLogRecord[]>([]);
  const [systemId, setSystemId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invoiceLoadingId, setInvoiceLoadingId] = useState('');
  const [paymentLoadingId, setPaymentLoadingId] = useState('');
  const [proofLoadingId, setProofLoadingId] = useState('');
  const [reviewLoadingId, setReviewLoadingId] = useState('');
  const [zaloLoadingId, setZaloLoadingId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadReferenceData() {
    const [nextSystems, nextCustomers] = await Promise.all([
      listAdminSystemsRequest(),
      listCustomersRequest(),
    ]);

    setSystems(ensureArray(nextSystems));
    setCustomers(ensureArray(nextCustomers));
  }

  async function loadPayments() {
    const nextPayments = await listPaymentsRequest();
    setPayments(ensureArray(nextPayments));
  }

  async function loadInvoices() {
    const nextInvoices = await listInvoicesRequest();
    setInvoices(ensureArray(nextInvoices));
  }

  async function loadZaloData(invoiceId?: string) {
    const [nextStatus, nextLogs] = await Promise.all([
      zaloNotificationsStatusRequest(),
      listZaloMessageLogsRequest(invoiceId, 8),
    ]);

    setZaloStatus(nextStatus || null);
    setZaloLogs(ensureArray(nextLogs));
  }

  async function loadRecords(nextFilters?: {
    systemId?: string;
    customerId?: string;
    month?: string;
    year?: string;
  }) {
    const filters = {
      systemId: nextFilters?.systemId ?? systemId,
      customerId: nextFilters?.customerId ?? customerId,
      month: nextFilters?.month ?? month,
      year: nextFilters?.year ?? year,
    };

    const result = await listMonthlyPvBillingsRequest({
      ...(filters.systemId ? { systemId: filters.systemId } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(parseOptionalInteger(filters.month || '') ? { month: Number(filters.month) } : {}),
      ...(parseOptionalInteger(filters.year || '') ? { year: Number(filters.year) } : {}),
    });

    setRecords(ensureArray(result));
  }

  async function reloadAll(nextFilters?: {
    systemId?: string;
    customerId?: string;
    month?: string;
    year?: string;
  }) {
    await Promise.all([
      loadReferenceData(),
      loadRecords(nextFilters),
      loadPayments(),
      loadInvoices(),
      loadZaloData(),
    ]);
  }

  useEffect(() => {
    reloadAll({ year: String(new Date().getFullYear()) })
      .catch((nextError) => {
        setError(
          nextError instanceof Error ? nextError.message : 'Không thể tải dữ liệu billing.',
        );
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingPayments = useMemo(
    () => payments.filter((payment) => payment.status === 'PENDING'),
    [payments],
  );

  const recentInvoices = useMemo(
    () =>
      [...invoices]
        .sort((left, right) => {
          const leftTime = new Date(left.issuedAt || 0).getTime();
          const rightTime = new Date(right.issuedAt || 0).getTime();
          return rightTime - leftTime;
        })
        .slice(0, 6),
    [invoices],
  );

  useEffect(() => {
    if (!recentInvoices.length) {
      setSelectedInvoiceId('');
      return;
    }

    setSelectedInvoiceId((current) =>
      current && recentInvoices.some((invoice) => invoice.id === current)
        ? current
        : recentInvoices[0].id,
    );
  }, [recentInvoices]);

  const stats = useMemo<StatCardItem[]>(() => {
    const totalPv = records.reduce((sum, record) => sum + record.pvGenerationKwh, 0);
    const totalAmount = records.reduce((sum, record) => sum + record.totalAmount, 0);
    const unbilledCount = records.filter((record) => !record.invoiceId).length;
    const unpaidCount = records.filter(
      (record) => record.invoice && record.invoice.status !== 'PAID',
    ).length;

    return [
      {
        title: 'Bản ghi PV tháng',
        value: formatNumber(records.length),
        subtitle: 'Số kỳ PV đang được quản lý trong bộ lọc hiện tại.',
        delta: unbilledCount ? `${unbilledCount} kỳ chưa phát hành hóa đơn` : 'Đã phát hành đủ',
        trend: unbilledCount ? 'neutral' : 'up',
      },
      {
        title: 'Sản lượng PV tính tiền',
        value: formatNumber(totalPv, 'kWh'),
        subtitle: 'Billable kWh lấy trực tiếp từ tổng PV tháng.',
        delta: records[0]
          ? `Kỳ mới nhất ${formatMonthPeriod(records[0].month, records[0].year)}`
          : 'Chưa có kỳ nào',
        trend: 'up',
      },
      {
        title: 'Giá trị phải thu',
        value: formatCurrency(totalAmount),
        subtitle: 'Tổng tiền sau VAT và chiết khấu trong danh mục hiện tại.',
        delta: pendingPayments.length
          ? `${pendingPayments.length} biên lai chờ xác nhận`
          : unpaidCount
            ? `${unpaidCount} hóa đơn chưa thanh toán`
            : 'Danh mục đang sạch',
        trend: pendingPayments.length || unpaidCount ? 'neutral' : 'up',
      },
    ];
  }, [pendingPayments.length, records]);

  async function handleApplyFilters() {
    setRefreshing(true);
    setMessage('');
    setError('');

    try {
      await loadRecords();
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể lọc dữ liệu billing.',
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function handleResetFilters() {
    const nextYear = String(new Date().getFullYear());
    setSystemId('');
    setCustomerId('');
    setMonth('');
    setYear(nextYear);
    setRefreshing(true);
    setMessage('');
    setError('');

    try {
      await loadRecords({ systemId: '', customerId: '', month: '', year: nextYear });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Không thể làm mới bộ lọc.');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleGenerateInvoice(record: MonthlyPvBillingRecord) {
    setInvoiceLoadingId(record.id);
    setMessage('');
    setError('');

    try {
      const result = await generateMonthlyPvBillingInvoiceRequest(record.id);
      await Promise.all([loadRecords(), loadPayments()]);
      setMessage(
        result.alreadyIssued
          ? invoiceAlreadyIssuedMessage(record, result.invoice)
          : invoiceGenerateMessage(record, result.invoice),
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Không thể phát hành hóa đơn từ bản ghi PV tháng.',
      );
    } finally {
      setInvoiceLoadingId('');
    }
  }

  async function handleMarkPaid(record: MonthlyPvBillingRecord) {
    if (!record.invoice) {
      return;
    }

    setPaymentLoadingId(record.id);
    setMessage('');
    setError('');

    try {
      await mockPayInvoiceRequest(record.invoice.id, 'ADMIN_RECONCILIATION');
      await Promise.all([loadRecords(), loadPayments()]);
      setMessage(`Đã ghi nhận thanh toán cho hóa đơn ${record.invoice.invoiceNumber}.`);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể ghi nhận thanh toán.',
      );
    } finally {
      setPaymentLoadingId('');
    }
  }

  async function handleSendZalo(invoiceId: string, loadingKey = invoiceId) {
    setZaloLoadingId(loadingKey);
    setMessage('');
    setError('');

    try {
      const result = await sendZaloInvoiceNotificationRequest(invoiceId, {
        templateType: 'INVOICE',
      });

      await loadZaloData(invoiceId);

      if (result.status === 'BLOCKED' || result.status === 'FAILED') {
        setError(buildZaloValidationMessage(result));
        return;
      }

      setMessage(
        result.dryRun
          ? `Zalo dry-run cho ${result.invoiceNumber}: ${result.providerMessage || 'Khong gui that trong moi truong hien tai.'}`
          : `Da gui Zalo cho ${result.invoiceNumber} toi ${result.recipientPhone || 'nguoi nhan'}.`,
      );
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Khong the gui thong bao Zalo.',
      );
    } finally {
      setZaloLoadingId('');
    }
  }

  async function handleOpenProof(paymentId: string) {
    setProofLoadingId(paymentId);
    setMessage('');
    setError('');

    try {
      await downloadPaymentProofRequest(paymentId);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể tải biên lai thanh toán.',
      );
    } finally {
      setProofLoadingId('');
    }
  }

  async function handleReviewPayment(paymentId: string, status: 'SUCCESS' | 'FAILED') {
    setReviewLoadingId(paymentId);
    setMessage('');
    setError('');

    try {
      await reviewPaymentRequest(paymentId, {
        status,
        reviewNote: reviewNotes[paymentId]?.trim() || undefined,
      });
      await Promise.all([loadRecords(), loadPayments()]);
      setReviewNotes((current) => {
        const next = { ...current };
        delete next[paymentId];
        return next;
      });
      setMessage(status === 'SUCCESS' ? 'Đã xác nhận biên lai thành công.' : 'Đã từ chối biên lai.');
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : 'Không thể cập nhật trạng thái biên lai.',
      );
    } finally {
      setReviewLoadingId('');
    }
  }

  if (loading) {
    return (
      <SectionCard title="Quản lý hóa đơn" eyebrow="Billing theo sản lượng PV tháng" dark>
        <p className="text-sm text-slate-300">Đang tải dữ liệu billing...</p>
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

      <SectionCard
        title="Bộ lọc billing theo kỳ"
        eyebrow="Lọc theo tháng, năm, hệ thống và khách hàng"
        dark
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Tháng</span>
              <input
                type="number"
                min="1"
                max="12"
                className="portal-field"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                placeholder="Tất cả"
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Năm</span>
              <input
                type="number"
                min="2020"
                max="2100"
                className="portal-field"
                value={year}
                onChange={(event) => setYear(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Hệ thống</span>
              <select
                className="portal-field"
                value={systemId}
                onChange={(event) => setSystemId(event.target.value)}
              >
                <option value="">Tất cả hệ thống</option>
                {systems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.systemCode} - {system.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm text-slate-300">
              <span>Khách hàng</span>
              <select
                className="portal-field"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">Tất cả khách hàng</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.companyName || customer.user.fullName} - {customer.customerCode}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3 xl:justify-end">
            <button type="button" className="btn-primary" disabled={refreshing} onClick={() => void handleApplyFilters()}>
              {refreshing ? 'Đang lọc...' : 'Áp dụng bộ lọc'}
            </button>
            <button type="button" className="btn-ghost" disabled={refreshing} onClick={() => void handleResetFilters()}>
              <RefreshCw className="h-4 w-4" />
              Làm mới
            </button>
          </div>
        </div>

        {message ? (
          <div className="mt-4 rounded-[20px] border border-emerald-300/15 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Zalo invoice notifications"
        eyebrow="Nen tang gui template an toan cho hoa don"
        dark
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="portal-card-soft p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Trang thai ket noi
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  {zaloStatus?.configuredForSend ? 'San sang gui' : 'Dang o che do test-safe'}
                </h3>
              </div>
              <StatusPill
                label={zaloStatus?.dryRun ? 'Dry run' : 'Live send'}
                tone={zaloStatus?.dryRun ? 'warning' : 'success'}
              />
            </div>

            <div className="mt-3">
              <Link href="/admin/zalo" className="text-sm font-medium text-emerald-200 transition hover:text-emerald-100">
                Mo trang cau hinh Zalo
              </Link>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
              <p>
                OA ID: <span className="font-medium text-white">{zaloStatus?.oaIdPreview || '-'}</span>
              </p>
              <p>
                Access token:{' '}
                <span className="font-medium text-white">
                  {zaloStatus?.hasAccessToken ? 'Da cau hinh' : 'Chua cau hinh'}
                </span>
              </p>
              <p>
                Template invoice:{' '}
                <span className="font-medium text-white">
                  {isZaloTemplateConfigured(zaloStatus, 'INVOICE') ? 'Da gan' : 'Chua gan'}
                </span>
              </p>
              <p>
                API base URL:{' '}
                <span className="font-medium text-white">{zaloStatus?.apiBaseUrl || '-'}</span>
              </p>
            </div>

            {zaloStatus?.missingRequired?.length ? (
              <p className="mt-4 rounded-[18px] border border-amber-300/15 bg-amber-400/10 px-4 py-3 text-sm leading-6 text-amber-100">
                Missing required config: {zaloStatus.missingRequired.join(', ')}
              </p>
            ) : null}

            {zaloStatus?.missingRecommended?.length ? (
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Recommended config chua co: {zaloStatus.missingRecommended.join(', ')}
              </p>
            ) : null}
          </div>

          <div className="portal-card-soft p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
              Nhat ky gui gan day
            </p>
            <div className="mt-4 grid gap-3">
              {zaloLogs.length ? (
                zaloLogs.map((log) => (
                  <div key={log.id} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">
                          {log.invoiceNumber || log.customerName}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {log.recipientPhone || '-'} · {formatDateTime(log.createdAt)}
                        </p>
                      </div>
                      <StatusPill label={zaloSendStatusLabel(log.sendStatus)} />
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {log.providerMessage || 'Khong co thong diep tra ve tu provider.'}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-300">
                  Chua co log gui Zalo nao. Khi admin bam &quot;Gui Zalo&quot;, ket qua se duoc luu tai day.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 portal-card-soft p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                Hoa don gan day de test template
              </p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Gui thu tu khu vuc admin billing
              </h3>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-400">
              Bang nay dung de test an toan truoc khi noi workflow nhac hoa don tu dong. Neu thieu OA/token/template,
              he thong se giu o dry-run va van luu log.
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            {recentInvoices.length ? (
              recentInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                  className={`flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-3 text-left ${
                    invoice.id === selectedInvoiceId
                      ? 'border-emerald-300/20 bg-emerald-400/10'
                      : 'border-white/8 bg-white/[0.03]'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">
                      {invoice.invoiceNumber}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {(invoice.customer?.companyName || invoice.customer?.user?.fullName || 'Khach hang')} ·{' '}
                      {formatMonthPeriod(invoice.billingMonth, invoice.billingYear)} · {formatCurrency(invoice.totalAmount)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill label={invoice.status} />
                    <button
                      type="button"
                      className="btn-ghost !min-h-[42px] !px-3 !py-2 text-xs"
                      disabled={zaloLoadingId === invoice.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleSendZalo(invoice.id);
                      }}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {zaloLoadingId === invoice.id ? 'Dang gui...' : 'Gui Zalo'}
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm leading-6 text-slate-300">
                Chua co hoa don nao de test. Khi he thong co invoice, admin co the gui template Zalo truc tiep tai day.
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Biên lai chờ xác nhận"
        eyebrow="Thanh toán thủ công do khách hàng gửi từ portal"
        dark
      >
        <div className="grid gap-4">
          {pendingPayments.length ? (
            pendingPayments.map((payment) => (
              <div key={payment.id} className="portal-card-soft p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {payment.invoice?.invoiceNumber || payment.paymentCode}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">
                      {formatCurrency(Number(payment.amount))}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                      <span>{payment.customer?.companyName || payment.customer?.user?.fullName || 'Khách hàng'}</span>
                      <span>{paymentMethodLabel(payment.method)}</span>
                      <span>{formatDateTime(payment.createdAt)}</span>
                    </div>
                  </div>

                  <StatusPill label={paymentStatusLabel(payment.status)} />
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                  <p>
                    Hóa đơn:{' '}
                    <span className="font-medium text-white">
                      {payment.invoice?.invoiceNumber || '-'}
                    </span>
                  </p>
                  <p>
                    Hạn thanh toán:{' '}
                    <span className="font-medium text-white">
                      {payment.invoice?.dueDate ? formatDate(payment.invoice.dueDate) : '-'}
                    </span>
                  </p>
                  <p>
                    Còn phải thu:{' '}
                    <span className="font-medium text-white">
                      {payment.invoice
                        ? formatCurrency(
                            Math.max(
                              Number(payment.invoice.totalAmount || 0) -
                                Number(payment.invoice.paidAmount || 0),
                              0,
                            ),
                          )
                        : '-'}
                    </span>
                  </p>
                  <p>
                    Gateway:{' '}
                    <span className="font-medium text-white">{payment.gateway}</span>
                  </p>
                </div>

                {payment.referenceNote ? (
                  <p className="mt-3 rounded-[18px] border border-white/8 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-300">
                    Ghi chú khách hàng: {payment.referenceNote}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-3">
                  <label className="grid gap-2 text-sm text-slate-300">
                    <span>Ghi chú xử lý</span>
                    <textarea
                      className="portal-field min-h-[110px]"
                      value={reviewNotes[payment.id] || ''}
                      onChange={(event) =>
                        setReviewNotes((current) => ({
                          ...current,
                          [payment.id]: event.target.value,
                        }))
                      }
                      placeholder="Ví dụ: đã đối soát thành công với sao kê ngày 26/03."
                    />
                  </label>
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
                      {proofLoadingId === payment.id ? 'Đang tải...' : 'Xem biên lai'}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
                    disabled={reviewLoadingId === payment.id}
                    onClick={() => void handleReviewPayment(payment.id, 'SUCCESS')}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {reviewLoadingId === payment.id ? 'Đang xử lý...' : 'Xác nhận'}
                  </button>

                  <button
                    type="button"
                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/15"
                    disabled={reviewLoadingId === payment.id}
                    onClick={() => void handleReviewPayment(payment.id, 'FAILED')}
                  >
                    <XCircle className="h-4 w-4" />
                    {reviewLoadingId === payment.id ? 'Đang xử lý...' : 'Từ chối'}
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="portal-card-soft p-5">
              <p className="text-base font-semibold text-white">Không có biên lai nào đang chờ xác nhận</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Khi khách hàng nộp biên lai thủ công từ portal, danh sách chờ duyệt sẽ xuất hiện tại đây.
              </p>
            </div>
          )}
        </div>
      </SectionCard>

      <MonthlyPvBillingTable
        title="Danh mục kỳ tính tiền theo PV"
        eyebrow="Tháng, năm, hệ thống, khách hàng, sản lượng PV, đơn giá và trạng thái"
        records={records}
        showSystem
        showCustomer
        emptyTitle="Chưa có kỳ tính tiền nào khớp bộ lọc"
        emptyBody="Hãy đồng bộ PV tháng ở trang hệ thống để tạo bản ghi billing thật trong database."
        className={refreshing ? 'opacity-80' : undefined}
        actions={(record) => (
          <div className="flex flex-wrap gap-2">
            {record.invoice ? (
              <>
                {isFinalizedInvoiceStatus(record.invoice.status) ? (
                  <span className="inline-flex min-h-[42px] items-center rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-100">
                    Da xuat hoa don {formatMonthPeriod(record.month, record.year)}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost !min-h-[42px] !px-3 !py-2 text-xs"
                  onClick={() => void downloadInvoicePdfRequest(record.invoice!.id)}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Tải PDF
                </button>
                <button
                  type="button"
                  className="btn-ghost !min-h-[42px] !px-3 !py-2 text-xs"
                  disabled={zaloLoadingId === record.id || !canSendZaloForBillingRecord(record)}
                  onClick={() => void handleSendZalo(record.invoice!.id, record.id)}
                >
                  <Send className="h-3.5 w-3.5" />
                  {zaloLoadingId === record.id ? 'Dang gui...' : 'Gui Zalo'}
                </button>
                {record.invoice.status !== 'PAID' ? (
                  <button
                    type="button"
                    className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
                    disabled={paymentLoadingId === record.id}
                    onClick={() => void handleMarkPaid(record)}
                  >
                    {paymentLoadingId === record.id ? 'Đang ghi nhận...' : 'Ghi nhận thanh toán'}
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
                disabled={invoiceLoadingId === record.id || record.invoiceStatus === 'ESTIMATE'}
                onClick={() => void handleGenerateInvoice(record)}
              >
                <ReceiptText className="h-3.5 w-3.5" />
                {invoiceLoadingId === record.id ? 'Dang xu ly...' : generateInvoiceButtonLabel(record)}
              </button>
            )}
            {record.invoice ? (
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-300">
                Còn phải thu {formatCurrency(outstandingInvoiceAmount(record))}
              </span>
            ) : null}
          </div>
        )}
      />

      <EntityActivityPanel
        entityType="Invoice"
        entityId={selectedInvoiceId}
        moduleKey="billing"
        title="Invoice activity timeline"
        eyebrow="Phát hành, thanh toán, phân công và ghi chú nội bộ"
        emptyMessage="Hóa đơn này chưa có thêm hoạt động nào được ghi lại."
      />
    </div>
  );
}
