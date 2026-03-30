import { Injectable } from '@nestjs/common';
import { buildOperationalFreshness, buildOperationalSourceLabel } from '../common/config/operational-data-source';
import { extractOperationalPeriodMetrics } from '../common/helpers/operational-period.helper';
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
        system.lastMonthlySyncAt,
        system.lastBillingSyncAt,
        system.updatedAt?.toISOString?.(),
        system.latestMonthlySyncTime,
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

    return {
      summary: {
        totalGenerationLifetime: this.roundMetric(lifetimeGeneration),
        totalConsumptionCurrentMonth:
          currentMonthConsumption !== null ? this.roundMetric(currentMonthConsumption) : null,
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
    };
  }

  private buildPeriodGroups(monthlyRecords: any[], monthlyBillings: any[], invoices: any[]) {
    const periodMap = new Map<string, PeriodGroup>();
    const linkedInvoiceIds = new Set(
      monthlyBillings.map((billing) => billing.invoiceId).filter(Boolean),
    );

    for (const record of monthlyRecords) {
      const metrics = extractOperationalPeriodMetrics(record);
      const key = `${record.year}-${record.month}`;
      const current =
        periodMap.get(key) ||
        ({
          year: record.year,
          month: record.month,
          period: `${String(record.month).padStart(2, '0')}/${record.year}`,
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
        } satisfies PeriodGroup);

      current.pvGenerationKwh += metrics?.pvGenerationKwh || 0;
      const loadConsumed = metrics?.loadConsumedKwh ?? metrics?.pvGenerationKwh ?? null;
      const previousReading = metrics?.previousReading ?? null;
      const currentReading = metrics?.currentReading ?? null;

      current.loadConsumedKwh =
        loadConsumed !== null
          ? (current.loadConsumedKwh || 0) + loadConsumed
          : current.loadConsumedKwh;
      current.previousReading =
        previousReading !== null
          ? (current.previousReading || 0) + previousReading
          : current.previousReading;
      current.currentReading =
        currentReading !== null
          ? (current.currentReading || 0) + currentReading
          : current.currentReading;
      current.updatedAt = this.maxIsoDate([
        current.updatedAt,
        metrics?.syncTime ||
          record.syncTime?.toISOString?.() ||
          record.syncTime ||
          null,
      ]);
      current.systemsCount += 1;

      if (!current.source && metrics?.source) {
        current.source = metrics.source;
        current.sourceLabel = metrics.sourceLabel;
      } else if (current.source && metrics?.source && current.source !== metrics.source) {
        current.source = 'MIXED';
        current.sourceLabel = 'Nhiều nguồn dữ liệu';
      }

      periodMap.set(key, current);
    }

    for (const billing of monthlyBillings) {
      const key = `${billing.year}-${billing.month}`;
      const current =
        periodMap.get(key) ||
        ({
          year: billing.year,
          month: billing.month,
          period: `${String(billing.month).padStart(2, '0')}/${billing.year}`,
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
        } satisfies PeriodGroup);

      current.pvGenerationKwh += this.toNullableNumber(billing.pvGenerationKwh) || 0;
      current.amount += this.toNullableNumber(billing.totalAmount) || 0;
      current.updatedAt = this.maxIsoDate([current.updatedAt, billing.syncTime?.toISOString?.()]);
      current.systemsCount += 1;
      if (!current.source && billing.source) {
        current.source = billing.source;
        current.sourceLabel = buildOperationalSourceLabel(billing.source);
      }
      periodMap.set(key, current);
    }

    for (const invoice of invoices) {
      const key = `${invoice.billingYear}-${invoice.billingMonth}`;
      const current =
        periodMap.get(key) ||
        ({
          year: invoice.billingYear,
          month: invoice.billingMonth,
          period: `${String(invoice.billingMonth).padStart(2, '0')}/${invoice.billingYear}`,
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
        } satisfies PeriodGroup);

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
        invoice.updatedAt?.toISOString?.(),
        invoice.issuedAt?.toISOString?.(),
      ]);
      periodMap.set(key, current);
    }

    return [...periodMap.values()]
      .sort((left, right) => right.year - left.year || right.month - left.month)
      .map((period) => ({
        ...period,
        loadConsumedKwh:
          period.loadConsumedKwh === null && period.pvGenerationKwh > 0
            ? period.pvGenerationKwh
            : period.loadConsumedKwh,
      }))
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

  private toNullableNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
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
