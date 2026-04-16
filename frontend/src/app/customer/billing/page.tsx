'use client';

import Link from 'next/link';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, FileDown, ReceiptText } from 'lucide-react';
import { InvoiceTable } from '@/components/invoice-table';
import { useCustomerTheme } from '@/components/customer-theme-provider';
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
  cn,
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
        summarySource: display.summarySource,
        liveAsOf: display.liveAsOf,
        snapshotAt: display.snapshotAt,
        isCurrentOpenPeriod: display.isCurrentOpenPeriod,
        isFinalized: display.isFinalized,
        liveSummaryLabel: display.liveSummaryLabel,
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

function isLiveCurrentBillingRecord(record?: MonthlyPvBillingRecord | null) {
  return Boolean(record?.isCurrentOpenPeriod && !record?.isFinalized);
}

type DetailField = {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
};

function BillingField({ field }: { field: DetailField }) {
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';

  return (
    <div className="customer-soft-card-muted px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{field.label}</p>
      <div
        className={cn(
          'mt-2 text-sm leading-6',
          field.emphasis
            ? dark
              ? 'font-semibold text-white'
              : 'font-semibold text-slate-950'
            : dark
              ? 'text-slate-200'
              : 'text-slate-700',
        )}
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
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';
  const display = buildCustomerBillingDisplayModel({ invoice, billing });
  const billableKwhVisible =
    display.billableKwh != null &&
    (display.pvGenerationKwh == null ||
      Math.abs(Number(display.billableKwh) - Number(display.pvGenerationKwh)) > 0.05);

  const detailFields: DetailField[] = [
    {
      label: 'PV thang',
      value:
        display.pvGenerationKwh != null
          ? formatNumber(display.pvGenerationKwh, 'kWh')
          : 'Chua cap nhat',
    },
    {
      label: 'Dien tieu thu',
      value: formatBillingUsage(display.loadConsumedKwh),
    },
    ...(billableKwhVisible
      ? [
          {
            label: 'San luong kWh',
            value:
              display.billableKwh != null
                ? formatNumber(display.billableKwh, 'kWh')
                : 'Chua cap nhat',
          } satisfies DetailField,
        ]
      : []),
    {
      label: 'Don gia',
      value: display.unitPrice != null ? formatCurrency(display.unitPrice) : 'Chua cau hinh',
    },
    {
      label: 'Tien truoc VAT',
      value:
        display.subtotalAmount != null
          ? formatCurrency(display.subtotalAmount)
          : 'Chua cap nhat',
    },
    {
      label: 'VAT',
      value: display.vatRate != null ? `${display.vatRate}%` : '-',
    },
    {
      label: 'Tien VAT',
      value: display.taxAmount != null ? formatCurrency(display.taxAmount) : '-',
    },
    {
      label: 'Chiet khau',
      value: display.discountAmount != null ? formatCurrency(display.discountAmount) : '-',
    },
    {
      label: 'Tong cong',
      value: display.totalAmount != null ? formatCurrency(display.totalAmount) : 'Chua cap nhat',
      emphasis: true,
    },
    ...(invoice
      ? [
          {
            label: 'So du can thanh toan',
            value: formatCurrency(display.outstandingAmount || 0),
            emphasis: true,
          } satisfies DetailField,
          {
            label: 'Da thanh toan',
            value: formatCurrency(display.paidAmount || 0),
          } satisfies DetailField,
        ]
      : []),
    {
      label: 'Chi so cu',
      value: formatBillingMeterReading(display.previousReading),
    },
    {
      label: 'Chi so moi',
      value: formatBillingMeterReading(display.currentReading),
    },
    {
      label: 'Sync',
      value: display.syncStatus || 'Chua cap nhat',
    },
    {
      label: 'Chat luong',
      value: display.dataQualityStatus || 'Chua cap nhat',
    },
    {
      label: 'Hoa don',
      value: display.workflowStatus || 'Chua cap nhat',
    },
    {
      label: 'Loai hoa don',
      value: contractTypeLabel(display.contractType),
    },
    {
      label: 'Dong bo',
      value: display.syncTime ? formatDateTime(display.syncTime) : 'Chua cap nhat',
    },
    {
      label: 'Nguon du lieu',
      value: display.sourceLabel || 'Chua cap nhat',
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
    <div className="customer-soft-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className={cn('text-sm font-medium', dark ? 'text-slate-300' : 'text-slate-600')}>
              {display.monthLabel}
            </p>
            {display.headerStatus ? <StatusPill label={display.headerStatus} /> : null}
          </div>
          <h3 className={cn('mt-3 text-2xl font-semibold tracking-tight', dark ? 'text-white' : 'text-slate-950')}>
            {display.systemName}
          </h3>
          <div className={cn('mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
            {display.address ? <span>{display.address}</span> : null}
            {display.contractNumber ? <span>Ma HD: {display.contractNumber}</span> : null}
            {display.customerName ? <span>Khach hang: {display.customerName}</span> : null}
          </div>
          {helperText ? (
            <p className={cn('mt-3 text-sm leading-6', dark ? 'text-slate-300' : 'text-slate-600')}>
              {helperText}
            </p>
          ) : null}
        </div>

        <div className="customer-soft-card-muted px-4 py-3 text-right">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Gia tri hien tai</p>
          <p className={cn('mt-2 text-xl font-semibold', dark ? 'text-white' : 'text-slate-950')}>
            {display.totalAmount != null ? formatCurrency(display.totalAmount) : 'Chua cap nhat'}
          </p>
          {invoice?.dueDate ? (
            <p className={cn('mt-2 text-xs', dark ? 'text-slate-400' : 'text-slate-500')}>
              Den han {formatDate(invoice.dueDate)}
            </p>
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

      {display.liveSummaryLabel ? (
        <div className="mt-4 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
          {display.liveSummaryLabel}
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {detailFields.map((field) => (
          <BillingField key={field.label} field={field} />
        ))}
      </div>

      {display.qualitySummary ? (
        <div className={cn(
          'mt-4 rounded-[20px] border px-4 py-3 text-sm leading-6',
          dark
            ? 'border-white/10 bg-white/[0.04] text-slate-200'
            : 'border-slate-200 bg-slate-50 text-slate-700',
        )}>
          {display.qualitySummary}
        </div>
      ) : null}

      {display.note ? (
        <div className={cn(
          'mt-3 rounded-[20px] border px-4 py-3 text-sm leading-6',
          dark
            ? 'border-white/10 bg-white/[0.04] text-slate-200'
            : 'border-slate-200 bg-slate-50 text-slate-700',
        )}>
          {display.note}
        </div>
      ) : null}

      {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}

export default function CustomerBillingPage() {
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';
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
            : 'Khong the tai du lieu hoa don.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const currentOpenBillingRecord = useMemo(
    () =>
      [...monthlyBillings]
        .filter((record) => isLiveCurrentBillingRecord(record))
        .sort((left, right) => {
          const leftTime = new Date(left.liveAsOf || left.syncTime || left.updatedAt).getTime();
          const rightTime = new Date(right.liveAsOf || right.syncTime || right.updatedAt).getTime();
          return rightTime - leftTime;
        })[0] || null,
    [monthlyBillings],
  );

  const currentOpenSnapshotInvoice = useMemo(() => {
    if (!currentOpenBillingRecord) {
      return null;
    }

    return (
      invoices.find((invoice) => invoice.id === currentOpenBillingRecord.invoiceId) ||
      currentOpenBillingRecord.invoice ||
      null
    );
  }, [currentOpenBillingRecord, invoices]);

  const pendingReviewRecord = useMemo(
    () =>
      monthlyBillings.find(
        (record) =>
          record.id !== currentOpenBillingRecord?.id &&
          record.invoiceStatus === 'PENDING_REVIEW' &&
          (!record.invoice || record.invoice.status === 'PENDING_REVIEW'),
      ) || null,
    [currentOpenBillingRecord?.id, monthlyBillings],
  );

  const openInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          !['PAID', 'CANCELLED'].includes(invoice.status) &&
          invoice.id !== currentOpenSnapshotInvoice?.id,
      ),
    [currentOpenSnapshotInvoice?.id, invoices],
  );

  const currentInvoice = useMemo(
    () =>
      [...openInvoices].sort(
        (left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
      )[0] ||
      invoices.find((invoice) => invoice.id !== currentOpenSnapshotInvoice?.id) ||
      null,
    [currentOpenSnapshotInvoice?.id, invoices, openInvoices],
  );

  const currentInvoiceBilling = useMemo(
    () => findBillingRecordForInvoice(currentInvoice, monthlyBillings),
    [currentInvoice, monthlyBillings],
  );

  const invoiceRows = useMemo(() => toInvoiceRows(invoices, monthlyBillings), [invoices, monthlyBillings]);

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
        title: 'Hoa don da phat hanh',
        value: String(invoices.length),
        subtitle: 'Tong so ky hoa don dang duoc luu tru',
        delta: `${paidCount} ky da hoan tat`,
        trend: 'up',
      },
      {
        title: 'Can thanh toan',
        value: formatCurrency(outstanding),
        subtitle: openInvoices.length
          ? `${openInvoices.length} hoa don chua thanh toan`
          : currentOpenBillingRecord
            ? 'Trong thang chi hien thi tam tinh, chua phat hanh hoa don chinh thuc'
            : 'Khong con du no can doi soat',
        delta: nearestDueInvoice
          ? `${nearestDueInvoice.invoiceNumber} · den han ${formatDate(nearestDueInvoice.dueDate)}`
          : overdueCount
            ? `${overdueCount} hoa don qua han`
            : currentOpenBillingRecord
              ? `Tam tinh ${formatCurrency(currentOpenBillingRecord.totalAmount)}`
              : 'Danh muc dang on dinh',
        trend: outstanding > 0 ? 'neutral' : 'up',
      },
      {
        title: 'Hoa don can uu tien',
        value: currentInvoice ? currentInvoice.invoiceNumber : 'Chua phat sinh',
        subtitle: currentInvoice
          ? `Den han ${formatDate(currentInvoice.dueDate)}`
          : 'He thong chua co hoa don can xu ly',
        delta: currentInvoice ? invoiceStatusLabel(currentInvoice.status) : 'Danh muc dang on dinh',
        trend: currentInvoice?.status === 'OVERDUE' ? 'down' : 'neutral',
      },
    ];
  }, [currentInvoice, currentOpenBillingRecord, invoices, openInvoices]);

  if (loading) {
    return (
      <SectionCard title="Hoa don dien" eyebrow="Doi soat va luu tru">
        <p className={cn('text-sm', dark ? 'text-slate-300' : 'text-slate-600')}>
          Dang tai du lieu hoa don...
        </p>
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
        <SectionCard title="Lich su hoa don" eyebrow="Ma hoa don, ky doi soat va PDF">
          {error ? (
            <div className="mb-4 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <InvoiceTable rows={invoiceRows} variant="billingDetailed" />
        </SectionCard>

        <SectionCard
          title="Tom tat ky dang theo doi"
          eyebrow="Giu layout moi nhung mo rong noi dung hoa don theo du lieu admin"
        >
          {currentOpenBillingRecord || pendingReviewRecord || currentInvoice ? (
            <div className="space-y-4">
              {currentOpenBillingRecord ? (
                <BillingSpotlightCard
                  eyebrow="Tam tinh thang nay"
                  billing={currentOpenBillingRecord}
                  helperText={
                    currentOpenSnapshotInvoice
                      ? `PDF ${currentOpenSnapshotInvoice.invoiceNumber} van la snapshot export va khong khoa so live dang hien thi tren trang nay.`
                      : 'Trong thang he thong chi hien thi san luong va so tien tam tinh theo du lieu live tu daily energy. Hoa don chinh thuc se duoc chot sau khi hoan tat doi soat du lieu thang.'
                  }
                  actions={
                    currentOpenSnapshotInvoice ? (
                      <button
                        type="button"
                        onClick={() => downloadInvoicePdfRequest(currentOpenSnapshotInvoice.id)}
                        className="btn-secondary-light inline-flex items-center gap-2"
                      >
                        <FileDown className="h-4 w-4" />
                        Tai PDF snapshot
                      </button>
                    ) : undefined
                  }
                />
              ) : null}

              {pendingReviewRecord ? (
                <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-700">
                  Du lieu ky {String(pendingReviewRecord.month).padStart(2, '0')}/{pendingReviewRecord.year} dang cho doi soat.
                  He thong se khong tu phat hanh hoac gui Zalo cho den khi du lieu dat trang thai san sang.
                </div>
              ) : null}

              {currentInvoice ? (
                <>
                  <BillingSpotlightCard
                    eyebrow={currentInvoice.invoiceNumber}
                    invoice={currentInvoice}
                    billing={currentInvoiceBilling}
                    helperText={`Ky ${formatMonthPeriod(
                      currentInvoice.billingMonth,
                      currentInvoice.billingYear,
                    )} · Den han ${formatDate(currentInvoice.dueDate)}`}
                    actions={
                      <>
                        <button
                          type="button"
                          onClick={() => downloadInvoicePdfRequest(currentInvoice.id)}
                          className="btn-primary inline-flex items-center gap-2"
                        >
                          <FileDown className="h-4 w-4" />
                          Tai PDF hoa don
                        </button>

                        <Link
                          href="/customer/payments"
                          className="btn-secondary-light inline-flex items-center gap-2"
                        >
                          Di toi thanh toan
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </>
                    }
                  />

                  <div className="customer-soft-card p-5">
                    <div className="flex items-center gap-2">
                      <ReceiptText className="h-4.5 w-4.5 text-slate-400" />
                      <p className={cn('text-sm font-semibold', dark ? 'text-white' : 'text-slate-950')}>
                        Chi tiet hang muc
                      </p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {currentInvoice.items.length ? (
                        currentInvoice.items.map((item) => (
                          <div
                            key={item.id}
                            className={cn(
                              'flex items-start justify-between gap-4 text-sm',
                              dark ? 'text-slate-200' : 'text-slate-700',
                            )}
                          >
                            <div className="min-w-0">
                              <p className={cn('font-medium', dark ? 'text-white' : 'text-slate-950')}>
                                {invoiceItemLabel(item.description)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                So luong {item.quantity} · Don gia {formatCurrency(Number(item.unitPrice))}
                              </p>
                            </div>
                            <span className={cn('shrink-0 font-semibold', dark ? 'text-white' : 'text-slate-950')}>
                              {formatCurrency(Number(item.amount))}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className={cn('text-sm leading-6', dark ? 'text-slate-300' : 'text-slate-600')}>
                          Hoa don nay chua co danh sach hang muc chi tiet.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="customer-soft-card p-5">
              <p className={cn('text-base font-semibold', dark ? 'text-white' : 'text-slate-950')}>
                Chua co hoa don can hien thi
              </p>
              <p className={cn('mt-2 text-sm leading-6', dark ? 'text-slate-300' : 'text-slate-600')}>
                He thong se tu dong cap nhat hoa don theo chu ky hop dong sau khi hoan tat doi soat dien nang.
              </p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
