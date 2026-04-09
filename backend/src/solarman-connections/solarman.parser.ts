type SolarmanRecord = Record<string, unknown>;

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
  raw: SolarmanRecord;
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

function tryParseIsoDate(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const slashMatch = normalized.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
  if (!slashMatch) {
    return null;
  }

  const left = Number(slashMatch[1]);
  const middle = Number(slashMatch[2]);
  const right = Number(slashMatch[3]);

  if (slashMatch[1].length === 4) {
    return new Date(Date.UTC(left, middle - 1, right));
  }

  return new Date(Date.UTC(right, middle - 1, left));
}

function buildRecordDate(
  source: SolarmanRecord,
  fallbackYear?: number | null,
  fallbackMonth?: number | null,
) {
  const directDate = tryParseIsoDate(
    pickFirstString(source, ['recordDate', 'date', 'time', 'collectTime', 'ts', 'day']),
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

  return new Date(Date.UTC(year, month - 1, day));
}

function parseAggregateMetrics(row: SolarmanRecord): ParsedSolarmanAggregateMetrics {
  return {
    pvGenerationKwh:
      pickFirstNumber(row, [
        'generationValue',
        'generation',
        'pvGeneration',
        'powerGeneration',
        'electricity',
        'yield',
        'generationMonth',
        'generationTotal',
      ]) || 0,
    loadConsumedKwh: pickFirstNumber(row, [
      'consumptionValue',
      'consumption',
      'loadConsumption',
      'loadConsumed',
      'load',
      'usePower',
    ]),
    gridImportedKwh: pickFirstNumber(row, [
      'gridImport',
      'buyPower',
      'gridPurchased',
      'importEnergy',
      'fromGrid',
    ]),
    gridExportedKwh: pickFirstNumber(row, [
      'gridExport',
      'sellPower',
      'feedIn',
      'exportEnergy',
      'toGrid',
    ]),
    batteryChargeKwh: pickFirstNumber(row, [
      'batteryCharge',
      'chargePower',
      'chargeEnergy',
      'batteryChargeEnergy',
    ]),
    batteryDischargeKwh: pickFirstNumber(row, [
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

      return {
        stationId,
        stationName: pickFirstString(item, ['name', 'stationName']),
        sourceSystem: pickFirstString(item, ['system', 'sourceSystem']),
        installedCapacityKw: pickFirstNumber(item, ['installedCapacity', 'installedPower', 'capacity']),
        generationMonthKwh: pickFirstNumber(item, ['generationMonth', 'todayPowerGeneration']),
        generationYearKwh: pickFirstNumber(item, ['generationYear', 'yearPowerGeneration']),
        generationTotalKwh: pickFirstNumber(item, ['generationTotal', 'totalPowerGeneration']),
        generationPowerKw: pickFirstNumber(item, ['generationPower', 'currentPower']),
        hasBattery:
          item.hasBattery === undefined || item.hasBattery === null
            ? null
            : ['1', 'true', 'yes'].includes(String(item.hasBattery).toLowerCase()),
        powerType: pickFirstString(item, ['powerType']),
        powerMode: pickFirstString(item, ['powerMode']),
        timezone: pickFirstString(item, ['timezone', 'timeZone']),
        lastUpdateTime: pickFirstString(item, ['lastUpdateTime', 'updateTime']),
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

export function parseMonthlyGeneration(data: SolarmanRecord): ParsedSolarmanMonthlyHistory | null {
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

  const systemId =
    pickFirstString(monthlyStats, ['systemId', 'stationId']) ||
    pickFirstString(dataRecord, ['systemId', 'stationId']) ||
    pickFirstString(root, ['systemId', 'stationId']);

  const defaultYear =
    pickFirstNumber(monthlyStats, ['year']) ??
    pickFirstNumber(dataRecord, ['year']) ??
    pickFirstNumber(root, ['year']);

  if (!systemId) {
    return null;
  }

  const records = rawRecords
    .map((item) => {
      const row = asRecord(item);
      const recordDate = buildRecordDate(row);
      const month = pickFirstNumber(row, ['month']) ?? (recordDate ? recordDate.getUTCMonth() + 1 : null);
      const rowYear =
        pickFirstNumber(row, ['year']) ??
        (recordDate ? recordDate.getUTCFullYear() : null) ??
        defaultYear;

      if (!month || !rowYear) {
        return null;
      }

      return {
        systemId:
          pickFirstString(row, ['systemId', 'stationId']) || systemId,
        year: rowYear,
        month,
        ...parseAggregateMetrics(row),
        raw: row,
      };
    })
    .filter((item): item is ParsedSolarmanMonthlyRecord => Boolean(item))
    .sort((left, right) => left.month - right.month);

  const year = defaultYear ?? records[0]?.year ?? null;
  if (!year || !records.length) {
    return null;
  }

  const totalGenerationKwh =
    pickFirstNumber(monthlyStats, ['generationValue', 'generationTotal']) ??
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
        ...parseAggregateMetrics(row),
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
