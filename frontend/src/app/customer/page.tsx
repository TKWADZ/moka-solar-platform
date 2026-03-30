'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, Scale } from 'lucide-react';
import { CustomerSystemCard } from '@/components/customer-system-card';
import { EnergyChart } from '@/components/energy-chart';
import { InvoiceTable } from '@/components/invoice-table';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { customerDashboardRequest } from '@/lib/api';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/utils';
import { CustomerDashboardData, InvoiceRecord, InvoiceRow, StatCardItem } from '@/types';

function normalizeStatus(status: string): InvoiceRow['status'] {
  const normalized = status.toUpperCase();

  if (normalized === 'PAID') return 'Paid';
  if (normalized === 'PARTIAL') return 'Partial';
  if (normalized === 'OVERDUE') return 'Overdue';
  return 'Issued';
}

function toInvoiceRows(invoices: Array<Record<string, unknown>>) {
  return invoices.map((invoice) => {
    const typedInvoice = invoice as InvoiceRecord;

    return {
      id: typedInvoice.id,
      number: typedInvoice.invoiceNumber,
      month: `${String(typedInvoice.billingMonth).padStart(2, '0')}/${typedInvoice.billingYear}`,
      dueDate: formatDate(typedInvoice.dueDate),
      amount: Number(typedInvoice.totalAmount || 0),
      status: normalizeStatus(String(typedInvoice.status || 'ISSUED')),
      model:
        typedInvoice.contract?.servicePackage?.name ||
        typedInvoice.contract?.type ||
        'Hợp đồng đang áp dụng',
      loadConsumedKwh:
        typeof typedInvoice.periodMetrics?.loadConsumedKwh === 'number'
          ? typedInvoice.periodMetrics.loadConsumedKwh
          : null,
      previousReading:
        typeof typedInvoice.periodMetrics?.previousReading === 'number'
          ? typedInvoice.periodMetrics.previousReading
          : null,
      currentReading:
        typeof typedInvoice.periodMetrics?.currentReading === 'number'
          ? typedInvoice.periodMetrics.currentReading
          : null,
      sourceLabel:
        typeof typedInvoice.periodMetrics?.sourceLabel === 'string'
          ? typedInvoice.periodMetrics.sourceLabel
          : null,
    } satisfies InvoiceRow;
  });
}

function formatUsage(value?: number | null) {
  return value != null ? formatNumber(value, 'kWh') : 'Chưa cập nhật';
}

function formatMeterReading(value?: number | null) {
  return value != null ? value.toLocaleString('vi-VN') : 'Chưa áp dụng đo chỉ số';
}

export default function CustomerPage() {
  const [dashboard, setDashboard] = useState<CustomerDashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    customerDashboardRequest()
      .then(setDashboard)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Không thể tải dữ liệu cổng khách hàng.',
        ),
      );
  }, []);

  const summaryCards = useMemo<StatCardItem[]>(() => {
    if (!dashboard) {
      return [];
    }

    return [
      {
        title: 'Điện mặt trời tạo ra',
        value:
          dashboard.summary.solarGenerated != null
            ? formatNumber(dashboard.summary.solarGenerated, 'kWh')
            : 'Chưa cập nhật',
        subtitle: 'Tổng sản lượng từ khi vận hành của tất cả hệ thống.',
        delta:
          dashboard.summary.systemsTracked != null
            ? `${dashboard.summary.systemsTracked} hệ thống đang được theo dõi`
            : 'Đang cập nhật danh mục',
        trend: 'up',
      },
      {
        title: 'Điện tiêu thụ tháng này',
        value:
          dashboard.summary.loadConsumed != null
            ? formatNumber(dashboard.summary.loadConsumed, 'kWh')
            : 'Chưa cập nhật',
        subtitle: dashboard.summary.latestDataPeriod
          ? `Tổng điện tiêu thụ tính tiền của kỳ ${dashboard.summary.latestDataPeriod}`
          : 'Tổng điện tiêu thụ tính tiền của tháng hiện tại.',
        delta:
          dashboard.summary.systemsUpdatedCurrentMonth != null
            ? `${dashboard.summary.systemsUpdatedCurrentMonth} hệ thống đã có dữ liệu kỳ này`
            : 'Đang đối soát theo kỳ',
        trend: 'neutral',
      },
      {
        title: 'Cần thanh toán',
        value: formatCurrency(dashboard.summary.currentBillingAmount || 0),
        subtitle:
          dashboard.summary.currentBillingLabel === 'Tạm tính kỳ này'
            ? 'Kỳ hiện tại đang được tạm tính, hóa đơn chính thức sẽ cập nhật sau khi đối soát.'
            : dashboard.summary.outstandingInvoiceCount &&
                dashboard.summary.outstandingInvoiceCount > 0
              ? `${dashboard.summary.outstandingInvoiceCount} hóa đơn chưa thanh toán / chờ thanh toán`
              : 'Không có hóa đơn đang mở',
        delta:
          dashboard.summary.nearestDueInvoiceNumber && dashboard.summary.nearestDueInvoiceDate
            ? `${dashboard.summary.nearestDueInvoiceNumber} - đến hạn ${formatDate(
                dashboard.summary.nearestDueInvoiceDate,
              )}`
            : dashboard.summary.currentBillingLabel === 'Tạm tính kỳ này' &&
                dashboard.summary.latestDataPeriod
              ? `Tạm tính cho kỳ ${dashboard.summary.latestDataPeriod}`
              : 'Danh mục đang ổn định',
        trend: (dashboard.summary.currentBillingAmount || 0) > 0 ? 'neutral' : 'up',
      },
      {
        title: 'Chỉ số mới nhất',
        value:
          dashboard.summary.latestMeterReading != null
            ? dashboard.summary.latestMeterReading.toLocaleString('vi-VN')
            : 'Chưa áp dụng đo chỉ số',
        subtitle: dashboard.summary.latestDataPeriod
          ? `Tổng chỉ số cuối kỳ ${dashboard.summary.latestDataPeriod} của tất cả hệ thống`
          : 'Chỉ số điện được cập nhật theo kỳ dữ liệu.',
        delta: dashboard.summary.latestUpdatedAt
          ? `Cập nhật gần nhất ${formatDateTime(dashboard.summary.latestUpdatedAt)}`
          : 'Đang chờ kỳ dữ liệu đầu tiên',
        trend: 'neutral',
      },
    ];
  }, [dashboard]);

  const invoiceRows = useMemo(
    () => (dashboard ? toInvoiceRows(dashboard.invoices.slice(0, 6)) : []),
    [dashboard],
  );

  const currentPeriod = dashboard?.meterHistory?.[0] || null;

  if (!dashboard) {
    return (
      <SectionCard title="Tổng quan khách hàng" eyebrow="Điện năng và thanh toán" dark>
        <p className={error ? 'text-sm text-rose-300' : 'text-sm text-slate-300'}>
          {error || 'Đang tải dữ liệu cổng khách hàng...'}
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {summaryCards.map((item) => (
          <StatCard key={item.title} {...item} dark />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <EnergyChart
          data={dashboard.generationTrend}
          title="Sản lượng tổng hợp theo kỳ"
          description="Tổng sản lượng và điện tiêu thụ tính tiền được tổng hợp theo kỳ cập nhật của tất cả hệ thống."
          unit="kWh"
          dark
        />

        <SectionCard title="Trạng thái đồng bộ" eyebrow="Cập nhật định kỳ 1 giờ / lần" dark>
          <div className="space-y-4">
            <div className="portal-card-soft p-5">
              <div className="flex items-start gap-3">
                <DatabaseZap className="mt-0.5 h-4.5 w-4.5 text-slate-300" />
                <div>
                  <p className="text-sm font-semibold text-white">
                    {dashboard.syncStatus?.statusLabel || 'Đang cập nhật'}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Portal hiển thị dữ liệu kỳ đã đối soát. Nếu chưa có dữ liệu mới, hệ thống sẽ giữ
                    kỳ gần nhất thay vì hiển thị realtime giả.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="portal-card-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Nguồn dữ liệu
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {dashboard.syncStatus?.sourceLabel ||
                    dashboard.summary.latestDataSourceLabel ||
                    'Đang cập nhật'}
                </p>
              </div>
              <div className="portal-card-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Lần cập nhật gần nhất
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {dashboard.syncStatus?.latestUpdatedAt
                    ? formatDateTime(dashboard.syncStatus.latestUpdatedAt)
                    : 'Chưa cập nhật'}
                </p>
              </div>
              <div className="portal-card-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Kỳ đang theo dõi
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {dashboard.summary.latestDataPeriod || 'Đang cập nhật'}
                </p>
              </div>
              <div className="portal-card-soft p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Hệ thống đã cập nhật kỳ này
                </p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {dashboard.summary.systemsUpdatedCurrentMonth ?? 0}/
                  {dashboard.summary.systemsTracked ?? dashboard.systems.length}
                </p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(340px,0.98fr)]">
        <SectionCard title="Kỳ đang theo dõi" eyebrow="Đối soát điện tiêu thụ tính tiền và thanh toán" dark>
          {currentPeriod ? (
            <div className="grid gap-4">
              <div className="portal-card-soft p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                      Kỳ {currentPeriod.period}
                    </p>
                    <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                      {formatCurrency(currentPeriod.amount)}
                    </h3>
                    <p className="mt-2 text-sm text-slate-400">
                      {currentPeriod.unpaidAmount > 0
                        ? `Còn ${formatCurrency(currentPeriod.unpaidAmount)} chưa thanh toán`
                        : 'Không còn công nợ của kỳ này'}
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                    {currentPeriod.paymentStatus}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: 'Chỉ số cũ',
                    value: formatMeterReading(currentPeriod.previousReading),
                  },
                  {
                    label: 'Chỉ số mới',
                    value: formatMeterReading(currentPeriod.currentReading),
                  },
                  {
                    label: 'Điện tiêu thụ',
                    value: formatUsage(currentPeriod.loadConsumedKwh),
                  },
                  {
                    label: 'Điện tạo ra',
                    value: formatNumber(currentPeriod.pvGenerationKwh, 'kWh'),
                  },
                  {
                    label: 'Nguồn dữ liệu',
                    value: currentPeriod.sourceLabel || 'Đang cập nhật',
                  },
                  {
                    label: 'Lần cập nhật',
                    value: currentPeriod.updatedAt
                      ? formatDateTime(currentPeriod.updatedAt)
                      : 'Chưa cập nhật',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                      {item.label}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="portal-card-soft p-5">
              <p className="text-base font-semibold text-white">Chưa có kỳ dữ liệu để hiển thị</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Đội vận hành sẽ cập nhật dữ liệu tháng và hóa đơn ngay khi hệ thống hoàn tất đối soát.
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Hóa đơn gần đây" eyebrow="Lịch sử thanh toán và đối soát" dark>
          <InvoiceTable rows={invoiceRows} dark />
        </SectionCard>
      </div>

      <SectionCard title="Tất cả hệ thống đang vận hành" eyebrow="Tổng hợp theo từng site" dark>
        <div className="space-y-4">
          {dashboard.systems.map((system) => (
            <CustomerSystemCard
              key={system.id}
              system={system}
              actionHref="/customer/meters"
              actionLabel="Xem lịch sử chỉ số"
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Lịch sử chỉ số và thanh toán" eyebrow="6 kỳ gần nhất" dark>
        <div className="space-y-3">
          {dashboard.meterHistory.slice(0, 6).map((period) => (
            <div key={period.period} className="portal-card-soft p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Kỳ {period.period}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-white">
                    {formatCurrency(period.amount)}
                  </h3>
                  <p className="mt-2 text-sm text-slate-400">
                    {period.systemsCount} hệ thống - {period.sourceLabel || 'Đang cập nhật'}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-200">
                  <Scale className="h-3.5 w-3.5" />
                  {period.paymentStatus}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Chỉ số</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    {formatMeterReading(period.previousReading)} {'->'}{' '}
                    {formatMeterReading(period.currentReading)}
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    Điện tiêu thụ / tạo ra
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    {formatUsage(period.loadConsumedKwh)} / {formatNumber(period.pvGenerationKwh, 'kWh')}
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
                    Cập nhật
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">
                    {period.updatedAt ? formatDateTime(period.updatedAt) : 'Chưa cập nhật'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
