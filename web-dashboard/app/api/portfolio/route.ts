import { execSync } from 'child_process';
import path from 'path';
import { NextResponse } from 'next/server';
import { MOCK_POSITIONS, TARGET_ALLOCATION } from '@/lib/mock-portfolio';
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

export async function GET() {
  const symbols = MOCK_POSITIONS.map(p => p.symbol);

  // Fetch live prices
  const quotes: Array<{ symbol: string; price: number; error?: string }> =
    callPython('get_batch_quotes', { symbols }) ?? [];

  const priceMap: Record<string, number> = {};
  for (const q of quotes) {
    if (q.price) priceMap[q.symbol] = q.price;
  }

  // Enrich positions with live prices (fall back to mockCurrentPrice if yfinance unavailable)
  const positions: Position[] = MOCK_POSITIONS.map(p => {
    const price = priceMap[p.symbol] ?? p.mockCurrentPrice;
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
      portfolioWeightPct: 0, // calculated below
      isShortTerm: p.holdingDays < 366,
    };
  });

  const totalEquity = positions.reduce((s, p) => s + p.equity, 0);
  for (const p of positions) {
    p.portfolioWeightPct = totalEquity > 0 ? (p.equity / totalEquity) * 100 : 0;
  }

  const totalUnrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalCost = positions.reduce((s, p) => s + p.avgCost * p.shares, 0);

  // Asset allocation vs. targets
  const actualByClass: Record<string, number> = {};
  for (const p of positions) {
    actualByClass[p.assetClass] = (actualByClass[p.assetClass] ?? 0) + p.equity;
  }
  const allocation: AllocationItem[] = Object.entries(TARGET_ALLOCATION).map(([name, target]) => {
    const current = (actualByClass[name] ?? 0) / totalEquity;
    return { name, target, current, drift: current - target };
  });

  // Upcoming earnings — try live, fall back to mock calendar
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

  // Fallback mock earnings when live data unavailable
  if (earnings.length === 0) {
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
    dayChange: 0, // Robinhood not connected in dev
    dayChangePct: 0,
    totalUnrealizedPnl,
    totalUnrealizedPnlPct: totalCost > 0 ? (totalUnrealizedPnl / totalCost) * 100 : 0,
    buyingPower: 2450.00, // mock
    positions: positions.sort((a, b) => b.equity - a.equity),
  };

  return NextResponse.json({ summary, allocation, earnings });
}
