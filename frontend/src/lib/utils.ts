export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat('vi-VN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatCompactVndAxis(value: number) {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000) {
    const scaled = absolute / 1_000_000_000;
    const formatted = new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: scaled >= 10 ? 0 : 1,
      maximumFractionDigits: scaled >= 10 ? 0 : 1,
    }).format(scaled);

    return `${value < 0 ? '-' : ''}${formatted} tỷ`;
  }

  if (absolute >= 1_000_000) {
    const scaled = absolute / 1_000_000;
    const formatted = new Intl.NumberFormat('vi-VN', {
      minimumFractionDigits: scaled >= 100 ? 0 : 1,
      maximumFractionDigits: scaled >= 100 ? 0 : 1,
    }).format(scaled);

    return `${value < 0 ? '-' : ''}${formatted} triệu`;
  }

  if (absolute >= 1_000) {
    const scaled = absolute / 1_000;
    const formatted = new Intl.NumberFormat('vi-VN', {
      maximumFractionDigits: 0,
    }).format(scaled);

    return `${value < 0 ? '-' : ''}${formatted} nghìn`;
  }

  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value?: string | Date | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) {
    return '-';
  }

  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(options || {}),
  }).format(date);
}

export function formatDateTime(value?: string | Date | null) {
  return formatDate(value, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMonthPeriod(month?: number | null, year?: number | null) {
  if (!month || !year) {
    return '-';
  }

  return `${String(month).padStart(2, '0')}/${year}`;
}

export function formatNumber(value: number, unit?: string) {
  const output = new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 1,
  }).format(value);

  return unit ? `${output} ${unit}` : output;
}

export function statusTone(status: string) {
  const normalized = status.toLowerCase();

  if (
    normalized.includes('paid') ||
    normalized.includes('ok') ||
    normalized.includes('success') ||
    normalized.includes('resolved') ||
    normalized.includes('đã thanh toán') ||
    normalized.includes('thành công') ||
    normalized.includes('đã giải quyết') ||
    normalized.includes('ổn định') ||
    normalized.includes('đang hoạt động')
  ) {
    return 'success';
  }

  if (
    normalized.includes('overdue') ||
    normalized.includes('error') ||
    normalized.includes('failed') ||
    normalized.includes('urgent') ||
    normalized.includes('quá hạn') ||
    normalized.includes('thất bại') ||
    normalized.includes('khẩn cấp') ||
    normalized.includes('cần chú ý')
  ) {
    return 'danger';
  }

  if (
    normalized.includes('draft') ||
    normalized.includes('estimate') ||
    normalized.includes('review') ||
    normalized.includes('retry') ||
    normalized.includes('incomplete') ||
    normalized.includes('override') ||
    normalized.includes('issued') ||
    normalized.includes('pending') ||
    normalized.includes('progress') ||
    normalized.includes('unbilled') ||
    normalized.includes('chờ') ||
    normalized.includes('chưa xuất') ||
    normalized.includes('đang xử lý') ||
    normalized.includes('thanh toán một phần')
  ) {
    return 'warning';
  }

  return 'default';
}
