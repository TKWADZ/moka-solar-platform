'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatabaseZap, Scale } from 'lucide-react';
import {
  CustomerConsumptionChartCard,
  CustomerDailyUsageCard,
} from '@/components/customer-consumption-cards';
import { useCustomerTheme } from '@/components/customer-theme-provider';
import { CustomerSystemCard } from '@/components/customer-system-card';
import { EnergyChart } from '@/components/energy-chart';
import { InvoiceTable } from '@/components/invoice-table';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { useSystemDashboardPresence } from '@/hooks/use-system-dashboard-presence';
import { customerDashboardRequest } from '@/lib/api';
import { formatBillingMeterReading } from '@/lib/billing-display';
import { buildCustomerConsumptionView } from '@/lib/customer-consumption';
import { cn, formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/utils';
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
      billingDetails: typedInvoice.billingDetails || undefined,
    } satisfies InvoiceRow;
  });
}

function formatUsage(value?: number | null) {
  return value != null ? formatNumber(value, 'kWh') : 'Chưa có dữ liệu';
}

function formatMeterReading(value?: number | null) {
  return value != null ? formatBillingMeterReading(value) : 'Chưa áp dụng chỉ số';
}

export default function CustomerPage() {
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';
  const [dashboard, setDashboard] = useState<CustomerDashboardData | null>(null);
  const [error, setError] = useState('');

  useSystemDashboardPresence(
    dashboard?.systems.map((system) => system.id) || [],
    'customer-dashboard',
  );

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

  const consumptionView = useMemo(() => buildCustomerConsumptionView(dashboard), [dashboard]);

  const summaryCards = useMemo<StatCardItem[]>(() => {
    if (!dashboard) {
      return [];
    }

    return [
      {
        title: 'Điện mặt trời tích lũy',
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
        title: 'Tiêu thụ tháng này',
        value:
          consumptionView.currentMonthConsumptionKwh != null
            ? formatNumber(consumptionView.currentMonthConsumptionKwh, 'kWh')
            : 'Chưa cập nhật',
        subtitle: dashboard.summary.latestDataPeriod
          ? `Tổng điện tiêu thụ của kỳ ${dashboard.summary.latestDataPeriod}`
          : 'Tổng điện tiêu thụ của kỳ hiện tại.',
        delta: consumptionView.updateLabel,
        trend: 'neutral',
      },
      {
        title: 'Hôm nay đã dùng',
        value:
          consumptionView.todayUsedKwh != null
            ? formatNumber(consumptionView.todayUsedKwh, 'kWh')
            : 'Chưa có dữ liệu',
        subtitle: consumptionView.hasDailyData
          ? 'Dữ liệu tiêu thụ theo ngày cho portal khách hàng.'
          : 'Cần load meter / smart meter / EMS / EVN theo ngày.',
        delta: consumptionView.updateLabel,
        trend: 'neutral',
      },
      {
        title: 'Cần thanh toán',
        value: formatCurrency(dashboard.summary.currentBillingAmount || 0),
        subtitle:
          dashboard.summary.currentBillingLabel === 'Tạm tính kỳ này'
            ? 'Kỳ hiện tại đang được tạm tính, hóa đơn chính thức sẽ cập nhật sau đối soát.'
            : dashboard.summary.outstandingInvoiceCount &&
                dashboard.summary.outstandingInvoiceCount > 0
              ? `${dashboard.summary.outstandingInvoiceCount} hóa đơn chưa thanh toán / chờ thanh toán`
              : 'Không có hóa đơn đang mở',
        delta:
          dashboard.summary.nearestDueInvoiceNumber && dashboard.summary.nearestDueInvoiceDate
            ? `${dashboard.summary.nearestDueInvoiceNumber} · đến hạn ${formatDate(
                dashboard.summary.nearestDueInvoiceDate,
              )}`
            : 'Danh mục đang ổn định',
        trend: (dashboard.summary.currentBillingAmount || 0) > 0 ? 'neutral' : 'up',
      },
    ];
  }, [
    consumptionView.currentMonthConsumptionKwh,
    consumptionView.hasDailyData,
    consumptionView.todayUsedKwh,
    consumptionView.updateLabel,
    dashboard,
  ]);

  const invoiceRows = useMemo(
    () => (dashboard ? toInvoiceRows(dashboard.invoices.slice(0, 6)) : []),
    [dashboard],
  );

  const currentPeriod = dashboard?.meterHistory?.[0] || null;
  const headingText = dark ? 'text-white' : 'text-slate-950';
  const bodyText = dark ? 'text-slate-300' : 'text-slate-600';
  const metricText = dark ? 'text-slate-200' : 'text-slate-700';
  const badgeClass = dark
    ? 'rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100'
    : 'rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700';

  if (!dashboard) {
    return (
      <SectionCard title="Tổng quan khách hàng" eyebrow="Điện năng và thanh toán">
        <p className={error ? 'text-sm text-rose-500' : cn('text-sm', bodyText)}>
          {error || 'Đang tải dữ liệu cổng khách hàng...'}
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {summaryCards.map((item) => (
          <StatCard key={item.title} {...item} />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.92fr)]">
        <CustomerDailyUsageCard
          todayUsedKwh={consumptionView.todayUsedKwh}
          lastUpdatedAt={consumptionView.lastUpdatedAt}
          updateLabel={consumptionView.updateLabel}
          level={consumptionView.todayLevel}
          hasDailyData={consumptionView.hasDailyData}
        />

        <SectionCard
          title="Kỳ đang theo dõi"
          eyebrow="Đối soát điện tiêu thụ, sản lượng và thanh toán"
        >
          {currentPeriod ? (
            <div className="grid gap-4">
              <div className="customer-soft-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      Kỳ {currentPeriod.period}
                    </p>
                    <h3 className={cn('mt-3 text-3xl font-semibold tracking-tight', headingText)}>
                      {formatCurrency(currentPeriod.amount)}
                    </h3>
                    <p className={cn('mt-2 text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
                      {currentPeriod.unpaidAmount > 0
                        ? `Còn ${formatCurrency(currentPeriod.unpaidAmount)} chưa thanh toán`
                        : 'Không còn công nợ của kỳ này'}
                    </p>
                  </div>
                  <div className={badgeClass}>{currentPeriod.paymentStatus}</div>
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
                    label: 'PV tháng',
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
                  <div key={item.label} className="customer-soft-card-muted px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                      {item.label}
                    </p>
                    <p className={cn('mt-2 text-sm leading-6', metricText)}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="customer-page-note">
              Đội vận hành sẽ cập nhật dữ liệu tháng và hóa đơn ngay khi hệ thống hoàn tất đối soát.
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <CustomerConsumptionChartCard
          title="Biểu đồ tiêu thụ 7 ngày"
          eyebrow="Theo ngày"
          description="Màu xanh là mức tiêu thụ thấp, vàng là trung bình, đỏ là cao so với 30 ngày gần nhất của chính khách hàng này."
          points={consumptionView.daily7}
          emptyTitle="Chưa có dữ liệu 7 ngày"
          emptyBody="Khi hệ thống nhận được dữ liệu load meter / smart meter theo ngày, biểu đồ sẽ xuất hiện ở đây."
        />
        <CustomerConsumptionChartCard
          title="Biểu đồ tiêu thụ 30 ngày"
          eyebrow="Theo ngày"
          description="Dùng để theo dõi nhịp tiêu thụ gần đây. Portal chỉ hiển thị dữ liệu theo ngày, không giả realtime nếu nguồn chưa đủ nhanh."
          points={consumptionView.daily30}
          emptyTitle="Chưa có dữ liệu 30 ngày"
          emptyBody="Cần dữ liệu tiêu thụ theo ngày để vẽ lịch sử 30 ngày một cách chính xác."
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <CustomerConsumptionChartCard
          title="Lịch sử tiêu thụ 12 tháng"
          eyebrow="Theo tháng"
          description="Mức màu được tính tương đối trên 12 tháng gần nhất của chính site/customer này, giúp nhận ra tháng nào tiêu thụ nhẹ hay cao."
          points={consumptionView.monthly12}
          emptyTitle="Chưa có lịch sử tiêu thụ tháng"
          emptyBody="Nếu mới chỉ có dữ liệu inverter mà chưa có nguồn load/EVN/EMS, lịch sử tiêu thụ tháng sẽ để trống thay vì hiển thị số giả."
        />

        <EnergyChart
          data={dashboard.generationTrend}
          title="Sản lượng điện mặt trời theo kỳ"
          description="Sản lượng solar giữ bảng màu tích cực riêng, không dùng cùng logic xanh-vàng-đỏ của phần tiêu thụ."
          unit="kWh"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(340px,0.98fr)]">
        <SectionCard title="Trạng thái đồng bộ" eyebrow="Theo dõi dữ liệu và nguồn cập nhật">
          <div className="space-y-4">
            <div className="customer-soft-card p-5">
              <div className="flex items-start gap-3">
                <DatabaseZap className="mt-0.5 h-4.5 w-4.5 text-slate-400" />
                <div>
                  <p className={cn('text-sm font-semibold', headingText)}>
                    {dashboard.syncStatus?.statusLabel || 'Đang cập nhật'}
                  </p>
                  <p className={cn('mt-2 text-sm leading-6', bodyText)}>
                    Portal hiển thị dữ liệu đã đối soát. Nếu chưa có dữ liệu tiêu thụ theo ngày,
                    hệ thống sẽ báo rõ trạng thái thay vì hiển thị số ước lượng giả.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {[
                {
                  label: 'Nguồn dữ liệu',
                  value:
                    dashboard.syncStatus?.sourceLabel ||
                    dashboard.summary.latestDataSourceLabel ||
                    'Đang cập nhật',
                },
                {
                  label: 'Lần cập nhật gần nhất',
                  value: dashboard.syncStatus?.latestUpdatedAt
                    ? formatDateTime(dashboard.syncStatus.latestUpdatedAt)
                    : 'Chưa cập nhật',
                },
                {
                  label: 'Kỳ đang theo dõi',
                  value: dashboard.summary.latestDataPeriod || 'Đang cập nhật',
                },
                {
                  label: 'Hệ thống đã có dữ liệu kỳ này',
                  value: `${dashboard.summary.systemsUpdatedCurrentMonth ?? 0}/${dashboard.summary.systemsTracked ?? dashboard.systems.length}`,
                },
              ].map((item) => (
                <div key={item.label} className="customer-soft-card-muted px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    {item.label}
                  </p>
                  <p className={cn('mt-2 text-lg font-semibold', headingText)}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Hóa đơn gần đây" eyebrow="Lịch sử thanh toán và đối soát">
          <InvoiceTable rows={invoiceRows} />
        </SectionCard>
      </div>

      <SectionCard title="Tất cả hệ thống đang vận hành" eyebrow="Tổng hợp theo từng site">
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

      <SectionCard title="Lịch sử chỉ số và thanh toán" eyebrow="6 kỳ gần nhất">
        <div className="space-y-3">
          {dashboard.meterHistory.slice(0, 6).map((period) => (
            <div key={period.period} className="customer-soft-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    Kỳ {period.period}
                  </p>
                  <h3 className={cn('mt-2 text-xl font-semibold', headingText)}>
                    {formatCurrency(period.amount)}
                  </h3>
                  <p className={cn('mt-2 text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
                    {period.systemsCount} hệ thống · {period.sourceLabel || 'Đang cập nhật'}
                  </p>
                </div>
                <div className={cn('inline-flex items-center gap-2', badgeClass)}>
                  <Scale className="h-3.5 w-3.5" />
                  {period.paymentStatus}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="customer-soft-card-muted px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Chỉ số
                  </p>
                  <p className={cn('mt-2 text-sm leading-6', metricText)}>
                    {formatMeterReading(period.previousReading)} {'->'}{' '}
                    {formatMeterReading(period.currentReading)}
                  </p>
                </div>
                <div className="customer-soft-card-muted px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Điện tiêu thụ / PV tháng
                  </p>
                  <p className={cn('mt-2 text-sm leading-6', metricText)}>
                    {formatUsage(period.loadConsumedKwh)} /{' '}
                    {formatNumber(period.pvGenerationKwh, 'kWh')}
                  </p>
                </div>
                <div className="customer-soft-card-muted px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                    Đồng bộ
                  </p>
                  <p className={cn('mt-2 text-sm leading-6', metricText)}>
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
