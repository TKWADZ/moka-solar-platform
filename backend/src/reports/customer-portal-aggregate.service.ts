import { Injectable } from '@nestjs/common';
import {
  buildOperationalFreshness,
  buildOperationalSourceLabel,
} from '../common/config/operational-data-source';
import {
  buildCumulativePvReadingLookups,
  buildOperationalPeriodKey,
  extractOperationalPeriodMetrics,
} from '../common/helpers/operational-period.helper';
import { sumBy } from '../common/helpers/domain.helper';

type PeriodGroup = {
  year: number;
  month: number;
  period: string;
  pvGenerationKwh: number;
  loadConsumedKwh: number | null;
  previousReading: number | null;
  currentReading: number | null;
  amount: number;
  unpaidAmount: number;
  paymentStatus: string;
  updatedAt: string | null;
  source: string | null;
  sourceLabel: string | null;
  systemsCount: number;
};

type PeriodGroupAccumulator = PeriodGroup & {
  systemPeriodKeys: Set<string>;
};

type SystemPeriodAggregate = {
  id: string;
  solarSystemId: string;
  year: number;
  month: number;
  period: string;
  operationalPvKwh: number | null;
  billingPvKwh: number | null;
  loadConsumedKwh: number | null;
  amount: number;
  updatedAt: string | null;
  source: string | null;
  sourceLabel: string | null;
};

type ConsumptionSeriesPoint = {
  key: string;
  label: string;
  value: number | null;
  updatedAt: string | null;
  isCurrentPeriod: boolean;
};

type ConsumptionInsight = {
  todayUsedKwh: number | null;
  currentMonthConsumptionKwh: number | null;
  lastUpdatedAt: string | null;
  hasDailyData: boolean;
  hasMonthlyData: boolean;
  daily7: ConsumptionSeriesPoint[];
  daily30: ConsumptionSeriesPoint[];
  monthly12: ConsumptionSeriesPoint[];
};

@Injectable()
export class CustomerPortalAggregateService {
  build(params: { systems: any[]; invoices: any[] }) {
    const systems = params.systems || [];
    const invoices = params.invoices || [];
    const monthlyRecords = systems.flatMap((system) =>
      (system.monthlyEnergyRecords || []).map((record: any) => ({
        ...record,
        solarSystemId: record.solarSystemId || system.id,
        systemId: system.id,
        systemName: system.name,
        systemCode: system.systemCode,
      })),
    );
    const monthlyBillings = systems.flatMap((system) =>
      (system.monthlyPvBillings || []).map((billing: any) => ({
        ...billing,
        solarSystemId: billing.solarSystemId || system.id,
        systemId: system.id,
        systemName: system.name,
      })),
    );
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;
    const unpaidInvoices = invoices.filter(
      (invoice: any) => !['PAID', 'CANCELLED'].includes(String(invoice.status || '').toUpperCase()),
    );
    const nearestDueInvoice =
      [...unpaidInvoices].sort(
        (left: any, right: any) =>
          new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
      )[0] || null;
    const periods = this.buildPeriodGroups(monthlyRecords, monthlyBillings, invoices);
    const currentCalendarPeriod =
      periods.find((period) => period.year === currentYear && period.month === currentMonth) || null;
    const targetPeriod = currentCalendarPeriod || periods[0] || null;
    const latestUpdatedAt = this.maxIsoDate(
      systems.flatMap((system) => [
        this.toIsoDate(system.lastMonthlySyncAt),
        this.toIsoDate(system.lastBillingSyncAt),
        this.toIsoDate(system.updatedAt),
        this.toIsoDate(system.latestMonthlySyncTime),
      ]),
    );
    const sources = [...new Set(monthlyRecords.map((record: any) => record.source).filter(Boolean))];
    const latestMeterReadings = systems
      .map((system) => {
        const latestSystemRecord =
          [...(system.monthlyEnergyRecords || [])].sort(
            (left: any, right: any) => right.year - left.year || right.month - left.month,
          )[0] || null;

        return extractOperationalPeriodMetrics(latestSystemRecord)?.currentReading ?? null;
      })
      .filter((value): value is number => value !== null);
    const latestMeterReading = latestMeterReadings.length
      ? sumBy(latestMeterReadings, (value) => value)
      : null;
    const lifetimeGeneration = sumBy(
      systems.map((system) => {
        const totalGeneration = this.toNullableNumber(system.totalGenerationKwh);
        if (totalGeneration !== null && totalGeneration > 0) {
          return totalGeneration;
        }

        return sumBy(system.monthlyEnergyRecords || [], (record: any) =>
          this.toNullableNumber(record.pvGenerationKwh) || 0,
        );
      }),
      (value) => value,
    );
    const currentMonthConsumption = targetPeriod?.loadConsumedKwh ?? null;
    const totalUnpaidAmount = sumBy(unpaidInvoices, (invoice: any) =>
      Math.max(
        (this.toNullableNumber(invoice.totalAmount) || 0) -
          (this.toNullableNumber(invoice.paidAmount) || 0),
        0,
      ),
    );
    const syncFreshness = buildOperationalFreshness({
      year: targetPeriod?.year,
      month: targetPeriod?.month,
      syncTime: targetPeriod?.updatedAt || latestUpdatedAt,
    });
    const consumptionInsight = this.buildConsumptionInsight(systems, now);

    return {
      summary: {
        totalGenerationLifetime: this.roundMetric(lifetimeGeneration),
        totalConsumptionCurrentMonth:
          consumptionInsight.currentMonthConsumptionKwh !== null
            ? this.roundMetric(consumptionInsight.currentMonthConsumptionKwh)
            : currentMonthConsumption !== null
              ? this.roundMetric(currentMonthConsumption)
              : null,
        totalUnpaidAmount: this.roundMoney(totalUnpaidAmount),
        latestMeterReading:
          targetPeriod?.currentReading !== null && targetPeriod?.currentReading !== undefined
            ? this.roundMetric(targetPeriod.currentReading)
            : latestMeterReading !== null
              ? this.roundMetric(latestMeterReading)
              : null,
        outstandingInvoiceCount: unpaidInvoices.length,
        nearestDueInvoiceNumber: nearestDueInvoice?.invoiceNumber || null,
        nearestDueInvoiceDate: nearestDueInvoice?.dueDate?.toISOString?.() || null,
        latestDataPeriod: targetPeriod?.period || null,
        latestDataSourceLabel:
          targetPeriod?.sourceLabel ||
          (sources.length === 1
            ? buildOperationalSourceLabel(sources[0])
            : sources.length > 1
              ? 'Nhiều nguồn dữ liệu'
              : null),
        latestDataStatusLabel: syncFreshness.label,
        latestUpdatedAt,
        systemsTracked: systems.length,
        systemsUpdatedCurrentMonth: new Set(
          monthlyRecords
            .filter(
              (record: any) =>
                targetPeriod &&
                record.year === targetPeriod.year &&
                record.month === targetPeriod.month,
            )
            .map((record: any) => record.solarSystemId || record.systemId),
        ).size,
      },
      monthlyTrend: periods
        .slice(-12)
        .map((period) => ({
          name: `${String(period.month).padStart(2, '0')}/${String(period.year).slice(-2)}`,
          solar: period.pvGenerationKwh,
          load: period.loadConsumedKwh || 0,
        })),
      meterHistory: periods,
      syncStatus: {
        latestUpdatedAt,
        sourceLabel:
          sources.length === 1
            ? buildOperationalSourceLabel(sources[0])
            : sources.length > 1
              ? 'Nhiều nguồn dữ liệu'
              : 'Đang cập nhật',
        statusLabel: syncFreshness.label,
        statusCode: syncFreshness.code,
      },
      consumptionInsight,
    };
  }

  private buildPeriodGroups(monthlyRecords: any[], monthlyBillings: any[], invoices: any[]) {
    const systemPeriodMap = new Map<string, SystemPeriodAggregate>();
    const periodMap = new Map<string, PeriodGroupAccumulator>();
    const linkedInvoiceIds = new Set(
      monthlyBillings.map((billing) => billing.invoiceId).filter(Boolean),
    );

    for (const record of monthlyRecords) {
      const solarSystemId = record.solarSystemId || record.systemId || null;
      const systemPeriodKey = buildOperationalPeriodKey(
        solarSystemId,
        record.year,
        record.month,
      );
      if (!solarSystemId || !systemPeriodKey) {
        continue;
      }

      const metrics = extractOperationalPeriodMetrics(record);
      const current =
        systemPeriodMap.get(systemPeriodKey) ||
        this.createSystemPeriodAggregate(
          systemPeriodKey,
          solarSystemId,
          record.year,
          record.month,
        );

      current.operationalPvKwh = this.resolveMetricValue(
        current.operationalPvKwh,
        metrics?.pvGenerationKwh,
        record.pvGenerationKwh,
        record.monthlyPvKwh,
        record.productionKwh,
      );
      current.loadConsumedKwh = this.resolveMetricValue(
        current.loadConsumedKwh,
        metrics?.loadConsumedKwh,
        record.loadConsumedKwh,
      );
      current.updatedAt = this.maxIsoDate([
        current.updatedAt,
        metrics?.syncTime ||
          this.toIsoDate(record.syncTime) ||
          null,
      ]);
      this.mergePeriodSource(
        current,
        metrics?.source || record.source || null,
        metrics?.sourceLabel || buildOperationalSourceLabel(record.source),
      );

      systemPeriodMap.set(systemPeriodKey, current);
    }

    for (const billing of monthlyBillings) {
      const solarSystemId = billing.solarSystemId || billing.systemId || null;
      const systemPeriodKey = buildOperationalPeriodKey(
        solarSystemId,
        billing.year,
        billing.month,
      );
      if (!solarSystemId || !systemPeriodKey) {
        continue;
      }

      const current =
        systemPeriodMap.get(systemPeriodKey) ||
        this.createSystemPeriodAggregate(
          systemPeriodKey,
          solarSystemId,
          billing.year,
          billing.month,
        );

      current.billingPvKwh = this.resolveMetricValue(
        current.billingPvKwh,
        billing.pvGenerationKwh,
        billing.monthlyPvKwh,
        billing.productionKwh,
      );
      current.amount += this.toNullableNumber(billing.totalAmount) || 0;
      current.updatedAt = this.maxIsoDate([
        current.updatedAt,
        this.toIsoDate(billing.syncTime),
      ]);
      this.mergePeriodSource(
        current,
        billing.source || null,
        billing.source ? buildOperationalSourceLabel(billing.source) : null,
      );

      systemPeriodMap.set(systemPeriodKey, current);
    }

    const cumulativeLookups = buildCumulativePvReadingLookups(
      [...systemPeriodMap.values()].map((record) => ({
        id: record.id,
        solarSystemId: record.solarSystemId,
        year: record.year,
        month: record.month,
        pvGenerationKwh: this.resolveSystemPeriodProductionKwh(record),
      })),
    );

    for (const record of systemPeriodMap.values()) {
      const key = `${record.year}-${record.month}`;
      const current =
        periodMap.get(key) || this.createPeriodAccumulator(record.year, record.month);
      const resolvedProductionKwh = this.resolveSystemPeriodProductionKwh(record);
      const loadConsumedKwh =
        record.loadConsumedKwh !== null && record.loadConsumedKwh !== undefined
          ? record.loadConsumedKwh
          : null;

      current.pvGenerationKwh += resolvedProductionKwh;
      current.loadConsumedKwh =
        loadConsumedKwh !== null
          ? (current.loadConsumedKwh || 0) + loadConsumedKwh
          : current.loadConsumedKwh;
      current.amount += record.amount;
      current.updatedAt = this.maxIsoDate([current.updatedAt, record.updatedAt]);
      current.systemPeriodKeys.add(record.id);
      this.mergePeriodSource(current, record.source, record.sourceLabel);

      periodMap.set(key, current);
    }

    for (const period of periodMap.values()) {
      let previousReading = 0;
      let currentReading = 0;
      let hasReadings = false;

      for (const systemPeriodKey of period.systemPeriodKeys) {
        const reading = cumulativeLookups.byRecordId.get(systemPeriodKey);
        if (!reading) {
          continue;
        }

        previousReading += reading.previousReading;
        currentReading += reading.currentReading;
        hasReadings = true;
      }

      period.previousReading = hasReadings ? previousReading : null;
      period.currentReading = hasReadings ? currentReading : null;
      period.systemsCount = period.systemPeriodKeys.size;
    }

    for (const invoice of invoices) {
      const key = `${invoice.billingYear}-${invoice.billingMonth}`;
      const current =
        periodMap.get(key) ||
        this.createPeriodAccumulator(invoice.billingYear, invoice.billingMonth);

      const outstanding = Math.max(
        (this.toNullableNumber(invoice.totalAmount) || 0) -
          (this.toNullableNumber(invoice.paidAmount) || 0),
        0,
      );
      current.unpaidAmount += outstanding;
      current.paymentStatus = this.resolveAggregatePaymentStatus(current.paymentStatus, invoice.status);
      if (!linkedInvoiceIds.has(invoice.id)) {
        current.amount += this.toNullableNumber(invoice.totalAmount) || 0;
      }
      current.updatedAt = this.maxIsoDate([
        current.updatedAt,
        this.toIsoDate(invoice.updatedAt),
        this.toIsoDate(invoice.issuedAt),
      ]);
      periodMap.set(key, current);
    }

    return [...periodMap.values()]
      .sort((left, right) => right.year - left.year || right.month - left.month)
      .map((period) => ({
        ...period,
        pvGenerationKwh: this.roundMetric(period.pvGenerationKwh),
        loadConsumedKwh:
          period.loadConsumedKwh !== null ? this.roundMetric(period.loadConsumedKwh) : null,
        previousReading:
          period.previousReading !== null ? this.roundMetric(period.previousReading) : null,
        currentReading:
          period.currentReading !== null ? this.roundMetric(period.currentReading) : null,
        amount: this.roundMoney(period.amount),
        unpaidAmount: this.roundMoney(period.unpaidAmount),
      }));
  }

  private buildConsumptionInsight(systems: any[], now: Date): ConsumptionInsight {
    const todayKey = this.formatDateKey(now);
    const currentMonthKey = `${this.getYearKey(now)}-${String(this.getMonthKey(now)).padStart(2, '0')}`;
    const dailyMap = new Map<
      string,
      { value: number; hasValue: boolean; updatedAt: string | null }
    >();
    const monthlyMap = new Map<
      string,
      { value: number; hasValue: boolean; updatedAt: string | null }
    >();

    for (const system of systems) {
      const dailyUpdatedAt = this.toIsoDate(system.lastDailySyncAt);
      const monthlyUpdatedAt =
        this.toIsoDate(system.lastMonthlySyncAt) ||
        this.toIsoDate(system.latestMonthlySyncTime);

      for (const record of system.deyeDailyRecords || []) {
        const consumptionValue = this.toNullableNumber(record.consumptionValueKwh);
        if (consumptionValue === null) {
          continue;
        }

        const dateKey = this.formatDateKey(record.recordDate);
        if (!dateKey) {
          continue;
        }
        const current =
          dailyMap.get(dateKey) || { value: 0, hasValue: false, updatedAt: null };

        current.value += consumptionValue;
        current.hasValue = true;
        current.updatedAt = this.maxIsoDate([
          current.updatedAt,
          dailyUpdatedAt,
          this.toIsoDate(record.recordDate),
        ]);

        dailyMap.set(dateKey, current);
      }

      for (const record of system.monthlyEnergyRecords || []) {
        const consumptionValue = this.toNullableNumber(record.loadConsumedKwh);
        if (consumptionValue === null) {
          continue;
        }

        const monthKey = `${record.year}-${String(record.month).padStart(2, '0')}`;
        const current =
          monthlyMap.get(monthKey) || { value: 0, hasValue: false, updatedAt: null };

        current.value += consumptionValue;
        current.hasValue = true;
        current.updatedAt = this.maxIsoDate([
          current.updatedAt,
          monthlyUpdatedAt,
          this.toIsoDate(record.syncTime),
        ]);

        monthlyMap.set(monthKey, current);
      }
    }

    const dailyKeysAsc = [...dailyMap.keys()].sort((left, right) => left.localeCompare(right));
    const latestDailyKey = dailyKeysAsc.at(-1) || null;
    const latestDailyUpdatedAt = this.maxIsoDate(
      [...dailyMap.values()].map((entry) => entry.updatedAt),
    );
    const dailyWindowEndKey = dailyMap.has(todayKey) ? todayKey : latestDailyKey;
    const daily7 = this.buildTrailingDailySeries({
      endKey: dailyWindowEndKey,
      days: 7,
      dailyMap,
      todayKey,
    });
    const daily30 = this.buildTrailingDailySeries({
      endKey: dailyWindowEndKey,
      days: 30,
      dailyMap,
      todayKey,
    });
    const todayUsedKwh = dailyMap.get(todayKey)?.hasValue
      ? this.roundMetric(dailyMap.get(todayKey)!.value)
      : null;

    const currentMonthDailyEntries = [...dailyMap.entries()].filter(
      ([key, entry]) => entry.hasValue && key.startsWith(currentMonthKey),
    );
    if (currentMonthDailyEntries.length) {
      monthlyMap.set(currentMonthKey, {
        value: this.roundMetric(
          sumBy(
            currentMonthDailyEntries.map(([, entry]) => entry.value),
            (value) => value,
          ),
        ),
        hasValue: true,
        updatedAt: latestDailyUpdatedAt,
      });
    }

    const monthlyKeysAsc = [...monthlyMap.keys()].sort((left, right) =>
      left.localeCompare(right),
    );
    const latestMonthlyKey = monthlyKeysAsc.at(-1) || currentMonthKey;
    const monthly12 = this.buildTrailingMonthlySeries({
      endKey: latestMonthlyKey,
      months: 12,
      monthlyMap,
      currentMonthKey,
    });
    const currentMonthConsumptionKwh = monthlyMap.get(currentMonthKey)?.hasValue
      ? this.roundMetric(monthlyMap.get(currentMonthKey)!.value)
      : null;

    return {
      todayUsedKwh,
      currentMonthConsumptionKwh,
      lastUpdatedAt: this.maxIsoDate([
        latestDailyUpdatedAt,
        ...[...monthlyMap.values()].map((entry) => entry.updatedAt),
      ]),
      hasDailyData: daily30.some((item) => item.value !== null),
      hasMonthlyData: monthly12.some((item) => item.value !== null),
      daily7,
      daily30,
      monthly12,
    };
  }

  private buildTrailingDailySeries(params: {
    endKey: string | null;
    days: number;
    dailyMap: Map<string, { value: number; hasValue: boolean; updatedAt: string | null }>;
    todayKey: string;
  }) {
    if (!params.endKey) {
      return [];
    }

    const endDate = this.parseDateKey(params.endKey);
    const points: ConsumptionSeriesPoint[] = [];

    for (let index = params.days - 1; index >= 0; index -= 1) {
      const currentDate = new Date(endDate);
      currentDate.setUTCDate(endDate.getUTCDate() - index);
      const key = this.formatDateKey(currentDate);
      const entry = params.dailyMap.get(key);

      points.push({
        key,
        label: this.formatDayLabel(key),
        value: entry?.hasValue ? this.roundMetric(entry.value) : null,
        updatedAt: entry?.updatedAt || null,
        isCurrentPeriod: key === params.todayKey,
      });
    }

    return points;
  }

  private buildTrailingMonthlySeries(params: {
    endKey: string;
    months: number;
    monthlyMap: Map<string, { value: number; hasValue: boolean; updatedAt: string | null }>;
    currentMonthKey: string;
  }) {
    const [yearText, monthText] = params.endKey.split('-');
    const endYear = Number(yearText);
    const endMonth = Number(monthText);
    const points: ConsumptionSeriesPoint[] = [];

    for (let index = params.months - 1; index >= 0; index -= 1) {
      const currentDate = new Date(Date.UTC(endYear, endMonth - 1, 1));
      currentDate.setUTCMonth(currentDate.getUTCMonth() - index);
      const year = currentDate.getUTCFullYear();
      const month = currentDate.getUTCMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const entry = params.monthlyMap.get(key);

      points.push({
        key,
        label: `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`,
        value: entry?.hasValue ? this.roundMetric(entry.value) : null,
        updatedAt: entry?.updatedAt || null,
        isCurrentPeriod: key === params.currentMonthKey,
      });
    }

    return points;
  }

  private createPeriodAccumulator(year: number, month: number): PeriodGroupAccumulator {
    return {
      year,
      month,
      period: `${String(month).padStart(2, '0')}/${year}`,
      pvGenerationKwh: 0,
      loadConsumedKwh: null,
      previousReading: null,
      currentReading: null,
      amount: 0,
      unpaidAmount: 0,
      paymentStatus: 'CHUA_PHAT_HANH',
      updatedAt: null,
      source: null,
      sourceLabel: null,
      systemsCount: 0,
      systemPeriodKeys: new Set<string>(),
    };
  }

  private createSystemPeriodAggregate(
    id: string,
    solarSystemId: string,
    year: number,
    month: number,
  ): SystemPeriodAggregate {
    return {
      id,
      solarSystemId,
      year,
      month,
      period: `${String(month).padStart(2, '0')}/${year}`,
      operationalPvKwh: null,
      billingPvKwh: null,
      loadConsumedKwh: null,
      amount: 0,
      updatedAt: null,
      source: null,
      sourceLabel: null,
    };
  }

  private mergePeriodSource(
    target: { source: string | null; sourceLabel: string | null },
    source?: string | null,
    sourceLabel?: string | null,
  ) {
    if (!source) {
      return;
    }

    if (!target.source) {
      target.source = source;
      target.sourceLabel = sourceLabel || buildOperationalSourceLabel(source);
      return;
    }

    if (target.source !== source) {
      target.source = 'MIXED';
      target.sourceLabel = 'Nhiều nguồn dữ liệu';
    }
  }

  private resolveAggregatePaymentStatus(currentStatus: string, nextStatus: string) {
    const score: Record<string, number> = {
      OVERDUE: 4,
      PARTIAL: 3,
      ISSUED: 2,
      DRAFT: 1,
      PAID: 0,
      CHUA_PHAT_HANH: -1,
    };

    return (score[nextStatus] ?? 0) > (score[currentStatus] ?? 0) ? nextStatus : currentStatus;
  }

  private resolveMetricValue(...values: unknown[]) {
    const candidates = values
      .map((value) => this.toNullableNumber(value))
      .filter((value): value is number => value !== null && value !== undefined);

    const preferredNonZero = candidates.find((value) => Math.abs(value) > 0);
    if (preferredNonZero !== undefined) {
      return preferredNonZero;
    }

    return candidates[0] ?? null;
  }

  private resolveSystemPeriodProductionKwh(record: SystemPeriodAggregate) {
    return this.resolveMetricValue(record.operationalPvKwh, record.billingPvKwh) ?? 0;
  }

  private toNullableNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private toIsoDate(value: unknown) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    return value instanceof Date ? value.toISOString() : null;
  }

  private parseDateKey(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private formatDateKey(value: unknown) {
    const date =
      value instanceof Date
        ? value
        : typeof value === 'string' || typeof value === 'number'
          ? new Date(value)
          : null;

    if (!date || Number.isNaN(date.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private formatDayLabel(dateKey: string) {
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
    }).format(this.parseDateKey(dateKey));
  }

  private getYearKey(date: Date) {
    return Number(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
      }).format(date),
    );
  }

  private getMonthKey(date: Date) {
    return Number(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        month: '2-digit',
      }).format(date),
    );
  }

  private roundMetric(value: number) {
    return Number(value.toFixed(2));
  }

  private roundMoney(value: number) {
    return Number(value.toFixed(0));
  }

  private maxIsoDate(values: Array<string | null | undefined>) {
    const filtered = values.filter(Boolean) as string[];

    if (!filtered.length) {
      return null;
    }

    return filtered.sort().at(-1) || null;
  }
}
