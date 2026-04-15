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
};

type CumulativePvReadingValue = {
  previousReading: number;
  currentReading: number;
};

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

function normalizeCumulativeValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(6));
}

export function extractOperationalPeriodMetrics(record: RecordLike | null | undefined) {
  if (!record) {
    return null;
  }

  let previousReading = extractNumericField(record.rawPayload, [
    'previousReading',
    'oldReading',
    'oldMeterReading',
    'chiSoCu',
    'startReading',
  ]);
  let currentReading = extractNumericField(record.rawPayload, [
    'currentReading',
    'newReading',
    'newMeterReading',
    'chiSoMoi',
    'endReading',
  ]);
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
      const pvGeneration = toNumber(item.pvGenerationKwh) ?? 0;
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
