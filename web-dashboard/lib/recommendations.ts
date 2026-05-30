import type { AdvisorRun } from './types';

const HISTORY_KEY = 'advisor:history';
const SCHEDULE_KEY = 'advisor:scheduleHours';
const MAX_RUNS = 30;

export function saveAdvisorRun(run: AdvisorRun): void {
  const history = loadAdvisorHistory();
  history.unshift(run);
  if (history.length > MAX_RUNS) history.splice(MAX_RUNS);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

export function loadAdvisorHistory(): AdvisorRun[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function getLastRunTime(): Date | null {
  const history = loadAdvisorHistory();
  if (!history.length) return null;
  return new Date(history[0].timestamp);
}

export function getScheduleHours(): number {
  if (typeof window === 'undefined') return 12;
  return parseInt(localStorage.getItem(SCHEDULE_KEY) ?? '12', 10);
}

export function setScheduleHours(hours: number): void {
  localStorage.setItem(SCHEDULE_KEY, String(hours));
}

export function shouldAutoRun(): boolean {
  const last = getLastRunTime();
  if (!last) return true;
  const intervalHours = getScheduleHours();
  return (Date.now() - last.getTime()) / 3600000 >= intervalHours;
}

export function msUntilNextRun(): number {
  const last = getLastRunTime();
  if (!last) return 0;
  const intervalMs = getScheduleHours() * 3600000;
  return Math.max(0, last.getTime() + intervalMs - Date.now());
}

// ─── Track record ─────────────────────────────────────────────────

export interface RecCall {
  runId: string;
  timestamp: string;
  symbol: string;
  action: string;
  summary: string;
  priceAtRec: number;
  currentPrice: number | null;
  returnPct: number | null;
  isGoodCall: boolean | null;
}

export interface TrackRecord {
  totalCalls: number;
  goodCalls: number;
  accuracyPct: number | null;
  avgBuyReturnPct: number | null;
  ghostPortfolioReturnPct: number | null; // equal-weighted avg of all buy/add recs
  actualPortfolioReturnPct: number | null; // portfolio return since first run
  calls: RecCall[];
  topWins: RecCall[];
  topMisses: RecCall[];
}

export function computeTrackRecord(
  history: AdvisorRun[],
  currentPrices: Record<string, number>,
): TrackRecord {
  const calls: RecCall[] = [];

  for (const run of history) {
    for (const rec of run.recommendations) {
      const currentPrice = currentPrices[rec.symbol] ?? null;
      const returnPct =
        currentPrice != null && rec.priceAtAnalysis > 0
          ? ((currentPrice - rec.priceAtAnalysis) / rec.priceAtAnalysis) * 100
          : null;
      const isGoodCall =
        returnPct == null
          ? null
          : rec.action === 'buy' || rec.action === 'add'
          ? returnPct > 0
          : rec.action === 'sell' || rec.action === 'trim'
          ? returnPct < 0
          : null;
      calls.push({
        runId: run.id,
        timestamp: run.timestamp,
        symbol: rec.symbol,
        action: rec.action,
        summary: rec.summary,
        priceAtRec: rec.priceAtAnalysis,
        currentPrice,
        returnPct,
        isGoodCall,
      });
    }
    for (const cand of run.buyCandidates) {
      const currentPrice = currentPrices[cand.symbol] ?? null;
      const returnPct =
        currentPrice != null && cand.priceAtAnalysis > 0
          ? ((currentPrice - cand.priceAtAnalysis) / cand.priceAtAnalysis) * 100
          : null;
      calls.push({
        runId: run.id,
        timestamp: run.timestamp,
        symbol: cand.symbol,
        action: 'buy',
        summary: cand.summary,
        priceAtRec: cand.priceAtAnalysis,
        currentPrice,
        returnPct,
        isGoodCall: returnPct == null ? null : returnPct > 0,
      });
    }
  }

  const withReturn = calls.filter(c => c.returnPct != null && c.isGoodCall != null);
  const goodCalls = withReturn.filter(c => c.isGoodCall === true);
  const buyRecs = withReturn.filter(c => c.action === 'buy' || c.action === 'add');
  const avgBuyReturnPct =
    buyRecs.length > 0
      ? buyRecs.reduce((s, c) => s + (c.returnPct ?? 0), 0) / buyRecs.length
      : null;

  // Ghost portfolio: equal $1000 per buy/add rec, measure blended return
  const ghostReturnPct = avgBuyReturnPct;

  // Actual portfolio return since earliest run
  let actualPortfolioReturnPct: number | null = null;
  if (history.length > 0) {
    const oldest = history[history.length - 1];
    const startEquity = oldest.totalEquityAtAnalysis;
    // estimate current equity from snapshot prices
    const currentEquity = oldest.portfolioSnapshot.reduce((s, p) => {
      const price = currentPrices[p.symbol] ?? p.price;
      return s + price * p.shares;
    }, 0);
    if (startEquity > 0) {
      actualPortfolioReturnPct = ((currentEquity - startEquity) / startEquity) * 100;
    }
  }

  const sorted = [...withReturn].sort((a, b) => (b.returnPct ?? 0) - (a.returnPct ?? 0));

  return {
    totalCalls: calls.length,
    goodCalls: goodCalls.length,
    accuracyPct: withReturn.length > 0 ? (goodCalls.length / withReturn.length) * 100 : null,
    avgBuyReturnPct,
    ghostPortfolioReturnPct: ghostReturnPct,
    actualPortfolioReturnPct,
    calls,
    topWins: sorted.slice(0, 3),
    topMisses: sorted.slice(-3).reverse(),
  };
}
