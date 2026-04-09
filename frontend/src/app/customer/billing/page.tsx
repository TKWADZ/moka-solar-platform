'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, FileDown, ReceiptText } from 'lucide-react';
import { InvoiceTable } from '@/components/invoice-table';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import {
  downloadInvoicePdfRequest,
  listMyInvoicesRequest,
  listMyMonthlyPvBillingsRequest,
} from '@/lib/api';
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils';
import { InvoiceRecord, InvoiceRow, MonthlyPvBillingRecord, StatCardItem } from '@/types';

function monthLabel(invoice: InvoiceRecord) {
  return `${String(invoice.billingMonth).padStart(2, '0')}/${invoice.billingYear}`;
}

function contractTypeLabel(type?: string | null) {
  switch (type) {
    case 'PPA_KWH':
      return 'Bán điện theo kWh';
    case 'LEASE':
      return 'Thuê hệ thống cố định';
    case 'INSTALLMENT':
      return 'Trả góp';
    case 'HYBRID':
      return 'Kết hợp cố định + sản lượng';
    case 'SALE':
      return 'Mua đứt hệ thống';
    default:
      return type || '-';
  }
}

function invoiceItemLabel(value: string) {
  switch (value) {
    case 'Electricity usage charge':
      return 'Tiền điện năng sử dụng';
    case 'Monthly lease fee':
      return 'Phí thuê hàng tháng';
    case 'Maintenance fee':
      return 'Phí bảo trì';
    case 'Monthly principal':
      return 'Gốc hàng tháng';
    case 'Interest':
      return 'Lãi';
    case 'Service fee':
      return 'Phí dịch vụ';
    case 'Fixed monthly fee':
      return 'Phí cố định hàng tháng';
    case 'Energy usage fee':
      return 'Phí sử dụng điện năng';
    case 'System sale payment':
      return 'Thanh toán mua hệ thống';
    default:
      return value;
  }
}

function invoiceStatusLabel(status: InvoiceRecord['status']) {
  if (status === 'PENDING_REVIEW') {
    return 'Chờ duyệt dữ liệu';
  }

  if (status === 'PAID') {
    return 'Đã thanh toán';
  }

  if (status === 'OVERDUE') {
    return 'Quá hạn';
  }

  if (status === 'PARTIAL') {
    return 'Thanh toán một phần';
  }

  return 'Chờ thanh toán';
}

function toInvoiceRows(invoices: InvoiceRecord[]): InvoiceRow[] {
  return invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.invoiceNumber,
    month: monthLabel(invoice),
    dueDate: formatDate(invoice.dueDate),
    amount: Number(invoice.totalAmount),
    status:
      invoice.status === 'PAID'
        ? 'Paid'
        : invoice.status === 'OVERDUE'
          ? 'Overdue'
          : invoice.status === 'PARTIAL'
            ? 'Partial'
            : invoice.status === 'PENDING_REVIEW'
              ? 'Pending'
            : 'Issued',
    model: contractTypeLabel(
      invoice.contract?.type || invoice.contract?.servicePackage?.contractType || null,
    ),
    loadConsumedKwh:
      typeof invoice.periodMetrics?.loadConsumedKwh === 'number'
        ? invoice.periodMetrics.loadConsumedKwh
        : null,
    previousReading:
      typeof invoice.periodMetrics?.previousReading === 'number'
        ? invoice.periodMetrics.previousReading
        : null,
    currentReading:
      typeof invoice.periodMetrics?.currentReading === 'number'
        ? invoice.periodMetrics.currentReading
        : null,
    sourceLabel:
      typeof invoice.periodMetrics?.sourceLabel === 'string'
        ? invoice.periodMetrics.sourceLabel
        : null,
  }));
}

function invoiceOutstanding(invoice: InvoiceRecord | null) {
  if (!invoice) {
    return 0;
  }

  return Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0);
}

function formatMeterReading(value?: number | null) {
  return value != null ? value.toLocaleString('vi-VN') : 'Chưa áp dụng đo chỉ số';
}

export default function CustomerBillingPage() {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [monthlyBillings, setMonthlyBillings] = useState<MonthlyPvBillingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listMyInvoicesRequest(), listMyMonthlyPvBillingsRequest()])
      .then(([invoiceData, billingData]) => {
        setInvoices(invoiceData);
        setMonthlyBillings(billingData);
      })
      .catch((nextError) =>
        setError(
          nextError instanceof Error ? nextError.message : 'Không thể tải dữ liệu hóa đơn.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const currentMonthEstimate = useMemo(() => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    return (
      monthlyBillings.find(
        (record) =>
          record.month === month &&
          record.year === year &&
          record.invoiceStatus === 'ESTIMATE',
      ) || null
    );
  }, [monthlyBillings]);

  const pendingReviewRecord = useMemo(
    () =>
      monthlyBillings.find(
        (record) =>
          record.invoiceStatus === 'PENDING_REVIEW' &&
          (!record.invoice || record.invoice.status === 'PENDING_REVIEW'),
      ) || null,
    [monthlyBillings],
  );

  const openInvoices = useMemo(
    () => invoices.filter((invoice) => !['PAID', 'CANCELLED'].includes(invoice.status)),
    [invoices],
  );

  const currentInvoice = useMemo(
    () =>
      [...openInvoices].sort(
        (left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
      )[0] ||
      invoices[0] ||
      null,
    [invoices, openInvoices],
  );

  const invoiceRows = useMemo(() => toInvoiceRows(invoices), [invoices]);

  const stats = useMemo<StatCardItem[]>(() => {
    const outstanding = openInvoices.reduce(
      (total, invoice) => total + invoiceOutstanding(invoice),
      0,
    );
    const paidCount = invoices.filter((invoice) => invoice.status === 'PAID').length;
    const overdueCount = invoices.filter((invoice) => invoice.status === 'OVERDUE').length;
    const nearestDueInvoice =
      [...openInvoices].sort(
        (left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
      )[0] || null;

    return [
      {
        title: 'Hóa đơn đã phát hành',
        value: String(invoices.length),
        subtitle: 'Tổng số kỳ hóa đơn đang được lưu trữ',
        delta: `${paidCount} kỳ đã hoàn tất`,
        trend: 'up',
      },
      {
        title: 'Cần thanh toán',
        value: formatCurrency(outstanding),
        subtitle: openInvoices.length
          ? `${openInvoices.length} hóa đơn chưa thanh toán`
          : currentMonthEstimate
            ? 'Trong tháng chỉ hiển thị tạm tính, chưa phát hành hóa đơn chính thức'
            : 'Không còn dư nợ cần đối soát',
        delta: nearestDueInvoice
          ? `${nearestDueInvoice.invoiceNumber} • đến hạn ${formatDate(nearestDueInvoice.dueDate)}`
          : overdueCount
            ? `${overdueCount} hóa đơn quá hạn`
            : currentMonthEstimate
              ? `Tạm tính ${formatCurrency(currentMonthEstimate.totalAmount)}`
              : 'Danh mục đang ổn định',
        trend: outstanding > 0 ? 'neutral' : 'up',
      },
      {
        title: 'Hóa đơn cần ưu tiên',
        value: currentInvoice ? currentInvoice.invoiceNumber : 'Chưa phát sinh',
        subtitle: currentInvoice
          ? `Đến hạn ${formatDate(currentInvoice.dueDate)}`
          : 'Hệ thống chưa có hóa đơn cần xử lý',
        delta: currentInvoice ? invoiceStatusLabel(currentInvoice.status) : 'Danh mục đang ổn định',
        trend: currentInvoice?.status === 'OVERDUE' ? 'down' : 'neutral',
      },
    ];
  }, [currentInvoice, currentMonthEstimate, invoices, openInvoices]);

  if (loading) {
    return (
      <SectionCard title="Hóa đơn điện" eyebrow="Đối soát và lưu trữ" dark>
        <p className="text-sm text-slate-300">Đang tải dữ liệu hóa đơn...</p>
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
        <SectionCard title="Lịch sử hóa đơn" eyebrow="Mã hóa đơn, kỳ đối soát và PDF" dark>
          {error ? (
            <div className="mb-4 rounded-[20px] border border-rose-300/15 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              {error}
            </div>
          ) : null}

          <InvoiceTable rows={invoiceRows} dark />
        </SectionCard>

        <SectionCard title="Tóm tắt kỳ đang theo dõi" eyebrow="Số tiền, sản lượng và đối soát chỉ số" dark>
          {currentMonthEstimate || pendingReviewRecord || currentInvoice ? (
            <div className="space-y-4">
              {currentMonthEstimate ? (
                <div className="portal-card-soft p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        Tạm tính tháng này
                      </p>
                      <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                        {formatCurrency(currentMonthEstimate.totalAmount)}
                      </h3>
                      <p className="mt-2 text-sm text-slate-400">
                        {monthLabel({
                          billingMonth: currentMonthEstimate.month,
                          billingYear: currentMonthEstimate.year,
                        } as InvoiceRecord)} • {formatNumber(currentMonthEstimate.pvGenerationKwh, 'kWh')}
                      </p>
                    </div>

                    <StatusPill label={currentMonthEstimate.invoiceStatus} />
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                    <p>Đơn giá: {formatCurrency(currentMonthEstimate.unitPrice)}</p>
                    <p>Thuế VAT: {currentMonthEstimate.vatRate != null ? `${currentMonthEstimate.vatRate}%` : '-'}</p>
                    <p>Dữ liệu: {currentMonthEstimate.qualitySummary || 'Đang cập nhật trong tháng'}</p>
                    <p>Nguồn: {currentMonthEstimate.periodMetrics?.sourceLabel || currentMonthEstimate.source}</p>
                  </div>
                </div>
              ) : null}

              {pendingReviewRecord ? (
                <div className="rounded-[24px] border border-amber-300/15 bg-amber-400/10 px-5 py-4 text-sm leading-6 text-amber-100">
                  Dữ liệu kỳ {String(pendingReviewRecord.month).padStart(2, '0')}/{pendingReviewRecord.year} đang chờ đối soát trước khi phát hành hóa đơn chính thức.
                </div>
              ) : null}

              {currentInvoice ? (
                <>
              <div className="portal-card-soft p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {currentInvoice.invoiceNumber}
                    </p>
                    <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                      {formatCurrency(Number(currentInvoice.totalAmount))}
                    </h3>
                    <p className="mt-2 text-sm text-slate-400">
                      Kỳ {monthLabel(currentInvoice)} • Đến hạn {formatDate(currentInvoice.dueDate)}
                    </p>
                  </div>

                  <StatusPill label={currentInvoice.status} />
                </div>

                <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                  <p>Số dư cần thanh toán: {formatCurrency(invoiceOutstanding(currentInvoice))}</p>
                  <p>VAT: {currentInvoice.vatRate != null ? `${currentInvoice.vatRate}%` : '-'}</p>
                  <p>Đã thanh toán: {formatCurrency(Number(currentInvoice.paidAmount))}</p>
                  <p>Tổng cộng: {formatCurrency(Number(currentInvoice.totalAmount || 0))}</p>
                  <p>
                    Điện tiêu thụ:{' '}
                    {currentInvoice.periodMetrics?.loadConsumedKwh != null
                      ? formatNumber(currentInvoice.periodMetrics.loadConsumedKwh, 'kWh')
                      : 'Chưa cập nhật'}
                  </p>
                  <p>
                    Nguồn dữ liệu:{' '}
                    {currentInvoice.periodMetrics?.sourceLabel || 'Chưa cập nhật'}
                  </p>
                  <p>Chỉ số cũ: {formatMeterReading(currentInvoice.periodMetrics?.previousReading)}</p>
                  <p>Chỉ số mới: {formatMeterReading(currentInvoice.periodMetrics?.currentReading)}</p>
                </div>
              </div>

              <div className="portal-card-soft p-5">
                <div className="flex items-center gap-2">
                  <ReceiptText className="h-4.5 w-4.5 text-slate-300" />
                  <p className="text-sm font-semibold text-white">Chi tiết hạng mục</p>
                </div>
                <div className="mt-4 space-y-3">
                  {currentInvoice.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 text-sm text-slate-300"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-white">{invoiceItemLabel(item.description)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Số lượng {item.quantity} • Đơn giá {formatCurrency(Number(item.unitPrice))}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold text-white">
                        {formatCurrency(Number(item.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => downloadInvoicePdfRequest(currentInvoice.id)}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Tải PDF hóa đơn
                </button>

                <Link href="/customer/payments" className="btn-ghost inline-flex items-center gap-2">
                  Đi tới thanh toán
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="portal-card-soft p-5">
              <p className="text-base font-semibold text-white">Chưa có hóa đơn cần hiển thị</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Hệ thống sẽ tự động cập nhật hóa đơn theo chu kỳ hợp đồng sau khi hoàn tất đối soát điện năng.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
