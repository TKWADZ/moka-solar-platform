export const SEMS_PLUS_VISIBLE_REPORT_SOURCE = 'SEMS_PLUS_VISIBLE_REPORT';

export type SemsPlusVisibleSeries = {
  total?: unknown;
  daily?: unknown[];
};

export type SemsPlusVisiblePlantReport = {
  plantName?: unknown;
  stationId?: unknown;
  inverterSerials?: unknown[];
  providerStatus?: unknown;
  period?: unknown;
  capturedAt?: unknown;
  timeZone?: unknown;
  generation?: SemsPlusVisibleSeries | null;
  batteryCharge?: SemsPlusVisibleSeries | null;
  batteryDischarge?: SemsPlusVisibleSeries | null;
  gridExport?: SemsPlusVisibleSeries | null;
  gridImport?: SemsPlusVisibleSeries | null;
};

export type SemsPlusVisibleReportPreview = {
  provider: typeof SEMS_PLUS_VISIBLE_REPORT_SOURCE;
  plantName: string;
  stationId: string | null;
  inverterSerials: string[];
  providerStatus: string | null;
  year: number;
  month: number;
  periodLabel: string;
  timeZone: string;
  capturedAt: string | null;
  pvGenerationKwh: number | null;
  gridExportedKwh: number | null;
  purchasedEnergyKwh: number | null;
  batteryChargeKwh: number | null;
  batteryDischargeKwh: number | null;
  dailyGenerationKwh: Array<{ date: string; value: number | null }>;
  dataQualityStatus: 'OK' | 'REVIEW_REQUIRED';
  importEligible: boolean;
  warnings: string[];
};

export type SemsPlusApprovedSystemLink = {
  stationId: string;
  systemCode: string;
};

type SemsPlusSystemLinkDocument = {
  schemaVersion?: unknown;
  links?: unknown;
};

export type SemsPlusOperationalImportRow = {
  systemCode: string;
  'Tên dự án': string;
  'Thời gian cập nhật': string;
  'Múi giờ': string;
  'Lượng điện phát -Trong tháng(kWh)': number;
  'Công suất cấp lên lưới -Trong tháng(kWh)'?: number;
  'Năng lượng đã mua -Trong tháng(kWh)'?: number;
  'Nguồn dữ liệu': typeof SEMS_PLUS_VISIBLE_REPORT_SOURCE;
  'Ghi chú': string;
  'SEMS Plant ID'?: string;
  'Inverter serial'?: string;
};

const FORBIDDEN_AUTH_KEY = /(^|_)(authorization|cookie|password|passwd|pwd|secret|session|token)(_|$)/i;

export function assertSemsPlusCaptureHasNoAuthArtifacts(value: unknown) {
  visitCapture(value, '$');
}

export function mapSemsPlusVisibleReport(
  input: SemsPlusVisiblePlantReport,
): SemsPlusVisibleReportPreview {
  assertSemsPlusCaptureHasNoAuthArtifacts(input);

  const plantName = readText(input.plantName);
  if (!plantName) {
    throw new Error('SEMS+ capture is missing plantName.');
  }

  const period = parsePeriod(input.period);
  if (!period) {
    throw new Error(`SEMS+ capture for "${plantName}" has an invalid period.`);
  }

  const generation = normalizeSeries(input.generation);
  const gridExport = normalizeSeries(input.gridExport);
  const gridImport = normalizeSeries(input.gridImport);
  const batteryCharge = normalizeSeries(input.batteryCharge);
  const batteryDischarge = normalizeSeries(input.batteryDischarge);
  const warnings: string[] = [];

  if (generation.total === null) {
    warnings.push('MISSING_PV_GENERATION');
  }

  const hasDailyGenerationEvidence = generation.daily.some(
    (value) => value !== null && value > 0,
  );
  if (generation.total === 0 && !hasDailyGenerationEvidence) {
    warnings.push('ZERO_ONLY_PROVIDER_DATA');
  }

  const providerStatus = readText(input.providerStatus);
  if (providerStatus && isOfflineStatus(providerStatus)) {
    warnings.push('PROVIDER_OFFLINE');
  }

  const importEligible =
    generation.total !== null &&
    !(generation.total === 0 && !hasDailyGenerationEvidence);

  return {
    provider: SEMS_PLUS_VISIBLE_REPORT_SOURCE,
    plantName,
    stationId: readText(input.stationId),
    inverterSerials: Array.isArray(input.inverterSerials)
      ? input.inverterSerials.map(readText).filter((value): value is string => Boolean(value))
      : [],
    providerStatus,
    year: period.year,
    month: period.month,
    periodLabel: `${period.year}/${String(period.month).padStart(2, '0')}`,
    timeZone: readText(input.timeZone) || 'Asia/Ho_Chi_Minh',
    capturedAt: normalizeDateTime(input.capturedAt),
    pvGenerationKwh: generation.total,
    gridExportedKwh: gridExport.total,
    purchasedEnergyKwh: gridImport.total,
    batteryChargeKwh: batteryCharge.total,
    batteryDischargeKwh: batteryDischarge.total,
    dailyGenerationKwh: generation.daily.map((value, index) => ({
      date: `${period.year}-${String(period.month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
      value,
    })),
    dataQualityStatus: importEligible ? 'OK' : 'REVIEW_REQUIRED',
    importEligible,
    warnings,
  };
}

export function toSemsPlusOperationalImportRow(
  preview: SemsPlusVisibleReportPreview,
  approvedLink?: SemsPlusApprovedSystemLink | null,
): SemsPlusOperationalImportRow | null {
  if (
    !preview.importEligible ||
    preview.pvGenerationKwh === null ||
    !preview.stationId ||
    !approvedLink ||
    approvedLink.stationId !== preview.stationId
  ) {
    return null;
  }

  return {
    systemCode: approvedLink.systemCode,
    'Tên dự án': preview.plantName,
    'Thời gian cập nhật': preview.periodLabel,
    'Múi giờ': preview.timeZone,
    'Lượng điện phát -Trong tháng(kWh)': preview.pvGenerationKwh,
    ...(preview.gridExportedKwh !== null
      ? { 'Công suất cấp lên lưới -Trong tháng(kWh)': preview.gridExportedKwh }
      : {}),
    ...(preview.purchasedEnergyKwh !== null
      ? { 'Năng lượng đã mua -Trong tháng(kWh)': preview.purchasedEnergyKwh }
      : {}),
    'Nguồn dữ liệu': SEMS_PLUS_VISIBLE_REPORT_SOURCE,
    'Ghi chú': buildImportNote(preview),
    ...(preview.stationId ? { 'SEMS Plant ID': preview.stationId } : {}),
    ...(preview.inverterSerials.length
      ? { 'Inverter serial': preview.inverterSerials.join(', ') }
      : {}),
  };
}

export function parseSemsPlusApprovedSystemLinks(
  input: unknown,
): Map<string, SemsPlusApprovedSystemLink> {
  assertSemsPlusCaptureHasNoAuthArtifacts(input);

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('SEMS+ system link file must be a JSON object.');
  }

  const document = input as SemsPlusSystemLinkDocument;
  if (document.schemaVersion !== 1) {
    throw new Error('SEMS+ system link file must use schemaVersion 1.');
  }
  if (!Array.isArray(document.links)) {
    throw new Error('SEMS+ system link file must include a links array.');
  }

  const seenStationIds = new Set<string>();
  const approvedLinks = new Map<string, SemsPlusApprovedSystemLink>();

  document.links.forEach((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`SEMS+ system link at index ${index} must be an object.`);
    }

    const candidate = value as Record<string, unknown>;
    const stationId = readText(candidate.stationId);
    const systemCode = readText(candidate.systemCode);
    if (!stationId || !systemCode) {
      throw new Error(
        `SEMS+ system link at index ${index} requires stationId and systemCode.`,
      );
    }
    if (seenStationIds.has(stationId)) {
      throw new Error(`SEMS+ system link contains duplicate stationId "${stationId}".`);
    }
    seenStationIds.add(stationId);

    // Only links explicitly reviewed by an operator can enter the import sheet.
    if (candidate.approved === true) {
      approvedLinks.set(stationId, { stationId, systemCode });
    }
  });

  return approvedLinks;
}

export function parseSemsPlusLocalizedNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const raw = value.trim().replace(/\u00a0/g, ' ');
  const multiplier = /\bMWh\b/i.test(raw) ? 1000 : 1;
  let numeric = raw.replace(/[^0-9,.-]/g, '');

  if (!numeric || numeric === '-' || numeric === '--') {
    return null;
  }

  if (numeric.includes(',') && numeric.includes('.')) {
    numeric = numeric.replace(/\./g, '').replace(',', '.');
  } else if (numeric.includes(',')) {
    numeric = numeric.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(numeric)) {
    numeric = numeric.replace(/\./g, '');
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed * multiplier : null;
}

function normalizeSeries(value?: SemsPlusVisibleSeries | null) {
  return {
    total: parseSemsPlusLocalizedNumber(value?.total),
    daily: Array.isArray(value?.daily)
      ? value.daily.map(parseSemsPlusLocalizedNumber)
      : [],
  };
}

function parsePeriod(value: unknown) {
  const normalized = readText(value);
  if (!normalized) {
    return null;
  }

  const monthFirst = normalized.match(/^(0?[1-9]|1[0-2])[\/-](\d{4})$/);
  if (monthFirst) {
    return { month: Number(monthFirst[1]), year: Number(monthFirst[2]) };
  }

  const yearFirst = normalized.match(/^(\d{4})[\/-](0?[1-9]|1[0-2])$/);
  return yearFirst
    ? { month: Number(yearFirst[2]), year: Number(yearFirst[1]) }
    : null;
}

function readText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeDateTime(value: unknown) {
  const text = readText(value);
  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isOfflineStatus(value: string) {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return normalized.includes('OFFLINE') || normalized.includes('NGOAI TUYEN');
}

function buildImportNote(preview: SemsPlusVisibleReportPreview) {
  const parts = [
    'Dữ liệu hiển thị được người dùng xuất từ SEMS+; không chứa cookie/token.',
    preview.capturedAt ? `Chụp lúc ${preview.capturedAt}` : null,
    `Pin sạc ${preview.batteryChargeKwh ?? '-'} kWh`,
    `Pin xả ${preview.batteryDischargeKwh ?? '-'} kWh`,
  ];

  return parts.filter(Boolean).join(' | ');
}

function visitCapture(value: unknown, path: string) {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => visitCapture(item, `${path}[${index}]`));
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_AUTH_KEY.test(key)) {
      throw new Error(`SEMS+ capture contains forbidden auth field at ${path}.${key}.`);
    }
    visitCapture(nested, `${path}.${key}`);
  }
}
