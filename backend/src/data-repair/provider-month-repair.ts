import {
  hasConfirmedBareMonthParserSignature,
  isAuthoritativeManualSource,
} from '../common/config/provider-history-billing';

export { hasConfirmedBareMonthParserSignature } from '../common/config/provider-history-billing';

export const PROVIDER_MONTH_REPAIR_CONFIRMATION =
  'QUARANTINE_CONFIRMED_SOLARMAN_PROVIDER_MONTHS';

export const INVALID_SOLARMAN_SOURCES = new Set([
  'SOLARMAN_MONTHLY',
  'SOLARMAN_DAILY_AGGREGATE',
]);

// Bare month parsing can cross the UTC/local-year boundary, so the confirmed
// legacy signature appears as Dec 2000 plus Jan-Nov 2001 in production.
export const INVALID_BARE_MONTH_DATE_YEARS = new Set([2000, 2001]);

const FINANCIAL_LOCKED_STATUSES = new Set([
  'ISSUED',
  'OVERDUE',
  'PAID',
  'PARTIAL',
]);

export type ProviderMonthRepairEnergyRecord = {
  id: string;
  solarSystemId: string;
  stationId: string;
  year: number;
  month: number;
  source: string;
  rawPayload?: unknown;
  updatedByUserId?: string | null;
  createdAt: Date | string;
  syncTime: Date | string;
  deletedAt?: Date | string | null;
  solarSystem?: {
    createdAt?: Date | string | null;
    installDate?: Date | string | null;
    startedAt?: Date | string | null;
  } | null;
};

export type ProviderMonthRepairBilling = {
  id: string;
  solarSystemId: string;
  year: number;
  month: number;
  source: string;
  manualOverrideKwh?: unknown;
  invoiceId?: string | null;
  invoice?: {
    id: string;
    status: string;
    referenceCounts?: {
      items: number;
      payments: number;
      zaloMessageLogs: number;
    };
  } | null;
};

export type ProviderMonthRepairAction =
  | 'SOFT_DELETE_INVALID_PROVIDER_DATA'
  | 'CANCEL_DRAFT_AND_SOFT_DELETE'
  | 'NEEDS_MANUAL_FINANCIAL_REVIEW'
  | 'PRESERVE_MANUAL_DATA';

export type ProviderMonthRepairPlanItem = {
  energyRecord: ProviderMonthRepairEnergyRecord;
  billing: ProviderMonthRepairBilling | null;
  action: ProviderMonthRepairAction;
  reason: string;
};

function yearOf(value?: Date | string | null) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getUTCFullYear();
}

export function getSystemHistoryStartYear(
  record: ProviderMonthRepairEnergyRecord,
) {
  return (
    yearOf(record.solarSystem?.installDate) ??
    yearOf(record.solarSystem?.startedAt) ??
    yearOf(record.solarSystem?.createdAt)
  );
}

export function maskStationId(stationId: string) {
  const normalized = stationId.trim();
  if (normalized.length <= 4) {
    return '*'.repeat(normalized.length || 1);
  }
  return `${normalized.slice(0, 2)}${'*'.repeat(Math.min(8, normalized.length - 4))}${normalized.slice(-2)}`;
}

export function isConfirmedInvalidProviderMonth(
  record: ProviderMonthRepairEnergyRecord,
) {
  if (
    record.deletedAt ||
    !INVALID_BARE_MONTH_DATE_YEARS.has(record.year) ||
    !INVALID_SOLARMAN_SOURCES.has(record.source.trim().toUpperCase()) ||
    isAuthoritativeManualSource(record.source) ||
    record.updatedByUserId
  ) {
    return false;
  }

  if (!hasConfirmedBareMonthParserSignature(record.rawPayload, record.month)) {
    return false;
  }

  const historyStartYear = getSystemHistoryStartYear(record);
  return historyStartYear !== null && record.year < historyStartYear;
}

export function buildProviderMonthRepairPlan(
  energyRecords: ProviderMonthRepairEnergyRecord[],
  billings: ProviderMonthRepairBilling[],
  scope?: { systemId?: string; stationId?: string },
) {
  const billingByPeriod = new Map(
    billings.map((billing) => [
      `${billing.solarSystemId}:${billing.year}:${billing.month}`,
      billing,
    ]),
  );

  return energyRecords
    .filter((record) => !scope?.systemId || record.solarSystemId === scope.systemId)
    .filter((record) => !scope?.stationId || record.stationId === scope.stationId)
    .filter(isConfirmedInvalidProviderMonth)
    .map((energyRecord): ProviderMonthRepairPlanItem => {
      const billing =
        billingByPeriod.get(
          `${energyRecord.solarSystemId}:${energyRecord.year}:${energyRecord.month}`,
        ) || null;
      const billingManuallyLocked = Boolean(
        billing &&
          (isAuthoritativeManualSource(billing.source) ||
            billing.manualOverrideKwh !== null &&
              billing.manualOverrideKwh !== undefined),
      );

      if (billingManuallyLocked) {
        return {
          energyRecord,
          billing,
          action: 'PRESERVE_MANUAL_DATA',
          reason: 'The linked billing period contains authoritative manual data.',
        };
      }

      const invoiceStatus = billing?.invoice?.status?.toUpperCase() || null;
      if (invoiceStatus && FINANCIAL_LOCKED_STATUSES.has(invoiceStatus)) {
        return {
          energyRecord,
          billing,
          action: 'NEEDS_MANUAL_FINANCIAL_REVIEW',
          reason: `Linked invoice status ${invoiceStatus} cannot be changed automatically.`,
        };
      }

      if (invoiceStatus === 'DRAFT' || invoiceStatus === 'PENDING_REVIEW') {
        return {
          energyRecord,
          billing,
          action: 'CANCEL_DRAFT_AND_SOFT_DELETE',
          reason: 'The mutable invoice must be cancelled and detached before quarantine.',
        };
      }

      return {
        energyRecord,
        billing,
        action: 'SOFT_DELETE_INVALID_PROVIDER_DATA',
        reason: 'Confirmed parser signature with no financially locked invoice.',
      };
    });
}

export function summarizeProviderMonthRepairPlan(plan: ProviderMonthRepairPlanItem[]) {
  const actionCounts = plan.reduce<Record<string, number>>((counts, item) => {
    counts[item.action] = (counts[item.action] || 0) + 1;
    return counts;
  }, {});
  const invoiceStatusCounts = plan.reduce<Record<string, number>>((counts, item) => {
    const status = item.billing?.invoice?.status || 'NO_INVOICE';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const relatedReferenceCounts = plan.reduce(
    (counts, item) => {
      if (item.billing) {
        counts.monthlyPvBillingPeriods += 1;
      }
      if (item.billing?.invoice) {
        counts.invoices += 1;
        counts.invoiceItems += item.billing.invoice.referenceCounts?.items || 0;
        counts.payments += item.billing.invoice.referenceCounts?.payments || 0;
        counts.zaloMessageLogs +=
          item.billing.invoice.referenceCounts?.zaloMessageLogs || 0;
      }
      return counts;
    },
    {
      monthlyPvBillingPeriods: 0,
      invoices: 0,
      invoiceItems: 0,
      payments: 0,
      zaloMessageLogs: 0,
    },
  );

  return {
    affectedSystemIds: [...new Set(plan.map((item) => item.energyRecord.solarSystemId))],
    maskedStationIds: [
      ...new Set(plan.map((item) => maskStationId(item.energyRecord.stationId))),
    ],
    invalidMonthlyEnergyRecordCount: plan.length,
    invalidMonthlyPvBillingCount: plan.filter((item) => item.billing).length,
    linkedInvoiceCount: plan.filter((item) => item.billing?.invoice).length,
    sources: [...new Set(plan.map((item) => item.energyRecord.source))],
    periods: [
      ...new Set(
        plan.map(
          (item) =>
            `${String(item.energyRecord.month).padStart(2, '0')}/${item.energyRecord.year}`,
        ),
      ),
    ].sort(),
    actionCounts,
    invoiceStatusCounts,
    relatedReferenceCounts,
    hasManualOverride: plan.some(
      (item) =>
        item.billing?.manualOverrideKwh !== null &&
        item.billing?.manualOverrideKwh !== undefined,
    ),
  };
}
