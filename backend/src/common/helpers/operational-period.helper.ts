import { buildOperationalSourceLabel, classifyOperationalSource } from '../config/operational-data-source';
import { toNumber } from './domain.helper';

type RecordLike = {
  year?: number | null;
  month?: number | null;
  pvGenerationKwh?: unknown;
  loadConsumedKwh?: unknown;
  meterReadingStart?: unknown;
  meterReadingEnd?: unknown;
  savingsAmount?: unknown;
  source?: string | null;
  syncTime?: Date | string | null;
  rawPayload?: unknown;
};

type CumulativePvReadingRecord = {
  id: string;
  solarSystemId?: string | null;
  contractId?: string | null;
  year?: number | null;
  month?: number | null;
  pvGenerationKwh?: unknown;
  monthlyPvKwh?: unknown;
  productionKwh?: unknown;
};

type CumulativePvReadingValue = {
  previousReading: number;
  currentReading: number;
};

export type MeterContinuityRecord = {
  id: string;
  solarSystemId?: string | null;
  contractId?: string | null;
  year?: number | null;
  month?: number | null;
  consumptionKwh?: unknown;
  consumptionSource?: string | null;
  billableKwh?: unknown;
  loadConsumedKwh?: unknown;
  pvGenerationKwh?: unknown;
  meterReadingStart?: unknown;
  meterReadingEnd?: unknown;
  rawPayload?: unknown;
};

export type MeterContinuityStatus =
  | 'FIRST_PERIOD'
  | 'OK'
  | 'RESET_CONFIRMED'
  | 'WARNING'
  | 'CONTINUITY_ERROR';

export type MeterContinuityValue = {
  previousReading: number;
  currentReading: number;
  consumptionKwh: number;
  consumptionSource: string | null;
  consumptionSourceLabel: string | null;
  continuityStatus: MeterContinuityStatus;
  continuityWarning: string | null;
  hasContinuityError: boolean;
  resetApplied: boolean;
  expectedPreviousReading: number | null;
  explicitPreviousReading: number | null;
  explicitCurrentReading: number | null;
};

export type MeterContinuityConsumptionResolution = {
  value: number | null;
  source: string | null;
  sourceLabel: string | null;
};

const CONTINUITY_RESET_ALIASES = [
  'meterReset',
  'meter_reset',
  'meterReplaced',
  'meter_replaced',
  'contractRestart',
  'contract_restart',
  'confirmedMeterReset',
  'confirmed_meter_reset',
  'continuityResetConfirmed',
  'continuity_reset_confirmed',
];

const PREVIOUS_READING_ALIASES = [
  'previousReading',
  'oldReading',
  'oldMeterReading',
  'chiSoCu',
  'startReading',
];

const CURRENT_READING_ALIASES = [
  'currentReading',
  'newReading',
  'newMeterReading',
  'chiSoMoi',
  'endReading',
];

const CONTINUITY_TOLERANCE = 0.05;

function maxIsoDate(values: Array<string | null | undefined>) {
  const filtered = values.filter(Boolean) as string[];

  if (!filtered.length) {
    return null;
  }

  return filtered.sort().at(-1) || null;
}

function normalizeKey(value: string) {
  return value
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function collectObjects(value: unknown, depth = 0, bucket: Record<string, unknown>[] = []) {
  if (!value || depth > 3 || typeof value !== 'object' || Array.isArray(value)) {
    return bucket;
  }

  bucket.push(value as Record<string, unknown>);

  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectObjects(nested, depth + 1, bucket);
  }

  return bucket;
}

function extractNumericField(payload: unknown, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeKey(alias)));
  const objects = collectObjects(payload);

  for (const item of objects) {
    for (const [key, value] of Object.entries(item)) {
      if (!normalizedAliases.has(normalizeKey(key))) {
        continue;
      }

      const numeric = toNumber(value);
      if (numeric !== null && numeric !== undefined && Number.isFinite(numeric)) {
        return numeric;
      }
    }
  }

  return null;
}

function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['true', '1', 'yes', 'y', 'co', 'có', 'x', 'checked'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n', 'khong', 'không', ''].includes(normalized)) {
    return false;
  }

  return null;
}

function extractBooleanField(payload: unknown, aliases: string[]) {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeKey(alias)));
  const objects = collectObjects(payload);

  for (const item of objects) {
    for (const [key, value] of Object.entries(item)) {
      if (!normalizedAliases.has(normalizeKey(key))) {
        continue;
      }

      const normalized = normalizeBoolean(value);
      if (normalized !== null) {
        return normalized;
      }
    }
  }

  return null;
}

function normalizeCumulativeValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(6));
}

function resolveCumulativeProductionKwh(record: CumulativePvReadingRecord) {
  const candidates = [
    toNumber(record.pvGenerationKwh),
    toNumber(record.monthlyPvKwh),
    toNumber(record.productionKwh),
  ].filter((value): value is number => value !== null && value !== undefined);

  const preferredNonZero = candidates.find((value) => Math.abs(value) > 0);
  if (preferredNonZero !== undefined) {
    return preferredNonZero;
  }

  return candidates[0] ?? 0;
}

function resolveReadingFromRecord(
  directValue: unknown,
  payload: unknown,
  aliases: string[],
) {
  return toNumber(directValue) ?? extractNumericField(payload, aliases);
}

export function hasConfirmedContinuityReset(payload: unknown) {
  return extractBooleanField(payload, CONTINUITY_RESET_ALIASES) === true;
}

export function resolveMeterContinuityConsumption(params: {
  consumptionKwh?: unknown;
  billableKwh?: unknown;
  loadConsumedKwh?: unknown;
  pvGenerationKwh?: unknown;
}) {
  const directConsumption = toNumber(params.consumptionKwh);
  if (directConsumption !== null && directConsumption !== undefined) {
    return {
      value: directConsumption,
      source: 'CONSUMPTION_KWH',
      sourceLabel: 'San luong tinh continuity',
    } satisfies MeterContinuityConsumptionResolution;
  }

  const billableKwh = toNumber(params.billableKwh);
  if (billableKwh !== null && billableKwh !== undefined) {
    return {
      value: billableKwh,
      source: 'BILLABLE_KWH',
      sourceLabel: 'San luong tinh tien',
    } satisfies MeterContinuityConsumptionResolution;
  }

  const loadConsumedKwh = toNumber(params.loadConsumedKwh);
  if (loadConsumedKwh !== null && loadConsumedKwh !== undefined) {
    return {
      value: loadConsumedKwh,
      source: 'LOAD_CONSUMED_KWH',
      sourceLabel: 'Dien tieu thu',
    } satisfies MeterContinuityConsumptionResolution;
  }

  const pvGenerationKwh = toNumber(params.pvGenerationKwh);
  if (pvGenerationKwh !== null && pvGenerationKwh !== undefined) {
    return {
      value: pvGenerationKwh,
      source: 'PV_GENERATION_KWH',
      sourceLabel: 'PV thang',
    } satisfies MeterContinuityConsumptionResolution;
  }

  return {
    value: null,
    source: null,
    sourceLabel: null,
  } satisfies MeterContinuityConsumptionResolution;
}

export function extractOperationalPeriodMetrics(record: RecordLike | null | undefined) {
  if (!record) {
    return null;
  }

  let previousReading = extractNumericField(record.rawPayload, PREVIOUS_READING_ALIASES);
  let currentReading = extractNumericField(record.rawPayload, CURRENT_READING_ALIASES);
  let explicitStart = toNumber(record.meterReadingStart);
  let explicitEnd = toNumber(record.meterReadingEnd);
  let loadConsumedKwh = toNumber(record.loadConsumedKwh);
  const sourceKind = classifyOperationalSource(record.source);

  const hasPlaceholderApiReadings =
    sourceKind !== 'MANUAL' &&
    [loadConsumedKwh, explicitStart, explicitEnd, previousReading, currentReading].every(
      (value) => value === null || value === 0,
    ) &&
    [loadConsumedKwh, explicitStart, explicitEnd, previousReading, currentReading].some(
      (value) => value === 0,
    );

  if (hasPlaceholderApiReadings) {
    loadConsumedKwh = null;
    explicitStart = null;
    explicitEnd = null;
    previousReading = null;
    currentReading = null;
  }

  return {
    period:
      record.month && record.year
        ? `${String(record.month).padStart(2, '0')}/${record.year}`
        : null,
    pvGenerationKwh: toNumber(record.pvGenerationKwh),
    loadConsumedKwh,
    savingsAmount: toNumber(record.savingsAmount),
    previousReading: explicitStart ?? previousReading,
    currentReading: explicitEnd ?? currentReading,
    source: record.source || null,
    sourceLabel: buildOperationalSourceLabel(record.source),
    sourceKind,
    syncTime:
      typeof record.syncTime === 'string'
        ? record.syncTime
        : record.syncTime?.toISOString?.() || null,
  };
}

export function aggregateOperationalPeriodMetrics(
  records: Array<RecordLike | null | undefined>,
  fallback?: {
    year?: number | null;
    month?: number | null;
    source?: string | null;
    syncTime?: Date | string | null;
  },
) {
  const validRecords = records.filter(Boolean) as RecordLike[];

  if (!validRecords.length && !fallback) {
    return null;
  }

  let pvGenerationKwh = 0;
  let loadConsumedKwh = 0;
  let previousReading = 0;
  let currentReading = 0;
  let hasPv = false;
  let hasLoad = false;
  let hasPrevious = false;
  let hasCurrent = false;
  let source: string | null = null;
  let sourceLabel: string | null = null;
  let sourceKind: string | null = null;
  let syncTime: string | null = null;

  for (const record of validRecords) {
    const metrics = extractOperationalPeriodMetrics(record);
    if (!metrics) {
      continue;
    }

    if (metrics.pvGenerationKwh !== null && metrics.pvGenerationKwh !== undefined) {
      pvGenerationKwh += metrics.pvGenerationKwh;
      hasPv = true;
    }

    if (metrics.loadConsumedKwh !== null && metrics.loadConsumedKwh !== undefined) {
      loadConsumedKwh += metrics.loadConsumedKwh;
      hasLoad = true;
    }

    if (metrics.previousReading !== null && metrics.previousReading !== undefined) {
      previousReading += metrics.previousReading;
      hasPrevious = true;
    }

    if (metrics.currentReading !== null && metrics.currentReading !== undefined) {
      currentReading += metrics.currentReading;
      hasCurrent = true;
    }

    syncTime = maxIsoDate([syncTime, metrics.syncTime]);

    if (!source && metrics.source) {
      source = metrics.source;
      sourceLabel = metrics.sourceLabel;
      sourceKind = metrics.sourceKind;
    } else if (source && metrics.source && source !== metrics.source) {
      source = 'MIXED';
      sourceLabel = 'Nhiều nguồn dữ liệu';
      sourceKind = 'MIXED';
    }
  }

  if (!hasLoad && hasPv) {
    loadConsumedKwh = pvGenerationKwh;
    hasLoad = true;
  }

  if (!source && fallback?.source) {
    source = fallback.source;
    sourceLabel = buildOperationalSourceLabel(fallback.source);
    sourceKind = classifyOperationalSource(fallback.source);
  }

  if (!syncTime && fallback?.syncTime) {
    syncTime =
      typeof fallback.syncTime === 'string'
        ? fallback.syncTime
        : fallback.syncTime.toISOString?.() || null;
  }

  const year = validRecords[0]?.year ?? fallback?.year ?? null;
  const month = validRecords[0]?.month ?? fallback?.month ?? null;

  return {
    period:
      year && month ? `${String(month).padStart(2, '0')}/${year}` : null,
    pvGenerationKwh: hasPv ? toNumber(pvGenerationKwh) : null,
    loadConsumedKwh: hasLoad ? toNumber(loadConsumedKwh) : null,
    savingsAmount: null,
    previousReading: hasPrevious ? toNumber(previousReading) : null,
    currentReading: hasCurrent ? toNumber(currentReading) : null,
    source,
    sourceLabel,
    sourceKind,
    syncTime,
  };
}

export function buildCumulativePvReadingLookups(
  records: Array<CumulativePvReadingRecord | null | undefined>,
) {
  const byRecordId = new Map<string, CumulativePvReadingValue>();
  const bySystemPeriod = new Map<string, CumulativePvReadingValue>();
  const groups = new Map<string, CumulativePvReadingRecord[]>();

  for (const record of records.filter(Boolean) as CumulativePvReadingRecord[]) {
    const groupKey =
      record.solarSystemId?.trim() ||
      (record.contractId?.trim() ? `contract:${record.contractId.trim()}` : null);

    if (!groupKey || !record.year || !record.month || !record.id) {
      continue;
    }

    const existing = groups.get(groupKey) || [];
    existing.push(record);
    groups.set(groupKey, existing);
  }

  for (const items of groups.values()) {
    items.sort((left, right) => {
      const yearDiff = Number(left.year || 0) - Number(right.year || 0);
      if (yearDiff !== 0) {
        return yearDiff;
      }

      const monthDiff = Number(left.month || 0) - Number(right.month || 0);
      if (monthDiff !== 0) {
        return monthDiff;
      }

      return String(left.id).localeCompare(String(right.id));
    });

    let cumulative = 0;

    for (const item of items) {
      const pvGeneration = resolveCumulativeProductionKwh(item);
      const previousReading = normalizeCumulativeValue(cumulative);
      cumulative = normalizeCumulativeValue(cumulative + pvGeneration);
      const currentReading = cumulative;
      const cumulativeValue = {
        previousReading,
        currentReading,
      };

      byRecordId.set(item.id, cumulativeValue);

      const systemPeriodKey = buildOperationalPeriodKey(
        item.solarSystemId || null,
        item.year || null,
        item.month || null,
      );

      if (systemPeriodKey) {
        bySystemPeriod.set(systemPeriodKey, cumulativeValue);
      }
    }
  }

  return {
    byRecordId,
    bySystemPeriod,
  };
}

export function buildMeterContinuityLookups(
  records: Array<MeterContinuityRecord | null | undefined>,
) {
  const byRecordId = new Map<string, MeterContinuityValue>();
  const bySystemPeriod = new Map<string, MeterContinuityValue>();
  const groups = new Map<string, MeterContinuityRecord[]>();

  for (const record of records.filter(Boolean) as MeterContinuityRecord[]) {
    const groupKey =
      record.solarSystemId?.trim() ||
      (record.contractId?.trim() ? `contract:${record.contractId.trim()}` : null);

    if (!groupKey || !record.year || !record.month || !record.id) {
      continue;
    }

    const existing = groups.get(groupKey) || [];
    existing.push(record);
    groups.set(groupKey, existing);
  }

  for (const items of groups.values()) {
    items.sort((left, right) => {
      const yearDiff = Number(left.year || 0) - Number(right.year || 0);
      if (yearDiff !== 0) {
        return yearDiff;
      }

      const monthDiff = Number(left.month || 0) - Number(right.month || 0);
      if (monthDiff !== 0) {
        return monthDiff;
      }

      return String(left.id).localeCompare(String(right.id));
    });

    let previousCurrentReading: number | null = null;
    let previousConsumptionSource: string | null = null;

    for (const item of items) {
      const explicitPreviousReading = resolveReadingFromRecord(
        item.meterReadingStart,
        item.rawPayload,
        PREVIOUS_READING_ALIASES,
      );
      const explicitCurrentReading = resolveReadingFromRecord(
        item.meterReadingEnd,
        item.rawPayload,
        CURRENT_READING_ALIASES,
      );
      const resetApplied = hasConfirmedContinuityReset(item.rawPayload);
      const consumption = resolveMeterContinuityConsumption({
        consumptionKwh: item.consumptionKwh,
        billableKwh: item.billableKwh,
        loadConsumedKwh: item.loadConsumedKwh,
        pvGenerationKwh: item.pvGenerationKwh,
      });
      const expectedPreviousReading = previousCurrentReading;
      const previousReading = normalizeCumulativeValue(
        expectedPreviousReading === null
          ? explicitPreviousReading ?? 0
          : resetApplied
            ? explicitPreviousReading ?? 0
            : expectedPreviousReading,
      );

      let consumptionKwh = toNumber(consumption.value);
      if (consumptionKwh !== null && consumptionKwh < 0) {
        consumptionKwh = 0;
      }

      if (consumptionKwh === null && explicitCurrentReading !== null) {
        const derivationBase =
          expectedPreviousReading === null || resetApplied
            ? explicitPreviousReading ?? previousReading
            : previousReading;
        consumptionKwh = normalizeCumulativeValue(
          Math.max(explicitCurrentReading - derivationBase, 0),
        );
      }

      consumptionKwh = normalizeCumulativeValue(consumptionKwh ?? 0);

      const currentReading = normalizeCumulativeValue(previousReading + consumptionKwh);
      const warnings: string[] = [];
      let continuityStatus: MeterContinuityStatus =
        expectedPreviousReading === null
          ? 'FIRST_PERIOD'
          : resetApplied
            ? 'RESET_CONFIRMED'
            : 'OK';

      if (
        expectedPreviousReading !== null &&
        !resetApplied &&
        explicitPreviousReading !== null &&
        Math.abs(explicitPreviousReading - expectedPreviousReading) > CONTINUITY_TOLERANCE
      ) {
        warnings.push(
          `old_reading ${normalizeCumulativeValue(explicitPreviousReading)} khong khop previous new_reading ${normalizeCumulativeValue(expectedPreviousReading)}.`,
        );
        continuityStatus = 'CONTINUITY_ERROR';
      }

      if (
        !resetApplied &&
        explicitCurrentReading !== null &&
        Math.abs(explicitCurrentReading - currentReading) > CONTINUITY_TOLERANCE
      ) {
        warnings.push(
          `new_reading ${normalizeCumulativeValue(explicitCurrentReading)} khong khop old_reading ${normalizeCumulativeValue(previousReading)} + consumption ${normalizeCumulativeValue(consumptionKwh)}.`,
        );
        continuityStatus = 'CONTINUITY_ERROR';
      }

      if (
        !resetApplied &&
        expectedPreviousReading !== null &&
        previousConsumptionSource &&
        consumption.source &&
        previousConsumptionSource !== consumption.source
      ) {
        warnings.push(
          `Nguon continuity doi tu ${previousConsumptionSource} sang ${consumption.source}.`,
        );
        if (continuityStatus !== 'CONTINUITY_ERROR') {
          continuityStatus = 'WARNING';
        }
      }

      if (
        expectedPreviousReading !== null &&
        !resetApplied &&
        consumption.value === null &&
        explicitCurrentReading === null
      ) {
        warnings.push('Khong co consumption/current reading de doi chieu continuity day du.');
        if (continuityStatus !== 'CONTINUITY_ERROR') {
          continuityStatus = 'WARNING';
        }
      }

      const continuityValue = {
        previousReading,
        currentReading,
        consumptionKwh,
        consumptionSource: consumption.source,
        consumptionSourceLabel: consumption.sourceLabel,
        continuityStatus,
        continuityWarning: warnings.length ? warnings.join(' | ') : null,
        hasContinuityError: continuityStatus === 'CONTINUITY_ERROR',
        resetApplied,
        expectedPreviousReading,
        explicitPreviousReading,
        explicitCurrentReading,
      } satisfies MeterContinuityValue;

      byRecordId.set(item.id, continuityValue);

      const systemPeriodKey = buildOperationalPeriodKey(
        item.solarSystemId || null,
        item.year || null,
        item.month || null,
      );

      if (systemPeriodKey) {
        bySystemPeriod.set(systemPeriodKey, continuityValue);
      }

      previousCurrentReading = currentReading;
      previousConsumptionSource = consumption.source || previousConsumptionSource;
    }
  }

  return {
    byRecordId,
    bySystemPeriod,
  };
}

export function buildOperationalPeriodKey(
  solarSystemId: string | null | undefined,
  year: number | null | undefined,
  month: number | null | undefined,
) {
  if (!solarSystemId || !year || !month) {
    return null;
  }

  return `${solarSystemId}:${year}:${month}`;
}
