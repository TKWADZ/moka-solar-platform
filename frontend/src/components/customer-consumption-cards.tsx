'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, CalendarDays, Clock3, Flame, Leaf, TriangleAlert } from 'lucide-react';
import {
  ConsumptionChartPoint,
  UsageLevel,
  formatConsumptionEmptyState,
  formatUsageHeadline,
  usageLevelChipClass,
  usageLevelColor,
  usageLevelLabel,
} from '@/lib/customer-consumption';
import { formatDateTime, formatNumber } from '@/lib/utils';

function UsageBadge({ level }: { level: UsageLevel }) {
  const Icon = level === 'LOW' ? Leaf : level === 'HIGH' ? Flame : Activity;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${usageLevelChipClass(level)}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {usageLevelLabel(level)}
    </span>
  );
}

export function CustomerDailyUsageCard({
  todayUsedKwh,
  lastUpdatedAt,
  updateLabel,
  level,
  hasDailyData,
}: {
  todayUsedKwh: number | null;
  lastUpdatedAt?: string | null;
  updateLabel: string;
  level: UsageLevel;
  hasDailyData: boolean;
}) {
  return (
    <div className="customer-surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
            Tieu thu hom nay
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[2.35rem]">
            Hom nay da dung {formatUsageHeadline(todayUsedKwh)}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{updateLabel}</p>
        </div>
        <UsageBadge level={level} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="customer-soft-card-muted px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Cap nhat</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700">
            <Clock3 className="h-4 w-4 text-slate-400" />
            {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : 'Chua co moc cap nhat'}
          </p>
        </div>
        <div className="customer-soft-card-muted px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Nguon du lieu</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-700">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            {hasDailyData ? 'Theo ngay' : 'Chua san sang'}
          </p>
        </div>
      </div>

      {!hasDailyData ? (
        <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-700">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0" />
            <p>{formatConsumptionEmptyState(hasDailyData)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CustomerConsumptionChartCard({
  title,
  eyebrow,
  description,
  points,
  emptyTitle,
  emptyBody,
}: {
  title: string;
  eyebrow: string;
  description: string;
  points: ConsumptionChartPoint[];
  emptyTitle: string;
  emptyBody: string;
}) {
  const hasData = points.some((point) => typeof point.value === 'number');
  const chartData = points.map((point) => ({
    ...point,
    chartValue: typeof point.value === 'number' ? point.value : 0,
    fill: usageLevelColor(point.level),
  }));

  return (
    <div className="customer-surface-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{eyebrow}</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
            {title}
          </h3>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <UsageBadge level="LOW" />
        <UsageBadge level="MEDIUM" />
        <UsageBadge level="HIGH" />
      </div>

      {hasData ? (
        <div className="mt-5 h-[230px] sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(148,163,184,0.18)" strokeDasharray="3 7" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
                tickMargin={10}
              />
              <YAxis
                stroke="#94a3b8"
                tickLine={false}
                axisLine={false}
                width={54}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatNumber(Number(value || 0), 'kWh')}
              />
              <Tooltip
                formatter={(_, __, payload) => {
                  const point = payload?.payload as ConsumptionChartPoint & { chartValue: number };

                  if (!point || point.value == null) {
                    return ['Chua co du lieu', 'Tieu thu'];
                  }

                  return [`${formatNumber(point.value, 'kWh')} · ${usageLevelLabel(point.level)}`, 'Tieu thu'];
                }}
                labelFormatter={(label, payload) => {
                  const point = payload?.[0]?.payload as ConsumptionChartPoint | undefined;
                  return point?.updatedAt
                    ? `${label} · cap nhat ${formatDateTime(point.updatedAt)}`
                    : String(label);
                }}
                contentStyle={{
                  borderRadius: 18,
                  border: '1px solid rgba(148,163,184,0.18)',
                  background: 'rgba(255,255,255,0.98)',
                  boxShadow: '0 20px 50px rgba(15,23,42,0.12)',
                }}
                labelStyle={{ color: '#0f172a', fontWeight: 600 }}
              />
              <Bar dataKey="chartValue" radius={[10, 10, 4, 4]}>
                {chartData.map((point) => (
                  <Cell
                    key={point.key}
                    fill={point.fill}
                    fillOpacity={point.value == null ? 0.2 : 0.95}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="mt-5 customer-soft-card-muted px-4 py-5">
          <p className="text-base font-semibold text-slate-900">{emptyTitle}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{emptyBody}</p>
        </div>
      )}
    </div>
  );
}
