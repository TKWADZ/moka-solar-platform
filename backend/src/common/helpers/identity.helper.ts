export type LoginIdentifierKind = 'EMAIL' | 'PHONE' | 'UNKNOWN';

export function normalizeEmail(value?: string | null) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  return normalized || null;
}

export function isValidEmail(value?: string | null) {
  const normalized = normalizeEmail(value);
  if (!normalized) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function normalizeVietnamPhone(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }

  digits = digits.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.startsWith('84')) {
    digits = `84${digits.slice(2).replace(/^0+/, '')}`;
  } else if (digits.startsWith('0')) {
    digits = `84${digits.slice(1)}`;
  }

  return /^84\d{8,11}$/.test(digits) ? digits : null;
}

export function isValidVietnamPhone(value?: string | null) {
  return Boolean(normalizeVietnamPhone(value));
}

export function detectLoginIdentifierKind(value?: string | null): LoginIdentifierKind {
  if (isValidEmail(value)) {
    return 'EMAIL';
  }

  if (isValidVietnamPhone(value)) {
    return 'PHONE';
  }

  return 'UNKNOWN';
}

export function maskPhoneNumber(value?: string | null) {
  const normalized = normalizeVietnamPhone(value);
  if (!normalized) {
    return null;
  }

  if (normalized.length <= 6) {
    return normalized;
  }

  return `${normalized.slice(0, 4)}***${normalized.slice(-3)}`;
}

export function toLegacyVietnamPhone(value?: string | null) {
  const normalized = normalizeVietnamPhone(value);
  if (!normalized) {
    return null;
  }

  if (!normalized.startsWith('84')) {
    return normalized;
  }

  return `0${normalized.slice(2)}`;
}
