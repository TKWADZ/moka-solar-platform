export const MANUAL_OPERATIONAL_SOURCE = 'MANUAL_ENTRY';
export const CSV_IMPORT_OPERATIONAL_SOURCE = 'CSV_IMPORT';
export const SEMI_AUTO_OPERATIONAL_SOURCE = 'SEMI_AUTO_IMPORT';
export const DEFAULT_OPERATIONAL_STALE_DAYS = 45;

export type OperationalSourceKind = 'MANUAL' | 'CSV_IMPORT' | 'API_PROVIDER' | 'UNKNOWN';
export type OperationalFreshnessCode = 'READY' | 'STALE' | 'MISSING';

export function classifyOperationalSource(source?: string | null): OperationalSourceKind {
  const normalized = String(source || '')
    .trim()
    .toUpperCase();

  if (!normalized) {
    return 'UNKNOWN';
  }

  if (normalized === MANUAL_OPERATIONAL_SOURCE || normalized === SEMI_AUTO_OPERATIONAL_SOURCE) {
    return 'MANUAL';
  }

  if (normalized === CSV_IMPORT_OPERATIONAL_SOURCE) {
    return 'CSV_IMPORT';
  }

  if (
    normalized.startsWith('DEYE') ||
    normalized.startsWith('SOLARMAN') ||
    normalized.startsWith('SEMS') ||
    normalized.startsWith('API_')
  ) {
    return 'API_PROVIDER';
  }

  return 'UNKNOWN';
}

export function buildOperationalSourceLabel(source?: string | null) {
  switch (classifyOperationalSource(source)) {
    case 'MANUAL':
      return 'Nhập tay';
    case 'CSV_IMPORT':
      return 'Import CSV / Excel';
    case 'API_PROVIDER':
      return 'Đồng bộ API';
    default:
      return 'Đang cập nhật';
  }
}

export function buildOperationalFreshness(input: {
  year?: number | null;
  month?: number | null;
  syncTime?: Date | string | null;
  staleDays?: number;
  now?: Date;
}) {
  const now = input.now || new Date();
  const staleDays = input.staleDays ?? DEFAULT_OPERATIONAL_STALE_DAYS;

  if (!input.syncTime || !input.year || !input.month) {
    return {
      code: 'MISSING' as OperationalFreshnessCode,
      label: 'Đang cập nhật',
      isStale: true,
      ageDays: null,
      periodLagMonths: null,
    };
  }

  const syncDate =
    input.syncTime instanceof Date ? input.syncTime : new Date(String(input.syncTime));
  const ageDays = Math.floor((now.getTime() - syncDate.getTime()) / (1000 * 60 * 60 * 24));
  const periodLagMonths =
    now.getFullYear() * 12 +
    (now.getMonth() + 1) -
    (Number(input.year) * 12 + Number(input.month));

  const isStale = ageDays > staleDays || periodLagMonths > 1;

  return {
    code: (isStale ? 'STALE' : 'READY') as OperationalFreshnessCode,
    label: isStale ? 'Cần cập nhật' : 'Đã cập nhật',
    isStale,
    ageDays,
    periodLagMonths,
  };
}
