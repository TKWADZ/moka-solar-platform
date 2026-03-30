type UnknownRecord = Record<string, unknown>;

export type ParsedDeyeDevice = {
  stationId: string;
  deviceId: string | null;
  deviceSn: string;
  deviceType: string | null;
  productId: string | null;
  connectStatus: string | null;
  collectionTime: number | null;
  raw: UnknownRecord;
};

export type ParsedDeyeStation = {
  stationId: string;
  stationName: string | null;
  installedCapacityKw: number | null;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  gridInterconnectionType: string | null;
  stationType: string | null;
  ownerName: string | null;
  createdDate: string | null;
  startedAt: string | null;
  lastUpdateTime: string | null;
  currentMonthGenerationKwh: number | null;
  currentYearGenerationKwh: number | null;
  totalGenerationKwh: number | null;
  currentGenerationPowerKw: number | null;
  raw: UnknownRecord;
  devices: ParsedDeyeDevice[];
};

export type ParsedDeyeMonthlyRecord = {
  stationId: string;
  year: number;
  month: number;
  generationValue: number;
  raw: UnknownRecord;
};

export type ParsedDeyeMonthlyHistory = {
  stationId: string;
  records: ParsedDeyeMonthlyRecord[];
  raw: UnknownRecord;
};

export type ParsedDeyeTelemetryRecord = {
  stationId: string;
  recordedAt: string;
  generationPowerKw: number | null;
  generationValueKwh: number | null;
  consumptionPowerKw: number | null;
  consumptionValueKwh: number | null;
  purchasePowerKw: number | null;
  purchaseValueKwh: number | null;
  gridPowerKw: number | null;
  gridValueKwh: number | null;
  batteryPowerKw: number | null;
  batterySocPct: number | null;
  chargePowerKw: number | null;
  chargeValueKwh: number | null;
  dischargePowerKw: number | null;
  dischargeValueKwh: number | null;
  fullPowerHours: number | null;
  raw: UnknownRecord;
};

export type ParsedDeyePowerHistory = {
  stationId: string;
  records: ParsedDeyeTelemetryRecord[];
  raw: UnknownRecord;
};

export type ParsedDeyeDailyRecord = {
  stationId: string;
  recordDate: string;
  generationValueKwh: number | null;
  consumptionValueKwh: number | null;
  purchaseValueKwh: number | null;
  gridValueKwh: number | null;
  batterySocPct: number | null;
  fullPowerHours: number | null;
  raw: UnknownRecord;
};

export type ParsedDeyeDailyHistory = {
  stationId: string;
  records: ParsedDeyeDailyRecord[];
  raw: UnknownRecord;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toStringValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function toDateTimeValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1e12 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric > 1e12 ? numeric : numeric * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toDateOnlyValue(value: unknown): string | null {
  const iso = toDateTimeValue(value);
  if (!iso) {
    return null;
  }

  return `${iso.slice(0, 10)}T00:00:00.000Z`;
}

function toNumberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toPowerKwValue(value: unknown): number | null {
  const numeric = toNumberValue(value);
  if (numeric === null) {
    return null;
  }

  return numeric / 1000;
}

function pickFirstString(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = toStringValue(record[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function pickFirstNumber(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = toNumberValue(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function findArrayCandidate(root: UnknownRecord, keys: string[]): UnknownRecord[] {
  for (const key of keys) {
    const direct = asArray<UnknownRecord>(root[key]).map(asRecord).filter(Boolean);
    if (direct.length) {
      return direct;
    }
  }

  for (const value of Object.values(root)) {
    const record = asRecord(value);
    if (!Object.keys(record).length) {
      continue;
    }

    const nested = findArrayCandidate(record, keys);
    if (nested.length) {
      return nested;
    }
  }

  return [];
}

function normalizeMonthYear(
  item: UnknownRecord,
  fallbackYear: number,
): { year: number | null; month: number | null } {
  const explicitMonth = pickFirstNumber(item, ['month', 'monthIndex', 'monthNum']);
  const explicitYear = pickFirstNumber(item, ['year']);

  if (explicitMonth && explicitYear) {
    return { year: explicitYear, month: explicitMonth };
  }

  const dateValue = pickFirstString(item, [
    'time',
    'timeStamp',
    'timestamp',
    'date',
    'monthAt',
    'statDate',
    'statisticsTime',
    'period',
    'label',
    'name',
  ]);

  if (dateValue) {
    const compact = dateValue.replace(/\./g, '-').replace(/\//g, '-');
    const isoMatch = compact.match(/(\d{4})-(\d{1,2})/);
    if (isoMatch) {
      return {
        year: Number(isoMatch[1]),
        month: Number(isoMatch[2]),
      };
    }

    const yyyymm = compact.match(/^(\d{4})(\d{2})$/);
    if (yyyymm) {
      return {
        year: Number(yyyymm[1]),
        month: Number(yyyymm[2]),
      };
    }

    const onlyMonth = compact.match(/^(\d{1,2})$/);
    if (onlyMonth) {
      return {
        year: fallbackYear,
        month: Number(onlyMonth[1]),
      };
    }
  }

  if (explicitMonth) {
    return {
      year: explicitYear || fallbackYear,
      month: explicitMonth,
    };
  }

  return {
    year: explicitYear || fallbackYear,
    month: null,
  };
}

function normalizeRecordDate(item: UnknownRecord): string | null {
  const explicitYear = pickFirstNumber(item, ['year']);
  const explicitMonth = pickFirstNumber(item, ['month', 'monthIndex', 'monthNum']);
  const explicitDay = pickFirstNumber(item, ['day', 'dayAt']);

  if (explicitYear && explicitMonth && explicitDay) {
    return toDateOnlyValue(
      `${String(explicitYear).padStart(4, '0')}-${String(explicitMonth).padStart(2, '0')}-${String(
        explicitDay,
      ).padStart(2, '0')}`,
    );
  }

  const directDate = pickFirstString(item, [
    'date',
    'statisticsDate',
    'statDate',
    'time',
    'timeStamp',
    'timestamp',
    'period',
    'label',
    'name',
  ]);

  if (directDate) {
    const normalized = directDate.replace(/\./g, '-').replace(/\//g, '-');
    const isoMatch = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      return toDateOnlyValue(
        `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`,
      );
    }

    const compact = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) {
      return toDateOnlyValue(`${compact[1]}-${compact[2]}-${compact[3]}`);
    }

    if (explicitYear && explicitMonth && /^\d{1,2}$/.test(normalized)) {
      return toDateOnlyValue(
        `${String(explicitYear).padStart(4, '0')}-${String(explicitMonth).padStart(2, '0')}-${normalized.padStart(2, '0')}`,
      );
    }
  }

  return toDateOnlyValue(directDate);
}

export function parseDeyeStationList(payload: unknown) {
  const root = asRecord(payload);
  const items = findArrayCandidate(root, ['stationList', 'stations', 'list', 'data']);

  return items
    .map((item) => {
      const station = asRecord(item);
      const stationId = pickFirstString(station, ['id', 'stationId', 'systemId']);
      if (!stationId) {
        return null;
      }

      const deviceItems = asArray<UnknownRecord>(station.deviceListItems).map(asRecord);
      const devices = deviceItems
        .map((device) => {
          const deviceSn = pickFirstString(device, ['deviceSn', 'sn', 'serialNo']);
          if (!deviceSn) {
            return null;
          }

          return {
            stationId,
            deviceId: pickFirstString(device, ['deviceId', 'id']),
            deviceSn,
            deviceType: pickFirstString(device, ['deviceType', 'type']),
            productId: pickFirstString(device, ['productId']),
            connectStatus: pickFirstString(device, ['connectStatus', 'status']),
            collectionTime: pickFirstNumber(device, ['collectionTime']),
            raw: device,
          } satisfies ParsedDeyeDevice;
        })
        .filter((device): device is ParsedDeyeDevice => Boolean(device));

      return {
        stationId,
        stationName: pickFirstString(station, ['name', 'stationName']),
        installedCapacityKw: pickFirstNumber(station, ['installedCapacity']),
        locationAddress: pickFirstString(station, ['locationAddress', 'address']),
        latitude: pickFirstNumber(station, ['locationLat', 'latitude']),
        longitude: pickFirstNumber(station, ['locationLng', 'longitude']),
        timezone: pickFirstString(station, ['regionTimezone', 'timezone']),
        gridInterconnectionType: pickFirstString(station, ['gridInterconnectionType']),
        stationType: pickFirstString(station, ['type', 'stationType']),
        ownerName: pickFirstString(station, ['ownerName']),
        createdDate: toDateTimeValue(station.createdDate),
        startedAt: toDateTimeValue(station.startOperatingTime),
        lastUpdateTime: toDateTimeValue(station.lastUpdateTime),
        currentMonthGenerationKwh: pickFirstNumber(station, ['generationMonth']),
        currentYearGenerationKwh: pickFirstNumber(station, ['generationYear']),
        totalGenerationKwh: pickFirstNumber(station, ['generationTotal']),
        currentGenerationPowerKw: toPowerKwValue(station.generationPower),
        raw: station,
        devices,
      } satisfies ParsedDeyeStation;
    })
    .filter((item): item is ParsedDeyeStation => Boolean(item));
}

export function parseDeyeMonthlyHistory(
  payload: unknown,
  stationId: string,
  requestedYear: number,
): ParsedDeyeMonthlyHistory {
  const root = asRecord(payload);
  const items = findArrayCandidate(root, [
    'stationDataItems',
    'dataItems',
    'records',
    'recordList',
    'historyItems',
    'items',
    'list',
    'data',
  ]);

  const deduped = new Map<string, ParsedDeyeMonthlyRecord>();

  for (const item of items) {
    const record = asRecord(item);
    const { year, month } = normalizeMonthYear(record, requestedYear);
    const generationValue = pickFirstNumber(record, [
      'generationValue',
      'generation',
      'pvGenerationKwh',
      'value',
    ]);

    if (!year || !month || month < 1 || month > 12 || generationValue === null) {
      continue;
    }

    deduped.set(`${year}-${month}`, {
      stationId,
      year,
      month,
      generationValue,
      raw: record,
    });
  }

  const records = [...deduped.values()].sort(
    (left, right) => left.year - right.year || left.month - right.month,
  );

  return {
    stationId,
    records,
    raw: root,
  };
}

export function parseDeyePowerHistory(
  payload: unknown,
  stationId: string,
): ParsedDeyePowerHistory {
  const root = asRecord(payload);
  const items = findArrayCandidate(root, [
    'stationDataItems',
    'dataItems',
    'records',
    'recordList',
    'historyItems',
    'items',
    'list',
    'data',
  ]);

  const deduped = new Map<string, ParsedDeyeTelemetryRecord>();

  for (const item of items) {
    const record = asRecord(item);
    const recordedAt = toDateTimeValue(
      record.timeStamp ??
        record.timestamp ??
        record.time ??
        record.date ??
        record.statisticsTime,
    );

    if (!recordedAt) {
      continue;
    }

    deduped.set(recordedAt, {
      stationId,
      recordedAt,
      generationPowerKw: toPowerKwValue(record.generationPower ?? record.pvPower),
      generationValueKwh: pickFirstNumber(record, ['generationValue', 'pvGenerationKwh']),
      consumptionPowerKw: toPowerKwValue(record.consumptionPower ?? record.loadPower),
      consumptionValueKwh: pickFirstNumber(record, ['consumptionValue', 'loadConsumedKwh']),
      purchasePowerKw: toPowerKwValue(record.purchasePower ?? record.gridImportPower),
      purchaseValueKwh: pickFirstNumber(record, ['purchaseValue', 'gridImportedKwh']),
      gridPowerKw: toPowerKwValue(record.gridPower ?? record.gridExportPower),
      gridValueKwh: pickFirstNumber(record, ['gridValue', 'gridExportedKwh']),
      batteryPowerKw: toPowerKwValue(record.batteryPower),
      batterySocPct: pickFirstNumber(record, ['batterySOC', 'batterySoc']),
      chargePowerKw: toPowerKwValue(record.chargePower),
      chargeValueKwh: pickFirstNumber(record, ['chargeValue']),
      dischargePowerKw: toPowerKwValue(record.dischargePower),
      dischargeValueKwh: pickFirstNumber(record, ['dischargeValue']),
      fullPowerHours: pickFirstNumber(record, ['fullPowerHours']),
      raw: record,
    });
  }

  return {
    stationId,
    records: [...deduped.values()].sort((left, right) =>
      left.recordedAt.localeCompare(right.recordedAt),
    ),
    raw: root,
  };
}

export function parseDeyeDailyHistory(
  payload: unknown,
  stationId: string,
): ParsedDeyeDailyHistory {
  const root = asRecord(payload);
  const items = findArrayCandidate(root, [
    'stationDataItems',
    'dataItems',
    'records',
    'recordList',
    'historyItems',
    'items',
    'list',
    'data',
  ]);

  const deduped = new Map<string, ParsedDeyeDailyRecord>();

  for (const item of items) {
    const record = asRecord(item);
    const recordDate = normalizeRecordDate(record);
    if (!recordDate) {
      continue;
    }

    deduped.set(recordDate, {
      stationId,
      recordDate,
      generationValueKwh: pickFirstNumber(record, ['generationValue', 'pvGenerationKwh']),
      consumptionValueKwh: pickFirstNumber(record, ['consumptionValue', 'loadConsumedKwh']),
      purchaseValueKwh: pickFirstNumber(record, ['purchaseValue', 'gridImportedKwh']),
      gridValueKwh: pickFirstNumber(record, ['gridValue', 'gridExportedKwh']),
      batterySocPct: pickFirstNumber(record, ['batterySOC', 'batterySoc']),
      fullPowerHours: pickFirstNumber(record, ['fullPowerHours']),
      raw: record,
    });
  }

  return {
    stationId,
    records: [...deduped.values()].sort((left, right) =>
      left.recordDate.localeCompare(right.recordDate),
    ),
    raw: root,
  };
}
