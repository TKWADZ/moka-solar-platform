'use client';

import { useCustomerTheme } from '@/components/customer-theme-provider';
import { formatBillingMeterReading } from '@/lib/billing-display';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import { InvoiceRow } from '@/types';
import { StatusPill } from './status-pill';

function formatReading(value?: number | null) {
  return formatBillingMeterReading(value);
}

function formatUsage(value?: number | null) {
  return value != null ? formatNumber(value, 'kWh') : 'Chưa cập nhật';
}

function detailCardClasses(dark: boolean) {
  return dark
    ? 'rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3'
    : 'customer-soft-card-muted px-4 py-3';
}

function detailLabelClasses(dark: boolean) {
  return dark
    ? 'text-[11px] uppercase tracking-[0.18em] text-slate-500'
    : 'text-[11px] uppercase tracking-[0.18em] text-slate-400';
}

function detailValueClasses(dark: boolean, emphasis = false) {
  if (dark) {
    return emphasis
      ? 'mt-2 text-sm font-semibold leading-6 text-white'
      : 'mt-2 text-sm leading-6 text-slate-200';
  }

  return emphasis
    ? 'mt-2 text-sm font-semibold leading-6 text-slate-950'
    : 'mt-2 text-sm leading-6 text-slate-700';
}

function BillingDetailItem({
  label,
  value,
  dark,
  emphasis = false,
}: {
  label: string;
  value: string;
  dark: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className={detailCardClasses(dark)}>
      <p className={detailLabelClasses(dark)}>{label}</p>
      <p className={detailValueClasses(dark, emphasis)}>{value}</p>
    </div>
  );
}

function renderBillingDetailedCards(rows: InvoiceRow[], dark: boolean) {
  return (
    <div className="grid gap-4">
      {rows.map((row) => {
        const details = row.billingDetails;
        const primaryTitle = details?.systemName || row.number;
        const paymentBadgeLabel = details?.invoiceStatus || row.status;
        const metadataItems = [
          details?.customerName
            ? { label: 'Tên khách hàng', value: details.customerName }
            : null,
          details?.contractNumber
            ? { label: 'Mã hợp đồng', value: details.contractNumber }
            : null,
          details?.address ? { label: 'Địa chỉ', value: details.address } : null,
          {
            label: 'Kỳ hóa đơn',
            value: details?.monthLabel || row.month,
          },
          row.model ? { label: 'Mô hình', value: row.model } : null,
          row.dueDate ? { label: 'Hạn thanh toán', value: row.dueDate } : null,
        ].filter((item): item is { label: string; value: string } => Boolean(item));

        const visibleBillableKwh =
          details?.billableKwh != null &&
          (details?.pvGenerationKwh == null ||
            Math.abs(Number(details.billableKwh) - Number(details.pvGenerationKwh)) > 0.05);

        const billingDetailItems = [
          {
            label: 'PV tháng',
            value:
              details?.pvGenerationKwh != null
                ? formatNumber(details.pvGenerationKwh, 'kWh')
                : 'Chưa cập nhật',
          },
          {
            label: 'Điện tiêu thụ',
            value: formatUsage(details?.loadConsumedKwh ?? row.loadConsumedKwh),
          },
          ...(visibleBillableKwh
            ? [
                {
                  label: 'Sản lượng kWh',
                  value:
                    details?.billableKwh != null
                      ? formatNumber(details.billableKwh, 'kWh')
                      : 'Chưa cập nhật',
                },
              ]
            : []),
          {
            label: 'Đơn giá',
            value:
              details?.unitPrice != null
                ? formatCurrency(details.unitPrice)
                : 'Chưa cấu hình',
          },
          {
            label: 'Tiền trước VAT',
            value:
              details?.subtotalAmount != null
                ? formatCurrency(details.subtotalAmount)
                : 'Chưa cập nhật',
          },
          {
            label: 'VAT',
            value: details?.vatRate != null ? `${details.vatRate}%` : '-',
          },
          {
            label: 'Tiền VAT',
            value:
              details?.taxAmount != null ? formatCurrency(details.taxAmount) : '-',
          },
          {
            label: 'Chiết khấu',
            value:
              details?.discountAmount != null
                ? formatCurrency(details.discountAmount)
                : '-',
          },
          {
            label: 'Tổng cộng',
            value:
              details?.totalAmount != null
                ? formatCurrency(details.totalAmount)
                : formatCurrency(row.amount),
            emphasis: true,
          },
          {
            label: 'Chỉ số cũ',
            value: formatReading(details?.previousReading ?? row.previousReading),
          },
          {
            label: 'Chỉ số mới',
            value: formatReading(details?.currentReading ?? row.currentReading),
          },
          {
            label: 'Sync',
            value: details?.syncStatus || 'Chưa cập nhật',
          },
          {
            label: 'Chất lượng',
            value: details?.dataQualityStatus || 'Chưa cập nhật',
          },
          {
            label: 'Hóa đơn',
            value: details?.invoiceStatus || row.status,
          },
          {
            label: 'Đồng bộ',
            value: details?.syncTime ? formatDateTime(details.syncTime) : 'Chưa cập nhật',
          },
        ];

        return (
          <article
            key={row.id}
            className={dark ? 'portal-card-soft p-5' : 'customer-surface-card p-5'}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className={detailLabelClasses(dark)}>{details?.monthLabel || row.month}</p>
                <h3
                  className={
                    dark
                      ? 'mt-2 text-xl font-semibold tracking-tight text-white'
                      : 'mt-2 text-xl font-semibold tracking-tight text-slate-950'
                  }
                >
                  {primaryTitle}
                </h3>
                <p
                  className={
                    dark
                      ? 'mt-2 text-sm text-slate-400'
                      : 'mt-2 text-sm text-slate-500'
                  }
                >
                  Hóa đơn {row.number}
                </p>
                {details?.liveSummaryLabel ? (
                  <p
                    className={
                      dark
                        ? 'mt-2 text-sm text-emerald-200'
                        : 'mt-2 text-sm text-emerald-700'
                    }
                  >
                    {details.liveSummaryLabel}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col items-end gap-3">
                <StatusPill label={paymentBadgeLabel} />
                <div className={detailCardClasses(dark)}>
                  <p className={detailLabelClasses(dark)}>Tổng cộng</p>
                  <p className={detailValueClasses(dark, true)}>
                    {details?.totalAmount != null
                      ? formatCurrency(details.totalAmount)
                      : formatCurrency(row.amount)}
                  </p>
                </div>
              </div>
            </div>

            {metadataItems.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {metadataItems.map((item) => (
                  <BillingDetailItem
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    dark={dark}
                  />
                ))}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {billingDetailItems.map((item) => (
                <BillingDetailItem
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  dark={dark}
                  emphasis={Boolean(item.emphasis)}
                />
              ))}
            </div>

            {(details?.sourceLabel ||
              details?.transferAmount != null ||
              details?.bankTransferNote) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {details?.sourceLabel ? (
                  <BillingDetailItem
                    label="Nguồn dữ liệu"
                    value={details.sourceLabel}
                    dark={dark}
                  />
                ) : null}
                {details?.transferAmount != null ? (
                  <BillingDetailItem
                    label="Transfer amount"
                    value={formatCurrency(details.transferAmount)}
                    dark={dark}
                  />
                ) : null}
                {details?.bankTransferNote ? (
                  <div className={detailCardClasses(dark)}>
                    <p className={detailLabelClasses(dark)}>Bank transfer note</p>
                    <p
                      className={`${detailValueClasses(dark)} break-all font-mono text-xs`}
                    >
                      {details.bankTransferNote}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {details?.qualitySummary ? (
              <div
                className={
                  dark
                    ? 'mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300'
                    : 'mt-4 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700'
                }
              >
                {details.qualitySummary}
              </div>
            ) : null}

            {details?.note ? (
              <div
                className={
                  dark
                    ? 'mt-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-300'
                    : 'mt-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700'
                }
              >
                {details.note}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function InvoiceTable({
  rows,
  dark = false,
  variant = 'summary',
}: {
  rows: InvoiceRow[];
  dark?: boolean;
  variant?: 'summary' | 'billingDetailed';
}) {
  const { enabled, theme } = useCustomerTheme();
  const resolvedDark = dark || (enabled && theme === 'dark');
  const showMeterColumns = rows.some(
    (row) => row.previousReading != null || row.currentReading != null,
  );

  if (!rows.length) {
    return (
      <div
        className={
          resolvedDark
            ? 'portal-card-soft p-6 text-sm text-slate-300'
            : 'customer-soft-card p-6 text-sm text-slate-600'
        }
      >
        Chưa có hóa đơn nào để hiển thị.
      </div>
    );
  }

  if (variant === 'billingDetailed') {
    return renderBillingDetailedCards(rows, resolvedDark);
  }

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <div
            key={row.id}
            className={resolvedDark ? 'portal-card-soft p-4' : 'customer-soft-card p-4'}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={
                    resolvedDark
                      ? 'text-xs uppercase tracking-[0.18em] text-slate-500'
                      : 'text-xs uppercase tracking-[0.18em] text-slate-400'
                  }
                >
                  Mã hóa đơn
                </p>
                <p
                  className={
                    resolvedDark
                      ? 'mt-2 text-base font-semibold text-white'
                      : 'mt-2 text-base font-semibold text-slate-950'
                  }
                >
                  {row.number}
                </p>
                {row.customer ? (
                  <p className={resolvedDark ? 'mt-1 text-sm text-slate-400' : 'mt-1 text-sm text-slate-500'}>
                    {row.customer}
                  </p>
                ) : null}
              </div>
              <StatusPill label={row.status} />
            </div>

            <div
              className={
                resolvedDark
                  ? 'mt-4 grid gap-3 text-sm text-slate-300'
                  : 'mt-4 grid gap-3 text-sm text-slate-700'
              }
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Kỳ hóa đơn</span>
                <span className="font-medium">{row.month}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Mô hình</span>
                <span className="text-right font-medium">{row.model || '-'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Hạn thanh toán</span>
                <span className="font-medium">{row.dueDate}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Điện tiêu thụ</span>
                <span className="text-right font-medium">{formatUsage(row.loadConsumedKwh)}</span>
              </div>
              {showMeterColumns ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Chỉ số cũ</span>
                    <span className="text-right font-medium">{formatReading(row.previousReading)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Chỉ số mới</span>
                    <span className="text-right font-medium">{formatReading(row.currentReading)}</span>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Số tiền</span>
                <span
                  className={
                    resolvedDark
                      ? 'break-words text-right font-semibold tabular-nums text-white'
                      : 'break-words text-right font-semibold tabular-nums text-slate-950'
                  }
                >
                  {formatCurrency(row.amount)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className={
          resolvedDark
            ? 'hidden min-w-0 overflow-hidden md:block portal-card'
            : 'hidden min-w-0 overflow-hidden md:block customer-surface-card'
        }
      >
        <div className="overflow-x-auto">
          <table className={`${showMeterColumns ? 'min-w-[1220px]' : 'min-w-[980px]'} w-full text-left`}>
            <thead
              className={
                resolvedDark
                  ? 'border-b border-white/10 text-[11px] uppercase tracking-[0.18em] text-slate-500'
                  : 'border-b border-slate-200 text-[11px] uppercase tracking-[0.18em] text-slate-400'
              }
            >
              <tr>
                <th className="px-5 py-4 font-semibold">Mã hóa đơn</th>
                <th className="px-5 py-4 font-semibold">Kỳ hóa đơn</th>
                <th className="px-5 py-4 font-semibold">Mô hình</th>
                <th className="px-5 py-4 font-semibold">Hạn thanh toán</th>
                <th className="px-5 py-4 font-semibold">Điện tiêu thụ</th>
                {showMeterColumns ? <th className="px-5 py-4 font-semibold">Chỉ số cũ</th> : null}
                {showMeterColumns ? <th className="px-5 py-4 font-semibold">Chỉ số mới</th> : null}
                <th className="px-5 py-4 font-semibold">Số tiền</th>
                <th className="px-5 py-4 font-semibold">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    resolvedDark
                      ? 'border-b border-white/6 align-top'
                      : 'border-b border-slate-200/70 align-top'
                  }
                >
                  <td className="px-5 py-5">
                    <p className={resolvedDark ? 'font-semibold text-white' : 'font-semibold text-slate-950'}>
                      {row.number}
                    </p>
                    {row.customer ? (
                      <p className={resolvedDark ? 'mt-1 text-xs text-slate-400' : 'mt-1 text-xs text-slate-500'}>
                        {row.customer}
                      </p>
                    ) : null}
                  </td>
                  <td className={resolvedDark ? 'px-5 py-5 text-sm text-slate-300' : 'px-5 py-5 text-sm text-slate-700'}>
                    {row.month}
                  </td>
                  <td className={resolvedDark ? 'px-5 py-5 text-sm text-slate-300' : 'px-5 py-5 text-sm text-slate-700'}>
                    {row.model || '-'}
                  </td>
                  <td className={resolvedDark ? 'px-5 py-5 text-sm text-slate-300' : 'px-5 py-5 text-sm text-slate-700'}>
                    {row.dueDate}
                  </td>
                  <td className={resolvedDark ? 'px-5 py-5 text-sm text-slate-300' : 'px-5 py-5 text-sm text-slate-700'}>
                    {formatUsage(row.loadConsumedKwh)}
                  </td>
                  {showMeterColumns ? (
                    <td
                      className={
                        resolvedDark
                          ? 'px-5 py-5 text-sm tabular-nums text-slate-300'
                          : 'px-5 py-5 text-sm tabular-nums text-slate-700'
                      }
                    >
                      {formatReading(row.previousReading)}
                    </td>
                  ) : null}
                  {showMeterColumns ? (
                    <td
                      className={
                        resolvedDark
                          ? 'px-5 py-5 text-sm tabular-nums text-slate-300'
                          : 'px-5 py-5 text-sm tabular-nums text-slate-700'
                      }
                    >
                      {formatReading(row.currentReading)}
                    </td>
                  ) : null}
                  <td
                    className={
                      resolvedDark
                        ? 'px-5 py-5 text-sm font-semibold tabular-nums text-white'
                        : 'px-5 py-5 text-sm font-semibold tabular-nums text-slate-950'
                    }
                  >
                    {formatCurrency(row.amount)}
                  </td>
                  <td className="px-5 py-5">
                    <StatusPill label={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
