'use client';

import { ReactNode } from 'react';
import { SectionCard } from '@/components/section-card';
import { StatusPill } from '@/components/status-pill';
import {
  formatCurrency,
  formatDateTime,
  formatMonthPeriod,
  formatNumber,
} from '@/lib/utils';
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
  return record.invoice?.status || record.invoiceStatus || 'UNBILLED';
}

function sourceLabel(source?: string | null) {
  switch (source) {
    case 'MANUAL':
      return 'Nhap tay';
    case 'MANUAL_OVERRIDE':
      return 'Override tay';
    case 'ENERGY_RECORD_AGGREGATE':
      return 'Tong hop daily record';
    case 'ADMIN_SYNC':
      return 'Dong bo admin';
    case 'DEYE_MONTHLY':
      return 'Deye OpenAPI';
    case 'SOLARMAN_MONTHLY':
      return 'SOLARMAN';
    case 'LUXPOWER_MONTHLY_AGGREGATE':
      return 'LuxPower';
    default:
      return source || 'Khong ro nguon';
  }
}

function formatReading(value?: number | null) {
  return value != null ? value.toLocaleString('vi-VN') : 'Chua ap dung do chi so';
}

function formatUsage(value?: number | null) {
  return value != null ? formatNumber(value, 'kWh') : 'Chua cap nhat';
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
  emptyTitle = 'Chua co ban ghi PV theo thang',
  emptyBody = 'Hay dong bo hoac tao ban ghi dau tien de he thong bat dau tinh tien theo san luong PV thang.',
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
                    <p className="mt-1 text-sm text-slate-400">{sourceLabel(record.source)}</p>
                  </div>
                  <StatusPill label={invoiceLabel(record)} />
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                  <p>PV thang: {formatNumber(record.pvGenerationKwh, 'kWh')}</p>
                  {showUsageColumns ? (
                    <p>Dien tieu thu: {formatUsage(record.periodMetrics?.loadConsumedKwh)}</p>
                  ) : null}
                  <p>Don gia: {formatCurrency(record.unitPrice)}</p>
                  <p>Tien truoc VAT: {formatCurrency(record.subtotalAmount)}</p>
                  <p>VAT: {record.vatRate != null ? `${record.vatRate}%` : '-'}</p>
                  <p>Tien VAT: {formatCurrency(record.taxAmount)}</p>
                  <p>Chiet khau: {formatCurrency(record.discountAmount)}</p>
                  <p className="font-semibold text-white">
                    Tong cong: {formatCurrency(record.totalAmount)}
                  </p>
                  {showUsageColumns ? (
                    <p>Chi so cu: {formatReading(record.periodMetrics?.previousReading)}</p>
                  ) : null}
                  {showUsageColumns ? (
                    <p>Chi so moi: {formatReading(record.periodMetrics?.currentReading)}</p>
                  ) : null}
                  <p>Sync: {record.syncStatus}</p>
                  <p>Chat luong: {record.dataQualityStatus}</p>
                  <p>Hoa don: {record.invoiceStatus}</p>
                  <p>Dong bo: {formatDateTime(record.syncTime)}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <StatusPill label={record.syncStatus} />
                  <StatusPill label={record.dataQualityStatus} />
                  <StatusPill label={record.invoiceStatus} />
                </div>

                {record.qualitySummary ? (
                  <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm leading-6 text-slate-300">
                    {record.qualitySummary}
                  </p>
                ) : null}

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
            <table
              className={`${showUsageColumns ? 'min-w-[1480px]' : 'min-w-[1180px]'} w-full text-left text-sm text-slate-300`}
            >
              <thead>
                <tr className="border-b border-white/8 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Ky</th>
                  {showSystem ? <th className="pb-3 pr-4 font-medium">He thong</th> : null}
                  {showCustomer ? <th className="pb-3 pr-4 font-medium">Khach hang</th> : null}
                  <th className="pb-3 pr-4 font-medium">PV thang</th>
                  {showUsageColumns ? <th className="pb-3 pr-4 font-medium">Dien tieu thu</th> : null}
                  {showUsageColumns ? <th className="pb-3 pr-4 font-medium">Chi so cu</th> : null}
                  {showUsageColumns ? <th className="pb-3 pr-4 font-medium">Chi so moi</th> : null}
                  <th className="pb-3 pr-4 font-medium">Don gia</th>
                  <th className="pb-3 pr-4 font-medium">Tong cong</th>
                  <th className="pb-3 pr-4 font-medium">Sync</th>
                  <th className="pb-3 pr-4 font-medium">Du lieu</th>
                  <th className="pb-3 pr-4 font-medium">Hoa don</th>
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
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-white tabular-nums">
                        {formatCurrency(record.totalAmount)}
                      </p>
                      {record.qualitySummary ? (
                        <p className="mt-1 max-w-[240px] text-xs leading-5 text-slate-500">
                          {record.qualitySummary}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-4 pr-4">
                      <StatusPill label={record.syncStatus} />
                    </td>
                    <td className="py-4 pr-4">
                      <StatusPill label={record.dataQualityStatus} />
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
