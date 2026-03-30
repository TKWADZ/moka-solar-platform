import { toNumber } from './domain.helper';

export function normalizePercentRate(value: unknown, fallback = 0) {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }

  return Number(numeric.toFixed(2));
}

export function roundMoney(value: number) {
  return Number((value || 0).toFixed(2));
}

export function calculateVatAmount(subtotalAmount: number, vatRate: number) {
  return roundMoney(subtotalAmount * (vatRate / 100));
}

export function deriveVatRateFromAmounts(
  subtotalAmount: unknown,
  vatAmount: unknown,
  fallback = 0,
) {
  const subtotal = toNumber(subtotalAmount);
  const amount = toNumber(vatAmount);

  if (subtotal > 0 && amount >= 0) {
    return normalizePercentRate((amount / subtotal) * 100, fallback);
  }

  return fallback;
}
