'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CustomerConsumptionChartCard, CustomerDailyUsageCard } from '@/components/customer-consumption-cards';
import { useCustomerTheme } from '@/components/customer-theme-provider';
import { SectionCard } from '@/components/section-card';
import { customerDashboardRequest } from '@/lib/api';
import { buildCustomerConsumptionView } from '@/lib/customer-consumption';
import { cn, formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import { CustomerDashboardData } from '@/types';

function formatMeterReading(value?: number | null) {
  if (value == null) {
    return 'Chua ap dung do chi so';
  }

  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatUsage(value?: number | null) {
  return value != null ? formatNumber(value, 'kWh') : 'Chua co du lieu';
}

export default function CustomerMetersPage() {
  const { enabled, theme } = useCustomerTheme();
  const dark = enabled && theme === 'dark';
  const [dashboard, setDashboard] = useState<CustomerDashboardData | null>(null);
  const [error, setError] = useState('');
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const headingText = dark ? 'text-white' : 'text-slate-950';
  const bodyText = dark ? 'text-slate-300' : 'text-slate-600';
  const metricText = dark ? 'text-slate-200' : 'text-slate-700';
  const badgeClass = dark
    ? 'rounded-full border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100'
    : 'rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700';

  useEffect(() => {
    customerDashboardRequest()
      .then((nextDashboard) => {
        setDashboard(nextDashboard);
        setExpandedPeriod(nextDashboard.meterHistory[0]?.period || null);
      })
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Khong the tai lich su chi so dien.',
        ),
      );
  }, []);

  const consumptionView = useMemo(
    () => buildCustomerConsumptionView(dashboard),
    [dashboard],
  );

  if (!dashboard) {
    return (
      <SectionCard title="Lịch sử chỉ số điện" eyebrow="Tổng hợp theo từng kỳ">
        <p className={error ? 'text-sm text-rose-500' : cn('text-sm', bodyText)}>
          {error || 'Dang tai lich su chi so...'}
        </p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <CustomerDailyUsageCard
        todayUsedKwh={consumptionView.todayUsedKwh}
        lastUpdatedAt={consumptionView.lastUpdatedAt}
        updateLabel={consumptionView.updateLabel}
        level={consumptionView.todayLevel}
        hasDailyData={consumptionView.hasDailyData}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <CustomerConsumptionChartCard
          title="Tiêu thụ 7 ngày"
          eyebrow="Theo ngày"
          description="Mức xanh-vàng-đỏ được tính theo lịch sử 30 ngày gần nhất của khách hàng này, không dùng ngưỡng cứng toàn hệ thống."
          points={consumptionView.daily7}
          emptyTitle="Chưa có dữ liệu 7 ngày"
          emptyBody="Khi có dữ liệu theo ngày từ nguồn tiêu thụ, biểu đồ sẽ được hiển thị tại đây."
        />
        <CustomerConsumptionChartCard
          title="Tiêu thụ 30 ngày"
          eyebrow="Theo ngày"
          description="Danh sách 30 ngày giúp nhìn ra ngày nào tải nhẹ, trung bình hoặc tăng cao. Portal không gắn nhãn realtime nếu dữ liệu chỉ cập nhật theo ngày."
          points={consumptionView.daily30}
          emptyTitle="Chưa có dữ liệu 30 ngày"
          emptyBody="Nếu chỉ mới có dữ liệu inverter, phần tiêu thụ theo ngày sẽ được để trống an toàn."
        />
      </div>

      <CustomerConsumptionChartCard
        title="Lịch sử tiêu thụ 12 tháng"
        eyebrow="Theo tháng"
        description="Biểu đồ tháng hỗ trợ đối chiếu xu hướng tiêu thụ dài hạn và so sánh mức cao/thấp tương đối của từng tháng."
        points={consumptionView.monthly12}
        emptyTitle="Chưa có dữ liệu tiêu thụ tháng"
        emptyBody="Cần monthly load data hợp lệ để hiển thị lịch sử tiêu thụ 12 tháng."
      />

      <SectionCard
        title="Lịch sử chỉ số điện"
        eyebrow="Chỉ số, điện tiêu thụ, PV tháng và thanh toán theo kỳ"
      >
        <div className="grid gap-3">
          {dashboard.meterHistory.map((period) => {
            const expanded = expandedPeriod === period.period;

            return (
              <article key={period.period} className="customer-soft-card p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedPeriod((current) =>
                      current === period.period ? null : period.period,
                    )
                  }
                  className="flex w-full flex-wrap items-start justify-between gap-4 text-left"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                      Kỳ {period.period}
                    </p>
                    <h3 className={cn('mt-2 text-lg font-semibold', headingText)}>
                      {formatCurrency(period.amount)}
                    </h3>
                    <p className={cn('mt-2 text-sm', dark ? 'text-slate-400' : 'text-slate-500')}>
                      {formatUsage(period.loadConsumedKwh)} · PV {formatNumber(period.pvGenerationKwh, 'kWh')}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className={badgeClass}>
                      {period.paymentStatus}
                    </div>
                    <span className="customer-icon-button h-10 w-10">
                      {expanded ? (
                        <ChevronUp className="h-4.5 w-4.5" />
                      ) : (
                        <ChevronDown className="h-4.5 w-4.5" />
                      )}
                    </span>
                  </div>
                </button>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Chỉ số cũ', value: formatMeterReading(period.previousReading) },
                    { label: 'Chỉ số mới', value: formatMeterReading(period.currentReading) },
                    { label: 'Điện tiêu thụ', value: formatUsage(period.loadConsumedKwh) },
                    { label: 'PV tháng', value: formatNumber(period.pvGenerationKwh, 'kWh') },
                  ].map((item) => (
                    <div key={item.label} className="customer-soft-card-muted px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        {item.label}
                      </p>
                      <p className={cn('mt-2 text-sm leading-6', metricText)}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {expanded ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      { label: 'Số tiền', value: formatCurrency(period.amount) },
                      {
                        label: 'Còn phải thu',
                        value: formatCurrency(period.unpaidAmount),
                      },
                      {
                        label: 'Đồng bộ',
                        value: period.updatedAt
                          ? formatDateTime(period.updatedAt)
                          : 'Chua cap nhat',
                      },
                      {
                        label: 'Nguồn dữ liệu',
                        value: period.sourceLabel || 'Dang cap nhat',
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
                ) : null}
              </article>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
