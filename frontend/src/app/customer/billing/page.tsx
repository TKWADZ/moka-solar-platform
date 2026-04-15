'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, FileDown, ReceiptText } from 'lucide-react';
import { InvoiceTable } from '@/components/invoice-table';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { StatusPill } from '@/components/status-pill';
import {
  buildCustomerBillingDisplayModel,
  contractTypeLabel,
  findBillingRecordForInvoice,
  formatBillingMeterReading,
  formatBillingUsage,
  invoiceItemLabel,
  invoiceStatusLabel,
} from '@/lib/billing-display';
import {
  downloadInvoicePdfRequest,
  listMyInvoicesRequest,
  listMyMonthlyPvBillingsRequest,
} from '@/lib/api';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMonthPeriod,
  formatNumber,
} from '@/lib/utils';
import { InvoiceRecord, InvoiceRow, MonthlyPvBillingRecord, StatCardItem } from '@/types';

function mapInvoiceStatusToRowStatus(status: InvoiceRecord['status']): InvoiceRow['status'] {
  if (status === 'PAID') {
    return 'Paid';
  }

  if (status === 'OVERDUE') {
    return 'Overdue';
  }

  if (status === 'PARTIAL') {
    return 'Partial';
  }

  if (status === 'PENDING_REVIEW') {
    return 'Pending';
  }

  return 'Issued';
}

function toInvoiceRows(
  invoices: InvoiceRecord[],
  monthlyBillings: MonthlyPvBillingRecord[],
): InvoiceRow[] {
  return invoices.map((invoice) => {
    const billing = findBillingRecordForInvoice(invoice, monthlyBillings);
    const display = buildCustomerBillingDisplayModel({ invoice, billing });

    return {
      id: invoice.id,
      number: invoice.invoiceNumber,
      month: formatMonthPeriod(invoice.billingMonth, invoice.billingYear),
      dueDate: formatDate(invoice.dueDate),
      amount: Number(display.totalAmount ?? invoice.totalAmount ?? 0),
      status: mapInvoiceStatusToRowStatus(invoice.status),
      customer: display.customerName,
      model: contractTypeLabel(
        display.contractType ||
          invoice.contract?.type ||
          invoice.contract?.servicePackage?.contractType ||
          null,
      ),
      loadConsumedKwh: display.loadConsumedKwh,
      previousReading: display.previousReading,
      currentReading: display.currentReading,
      sourceLabel: display.sourceLabel,
      billingDetails: {
        systemName: display.systemName,
        customerName: display.customerName,
        contractNumber: display.contractNumber,
        address: display.address,
        monthLabel: display.monthLabel,
        contractType: display.contractType,
        pvGenerationKwh: display.pvGenerationKwh,
        loadConsumedKwh: display.loadConsumedKwh,
        billableKwh: display.billableKwh,
        unitPrice: display.unitPrice,
        subtotalAmount: display.subtotalAmount,
        vatRate: display.vatRate,
        taxAmount: display.taxAmount,
        discountAmount: display.discountAmount,
        totalAmount: display.totalAmount,
        previousReading: display.previousReading,
        currentReading: display.currentReading,
        syncStatus: display.syncStatus,
        dataQualityStatus: display.dataQualityStatus,
        invoiceStatus: display.workflowStatus,
        syncTime: display.syncTime,
        sourceLabel: display.sourceLabel,
        transferAmount: display.transferAmount,
        bankTransferNote: display.bankTransferNote,
        qualitySummary: display.qualitySummary,
        note: display.note,
      },
    };
  });
}

function invoiceOutstanding(invoice: InvoiceRecord | null) {
  if (!invoice) {
    return 0;
  }

  return Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0);
}

type DetailField = {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
};

function BillingField({ field }: { field: DetailField }) {
  return (
    <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{field.label}</p>
      <div
        className={`mt-2 text-sm leading-6 ${field.emphasis ? 'font-semibold text-white' : 'text-slate-200'}`}
      >
        {field.value}
      </div>
    </div>
  );
}

function BillingSpotlightCard({
  eyebrow,
  invoice,
  billing,
  helperText,
  actions,
}: {
  eyebrow: string;
  invoice?: InvoiceRecord | null;
  billing?: MonthlyPvBillingRecord | null;
  helperText?: string;
  actions?: ReactNode;
}) {
  const display = buildCustomerBillingDisplayModel({ invoice, billing });
  const billableKwhVisible =
    display.billableKwh != null &&
    (display.pvGenerationKwh == null ||
      Math.abs(Number(display.billableKwh) - Number(display.pvGenerationKwh)) > 0.05);

  const detailFields: DetailField[] = [
    {
      label: 'PV tháng',
      value:
        display.pvGenerationKwh != null
          ? formatNumber(display.pvGenerationKwh, 'kWh')
          : 'Chưa cập nhật',
    },
    {
      label: 'Điện tiêu thụ',
      value: formatBillingUsage(display.loadConsumedKwh),
    },
    ...(billableKwhVisible
      ? [
          {
            label: 'Sản lượng kWh',
            value:
              display.billableKwh != null
                ? formatNumber(display.billableKwh, 'kWh')
                : 'Chưa cập nhật',
          } satisfies DetailField,
        ]
      : []),
    {
      label: 'Đơn giá',
      value:
        display.unitPrice != null ? formatCurrency(display.unitPrice) : 'Chưa cấu hình',
    },
    {
      label: 'Tiền trước VAT',
      value:
        display.subtotalAmount != null
          ? formatCurrency(display.subtotalAmount)
          : 'Chưa cập nhật',
    },
    {
      label: 'VAT',
      value: display.vatRate != null ? `${display.vatRate}%` : '-',
    },
    {
      label: 'Tiền VAT',
      value: display.taxAmount != null ? formatCurrency(display.taxAmount) : '-',
    },
    {
      label: 'Chiết khấu',
      value:
        display.discountAmount != null ? formatCurrency(display.discountAmount) : '-',
    },
    {
      label: 'Tổng cộng',
      value:
        display.totalAmount != null ? formatCurrency(display.totalAmount) : 'Chưa cập nhật',
      emphasis: true,
    },
    ...(invoice
      ? [
          {
            label: 'Số dư cần thanh toán',
            value: formatCurrency(display.outstandingAmount || 0),
            emphasis: true,
          } satisfies DetailField,
          {
            label: 'Đã thanh toán',
            value: formatCurrency(display.paidAmount || 0),
          } satisfies DetailField,
        ]
      : []),
    {
      label: 'Chỉ số cũ',
      value: formatBillingMeterReading(display.previousReading),
    },
    {
      label: 'Chỉ số mới',
      value: formatBillingMeterReading(display.currentReading),
    },
    {
      label: 'Sync',
      value: display.syncStatus || 'Chưa cập nhật',
    },
    {
      label: 'Chất lượng',
      value: display.dataQualityStatus || 'Chưa cập nhật',
    },
    {
      label: 'Hóa đơn',
      value: display.workflowStatus || 'Chưa cập nhật',
    },
    {
      label: 'Loại hóa đơn',
      value: contractTypeLabel(display.contractType),
    },
    {
      label: 'Đồng bộ',
      value: display.syncTime ? formatDateTime(display.syncTime) : 'Chưa cập nhật',
    },
    {
      label: 'Nguồn dữ liệu',
      value: display.sourceLabel || 'Chưa cập nhật',
    },
    ...(display.transferAmount != null
      ? [
          {
            label: 'Transfer amount',
            value: formatCurrency(display.transferAmount),
          } satisfies DetailField,
        ]
      : []),
    ...(display.bankTransferNote
      ? [
          {
            label: 'Bank transfer note',
            value: <span className="break-all font-mono text-xs">{display.bankTransferNote}</span>,
          } satisfies DetailField,
        ]
      : []),
  ];

  return (
    <div className="portal-card-soft p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-slate-300">{display.monthLabel}</p>
            {display.headerStatus ? <StatusPill label={display.headerStatus} /> : null}
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            {display.systemName}
          </h3>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-400">
            {display.address ? <span>{display.address}</span> : null}
            {display.contractNumber ? <span>Mã HĐ: {display.contractNumber}</span> : null}
            {display.customerName ? <span>Khách hàng: {display.customerName}</span> : null}
          </div>
          {helperText ? <p className="mt-3 text-sm leading-6 text-slate-300">{helperText}</p> : null}
        </div>

        <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-right">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Giá trị hiện tại
          </p>
          <p className="mt-2 text-xl font-semibold text-white">
            {display.totalAmount != null ? formatCurrency(display.totalAmount) : 'Chưa cập nhật'}
          </p>
          {invoice?.dueDate ? (
            <p className="mt-2 text-xs text-slate-400">Đến hạn {formatDate(invoice.dueDate)}</p>
          ) : null}
        </div>
      </div>

      {(display.syncStatus || display.dataQualityStatus || display.workflowStatus) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {display.syncStatus ? <StatusPill label={display.syncStatus} /> : null}
          {display.dataQualityStatus ? <StatusPill label={display.dataQualityStatus} /> : null}
          {display.workflowStatus ? <StatusPill label={display.workflowStatus} /> : null}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {detailFields.map((field) => (
          <BillingField key={field.label} field={field} />
        ))}
      </div>

      {display.qualitySummary ? (
        <div className="mt-4 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300">
          {display.qualitySummary}
        </div>
      ) : null}

      {display.note ? (
        <div className="mt-3 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300">
          {display.note}
        </div>
      ) : null}

      {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
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
          nextError instanceof Error
            ? nextError.message
            : 'Không thể tải dữ liệu hóa đơn.',
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

  const currentInvoiceBilling = useMemo(
    () => findBillingRecordForInvoice(currentInvoice, monthlyBillings),
    [currentInvoice, monthlyBillings],
  );

  const invoiceRows = useMemo(
    () => toInvoiceRows(invoices, monthlyBillings),
    [invoices, monthlyBillings],
  );

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

          <InvoiceTable rows={invoiceRows} dark variant="billingDetailed" />
        </SectionCard>

        <SectionCard
          title="Tóm tắt kỳ đang theo dõi"
          eyebrow="Giữ layout mới nhưng mở rộng nội dung hóa đơn theo dữ liệu admin"
          dark
        >
          {currentMonthEstimate || pendingReviewRecord || currentInvoice ? (
            <div className="space-y-4">
              {currentMonthEstimate ? (
                <BillingSpotlightCard
                  eyebrow="Tạm tính tháng này"
                  billing={currentMonthEstimate}
                  helperText="Trong tháng hệ thống chỉ hiển thị sản lượng và số tiền tạm tính. Hóa đơn chính thức sẽ được chốt sau khi hoàn tất đối soát dữ liệu tháng."
                />
              ) : null}

              {pendingReviewRecord ? (
                <div className="rounded-[24px] border border-amber-300/15 bg-amber-400/10 px-5 py-4 text-sm leading-6 text-amber-100">
                  Dữ liệu kỳ {String(pendingReviewRecord.month).padStart(2, '0')}/
                  {pendingReviewRecord.year} đang chờ đối soát. Hệ thống sẽ không tự phát hành
                  hoặc gửi Zalo cho đến khi dữ liệu đạt trạng thái sẵn sàng.
                </div>
              ) : null}

              {currentInvoice ? (
                <>
                  <BillingSpotlightCard
                    eyebrow={currentInvoice.invoiceNumber}
                    invoice={currentInvoice}
                    billing={currentInvoiceBilling}
                    helperText={`Kỳ ${formatMonthPeriod(
                      currentInvoice.billingMonth,
                      currentInvoice.billingYear,
                    )} • Đến hạn ${formatDate(currentInvoice.dueDate)}`}
                    actions={
                      <>
                        <button
                          type="button"
                          onClick={() => downloadInvoicePdfRequest(currentInvoice.id)}
                          className="btn-primary inline-flex items-center gap-2"
                        >
                          <FileDown className="h-4 w-4" />
                          Tải PDF hóa đơn
                        </button>

                        <Link
                          href="/customer/payments"
                          className="btn-ghost inline-flex items-center gap-2"
                        >
                          Đi tới thanh toán
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </>
                    }
                  />

                  <div className="portal-card-soft p-5">
                    <div className="flex items-center gap-2">
                      <ReceiptText className="h-4.5 w-4.5 text-slate-300" />
                      <p className="text-sm font-semibold text-white">Chi tiết hạng mục</p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {currentInvoice.items.length ? (
                        currentInvoice.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-start justify-between gap-4 text-sm text-slate-300"
                          >
                            <div className="min-w-0">
                              <p className="font-medium text-white">
                                {invoiceItemLabel(item.description)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                Số lượng {item.quantity} • Đơn giá{' '}
                                {formatCurrency(Number(item.unitPrice))}
                              </p>
                            </div>
                            <span className="shrink-0 font-semibold text-white">
                              {formatCurrency(Number(item.amount))}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm leading-6 text-slate-300">
                          Hóa đơn này chưa có danh sách hạng mục chi tiết.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="portal-card-soft p-5">
              <p className="text-base font-semibold text-white">Chưa có hóa đơn cần hiển thị</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Hệ thống sẽ tự động cập nhật hóa đơn theo chu kỳ hợp đồng sau khi hoàn tất đối
                soát điện năng.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
