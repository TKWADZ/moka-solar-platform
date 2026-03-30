'use client';

import { formatCurrency, formatNumber } from '@/lib/utils';
import { InvoiceRow } from '@/types';
import { StatusPill } from './status-pill';

function formatReading(value?: number | null) {
  return value != null ? value.toLocaleString('vi-VN') : 'Chưa áp dụng đo chỉ số';
}

function formatUsage(value?: number | null) {
  return value != null ? formatNumber(value, 'kWh') : 'Chưa cập nhật';
}

export function InvoiceTable({
  rows,
  dark = false,
}: {
  rows: InvoiceRow[];
  dark?: boolean;
}) {
  const showMeterColumns = rows.some(
    (row) => row.previousReading != null || row.currentReading != null,
  );

  if (!rows.length) {
    return (
      <div
        className={
          dark
            ? 'portal-card-soft p-6 text-sm text-slate-300'
            : 'rounded-[24px] border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600'
        }
      >
        Chưa có hóa đơn nào để hiển thị.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <div key={row.id} className={dark ? 'portal-card-soft p-4' : 'surface-card p-4'}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={
                    dark
                      ? 'text-xs uppercase tracking-[0.18em] text-slate-500'
                      : 'text-xs uppercase tracking-[0.18em] text-slate-400'
                  }
                >
                  Mã hóa đơn
                </p>
                <p
                  className={
                    dark
                      ? 'mt-2 text-base font-semibold text-white'
                      : 'mt-2 text-base font-semibold text-slate-950'
                  }
                >
                  {row.number}
                </p>
                {row.customer ? (
                  <p className={dark ? 'mt-1 text-sm text-slate-400' : 'mt-1 text-sm text-slate-500'}>
                    {row.customer}
                  </p>
                ) : null}
              </div>
              <StatusPill label={row.status} />
            </div>

            <div
              className={
                dark
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
                    dark
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
          dark
            ? 'hidden min-w-0 overflow-hidden md:block portal-card'
            : 'hidden min-w-0 overflow-hidden md:block surface-card'
        }
      >
        <div className="overflow-x-auto">
          <table className={`${showMeterColumns ? 'min-w-[1220px]' : 'min-w-[980px]'} w-full text-left`}>
            <thead
              className={
                dark
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
                    dark
                      ? 'border-b border-white/6 align-top'
                      : 'border-b border-slate-200/70 align-top'
                  }
                >
                  <td className="px-5 py-5">
                    <p className={dark ? 'font-semibold text-white' : 'font-semibold text-slate-950'}>
                      {row.number}
                    </p>
                    {row.customer ? (
                      <p className={dark ? 'mt-1 text-xs text-slate-400' : 'mt-1 text-xs text-slate-500'}>
                        {row.customer}
                      </p>
                    ) : null}
                  </td>
                  <td className={dark ? 'px-5 py-5 text-sm text-slate-300' : 'px-5 py-5 text-sm text-slate-700'}>
                    {row.month}
                  </td>
                  <td className={dark ? 'px-5 py-5 text-sm text-slate-300' : 'px-5 py-5 text-sm text-slate-700'}>
                    {row.model || '-'}
                  </td>
                  <td className={dark ? 'px-5 py-5 text-sm text-slate-300' : 'px-5 py-5 text-sm text-slate-700'}>
                    {row.dueDate}
                  </td>
                  <td className={dark ? 'px-5 py-5 text-sm text-slate-300' : 'px-5 py-5 text-sm text-slate-700'}>
                    {formatUsage(row.loadConsumedKwh)}
                  </td>
                  {showMeterColumns ? (
                    <td
                      className={
                        dark
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
                        dark
                          ? 'px-5 py-5 text-sm tabular-nums text-slate-300'
                          : 'px-5 py-5 text-sm tabular-nums text-slate-700'
                      }
                    >
                      {formatReading(row.currentReading)}
                    </td>
                  ) : null}
                  <td
                    className={
                      dark
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
