import type { AdvisorRun } from './types';

const HISTORY_KEY  = 'advisor:history';
const AUTO_RUN_KEY = 'advisor:autoRun';
const MAX_RUNS = 30;

// US market holidays 2026 (YYYY-MM-DD, NYSE observed dates)
const MARKET_HOLIDAYS_2026 = new Set([
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed, Jul 4 is Saturday)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
]);

function toLocalDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA'); // returns YYYY-MM-DD in local time
}

export function isMarketDay(d: Date = new Date()): boolean {
  const dow = d.getDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !MARKET_HOLIDAYS_2026.has(toLocalDateStr(d));
}

export function nextMarketDay(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (!isMarketDay(d)) d.setDate(d.getDate() + 1);
  return d;
}

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

export function getAutoRunEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const val = localStorage.getItem(AUTO_RUN_KEY);
  return val === null ? true : val === 'true';
}

export function setAutoRunEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_RUN_KEY, String(enabled));
}

export function shouldAutoRun(): boolean {
  if (!getAutoRunEnabled()) return false;
  const today = new Date();
  if (!isMarketDay(today)) return false;
  const last = getLastRunTime();
  if (!last) return true;
  // Already ran today?
  return toLocalDateStr(last) !== toLocalDateStr(today);
}

// Returns a human-readable label for the next scheduled run
export function nextRunLabel(): string {
  const today = new Date();
  if (!isMarketDay(today)) {
    const next = nextMarketDay(today);
    const label = next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `Next market day: ${label}`;
  }
  const last = getLastRunTime();
  if (!last || toLocalDateStr(last) !== toLocalDateStr(today)) {
    return 'Will run today';
  }
  return 'Already ran today';
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

  // Deduplicate: keep only the most recent call per symbol+action.
  // History is most-recent-first, so the first occurrence we encounter is newest.
  const seen = new Set<string>();
  const deduped = calls.filter(c => {
    const key = `${c.symbol}:${c.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const withReturn = deduped.filter(c => c.returnPct != null && c.isGoodCall != null);
  const goodCalls = withReturn.filter(c => c.isGoodCall === true);
  const buyRecs = withReturn.filter(c => c.action === 'buy' || c.action === 'add');
  const avgBuyReturnPct =
    buyRecs.length > 0
      ? buyRecs.reduce((s, c) => s + (c.returnPct ?? 0), 0) / buyRecs.length
      : null;

  const ghostReturnPct = avgBuyReturnPct;

  let actualPortfolioReturnPct: number | null = null;
  if (history.length > 0) {
    const oldest = history[history.length - 1];
    const startEquity = oldest.totalEquityAtAnalysis;
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
    totalCalls: deduped.length,
    goodCalls: goodCalls.length,
    accuracyPct: withReturn.length > 0 ? (goodCalls.length / withReturn.length) * 100 : null,
    avgBuyReturnPct,
    ghostPortfolioReturnPct: ghostReturnPct,
    actualPortfolioReturnPct,
    calls: deduped,
    topWins: sorted.slice(0, 3),
    topMisses: sorted.slice(-3).reverse(),
  };
}
