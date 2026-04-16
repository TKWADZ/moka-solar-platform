import { formatCurrency, formatDateTime, formatMonthPeriod } from '@/lib/utils';
import { InvoiceRecord, MonthlyPvBillingRecord } from '@/types';

const BANK_TRANSFER_NOTE_MAX_LENGTH = 40;
const CONTINUITY_TOLERANCE = 0.05;

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function contractTypeLabel(type?: string | null) {
  switch (type) {
    case 'PPA_KWH':
      return 'Bán điện theo kWh';
    case 'LEASE':
      return 'Thuê hệ thống cố định';
    case 'INSTALLMENT':
      return 'Trả góp';
    case 'HYBRID':
      return 'Kết hợp cố định + sản lượng';
    case 'SALE':
      return 'Mua đứt hệ thống';
    default:
      return type || '-';
  }
}

export function invoiceItemLabel(value: string) {
  switch (value) {
    case 'Electricity usage charge':
      return 'Tiền điện năng sử dụng';
    case 'Monthly lease fee':
      return 'Phí thuê hàng tháng';
    case 'Maintenance fee':
      return 'Phí bảo trì';
    case 'Monthly principal':
      return 'Gốc hàng tháng';
    case 'Interest':
      return 'Lãi';
    case 'Service fee':
      return 'Phí dịch vụ';
    case 'Fixed monthly fee':
      return 'Phí cố định hàng tháng';
    case 'Energy usage fee':
      return 'Phí sử dụng điện năng';
    case 'System sale payment':
      return 'Thanh toán mua hệ thống';
    default:
      return value;
  }
}

export function invoiceStatusLabel(status: InvoiceRecord['status']) {
  if (status === 'PENDING_REVIEW') {
    return 'Chờ duyệt dữ liệu';
  }

  if (status === 'PAID') {
    return 'Đã thanh toán';
  }

  if (status === 'OVERDUE') {
    return 'Quá hạn';
  }

  if (status === 'PARTIAL') {
    return 'Thanh toán một phần';
  }

  return 'Chờ thanh toán';
}

export function monthlyBillingSourceLabel(source?: string | null) {
  switch (source) {
    case 'MANUAL':
      return 'Nhập tay';
    case 'MANUAL_OVERRIDE':
      return 'Override tay';
    case 'ENERGY_RECORD_AGGREGATE':
      return 'Tổng hợp daily record';
    case 'ADMIN_SYNC':
      return 'Đồng bộ admin';
    case 'DEYE_MONTHLY':
      return 'Deye OpenAPI';
    case 'SOLARMAN_MONTHLY':
      return 'SOLARMAN';
    case 'LUXPOWER_MONTHLY_AGGREGATE':
      return 'LuxPower';
    default:
      return source || 'Không rõ nguồn';
  }
}

export function formatBillingMeterReading(value?: number | null) {
  if (value == null) {
    return 'Chưa áp dụng đo chỉ số';
  }

  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatBillingUsage(value?: number | null) {
  if (value == null) {
    return 'Chưa cập nhật';
  }

  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 1,
  }).format(value).concat(' kWh');
}

export function buildBillingLiveSummaryLabel(params: {
  summarySource?: 'LIVE_CURRENT' | 'SNAPSHOT' | string | null;
  isCurrentOpenPeriod?: boolean;
  liveAsOf?: string | null;
}) {
  if (params.summarySource !== 'LIVE_CURRENT') {
    return null;
  }

  if (params.liveAsOf) {
    return `Tạm tính đến ${formatDateTime(params.liveAsOf)}`;
  }

  return 'Tạm tính theo dữ liệu live hiện tại';
}

function stripAccents(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd');
}

export function sanitizeBankTransferNote(value: string) {
  const sanitized = stripAccents(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  return sanitized.slice(0, BANK_TRANSFER_NOTE_MAX_LENGTH);
}

export function buildBillingTransferNote(params: {
  invoiceNumber?: string | null;
  customerCode?: string | null;
  contractNumber?: string | null;
  customerName?: string | null;
  billingMonth?: number | null;
  billingYear?: number | null;
}) {
  const month = params.billingMonth ? String(params.billingMonth).padStart(2, '0') : '';
  const year = params.billingYear ? String(params.billingYear) : '';
  const reference =
    firstNonEmpty(
      params.contractNumber,
      params.customerCode,
      params.invoiceNumber,
      params.customerName,
    ) || 'MOKA';

  return sanitizeBankTransferNote(`MOKA${month}${year}${reference}`);
}

export function resolveInvoiceCustomerName(
  invoice?: InvoiceRecord | null,
  billing?: MonthlyPvBillingRecord | null,
) {
  return (
    firstNonEmpty(
      invoice?.customer?.companyName,
      billing?.customer?.companyName,
      invoice?.customer?.user?.fullName,
      billing?.customer?.user?.fullName,
    ) || 'Khách hàng Moka Solar'
  );
}

export function resolveInvoiceSystemName(
  invoice?: InvoiceRecord | null,
  billing?: MonthlyPvBillingRecord | null,
) {
  return (
    firstNonEmpty(
      billing?.solarSystem?.name,
      invoice?.contract?.solarSystem?.name,
      billing?.contract?.solarSystem?.name,
      billing?.solarSystem?.stationName,
    ) || 'Hệ thống điện mặt trời'
  );
}

export function resolveInvoiceContractNumber(
  invoice?: InvoiceRecord | null,
  billing?: MonthlyPvBillingRecord | null,
) {
  return firstNonEmpty(invoice?.contract?.contractNumber, billing?.contract?.contractNumber);
}

export function resolveInvoiceAddress(
  invoice?: InvoiceRecord | null,
  billing?: MonthlyPvBillingRecord | null,
) {
  return firstNonEmpty(
    billing?.solarSystem?.locationAddress,
    billing?.contract?.solarSystem?.locationAddress,
    invoice?.contract?.solarSystem?.locationAddress,
    billing?.solarSystem?.location,
    billing?.contract?.solarSystem?.location,
    invoice?.contract?.solarSystem?.location,
    billing?.customer?.installationAddress,
    invoice?.customer?.installationAddress,
    billing?.customer?.billingAddress,
    invoice?.customer?.billingAddress,
  );
}

export function findBillingRecordForInvoice(
  invoice: InvoiceRecord | null,
  records: MonthlyPvBillingRecord[],
) {
  if (!invoice) {
    return null;
  }

  return (
    records.find((record) => record.invoiceId === invoice.id) ||
    records.find(
      (record) =>
        record.month === invoice.billingMonth &&
        record.year === invoice.billingYear &&
        record.contractId === invoice.contractId,
    ) ||
    records.find(
      (record) =>
        record.month === invoice.billingMonth &&
        record.year === invoice.billingYear &&
        record.customerId === invoice.customerId,
    ) ||
    null
  );
}

type BillingContinuityInput = {
  id: string;
  solarSystemId?: string | null;
  contractId?: string | null;
  year?: number | null;
  month?: number | null;
  billableKwh?: number | null;
  loadConsumedKwh?: number | null;
  pvGenerationKwh?: number | null;
  previousReading?: number | null;
  currentReading?: number | null;
  resetApplied?: boolean | null;
};

type BillingContinuityValue = {
  previousReading: number;
  currentReading: number;
  consumptionKwh: number;
};

export type CustomerBillingContinuityLookups = {
  byBillingId: Map<string, BillingContinuityValue>;
  byInvoiceId: Map<string, BillingContinuityValue>;
  byPeriodKey: Map<string, BillingContinuityValue>;
};

type CustomerMeterHistoryLike = {
  year: number;
  month: number;
  previousReading?: number | null;
  currentReading?: number | null;
  loadConsumedKwh?: number | null;
  pvGenerationKwh?: number | null;
  resetApplied?: boolean | null;
};

function toFiniteNumber(value?: number | string | null) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeContinuityValue(value: number) {
  return Number(value.toFixed(6));
}

function normalizeExplicitReading(params: {
  previousReading?: number | null;
  currentReading?: number | null;
  consumptionKwh?: number | null;
  resetApplied?: boolean | null;
}) {
  const previousReading = toFiniteNumber(params.previousReading);
  const currentReading = toFiniteNumber(params.currentReading);
  const consumptionKwh = Math.max(toFiniteNumber(params.consumptionKwh) ?? 0, 0);

  const bothZero =
    previousReading !== null &&
    currentReading !== null &&
    Math.abs(previousReading) <= CONTINUITY_TOLERANCE &&
    Math.abs(currentReading) <= CONTINUITY_TOLERANCE;

  if (!params.resetApplied && bothZero && consumptionKwh > CONTINUITY_TOLERANCE) {
    return {
      previousReading: null,
      currentReading: null,
    };
  }

  return {
    previousReading,
    currentReading,
  };
}

function resolveContinuityConsumption(params: {
  billableKwh?: number | null;
  loadConsumedKwh?: number | null;
  pvGenerationKwh?: number | null;
}) {
  const orderedCandidates = [
    toFiniteNumber(params.billableKwh),
    toFiniteNumber(params.pvGenerationKwh),
    toFiniteNumber(params.loadConsumedKwh),
  ];

  const preferredPositive = orderedCandidates.find(
    (candidate) => candidate !== null && candidate !== undefined && candidate > CONTINUITY_TOLERANCE,
  );

  if (preferredPositive !== undefined) {
    return Math.max(preferredPositive, 0);
  }

  const firstFinite = orderedCandidates.find(
    (candidate) => candidate !== null && candidate !== undefined,
  );

  if (firstFinite !== undefined) {
    return Math.max(firstFinite, 0);
  }

  return 0;
}

function buildContinuityGroupKey(
  solarSystemId?: string | null,
  contractId?: string | null,
) {
  if (solarSystemId && solarSystemId.trim()) {
    return `system:${solarSystemId.trim()}`;
  }

  if (contractId && contractId.trim()) {
    return `contract:${contractId.trim()}`;
  }

  return null;
}

function buildContinuityPeriodKey(params: {
  solarSystemId?: string | null;
  contractId?: string | null;
  year?: number | null;
  month?: number | null;
}) {
  const groupKey = buildContinuityGroupKey(params.solarSystemId, params.contractId);
  if (!groupKey || !params.year || !params.month) {
    return null;
  }

  return `${groupKey}:${params.year}:${params.month}`;
}

function deriveContinuityValues<T extends BillingContinuityInput>(records: T[]) {
  const byRecordId = new Map<string, BillingContinuityValue>();
  const byPeriodKey = new Map<string, BillingContinuityValue>();
  const groups = new Map<string, T[]>();

  for (const record of records) {
    const groupKey = buildContinuityGroupKey(record.solarSystemId, record.contractId);
    if (!groupKey || !record.year || !record.month || !record.id) {
      continue;
    }

    const items = groups.get(groupKey) || [];
    items.push(record);
    groups.set(groupKey, items);
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

    for (const item of items) {
      const consumptionKwh = resolveContinuityConsumption({
        billableKwh: item.billableKwh,
        loadConsumedKwh: item.loadConsumedKwh,
        pvGenerationKwh: item.pvGenerationKwh,
      });
      const explicitReadings = normalizeExplicitReading({
        previousReading: item.previousReading,
        currentReading: item.currentReading,
        consumptionKwh,
        resetApplied: item.resetApplied,
      });
      const previousReading = normalizeContinuityValue(
        previousCurrentReading === null
          ? explicitReadings.previousReading ?? 0
          : item.resetApplied
            ? explicitReadings.previousReading ?? 0
            : previousCurrentReading,
      );
      const currentReading =
        consumptionKwh > CONTINUITY_TOLERANCE || explicitReadings.currentReading === null
          ? normalizeContinuityValue(previousReading + consumptionKwh)
          : normalizeContinuityValue(
              Math.max(explicitReadings.currentReading, previousReading),
            );
      const continuityValue = {
        previousReading,
        currentReading,
        consumptionKwh,
      } satisfies BillingContinuityValue;

      byRecordId.set(item.id, continuityValue);

      const periodKey = buildContinuityPeriodKey({
        solarSystemId: item.solarSystemId,
        contractId: item.contractId,
        year: item.year,
        month: item.month,
      });
      if (periodKey) {
        byPeriodKey.set(periodKey, continuityValue);
      }

      previousCurrentReading = currentReading;
    }
  }

  return {
    byRecordId,
    byPeriodKey,
  };
}

export function buildCustomerBillingContinuityLookups(params: {
  monthlyBillings: MonthlyPvBillingRecord[];
  invoices?: InvoiceRecord[];
}) {
  const billingRecords = params.monthlyBillings.map((billing) => ({
    id: billing.id,
    invoiceId: billing.invoiceId || billing.invoice?.id || null,
    solarSystemId:
      billing.solarSystemId ||
      billing.solarSystem?.id ||
      billing.contract?.solarSystem?.id ||
      null,
    contractId: billing.contractId || billing.contract?.id || null,
    year: billing.year,
    month: billing.month,
    billableKwh: billing.billableKwh,
    loadConsumedKwh: billing.periodMetrics?.loadConsumedKwh ?? null,
    pvGenerationKwh: billing.pvGenerationKwh,
    previousReading: billing.periodMetrics?.previousReading ?? null,
    currentReading: billing.periodMetrics?.currentReading ?? null,
    resetApplied: billing.periodMetrics?.resetApplied ?? false,
  }));

  const existingInvoiceIds = new Set(
    billingRecords
      .map((record) => record.invoiceId)
      .filter((value): value is string => Boolean(value)),
  );

  const invoiceFallbackRecords = (params.invoices || [])
    .filter((invoice) => !existingInvoiceIds.has(invoice.id))
    .map((invoice) => ({
      id: invoice.id,
      invoiceId: invoice.id,
      solarSystemId: invoice.contract?.solarSystem?.id || null,
      contractId: invoice.contractId || invoice.contract?.id || null,
      year: invoice.billingYear,
      month: invoice.billingMonth,
      billableKwh: null,
      loadConsumedKwh: invoice.periodMetrics?.loadConsumedKwh ?? null,
      pvGenerationKwh: invoice.periodMetrics?.pvGenerationKwh ?? null,
      previousReading: invoice.periodMetrics?.previousReading ?? null,
      currentReading: invoice.periodMetrics?.currentReading ?? null,
      resetApplied: invoice.periodMetrics?.resetApplied ?? false,
    }));

  const continuityRecords = [...billingRecords, ...invoiceFallbackRecords];
  const derived = deriveContinuityValues(continuityRecords);
  const byBillingId = new Map<string, BillingContinuityValue>();
  const byInvoiceId = new Map<string, BillingContinuityValue>();

  for (const record of continuityRecords) {
    const value = derived.byRecordId.get(record.id);
    if (!value) {
      continue;
    }

    if (params.monthlyBillings.some((billing) => billing.id === record.id)) {
      byBillingId.set(record.id, value);
    }

    if (record.invoiceId) {
      byInvoiceId.set(record.invoiceId, value);
    }
  }

  return {
    byBillingId,
    byInvoiceId,
    byPeriodKey: derived.byPeriodKey,
  } satisfies CustomerBillingContinuityLookups;
}

function resolveCustomerBillingContinuity(params: {
  lookups?: CustomerBillingContinuityLookups | null;
  invoice?: InvoiceRecord | null;
  billing?: MonthlyPvBillingRecord | null;
}) {
  const { lookups, invoice, billing } = params;
  if (!lookups) {
    return null;
  }

  if (billing?.id && lookups.byBillingId.has(billing.id)) {
    return lookups.byBillingId.get(billing.id) || null;
  }

  if (invoice?.id && lookups.byInvoiceId.has(invoice.id)) {
    return lookups.byInvoiceId.get(invoice.id) || null;
  }

  const periodKey = buildContinuityPeriodKey({
    solarSystemId:
      billing?.solarSystemId ||
      billing?.solarSystem?.id ||
      billing?.contract?.solarSystem?.id ||
      invoice?.contract?.solarSystem?.id ||
      null,
    contractId: billing?.contractId || billing?.contract?.id || invoice?.contractId || null,
    year: billing?.year || invoice?.billingYear || null,
    month: billing?.month || invoice?.billingMonth || null,
  });

  if (!periodKey) {
    return null;
  }

  return lookups.byPeriodKey.get(periodKey) || null;
}

export function deriveCustomerMeterHistoryReadings<
  T extends CustomerMeterHistoryLike & Record<string, unknown>,
>(rows: T[]) {
  const sorted = [...rows].sort((left, right) => {
    const yearDiff = Number(left.year || 0) - Number(right.year || 0);
    if (yearDiff !== 0) {
      return yearDiff;
    }

    return Number(left.month || 0) - Number(right.month || 0);
  });

  let previousCurrentReading: number | null = null;
  const derivedByPeriod = new Map<string, BillingContinuityValue>();

  for (const row of sorted) {
    const consumptionKwh = resolveContinuityConsumption({
      loadConsumedKwh: row.loadConsumedKwh,
      pvGenerationKwh: row.pvGenerationKwh,
    });
    const explicitReadings = normalizeExplicitReading({
      previousReading: row.previousReading,
      currentReading: row.currentReading,
      consumptionKwh,
      resetApplied: row.resetApplied,
    });
    const previousReading = normalizeContinuityValue(
      previousCurrentReading === null
        ? explicitReadings.previousReading ?? 0
        : row.resetApplied
          ? explicitReadings.previousReading ?? 0
          : previousCurrentReading,
    );
    const currentReading =
      consumptionKwh > CONTINUITY_TOLERANCE || explicitReadings.currentReading === null
        ? normalizeContinuityValue(previousReading + consumptionKwh)
        : normalizeContinuityValue(Math.max(explicitReadings.currentReading, previousReading));

    derivedByPeriod.set(`${row.year}-${row.month}`, {
      previousReading,
      currentReading,
      consumptionKwh,
    });
    previousCurrentReading = currentReading;
  }

  return rows.map((row) => {
    const continuity = derivedByPeriod.get(`${row.year}-${row.month}`);
    if (!continuity) {
      return row;
    }

    return {
      ...row,
      previousReading: continuity.previousReading,
      currentReading: continuity.currentReading,
    };
  });
}

export function deriveDiscountRatePercent(
  discountAmount?: number | null,
  subtotalAmount?: number | null,
) {
  const subtotal = toFiniteNumber(subtotalAmount);
  const discount = toFiniteNumber(discountAmount);

  if (subtotal === null || subtotal <= 0 || discount === null) {
    return null;
  }

  return normalizeContinuityValue((discount / subtotal) * 100);
}

export function formatBillingDiscountLabel(params: {
  discountAmount?: number | null;
  subtotalAmount?: number | null;
}) {
  const discountAmount = toFiniteNumber(params.discountAmount);
  const discountRate = deriveDiscountRatePercent(discountAmount, params.subtotalAmount);

  if (discountRate !== null) {
    const formattedRate = new Intl.NumberFormat('vi-VN', {
      maximumFractionDigits: 1,
    }).format(discountRate);

    if (discountAmount !== null && discountAmount > 0) {
      return `${formattedRate}% (${formatCurrency(discountAmount)})`;
    }

    return `${formattedRate}%`;
  }

  if (discountAmount !== null) {
    return formatCurrency(discountAmount);
  }

  return '-';
}

export type CustomerBillingDisplayModel = {
  monthLabel: string;
  headerStatus: string | null;
  invoiceStatus: string | null;
  paymentStatus: string | null;
  systemName: string;
  customerName: string;
  contractNumber: string | null;
  address: string | null;
  contractType: string | null;
  pvGenerationKwh: number | null;
  loadConsumedKwh: number | null;
  billableKwh: number | null;
  unitPrice: number | null;
  subtotalAmount: number | null;
  vatRate: number | null;
  taxAmount: number | null;
  discountAmount: number | null;
  discountRate: number | null;
  discountLabel: string;
  totalAmount: number | null;
  outstandingAmount: number | null;
  paidAmount: number | null;
  previousReading: number | null;
  currentReading: number | null;
  syncStatus: string | null;
  dataQualityStatus: string | null;
  workflowStatus: string | null;
  syncTime: string | null;
  sourceLabel: string | null;
  transferAmount: number | null;
  bankTransferNote: string | null;
  qualitySummary: string | null;
  note: string | null;
  summarySource: 'LIVE_CURRENT' | 'SNAPSHOT' | null;
  liveAsOf: string | null;
  snapshotAt: string | null;
  isCurrentOpenPeriod: boolean;
  isFinalized: boolean;
  liveSummaryLabel: string | null;
};

export function buildCustomerBillingDisplayModel(params: {
  invoice?: InvoiceRecord | null;
  billing?: MonthlyPvBillingRecord | null;
  continuityLookups?: CustomerBillingContinuityLookups | null;
}): CustomerBillingDisplayModel {
  const invoice = params.invoice || null;
  const billing = params.billing || null;
  const derivedContinuity = resolveCustomerBillingContinuity({
    lookups: params.continuityLookups || null,
    invoice,
    billing,
  });
  const month = invoice?.billingMonth ?? billing?.month ?? null;
  const year = invoice?.billingYear ?? billing?.year ?? null;
  const monthLabel = formatMonthPeriod(month, year);
  const totalAmount =
    billing?.totalAmount != null
      ? Number(billing.totalAmount)
      : invoice?.totalAmount != null
        ? Number(invoice.totalAmount)
        : null;
  const outstandingAmount =
    invoice != null
      ? Math.max(Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0), 0)
      : totalAmount;
  const transferAmount =
    outstandingAmount != null && Number.isFinite(outstandingAmount)
      ? outstandingAmount
      : totalAmount;
  const customerName = resolveInvoiceCustomerName(invoice, billing);
  const contractNumber = resolveInvoiceContractNumber(invoice, billing);
  const summarySource = billing?.summarySource || null;
  const liveAsOf =
    billing?.liveAsOf ||
    (summarySource === 'LIVE_CURRENT' ? billing?.syncTime || null : null);
  const isCurrentOpenPeriod = Boolean(billing?.isCurrentOpenPeriod);
  const isFinalized = Boolean(billing?.isFinalized);
  const visibleWorkflowStatus =
    isCurrentOpenPeriod && !isFinalized
      ? 'ESTIMATE'
      : billing?.invoiceStatus || invoice?.status || null;
  const liveSummaryLabel = buildBillingLiveSummaryLabel({
    summarySource,
    isCurrentOpenPeriod,
    liveAsOf,
  });
  const discountAmount =
    billing?.discountAmount != null
      ? Number(billing.discountAmount)
      : invoice?.discountAmount != null
        ? Number(invoice.discountAmount)
        : null;
  const subtotalAmount =
    billing?.subtotalAmount != null
      ? Number(billing.subtotalAmount)
      : invoice?.subtotal != null
        ? Number(invoice.subtotal)
        : null;
  const discountRate = deriveDiscountRatePercent(discountAmount, subtotalAmount);

  return {
    monthLabel,
    headerStatus:
      isCurrentOpenPeriod && !isFinalized
        ? 'ESTIMATE'
        : invoice?.status || billing?.invoiceStatus || null,
    invoiceStatus: invoice?.status || null,
    paymentStatus:
      isCurrentOpenPeriod && !isFinalized
        ? 'ESTIMATE'
        : invoice?.status || billing?.invoiceStatus || null,
    systemName: resolveInvoiceSystemName(invoice, billing),
    customerName,
    contractNumber,
    address: resolveInvoiceAddress(invoice, billing),
    contractType: firstNonEmpty(
      invoice?.contract?.type,
      billing?.contract?.type,
      invoice?.contract?.servicePackage?.contractType,
      billing?.contract?.servicePackage?.contractType,
    ),
    pvGenerationKwh:
      billing?.pvGenerationKwh != null
        ? Number(billing.pvGenerationKwh)
        : invoice?.periodMetrics?.pvGenerationKwh != null
          ? Number(invoice.periodMetrics.pvGenerationKwh)
          : null,
    loadConsumedKwh:
      billing?.periodMetrics?.loadConsumedKwh != null
        ? Number(billing.periodMetrics.loadConsumedKwh)
        : invoice?.periodMetrics?.loadConsumedKwh != null
          ? Number(invoice.periodMetrics.loadConsumedKwh)
          : null,
    billableKwh:
      billing?.billableKwh != null && Number.isFinite(Number(billing.billableKwh))
        ? Number(billing.billableKwh)
        : null,
    unitPrice:
      billing?.unitPrice != null
        ? Number(billing.unitPrice)
        : invoice?.contract?.pricePerKwh != null
          ? Number(invoice.contract.pricePerKwh)
          : invoice?.contract?.servicePackage?.pricePerKwh != null
            ? Number(invoice.contract.servicePackage.pricePerKwh)
            : null,
    subtotalAmount:
      subtotalAmount,
    vatRate:
      billing?.vatRate != null
        ? Number(billing.vatRate)
        : invoice?.vatRate != null
          ? Number(invoice.vatRate)
          : null,
    taxAmount:
      billing?.taxAmount != null
        ? Number(billing.taxAmount)
        : invoice?.vatAmount != null
          ? Number(invoice.vatAmount)
          : null,
    discountAmount,
    discountRate,
    discountLabel: formatBillingDiscountLabel({
      discountAmount,
      subtotalAmount,
    }),
    totalAmount,
    outstandingAmount,
    paidAmount: invoice?.paidAmount != null ? Number(invoice.paidAmount) : null,
    previousReading:
      derivedContinuity?.previousReading != null
        ? Number(derivedContinuity.previousReading)
        : billing?.periodMetrics?.previousReading != null
          ? Number(billing.periodMetrics.previousReading)
          : invoice?.periodMetrics?.previousReading != null
            ? Number(invoice.periodMetrics.previousReading)
            : null,
    currentReading:
      derivedContinuity?.currentReading != null
        ? Number(derivedContinuity.currentReading)
        : billing?.periodMetrics?.currentReading != null
          ? Number(billing.periodMetrics.currentReading)
          : invoice?.periodMetrics?.currentReading != null
            ? Number(invoice.periodMetrics.currentReading)
            : null,
    syncStatus: billing?.syncStatus || null,
    dataQualityStatus: billing?.dataQualityStatus || null,
    workflowStatus: visibleWorkflowStatus,
    syncTime: billing?.syncTime || invoice?.periodMetrics?.syncTime || null,
    sourceLabel:
      billing?.periodMetrics?.sourceLabel ||
      (billing?.source ? monthlyBillingSourceLabel(billing.source) : null) ||
      invoice?.periodMetrics?.sourceLabel ||
      null,
    transferAmount,
    bankTransferNote:
      month && year
        ? buildBillingTransferNote({
            invoiceNumber: invoice?.invoiceNumber,
            customerCode: invoice?.customer?.customerCode || billing?.customer?.customerCode,
            contractNumber,
            customerName,
            billingMonth: month,
            billingYear: year,
          })
        : null,
    qualitySummary: billing?.qualitySummary || null,
    note: billing?.note || null,
    summarySource,
    liveAsOf,
    snapshotAt: billing?.snapshotAt || invoice?.createdAt || invoice?.issuedAt || null,
    isCurrentOpenPeriod,
    isFinalized,
    liveSummaryLabel,
  };
}
