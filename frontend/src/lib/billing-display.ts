import { formatMonthPeriod } from '@/lib/utils';
import { InvoiceRecord, MonthlyPvBillingRecord } from '@/types';

const BANK_TRANSFER_NOTE_MAX_LENGTH = 40;

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
  return value != null ? value.toLocaleString('vi-VN') : 'Chưa áp dụng đo chỉ số';
}

export function formatBillingUsage(value?: number | null) {
  if (value == null) {
    return 'Chưa cập nhật';
  }

  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 1,
  }).format(value).concat(' kWh');
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
};

export function buildCustomerBillingDisplayModel(params: {
  invoice?: InvoiceRecord | null;
  billing?: MonthlyPvBillingRecord | null;
}): CustomerBillingDisplayModel {
  const invoice = params.invoice || null;
  const billing = params.billing || null;
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

  return {
    monthLabel,
    headerStatus: invoice?.status || billing?.invoiceStatus || null,
    invoiceStatus: invoice?.status || null,
    paymentStatus: invoice?.status || billing?.invoiceStatus || null,
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
      billing?.subtotalAmount != null
        ? Number(billing.subtotalAmount)
        : invoice?.subtotal != null
          ? Number(invoice.subtotal)
          : null,
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
    discountAmount:
      billing?.discountAmount != null
        ? Number(billing.discountAmount)
        : invoice?.discountAmount != null
          ? Number(invoice.discountAmount)
          : null,
    totalAmount,
    outstandingAmount,
    paidAmount: invoice?.paidAmount != null ? Number(invoice.paidAmount) : null,
    previousReading:
      billing?.periodMetrics?.previousReading != null
        ? Number(billing.periodMetrics.previousReading)
        : invoice?.periodMetrics?.previousReading != null
          ? Number(invoice.periodMetrics.previousReading)
          : null,
    currentReading:
      billing?.periodMetrics?.currentReading != null
        ? Number(billing.periodMetrics.currentReading)
        : invoice?.periodMetrics?.currentReading != null
          ? Number(invoice.periodMetrics.currentReading)
          : null,
    syncStatus: billing?.syncStatus || null,
    dataQualityStatus: billing?.dataQualityStatus || null,
    workflowStatus: billing?.invoiceStatus || invoice?.status || null,
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
  };
}
