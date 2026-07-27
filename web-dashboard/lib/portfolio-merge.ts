import type { UserPosition } from './types';

function normalizedBrokerage(value?: string): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\b(investments?|brokerage|securities|financial|services|inc|llc|corp|corporation)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function sameBrokerage(left?: string, right?: string): boolean {
  const a = normalizedBrokerage(left);
  const b = normalizedBrokerage(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

export function mergePortfolioPositions(
  manualPositions: UserPosition[],
  plaidPositions: UserPosition[],
  connectedBrokerages: string[] = [],
): { positions: UserPosition[]; hiddenManualCount: number } {
  const authoritativeBrokerages = Array.from(new Set([
    ...connectedBrokerages,
    ...plaidPositions
      .map(position => position.brokerage)
      .filter((brokerage): brokerage is string => Boolean(brokerage)),
  ]));

  if (!authoritativeBrokerages.length) {
    return {
      positions: manualPositions.map(position => ({ ...position, source: position.source ?? 'manual' })),
      hiddenManualCount: 0,
    };
  }

  const visibleManual = manualPositions.filter(position =>
    !authoritativeBrokerages.some(brokerage => sameBrokerage(position.brokerage, brokerage)),
  );

  const enrichedPlaid = plaidPositions.map(position => {
    const previous = manualPositions.find(manual =>
      manual.symbol === position.symbol
      && manual.accountType === position.accountType
      && sameBrokerage(manual.brokerage, position.brokerage)
    );
    return previous?.assetClass
      ? { ...position, assetClass: previous.assetClass }
      : position;
  });

  return {
    positions: [
      ...visibleManual.map(position => ({ ...position, source: position.source ?? 'manual' as const })),
      ...enrichedPlaid,
    ],
    hiddenManualCount: manualPositions.length - visibleManual.length,
  };
}
