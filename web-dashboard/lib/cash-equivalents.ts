const COST_BASIS_PRICED_SYMBOLS = new Set(['FDRXX', '59515R401']);

export function shouldPriceAtCostBasis(symbol: string): boolean {
  return COST_BASIS_PRICED_SYMBOLS.has(symbol.trim().toUpperCase());
}
