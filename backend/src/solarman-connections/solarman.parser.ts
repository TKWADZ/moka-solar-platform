type SolarmanRecord = Record<string, unknown>;

const PV_GENERATION_KEYS = [
  'generationValue',
  'generation',
  'pvGeneration',
  'powerGeneration',
  'electricity',
  'yield',
  'generationMonth',
  'generationTotal',
];

export type ParsedSolarmanStation = {
  stationId: string;
  stationName: string | null;
  sourceSystem: string | null;
  installedCapacityKw: number | null;
  generationMonthKwh: number | null;
  generationYearKwh: number | null;
  generationTotalKwh: number | null;
  generationPowerKw: number | null;
  hasBattery: boolean | null;
  powerType: string | null;
  powerMode: string | null;
  timezone: string | null;
  lastUpdateTime: string | null;
  raw: SolarmanRecord;
};

export type ParsedSolarmanDevice = {
  deviceId: string;
  serialNumber: string | null;
  deviceType: string | null;
  deviceModel: string | null;
  status: string | null;
  raw: SolarmanRecord;
};

export type ParsedSolarmanAggregateMetrics = {
  pvGenerationKwh: number;
  loadConsumedKwh: number | null;
  gridImportedKwh: number | null;
  gridExportedKwh: number | null;
  batteryChargeKwh: number | null;
  batteryDischargeKwh: number | null;
};

export type ParsedSolarmanMonthlyRecord = ParsedSolarmanAggregateMetrics & {
  systemId: string;
  year: number;
  month: number;
  raw: SolarmanRecord;
};

export type ParsedSolarmanMonthlyHistory = {
  systemId: string;
  year: number;
  totalGenerationKwh: number;
  records: ParsedSolarmanMonthlyRecord[];
  rejectedRecordCount: number;
  rejectionReasons: Array<{
    reason: SolarmanHistoryRejectionReason;
    count: number;
  }>;
  dataQualityStatus: SolarmanHistoryDataQualityStatus;
  raw: SolarmanRecord;
};

export type SolarmanHistoryRejectionReason =
  | 'INVALID_MONTH'
  | 'INVALID_YEAR'
  | 'YEAR_MISMATCH'
  | 'MISSING_PV_VALUE'
  | 'INVALID_PV_VALUE'
  | 'STATION_MISMATCH'
  | 'UNRECOGNIZED_PERIOD';

export type SolarmanHistoryDataQualityStatus =
  | 'VERIFIED_HISTORY'
  | 'REQUIRES_REVIEW'
  | 'INVALID_HISTORY_PERIOD'
  | 'SCHEMA_CHANGED';

export type SolarmanMonthlyParseContext = {
  expectedStationId: string;
  expectedYear: number;
  timezone?: string | null;
  minYear?: number;
  maxYear?: number;
};

export type ParsedSolarmanDailyRecord = ParsedSolarmanAggregateMetrics & {
  systemId: string;
  year: number;
  month: number;
  day: number;
  recordDate: string;
  raw: SolarmanRecord;
};

export type ParsedSolarmanDailyHistory = {
  systemId: string;
  year: number;
  totalGenerationKwh: number;
  records: ParsedSolarmanDailyRecord[];
  raw: SolarmanRecord;
};

export function asRecord(value: unknown): SolarmanRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as SolarmanRecord)
    : {};
}

export function toStringValue(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function toNumberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function toDateTimeValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') {
    return null;
  }

  const date = parseStrictDateValue(normalized, true);
  return !date || Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function findFirstList(data: SolarmanRecord) {
  const record = asRecord(data.data);
  const candidates = [
    data.data,
    data.list,
    data.deviceList,
    data.stationList,
    data.records,
    data.history,
    record.data,
    record.list,
    record.deviceList,
    record.stationList,
    record.records,
    record.history,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => asRecord(item));
    }
  }

  return [] as SolarmanRecord[];
}

function pickFirstString(source: SolarmanRecord, keys: string[]) {
  for (const key of keys) {
    const value = toStringValue(source[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function pickFirstNumber(source: SolarmanRecord, keys: string[]) {
  for (const key of keys) {
    const value = toNumberValue(source[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function pickFirstDateTime(source: SolarmanRecord, keys: string[]) {
  for (const key of keys) {
    const value = toDateTimeValue(source[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function buildUtcDate(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
    ? date
    : null;
}

function parseStrictDateValue(value: unknown, allowDayFirst = false): Date | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      return null;
    }
    const digits = String(Math.abs(value)).length;
    if (digits !== 10 && digits !== 13) {
      return null;
    }
    const date = new Date(digits === 10 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (/^\d{10}$/.test(normalized) || /^\d{13}$/.test(normalized)) {
    const numeric = Number(normalized);
    const date = new Date(normalized.length === 10 ? numeric * 1000 : numeric);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dateOnly = normalized.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (dateOnly) {
    return buildUtcDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
  }

  if (allowDayFirst) {
    const dayFirst = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (dayFirst) {
      return buildUtcDate(Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1]));
    }
  }

  // Date.parse is only used after the input has matched an explicit ISO datetime shape.
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(
      normalized,
    )
  ) {
    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? null : new Date(timestamp);
  }

  return null;
}

function buildRecordDate(
  source: SolarmanRecord,
  fallbackYear?: number | null,
  fallbackMonth?: number | null,
) {
  const directDate = parseStrictDateValue(
    pickFirstString(source, ['recordDate', 'date', 'time', 'collectTime', 'ts', 'day']),
    true,
  );
  if (directDate) {
    return directDate;
  }

  const year = pickFirstNumber(source, ['year']) ?? fallbackYear ?? null;
  const month = pickFirstNumber(source, ['month']) ?? fallbackMonth ?? null;
  const day = pickFirstNumber(source, ['day', 'dateNum']) ?? null;

  if (!year || !month || !day) {
    return null;
  }

  return buildUtcDate(year, month, day);
}

function parseAggregateMetrics(
  row: SolarmanRecord,
  pvGenerationKwh: number,
): ParsedSolarmanAggregateMetrics {
  return {
    pvGenerationKwh,
    loadConsumedKwh: pickFirstNumber(row, [
      'useValue',
      'consumptionValue',
      'consumption',
      'loadConsumption',
      'loadConsumed',
      'load',
      'usePower',
    ]),
    gridImportedKwh: pickFirstNumber(row, [
      'buyValue',
      'gridImport',
      'buyPower',
      'gridPurchased',
      'importEnergy',
      'fromGrid',
    ]),
    gridExportedKwh: pickFirstNumber(row, [
      'gridValue',
      'gridExport',
      'sellPower',
      'feedIn',
      'exportEnergy',
      'toGrid',
    ]),
    batteryChargeKwh: pickFirstNumber(row, [
      'chargeValue',
      'batteryCharge',
      'chargePower',
      'chargeEnergy',
      'batteryChargeEnergy',
    ]),
    batteryDischargeKwh: pickFirstNumber(row, [
      'dischargeValue',
      'batteryDischarge',
      'dischargePower',
      'dischargeEnergy',
      'batteryDischargeEnergy',
    ]),
  };
}

export function parseStationList(data: SolarmanRecord): ParsedSolarmanStation[] {
  const items = Array.isArray(data.data)
    ? data.data.map((item) => asRecord(item))
    : findFirstList(data);

  return items
    .map((item) => {
      const stationId =
        pickFirstString(item, ['stationId', 'systemId', 'id', 'plantId']) || '';

      if (!stationId) {
        return null;
      }

      const explicitGenerationPowerKw = pickFirstNumber(item, [
        'generationPowerKw',
        'currentPowerKw',
      ]);
      const generationPowerW = pickFirstNumber(item, ['generationPower', 'currentPower']);

      return {
        stationId,
        stationName: pickFirstString(item, ['name', 'stationName']),
        sourceSystem: pickFirstString(item, ['system', 'sourceSystem']),
        installedCapacityKw: pickFirstNumber(item, ['installedCapacity', 'installedPower', 'capacity']),
        generationMonthKwh: pickFirstNumber(item, ['generationMonth', 'todayPowerGeneration']),
        generationYearKwh: pickFirstNumber(item, ['generationYear', 'yearPowerGeneration']),
        generationTotalKwh: pickFirstNumber(item, ['generationTotal', 'totalPowerGeneration']),
        generationPowerKw:
          explicitGenerationPowerKw ??
          (generationPowerW === null ? null : generationPowerW / 1000),
        hasBattery:
          item.hasBattery === undefined || item.hasBattery === null
            ? null
            : ['1', 'true', 'yes'].includes(String(item.hasBattery).toLowerCase()),
        powerType: pickFirstString(item, ['powerType']),
        powerMode: pickFirstString(item, ['powerMode']),
        timezone: pickFirstString(item, ['timezone', 'timeZone']),
        lastUpdateTime: pickFirstDateTime(item, ['lastUpdateTime', 'updateTime']),
        raw: item,
      };
    })
    .filter((item): item is ParsedSolarmanStation => Boolean(item));
}

export function parseDeviceList(data: SolarmanRecord): ParsedSolarmanDevice[] {
  const items = Array.isArray(data.data)
    ? data.data.map((item) => asRecord(item))
    : findFirstList(data);

  return items
    .map((item) => {
      const deviceId =
        pickFirstString(item, ['deviceId', 'id', 'devId']) ||
        pickFirstString(item, ['sn', 'serialNo', 'deviceSn']) ||
        '';

      if (!deviceId) {
        return null;
      }

      return {
        deviceId,
        serialNumber: pickFirstString(item, ['sn', 'serialNo', 'deviceSn']),
        deviceType: pickFirstString(item, ['deviceType', 'type']),
        deviceModel: pickFirstString(item, ['deviceModel', 'model']),
        status: pickFirstString(item, ['status', 'deviceStatus']),
        raw: item,
      };
    })
    .filter((item): item is ParsedSolarmanDevice => Boolean(item));
}

function parseIntegerValue(value: unknown) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  return null;
}

function pickFirstPresent(source: SolarmanRecord, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
  }
  return null;
}

function readPvGeneration(row: SolarmanRecord):
  | { value: number; reason: null }
  | { value: null; reason: 'MISSING_PV_VALUE' | 'INVALID_PV_VALUE' } {
  const rawValue = pickFirstPresent(row, PV_GENERATION_KEYS);
  if (rawValue === null) {
    return { value: null, reason: 'MISSING_PV_VALUE' };
  }

  const value = toNumberValue(rawValue);
  if (value === null || !Number.isFinite(value) || value < 0) {
    return { value: null, reason: 'INVALID_PV_VALUE' };
  }

  return { value, reason: null };
}

function resolveMonthlyPeriod(
  row: SolarmanRecord,
  context: Required<Pick<SolarmanMonthlyParseContext, 'expectedYear' | 'minYear' | 'maxYear'>> & {
    timezone?: string | null;
  },
): { year: number; month: number; reason: null } | { year: null; month: null; reason: SolarmanHistoryRejectionReason } {
  const rawYear = pickFirstPresent(row, ['year']);
  const explicitYear = rawYear === null ? null : parseIntegerValue(rawYear);
  if (rawYear !== null && explicitYear === null) {
    return { year: null, month: null, reason: 'INVALID_YEAR' };
  }
  if (
    explicitYear !== null &&
    (explicitYear < context.minYear || explicitYear > context.maxYear)
  ) {
    return { year: null, month: null, reason: 'INVALID_YEAR' };
  }
  if (explicitYear !== null && explicitYear !== context.expectedYear) {
    return { year: null, month: null, reason: 'YEAR_MISMATCH' };
  }

  const rawMonth = pickFirstPresent(row, ['month']);
  const explicitMonth = rawMonth === null ? null : parseIntegerValue(rawMonth);
  if (rawMonth !== null && (explicitMonth === null || explicitMonth < 1 || explicitMonth > 12)) {
    return { year: null, month: null, reason: 'INVALID_MONTH' };
  }

  if (explicitYear !== null && explicitMonth !== null) {
    return { year: explicitYear, month: explicitMonth, reason: null };
  }

  const periodValue = pickFirstPresent(row, [
    'period',
    'monthLabel',
    'time',
    'recordDate',
    'date',
    'collectTime',
    'ts',
  ]);
  const periodText =
    typeof periodValue === 'string' || typeof periodValue === 'number'
      ? String(periodValue).trim()
      : '';

  const yearMonth = periodText.match(/^(\d{4})[-/](\d{1,2})$/);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    if (year < context.minYear || year > context.maxYear) {
      return { year: null, month: null, reason: 'INVALID_YEAR' };
    }
    if (year !== context.expectedYear) {
      return { year: null, month: null, reason: 'YEAR_MISMATCH' };
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return { year: null, month: null, reason: 'INVALID_MONTH' };
    }
    return { year, month, reason: null };
  }

  const numericMonth = explicitMonth ?? parseIntegerValue(periodValue);
  if (numericMonth !== null && numericMonth >= 1 && numericMonth <= 12) {
    return { year: context.expectedYear, month: numericMonth, reason: null };
  }

  const explicitDateOnly = periodText.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (explicitDateOnly) {
    const year = Number(explicitDateOnly[1]);
    const month = Number(explicitDateOnly[2]);
    if (year < context.minYear || year > context.maxYear) {
      return { year: null, month: null, reason: 'INVALID_YEAR' };
    }
    if (year !== context.expectedYear) {
      return { year: null, month: null, reason: 'YEAR_MISMATCH' };
    }
    if (month < 1 || month > 12) {
      return { year: null, month: null, reason: 'INVALID_MONTH' };
    }
    if (!parseStrictDateValue(periodValue, true)) {
      return { year: null, month: null, reason: 'UNRECOGNIZED_PERIOD' };
    }
    return { year, month, reason: null };
  }

  const fullDate = parseStrictDateValue(periodValue, true);
  if (fullDate) {
    let year = fullDate.getUTCFullYear();
    let month = fullDate.getUTCMonth() + 1;
    if (context.timezone) {
      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: context.timezone,
          year: 'numeric',
          month: '2-digit',
        }).formatToParts(fullDate);
        year = Number(parts.find((part) => part.type === 'year')?.value || year);
        month = Number(parts.find((part) => part.type === 'month')?.value || month);
      } catch {
        return { year: null, month: null, reason: 'UNRECOGNIZED_PERIOD' };
      }
    }
    if (year < context.minYear || year > context.maxYear) {
      return { year: null, month: null, reason: 'INVALID_YEAR' };
    }
    if (year !== context.expectedYear) {
      return { year: null, month: null, reason: 'YEAR_MISMATCH' };
    }
    return { year, month, reason: null };
  }

  if (numericMonth !== null) {
    return { year: null, month: null, reason: 'INVALID_MONTH' };
  }

  return { year: null, month: null, reason: 'UNRECOGNIZED_PERIOD' };
}

function summarizeRejections(reasons: SolarmanHistoryRejectionReason[]) {
  const counts = new Map<SolarmanHistoryRejectionReason, number>();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return Array.from(counts, ([reason, count]) => ({ reason, count }));
}

function resolveMonthlyDataQuality(
  validCount: number,
  reasons: SolarmanHistoryRejectionReason[],
): SolarmanHistoryDataQualityStatus {
  if (validCount > 0 && reasons.length === 0) {
    return 'VERIFIED_HISTORY';
  }
  if (validCount > 0) {
    return 'REQUIRES_REVIEW';
  }
  return reasons.some((reason) =>
    ['INVALID_MONTH', 'INVALID_YEAR', 'YEAR_MISMATCH', 'UNRECOGNIZED_PERIOD'].includes(reason),
  )
    ? 'INVALID_HISTORY_PERIOD'
    : 'SCHEMA_CHANGED';
}

export function parseMonthlyGeneration(
  data: SolarmanRecord,
  context: SolarmanMonthlyParseContext,
): ParsedSolarmanMonthlyHistory {
  const root = asRecord(data);
  const dataRecord = asRecord(root.data);
  const statistics = asRecord(root.statistics);
  const nestedStatistics = asRecord(dataRecord.statistics);
  const monthlyStats = Object.keys(statistics).length ? statistics : nestedStatistics;
  const rawRecords = Array.isArray(root.records)
    ? root.records
    : Array.isArray(dataRecord.records)
      ? dataRecord.records
      : findFirstList(root);

  const payloadSystemId =
    pickFirstString(monthlyStats, ['systemId', 'stationId']) ||
    pickFirstString(dataRecord, ['systemId', 'stationId']) ||
    pickFirstString(root, ['systemId', 'stationId']);
  const minYear = context.minYear ?? 2000;
  const maxYear = context.maxYear ?? new Date().getUTCFullYear() + 1;
  const reasons: SolarmanHistoryRejectionReason[] = [];
  const records: ParsedSolarmanMonthlyRecord[] = [];
  const rootYear =
    pickFirstPresent(monthlyStats, ['year']) ??
    pickFirstPresent(dataRecord, ['year']) ??
    pickFirstPresent(root, ['year']);
  const parsedRootYear = rootYear === null ? null : parseIntegerValue(rootYear);
  const rootYearReason =
    rootYear !== null && parsedRootYear === null
      ? 'INVALID_YEAR'
      : parsedRootYear !== null && (parsedRootYear < minYear || parsedRootYear > maxYear)
        ? 'INVALID_YEAR'
        : parsedRootYear !== null && parsedRootYear !== context.expectedYear
          ? 'YEAR_MISMATCH'
          : null;
  const rootStationMismatch = Boolean(
    payloadSystemId && payloadSystemId !== context.expectedStationId,
  );

  for (const item of rawRecords) {
    const row = asRecord(item);
    const rowStationId = pickFirstString(row, ['systemId', 'stationId']);
    if (rootStationMismatch || (rowStationId && rowStationId !== context.expectedStationId)) {
      reasons.push('STATION_MISMATCH');
      continue;
    }
    if (rootYearReason) {
      reasons.push(rootYearReason);
      continue;
    }

    const pv = readPvGeneration(row);
    if (pv.reason || pv.value === null) {
      reasons.push(pv.reason || 'INVALID_PV_VALUE');
      continue;
    }

    const period = resolveMonthlyPeriod(row, {
      expectedYear: context.expectedYear,
      minYear,
      maxYear,
      timezone: context.timezone,
    });
    if (period.reason || period.year === null || period.month === null) {
      reasons.push(period.reason || 'UNRECOGNIZED_PERIOD');
      continue;
    }

    records.push({
      systemId: context.expectedStationId,
      year: period.year,
      month: period.month,
      ...parseAggregateMetrics(row, pv.value),
      raw: row,
    });
  }

  records.sort((left, right) => left.month - right.month);
  const totalGenerationKwh = records.reduce(
    (sum, record) => sum + record.pvGenerationKwh,
    0,
  );

  return {
    systemId: context.expectedStationId,
    year: context.expectedYear,
    totalGenerationKwh,
    records,
    rejectedRecordCount: reasons.length,
    rejectionReasons: summarizeRejections(reasons),
    dataQualityStatus: resolveMonthlyDataQuality(records.length, reasons),
    raw: root,
  };
}

export function parseDailyGeneration(data: SolarmanRecord): ParsedSolarmanDailyHistory | null {
  const root = asRecord(data);
  const dataRecord = asRecord(root.data);
  const statistics = asRecord(root.statistics);
  const nestedStatistics = asRecord(dataRecord.statistics);
  const dailyStats = Object.keys(statistics).length ? statistics : nestedStatistics;
  const rawRecords = Array.isArray(root.records)
    ? root.records
    : Array.isArray(dataRecord.records)
      ? dataRecord.records
      : findFirstList(root);

  const systemId =
    pickFirstString(dailyStats, ['systemId', 'stationId']) ||
    pickFirstString(dataRecord, ['systemId', 'stationId']) ||
    pickFirstString(root, ['systemId', 'stationId']);

  if (!systemId) {
    return null;
  }

  const defaultYear =
    pickFirstNumber(dailyStats, ['year']) ??
    pickFirstNumber(dataRecord, ['year']) ??
    pickFirstNumber(root, ['year']) ??
    null;
  const defaultMonth =
    pickFirstNumber(dailyStats, ['month']) ??
    pickFirstNumber(dataRecord, ['month']) ??
    pickFirstNumber(root, ['month']) ??
    null;

  const records = rawRecords
    .map((item) => {
      const row = asRecord(item);
      const pv = readPvGeneration(row);
      if (pv.value === null) {
        return null;
      }
      const recordDate = buildRecordDate(row, defaultYear, defaultMonth);
      if (!recordDate) {
        return null;
      }

      return {
        systemId:
          pickFirstString(row, ['systemId', 'stationId']) || systemId,
        year: recordDate.getUTCFullYear(),
        month: recordDate.getUTCMonth() + 1,
        day: recordDate.getUTCDate(),
        recordDate: recordDate.toISOString().slice(0, 10),
        ...parseAggregateMetrics(row, pv.value),
        raw: row,
      };
    })
    .filter((item): item is ParsedSolarmanDailyRecord => Boolean(item))
    .sort((left, right) => left.recordDate.localeCompare(right.recordDate));

  const year = defaultYear ?? records[0]?.year ?? null;
  if (!year || !records.length) {
    return null;
  }

  const totalGenerationKwh =
    pickFirstNumber(dailyStats, ['generationValue', 'generationTotal']) ??
    pickFirstNumber(dataRecord, ['generationValue', 'generationTotal']) ??
    records.reduce((sum, record) => sum + record.pvGenerationKwh, 0);

  return {
    systemId,
    year,
    totalGenerationKwh,
    records,
    raw: root,
  };
}
