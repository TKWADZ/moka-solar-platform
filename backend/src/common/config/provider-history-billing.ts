export const AUTHORITATIVE_MANUAL_SOURCES = new Set([
  'CSV_IMPORT',
  'MANUAL',
  'MANUAL_ENTRY',
  'ADMIN_SYNC',
  'MANUAL_OVERRIDE',
  'SEMI_AUTO_IMPORT',
]);

export type ProviderHistoryDataQuality =
  | 'GOOD'
  | 'VERIFIED_HISTORY'
  | 'REQUIRES_REVIEW'
  | 'UNVERIFIED'
  | 'INVALID_HISTORY_PERIOD'
  | 'SCHEMA_CHANGED';

export type ProviderHistoryBillingInput = {
  provider: string;
  historyContractVerified: boolean;
  stationVerified: boolean;
  periodValid: boolean;
  expectedYearMatches: boolean;
  dataQualityStatus: ProviderHistoryDataQuality;
  pvGenerationKwh: number | null | undefined;
  customerAssigned: boolean;
  manuallyLocked: boolean;
};

export type ProviderHistoryBillingReason =
  | 'FEATURE_DISABLED'
  | 'HISTORY_CONTRACT_UNVERIFIED'
  | 'STATION_UNVERIFIED'
  | 'INVALID_PERIOD'
  | 'EXPECTED_YEAR_MISMATCH'
  | 'DATA_QUALITY_NOT_VERIFIED'
  | 'MISSING_OR_INVALID_PV'
  | 'CUSTOMER_NOT_ASSIGNED'
  | 'MANUAL_DATA_LOCKED';

function normalizeProvider(provider: string) {
  const normalized = provider.trim().toUpperCase();
  return normalized === 'SEMS_PORTAL' || normalized === 'SEMS+'
    ? 'SEMS_PLUS'
    : normalized;
}

export function isAuthoritativeManualSource(source?: string | null) {
  return AUTHORITATIVE_MANUAL_SOURCES.has(String(source || '').trim().toUpperCase());
}

export function hasConfirmedBareMonthParserSignature(
  rawPayload: unknown,
  expectedMonth: number,
) {
  const payload =
    rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : {};
  for (const key of ['time', 'period', 'monthLabel', 'date', 'recordDate', 'month']) {
    const value = payload[key];
    if (
      (typeof value === 'string' || typeof value === 'number') &&
      /^(?:[1-9]|1[0-2])$/.test(String(value).trim()) &&
      Number(value) === expectedMonth
    ) {
      return true;
    }
  }
  return false;
}

export function describeMonthlyEnergyDataQuality(record: {
  source?: string | null;
  year: number;
  month: number;
  rawPayload?: unknown;
}) {
  const source = String(record.source || '').trim().toUpperCase();
  if (isAuthoritativeManualSource(source)) {
    return {
      sourceLabel: source === 'CSV_IMPORT' ? 'CSV import' : 'Nhập thủ công',
      dataQualityStatus: 'MANUAL_VERIFIED',
      requiresReview: false,
    };
  }

  if (
    source.startsWith('SOLARMAN') &&
    [2000, 2001].includes(record.year) &&
    hasConfirmedBareMonthParserSignature(record.rawPayload, record.month)
  ) {
    return {
      sourceLabel: 'Dữ liệu nghi ngờ',
      dataQualityStatus: 'INVALID_PERIOD',
      requiresReview: true,
    };
  }

  const raw =
    record.rawPayload && typeof record.rawPayload === 'object' && !Array.isArray(record.rawPayload)
      ? (record.rawPayload as Record<string, unknown>)
      : {};
  const mokaHistory =
    raw._mokaHistory && typeof raw._mokaHistory === 'object' && !Array.isArray(raw._mokaHistory)
      ? (raw._mokaHistory as Record<string, unknown>)
      : {};
  const verified = mokaHistory.dataQualityStatus === 'VERIFIED_HISTORY';

  if (source.startsWith('SOLARMAN')) {
    return {
      sourceLabel: verified ? 'SOLARMAN đã xác minh' : 'Dữ liệu nghi ngờ',
      dataQualityStatus: verified ? 'PROVIDER_VERIFIED' : 'UNVERIFIED',
      requiresReview: !verified,
    };
  }
  if (source.startsWith('SEMS')) {
    return {
      sourceLabel: verified ? 'SEMS+ đã xác minh' : 'Chưa có lịch sử từ hãng',
      dataQualityStatus: verified ? 'PROVIDER_VERIFIED' : 'UNVERIFIED',
      requiresReview: !verified,
    };
  }
  if (source.startsWith('DEYE') || source.startsWith('LUXPOWER')) {
    return {
      sourceLabel: 'Dữ liệu provider đã xác minh',
      dataQualityStatus: 'PROVIDER_VERIFIED',
      requiresReview: false,
    };
  }

  return {
    sourceLabel: 'Dữ liệu nghi ngờ',
    dataQualityStatus: 'REQUIRES_REVIEW',
    requiresReview: true,
  };
}

export function isProviderHistoryBillingEnabled(
  provider: string,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const normalized = normalizeProvider(provider);
  const key = `${normalized}_HISTORY_BILLING_ENABLED`;
  return environment[key]?.trim().toLowerCase() === 'true';
}

export function assessProviderHistoryBillingEligibility(
  input: ProviderHistoryBillingInput,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const reasons: ProviderHistoryBillingReason[] = [];

  if (!isProviderHistoryBillingEnabled(input.provider, environment)) {
    reasons.push('FEATURE_DISABLED');
  }
  if (!input.historyContractVerified) {
    reasons.push('HISTORY_CONTRACT_UNVERIFIED');
  }
  if (!input.stationVerified) {
    reasons.push('STATION_UNVERIFIED');
  }
  if (!input.periodValid) {
    reasons.push('INVALID_PERIOD');
  }
  if (!input.expectedYearMatches) {
    reasons.push('EXPECTED_YEAR_MISMATCH');
  }
  if (!['GOOD', 'VERIFIED_HISTORY'].includes(input.dataQualityStatus)) {
    reasons.push('DATA_QUALITY_NOT_VERIFIED');
  }
  if (
    input.pvGenerationKwh === null ||
    input.pvGenerationKwh === undefined ||
    !Number.isFinite(input.pvGenerationKwh) ||
    input.pvGenerationKwh < 0
  ) {
    reasons.push('MISSING_OR_INVALID_PV');
  }
  if (!input.customerAssigned) {
    reasons.push('CUSTOMER_NOT_ASSIGNED');
  }
  if (input.manuallyLocked) {
    reasons.push('MANUAL_DATA_LOCKED');
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}
