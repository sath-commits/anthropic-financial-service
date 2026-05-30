import { execSync } from 'child_process';
import path from 'path';
import { NextResponse } from 'next/server';
import { MOCK_POSITIONS } from '@/lib/mock-portfolio';

const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

// Seed a plausible price series ending at the mock current price
function generateMockHistory(symbol: string, periodDays: number) {
  const pos = MOCK_POSITIONS.find(p => p.symbol === symbol);
  const endPrice = pos?.mockCurrentPrice ?? 100;
  // Start ~15% below end for an upward trend (adjust per symbol)
  const losers = ['INTC', 'BND', 'JNJ'];
  const startOffset = losers.includes(symbol) ? 1.25 : 0.82;
  const startPrice = endPrice * startOffset;

  const points = [];
  const today = new Date();
  for (let i = periodDays; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const progress = 1 - i / periodDays;
    const trend = startPrice + (endPrice - startPrice) * progress;
    // Add daily noise ±1%
    const noise = trend * (Math.random() * 0.02 - 0.01);
    points.push({
      date: d.toISOString().slice(0, 10),
      close: parseFloat((trend + noise).toFixed(2)),
    });
  }
  return points;
}

const PERIOD_DAYS: Record<string, number> = {
  '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '2y': 730,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol') ?? 'VOO';
  const period = searchParams.get('period') ?? '6mo';

  try {
    const output = execSync('python3 data_service.py', {
      input: JSON.stringify({ method: 'get_price_history', params: { symbol, period } }),
      cwd: SCRIPTS_DIR,
      encoding: 'utf-8',
      timeout: 15000,
    });
    const data = JSON.parse(output);
    if (Array.isArray(data) && data.length > 0) return NextResponse.json(data);
  } catch { /* fall through to mock */ }

  // Fallback: generate mock history
  const days = PERIOD_DAYS[period] ?? 180;
  return NextResponse.json(generateMockHistory(symbol, days));
}
