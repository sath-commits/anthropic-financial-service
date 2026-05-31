export type Currency = 'USD' | 'SGD' | 'INR';

export const DEFAULT_USD_TO_SGD_RATE = 1.35;
export const DEFAULT_USD_TO_INR_RATE = 83.5;

export function positionCurrency(currency?: string): Currency {
  if (currency === 'SGD') return 'SGD';
  if (currency === 'INR') return 'INR';
  return 'USD';
}

export function toUsd(amount: number, currency: Currency | undefined, usdToSgdRate: number, usdToInrRate = DEFAULT_USD_TO_INR_RATE): number {
  const c = positionCurrency(currency);
  if (c === 'SGD') return amount / usdToSgdRate;
  if (c === 'INR') return amount / usdToInrRate;
  return amount;
}

export function fromUsd(amount: number, currency: Currency, usdToSgdRate: number, usdToInrRate = DEFAULT_USD_TO_INR_RATE): number {
  if (currency === 'SGD') return amount * usdToSgdRate;
  if (currency === 'INR') return amount * usdToInrRate;
  return amount;
}

export function formatCurrency(amountUsd: number, currency: Currency, usdToSgdRate: number, usdToInrRate = DEFAULT_USD_TO_INR_RATE): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromUsd(amountUsd, currency, usdToSgdRate, usdToInrRate));
}
