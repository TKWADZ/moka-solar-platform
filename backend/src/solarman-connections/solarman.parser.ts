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

export type ParsedSolarmanMonthlyRecord = {
  systemId: string;
  year: number;
  month: number;
  pvGenerationKwh: number;
  raw: SolarmanRecord;
};

export type ParsedSolarmanMonthlyHistory = {
  systemId: string;
  year: number;
  totalGenerationKwh: number;
  records: ParsedSolarmanMonthlyRecord[];
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
    record.data,
    record.list,
    record.deviceList,
    record.stationList,
    record.records,
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
        generationMonthKwh: pickFirstNumber(item, ['generationMonth']),
        generationYearKwh: pickFirstNumber(item, ['generationYear']),
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
  const year =
    pickFirstNumber(monthlyStats, ['year']) ??
    pickFirstNumber(dataRecord, ['year']) ??
    pickFirstNumber(root, ['year']);

  if (!systemId || !year) {
    return null;
  }

  const totalGenerationKwh =
    pickFirstNumber(monthlyStats, ['generationValue', 'generationTotal']) ??
    pickFirstNumber(dataRecord, ['generationValue', 'generationTotal']) ??
    0;

  const records = rawRecords
    .map((item) => {
      const row = asRecord(item);
      const month = pickFirstNumber(row, ['month']);
      const rowYear = pickFirstNumber(row, ['year']) ?? year;
      if (!month || !rowYear) {
        return null;
      }

      return {
        systemId:
          pickFirstString(row, ['systemId', 'stationId']) || systemId,
        year: rowYear,
        month,
        pvGenerationKwh: pickFirstNumber(row, ['generationValue']) || 0,
        raw: row,
      };
    })
    .filter((item): item is ParsedSolarmanMonthlyRecord => Boolean(item))
    .sort((left, right) => left.month - right.month);

  return {
    systemId,
    year,
    totalGenerationKwh,
    records,
    raw: root,
  };
}
