import { execSync } from 'child_process';
import path from 'path';
import { NextResponse } from 'next/server';
import { MOCK_POSITIONS, TARGET_ALLOCATION } from '@/lib/mock-portfolio';
import type { UserPosition } from '@/lib/types';
import type { Position, PortfolioSummary, AllocationItem, EarningsEvent } from '@/lib/types';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

function callPython(method: string, params: Record<string, unknown>) {
  try {
    const output = execSync('python3 data_service.py', {
      input: JSON.stringify({ method, params }),
      cwd: SCRIPTS_DIR,
      encoding: 'utf-8',
      timeout: 20000,
    });
    return JSON.parse(output);
  } catch {
    return null;
  }
}

export async function GET() { return handler(null, null); }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return handler(body.positions ?? null, body.targetAllocation ?? null);
}

async function handler(
  userPositions: UserPosition[] | null,
  targetAllocation: Record<string, number> | null,
) {
  const rawPositions = userPositions ?? MOCK_POSITIONS.map(p => ({
    symbol: p.symbol,
    name: p.name,
    shares: p.shares,
    avgCost: p.avgCost,
    fallbackPrice: p.mockCurrentPrice,
    accountType: p.accountType,
    holdingDays: p.holdingDays,
    assetClass: p.assetClass,
  }));

  const symbols = rawPositions.map(p => p.symbol);

  const quotes: Array<{ symbol: string; price: number; error?: string }> =
    callPython('get_batch_quotes', { symbols }) ?? [];

  const priceMap: Record<string, number> = {};
  for (const q of quotes) {
    if (q.price) priceMap[q.symbol] = q.price;
  }

  const positions: Position[] = rawPositions.map(p => {
    const price = priceMap[p.symbol] ?? (p as { fallbackPrice?: number }).fallbackPrice ?? p.avgCost;
    const equity = price * p.shares;
    const costTotal = p.avgCost * p.shares;
    const unrealizedPnl = equity - costTotal;
    const unrealizedPnlPct = ((price / p.avgCost) - 1) * 100;
    return {
      ...p,
      currentPrice: price,
      equity,
      unrealizedPnl,
      unrealizedPnlPct,
      portfolioWeightPct: 0,
      isShortTerm: p.holdingDays < 366,
    };
  });

  const totalEquity = positions.reduce((s, p) => s + p.equity, 0);
  for (const p of positions) {
    p.portfolioWeightPct = totalEquity > 0 ? (p.equity / totalEquity) * 100 : 0;
  }

  const totalUnrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalCost = positions.reduce((s, p) => s + p.avgCost * p.shares, 0);

  // Allocation vs. targets — use user's profile targets if provided, else mock defaults
  const actualByClass: Record<string, number> = {};
  for (const p of positions) {
    actualByClass[p.assetClass] = (actualByClass[p.assetClass] ?? 0) + p.equity;
  }
  const targets = targetAllocation ?? TARGET_ALLOCATION;
  const allocation: AllocationItem[] = Object.entries(targets).map(([name, target]) => {
    const current = totalEquity > 0 ? (actualByClass[name] ?? 0) / totalEquity : 0;
    return { name, target, current, drift: current - target };
  });

  const earningsRaw: Array<{ symbol: string; earnings_date: string; eps_estimate: number | null }> =
    callPython('get_earnings_calendar', { symbols }) ?? [];

  const today = new Date();
  let earnings: EarningsEvent[] = earningsRaw
    .filter(e => e.earnings_date)
    .map(e => {
      const d = new Date(e.earnings_date);
      const daysUntil = Math.round((d.getTime() - today.getTime()) / 86400000);
      return { symbol: e.symbol, earningsDate: e.earnings_date, epsEstimate: e.eps_estimate, daysUntil };
    })
    .filter(e => e.daysUntil >= 0 && e.daysUntil <= 60)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  if (earnings.length === 0 && !userPositions) {
    const addDays = (n: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    earnings = [
      { symbol: 'NVDA', earningsDate: addDays(4),  epsEstimate: 0.89, daysUntil: 4  },
      { symbol: 'AAPL', earningsDate: addDays(11), epsEstimate: 1.58, daysUntil: 11 },
      { symbol: 'MSFT', earningsDate: addDays(18), epsEstimate: 3.24, daysUntil: 18 },
      { symbol: 'AMZN', earningsDate: addDays(25), epsEstimate: 1.36, daysUntil: 25 },
    ];
  }

  const summary: PortfolioSummary = {
    totalEquity,
    dayChange: 0,
    dayChangePct: 0,
    totalUnrealizedPnl,
    totalUnrealizedPnlPct: totalCost > 0 ? (totalUnrealizedPnl / totalCost) * 100 : 0,
    buyingPower: 2450.00,
    positions: positions.sort((a, b) => b.equity - a.equity),
  };

  return NextResponse.json({ summary, allocation, earnings });
}
