export type SemsPlusRecord = Record<string, unknown>;

export type ParsedSemsPlusPlant = {
  plantId: string;
  plantName: string | null;
  installedCapacityKwp: number | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  status: string | null;
  todayGenerationKwh: number | null;
  totalGenerationKwh: number | null;
  providerUpdatedAt: string | null;
  raw: SemsPlusRecord;
};

const PLANT_ID_KEYS = ['id', 'plantId', 'stationId'] as const;

export function asSemsPlusRecord(value: unknown): SemsPlusRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as SemsPlusRecord)
    : {};
}

export function unwrapSemsPlusData(payload: SemsPlusRecord) {
  return payload.data === undefined ? payload : payload.data;
}

export function parseSemsPlusStationTypes(payload: SemsPlusRecord) {
  const data = unwrapSemsPlusData(payload);
  const rows = Array.isArray(data)
    ? data
    : readArray(asSemsPlusRecord(data), ['dataList', 'records', 'list', 'rows']);
  const values = rows
    .map((item) => {
      if (typeof item === 'string' || typeof item === 'number') {
        return String(item);
      }
      return readString(asSemsPlusRecord(item), [
        'stationTypeEnum',
        'powerStationType',
        'type',
        'value',
        'code',
      ]);
    })
    .filter((item): item is string => Boolean(item));

  return [...new Set(values)];
}

export function parseSemsPlusStationPage(payload: SemsPlusRecord) {
  const data = asSemsPlusRecord(unwrapSemsPlusData(payload));
  const rows = Array.isArray(unwrapSemsPlusData(payload))
    ? (unwrapSemsPlusData(payload) as unknown[])
    : readArray(data, ['dataList', 'records', 'list', 'rows', 'stationList']);
  const total = readNumber(data, ['total', 'totalCount', 'count']) ?? rows.length;

  return {
    rows: rows.map(asSemsPlusRecord).filter((row) => Boolean(readPlantId(row))),
    total: Math.max(0, Math.trunc(total)),
  };
}

export function parseSemsPlusProfile(payload: SemsPlusRecord) {
  const profile = asSemsPlusRecord(unwrapSemsPlusData(payload));
  const info = asSemsPlusRecord(profile.info);
  const merged = { ...profile, ...info };
  return {
    roleKey: readString(merged, ['roleKey', 'roleCode', 'userIdentity', 'userType']),
    orgId: readString(merged, ['orgId']),
    permissions: Array.isArray(merged.permissions) ? merged.permissions : [],
    permissionList: Array.isArray(merged.permissionList) ? merged.permissionList : [],
    raw: merged,
  };
}

export function mergeSemsPlusPlantRecords(
  baseRows: SemsPlusRecord[],
  detailRows: SemsPlusRecord[],
) {
  const merged = new Map<string, SemsPlusRecord>();
  for (const row of baseRows) {
    const id = readPlantId(row);
    if (id) merged.set(id, { ...row });
  }
  for (const row of detailRows) {
    const id = readPlantId(row);
    if (id) merged.set(id, { ...(merged.get(id) || {}), ...row });
  }
  return [...merged.values()];
}

export function parseSemsPlusPlant(row: SemsPlusRecord): ParsedSemsPlusPlant | null {
  const plantId = readPlantId(row);
  if (!plantId) return null;

  return {
    plantId,
    plantName: readString(row, ['name', 'plantName', 'stationName']),
    installedCapacityKwp: readNumber(row, ['installedPower', 'installedCapacityKwp']),
    location: readString(row, ['stationAddress', 'address', 'location']),
    latitude: readNumber(row, ['latitude', 'lat']),
    longitude: readNumber(row, ['longitude', 'lng', 'lon']),
    timezone: readString(row, ['timeZone', 'timezone']),
    status: readString(row, ['status', 'stationStatus', 'runningStatus']),
    todayGenerationKwh: readNumber(row, ['productionToday']),
    totalGenerationKwh: readNumber(row, ['productionTotal']),
    providerUpdatedAt: normalizeDateTime(
      readString(row, ['updateTime', 'lastUpdateTime', 'dataTime']),
    ),
    raw: row,
  };
}

export function readPlantId(row: SemsPlusRecord) {
  return readString(row, PLANT_ID_KEYS);
}

export function readString(source: SemsPlusRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

export function readNumber(source: SemsPlusRecord, keys: readonly string[]) {
  for (const key of keys) {
    const parsed = parseNumber(source[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function readArray(source: SemsPlusRecord, keys: readonly string[]) {
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
  }
  return [];
}

function parseNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '--') return null;

  const match = trimmed.match(/[-+]?\d[\d.,]*/);
  if (!match) return null;
  let numeric = match[0];
  if (numeric.includes(',') && numeric.includes('.')) {
    numeric = numeric.lastIndexOf(',') > numeric.lastIndexOf('.')
      ? numeric.replace(/\./g, '').replace(',', '.')
      : numeric.replace(/,/g, '');
  } else if (numeric.includes(',')) {
    const parts = numeric.split(',');
    numeric = parts.length === 2 && parts[1].length <= 2
      ? `${parts[0]}.${parts[1]}`
      : parts.join('');
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDateTime(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
