'use client';

import { ReactNode } from 'react';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import { formatCurrency, formatDateTime, formatMonthPeriod, formatNumber } from '@/lib/utils';
import { MonthlyPvBillingRecord } from '@/types';

type MonthlyPvBillingTableProps = {
  title: string;
  eyebrow?: string;
  records: MonthlyPvBillingRecord[];
  showCustomer?: boolean;
  showSystem?: boolean;
  emptyTitle?: string;
  emptyBody?: string;
  actions?: (record: MonthlyPvBillingRecord) => ReactNode;
  dark?: boolean;
  className?: string;
};

function invoiceLabel(record: MonthlyPvBillingRecord) {
  return record.invoice?.status || 'UNBILLED';
}

function sourceLabel(source?: string | null) {
  switch (source) {
    case 'MANUAL':
      return 'Nhập tay';
    case 'ENERGY_RECORD_AGGREGATE':
      return 'Tổng hợp daily record';
    case 'ADMIN_SYNC':
      return 'Đồng bộ admin';
    case 'DEYE_MONTHLY':
      return 'Deye OpenAPI';
    case 'SOLARMAN_MONTHLY':
      return 'SOLARMAN';
    default:
      return source || 'Không rõ nguồn';
  }
}

function formatReading(value?: number | null) {
  return value != null ? value.toLocaleString('vi-VN') : 'Chưa áp dụng đo chỉ số';
}

function formatUsage(value?: number | null) {
  return value != null ? formatNumber(value, 'kWh') : 'Chưa cập nhật';
}

function emptyState(title: string, body: string) {
  return (
    <div className="portal-card-soft p-5">
      <p className="text-base font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
    </div>
  );
}

export function MonthlyPvBillingTable({
  title,
  eyebrow,
  records,
  showCustomer = false,
  showSystem = false,
  emptyTitle = 'Chưa có bản ghi PV theo tháng',
  emptyBody = 'Hãy đồng bộ hoặc tạo bản ghi đầu tiên để hệ thống bắt đầu tính tiền theo sản lượng PV tháng.',
  actions,
  dark = true,
  className,
}: MonthlyPvBillingTableProps) {
  const showUsageColumns = records.some(
    (record) =>
      record.periodMetrics?.loadConsumedKwh !== undefined ||
      record.periodMetrics?.previousReading !== undefined ||
      record.periodMetrics?.currentReading !== undefined,
  );

  return (
    <SectionCard title={title} eyebrow={eyebrow} dark={dark} className={className}>
      {records.length ? (
        <>
          <div className="grid gap-3 lg:hidden">
            {records.map((record) => (
              <div key={record.id} className="portal-card-soft p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      {formatMonthPeriod(record.month, record.year)}
                    </p>
                    <h3 className="mt-2 text-base font-semibold text-white">
                      {showSystem
                        ? record.solarSystem?.name || record.solarSystemId
                        : showCustomer
                          ? record.customer?.companyName ||
                            record.customer?.user?.fullName ||
                            record.customerId
                          : 'Ban ghi PV thang'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {showSystem && showCustomer
                        ? record.customer?.companyName ||
                          record.customer?.user?.fullName ||
                          'Khach hang chua gan'
                        : sourceLabel(record.source)}
                    </p>
                  </div>
                  <StatusPill label={invoiceLabel(record)} />
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                  <p>PV thang: {formatNumber(record.pvGenerationKwh, 'kWh')}</p>
                  {showUsageColumns ? (
                  <p>Điện tiêu thụ: {formatUsage(record.periodMetrics?.loadConsumedKwh)}</p>
                  ) : null}
                  <p>Don gia: {formatCurrency(record.unitPrice)}</p>
                  <p className="break-words">Tien truoc VAT: {formatCurrency(record.subtotalAmount)}</p>
                  <p>
                    VAT: {record.vatRate != null ? `${record.vatRate}%` : '-'} (
                    {formatCurrency(record.taxAmount)})
                  </p>
                  {showUsageColumns ? (
                    <p>Chỉ số cũ: {formatReading(record.periodMetrics?.previousReading)}</p>
                  ) : null}
                  {showUsageColumns ? (
                    <p>Chỉ số mới: {formatReading(record.periodMetrics?.currentReading)}</p>
                  ) : null}
                  <p>Chiet khau: {formatCurrency(record.discountAmount)}</p>
                  <p className="break-words font-semibold text-white">
                    Tong cong: {formatCurrency(record.totalAmount)}
                  </p>
                  <p>Dong bo: {formatDateTime(record.syncTime)}</p>
                  <p>Nguon: {sourceLabel(record.source)}</p>
                </div>

                {record.note ? (
                  <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm leading-6 text-slate-300">
                    {record.note}
                  </p>
                ) : null}

                {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions(record)}</div> : null}
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className={`${showUsageColumns ? 'min-w-[1320px]' : 'min-w-[1040px]'} w-full text-left text-sm text-slate-300`}>
              <thead>
                <tr className="border-b border-white/8 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Ky</th>
                  {showSystem ? <th className="pb-3 pr-4 font-medium">He thong</th> : null}
                  {showCustomer ? <th className="pb-3 pr-4 font-medium">Khach hang</th> : null}
                  <th className="pb-3 pr-4 font-medium">PV thang</th>
                  {showUsageColumns ? <th className="pb-3 pr-4 font-medium">Điện tiêu thụ</th> : null}
                  {showUsageColumns ? <th className="pb-3 pr-4 font-medium">Chỉ số cũ</th> : null}
                  {showUsageColumns ? <th className="pb-3 pr-4 font-medium">Chỉ số mới</th> : null}
                  <th className="pb-3 pr-4 font-medium">Don gia</th>
                  <th className="pb-3 pr-4 font-medium">Tien truoc VAT</th>
                  <th className="pb-3 pr-4 font-medium">VAT %</th>
                  <th className="pb-3 pr-4 font-medium">Tien VAT</th>
                  <th className="pb-3 pr-4 font-medium">Chiet khau</th>
                  <th className="pb-3 pr-4 font-medium">Tong cong</th>
                  <th className="pb-3 pr-4 font-medium">Trang thai</th>
                  <th className="pb-3 pr-4 font-medium">Dong bo</th>
                  <th className="pb-3 pr-4 font-medium">Nguon</th>
                  {actions ? <th className="pb-3 font-medium">Thao tac</th> : null}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-white/6 align-top last:border-none">
                    <td className="py-4 pr-4 font-semibold text-white">
                      {formatMonthPeriod(record.month, record.year)}
                    </td>
                    {showSystem ? (
                      <td className="py-4 pr-4">
                        <div className="max-w-[220px]">
                          <p className="truncate font-medium text-white">
                            {record.solarSystem?.name || record.solarSystemId}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {record.solarSystem?.systemCode || 'Chua co ma'}
                          </p>
                        </div>
                      </td>
                    ) : null}
                    {showCustomer ? (
                      <td className="py-4 pr-4">
                        <div className="max-w-[220px]">
                          <p className="truncate font-medium text-white">
                            {record.customer?.companyName ||
                              record.customer?.user?.fullName ||
                              record.customerId}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {record.customer?.user?.email ||
                              record.customer?.customerCode ||
                              'Chua co email'}
                          </p>
                        </div>
                      </td>
                    ) : null}
                    <td className="py-4 pr-4 tabular-nums">
                      {formatNumber(record.pvGenerationKwh, 'kWh')}
                    </td>
                    {showUsageColumns ? (
                      <td className="py-4 pr-4 tabular-nums">
                        {formatUsage(record.periodMetrics?.loadConsumedKwh)}
                      </td>
                    ) : null}
                    {showUsageColumns ? (
                      <td className="py-4 pr-4 tabular-nums">
                        {formatReading(record.periodMetrics?.previousReading)}
                      </td>
                    ) : null}
                    {showUsageColumns ? (
                      <td className="py-4 pr-4 tabular-nums">
                        {formatReading(record.periodMetrics?.currentReading)}
                      </td>
                    ) : null}
                    <td className="py-4 pr-4 tabular-nums whitespace-nowrap">
                      {formatCurrency(record.unitPrice)}
                    </td>
                    <td className="py-4 pr-4 tabular-nums whitespace-nowrap">
                      {formatCurrency(record.subtotalAmount)}
                    </td>
                    <td className="py-4 pr-4 tabular-nums whitespace-nowrap">
                      {record.vatRate != null ? `${record.vatRate}%` : '-'}
                    </td>
                    <td className="py-4 pr-4 tabular-nums whitespace-nowrap">
                      {formatCurrency(record.taxAmount)}
                    </td>
                    <td className="py-4 pr-4 tabular-nums whitespace-nowrap">
                      {formatCurrency(record.discountAmount)}
                    </td>
                    <td className="py-4 pr-4">
                      <p className="break-words font-semibold text-white tabular-nums">
                        {formatCurrency(record.totalAmount)}
                      </p>
                      {record.note ? (
                        <p className="mt-1 max-w-[220px] text-xs leading-5 text-slate-500">
                          {record.note}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-4 pr-4">
                      <StatusPill label={invoiceLabel(record)} />
                    </td>
                    <td className="py-4 pr-4 whitespace-nowrap">
                      {formatDateTime(record.syncTime)}
                    </td>
                    <td className="py-4 pr-4">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
                        {sourceLabel(record.source)}
                      </span>
                    </td>
                    {actions ? <td className="py-4">{actions(record)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        emptyState(emptyTitle, emptyBody)
      )}
    </SectionCard>
  );
}
