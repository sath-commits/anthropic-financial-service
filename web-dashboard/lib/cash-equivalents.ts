const COST_BASIS_PRICED_SYMBOLS = new Set(['FDRXX']);

export function shouldPriceAtCostBasis(symbol: string): boolean {
  return COST_BASIS_PRICED_SYMBOLS.has(symbol.trim().toUpperCase());
}
