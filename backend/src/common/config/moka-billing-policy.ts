export const MOKA_DEFAULT_PPA_UNIT_PRICE = 2500;
export const MOKA_DEFAULT_VAT_RATE = 8;
export const MOKA_DEFAULT_DISCOUNT_AMOUNT = 0;

export function buildMokaMonthlyBillingNote(month: number, year: number) {
  return `Du lieu PV thang ${month}/${year} dong bo tu Deye. Gia tham chieu Moka 2.500 d/kWh, VAT tinh theo phan tram hop dong.`;
}
