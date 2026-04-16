import { formatDateTime, formatNumber } from '@/lib/utils';
import { CustomerDashboardData } from '@/types';

export type UsageLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export type ConsumptionChartPoint = {
  key: string;
  label: string;
  value: number | null;
  updatedAt?: string | null;
  isCurrentPeriod?: boolean;
  level: UsageLevel;
};

export type CustomerConsumptionView = {
  hasDailyData: boolean;
  hasMonthlyData: boolean;
  todayUsedKwh: number | null;
  currentMonthConsumptionKwh: number | null;
  lastUpdatedAt: string | null;
  updateLabel: string;
  todayLevel: UsageLevel;
  daily7: ConsumptionChartPoint[];
  daily30: ConsumptionChartPoint[];
  monthly12: ConsumptionChartPoint[];
};

function quantile(values: number[], ratio: number) {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function buildThresholds(values: Array<number | null | undefined>) {
  const numericValues = values.filter((value): value is number => typeof value === 'number');

  if (!numericValues.length) {
    return null;
  }

  const lowMax = quantile(numericValues, 0.33);
  const mediumMax = quantile(numericValues, 0.66);

  if (lowMax === null || mediumMax === null) {
    return null;
  }

  return { lowMax, mediumMax };
}

export function classifyUsageLevel(
  value: number | null | undefined,
  values: Array<number | null | undefined>,
): UsageLevel {
  if (typeof value !== 'number') {
    return 'UNKNOWN';
  }

  const thresholds = buildThresholds(values);
  if (!thresholds) {
    return 'MEDIUM';
  }

  if (thresholds.lowMax === thresholds.mediumMax) {
    return 'MEDIUM';
  }

  if (value <= thresholds.lowMax) {
    return 'LOW';
  }

  if (value <= thresholds.mediumMax) {
    return 'MEDIUM';
  }

  return 'HIGH';
}

export function usageLevelLabel(level: UsageLevel) {
  switch (level) {
    case 'LOW':
      return 'Thap';
    case 'MEDIUM':
      return 'Trung binh';
    case 'HIGH':
      return 'Cao';
    default:
      return 'Chua du du lieu';
  }
}

export function usageLevelColor(level: UsageLevel) {
  switch (level) {
    case 'LOW':
      return '#16a34a';
    case 'MEDIUM':
      return '#f59e0b';
    case 'HIGH':
      return '#dc2626';
    default:
      return '#cbd5e1';
  }
}

export function usageLevelChipClass(level: UsageLevel) {
  switch (level) {
    case 'LOW':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'MEDIUM':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'HIGH':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

export function formatUsageBadge(level: UsageLevel) {
  return `${usageLevelLabel(level)} usage`;
}

function withUsageLevels(points: Array<{
  key: string;
  label: string;
  value: number | null;
  updatedAt?: string | null;
  isCurrentPeriod?: boolean;
}>) {
  const values = points.map((point) => point.value);

  return points.map((point) => ({
    ...point,
    level: classifyUsageLevel(point.value, values),
  }));
}

export function buildCustomerConsumptionView(
  dashboard: CustomerDashboardData | null,
): CustomerConsumptionView {
  const insight = dashboard?.consumptionInsight || null;
  const daily7 = withUsageLevels(insight?.daily7 || []);
  const daily30 = withUsageLevels(insight?.daily30 || []);
  const monthly12 = withUsageLevels(insight?.monthly12 || []);
  const todayUsedKwh = insight?.todayUsedKwh ?? null;
  const updateLabel = insight?.lastUpdatedAt
    ? `Theo ngay · cap nhat luc ${formatDateTime(insight.lastUpdatedAt)}`
    : insight?.hasDailyData
      ? 'Theo ngay'
      : 'Chua co du lieu tieu thu theo ngay';

  return {
    hasDailyData: Boolean(insight?.hasDailyData),
    hasMonthlyData: Boolean(insight?.hasMonthlyData),
    todayUsedKwh,
    currentMonthConsumptionKwh: insight?.currentMonthConsumptionKwh ?? null,
    lastUpdatedAt: insight?.lastUpdatedAt || null,
    updateLabel,
    todayLevel: classifyUsageLevel(
      todayUsedKwh,
      daily30.map((point) => point.value),
    ),
    daily7,
    daily30,
    monthly12,
  };
}

export function formatConsumptionEmptyState(hasDailyData: boolean) {
  return hasDailyData
    ? 'Dang cho du lieu tieu thu moi nhat tu nguon theo ngay.'
    : 'Can nguon load meter / smart meter / EMS / EVN theo ngay de hien thi tieu thu.';
}

export function formatUsageHeadline(value: number | null) {
  return typeof value === 'number' ? formatNumber(value, 'kWh') : 'Chua co du lieu';
}
