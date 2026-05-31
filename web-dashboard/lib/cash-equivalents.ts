const COST_BASIS_PRICED_SYMBOLS = new Set(['FDRXX', '59515R401']);
const CASH_EQUIVALENT_SYMBOLS = new Set(['FDRXX', 'SPAXX', 'SWVXX', 'VMFXX']);

export function shouldPriceAtCostBasis(symbol: string): boolean {
  return COST_BASIS_PRICED_SYMBOLS.has(symbol.trim().toUpperCase());
}

export function isCashEquivalent(symbol: string, assetClass?: string): boolean {
  return CASH_EQUIVALENT_SYMBOLS.has(symbol.trim().toUpperCase()) || assetClass === 'Cash';
}
