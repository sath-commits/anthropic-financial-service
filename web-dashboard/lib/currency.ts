export type Currency = 'USD' | 'SGD';

export const DEFAULT_USD_TO_SGD_RATE = 1.35;

export function positionCurrency(currency?: Currency): Currency {
  return currency === 'SGD' ? 'SGD' : 'USD';
}

export function toUsd(amount: number, currency: Currency | undefined, usdToSgdRate: number): number {
  return positionCurrency(currency) === 'SGD' ? amount / usdToSgdRate : amount;
}

export function fromUsd(amount: number, currency: Currency, usdToSgdRate: number): number {
  return currency === 'SGD' ? amount * usdToSgdRate : amount;
}

export function formatCurrency(amountUsd: number, currency: Currency, usdToSgdRate: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromUsd(amountUsd, currency, usdToSgdRate));
}
