import OpenAI from 'openai';
import { execSync } from 'child_process';
import path from 'path';
import { NextResponse } from 'next/server';
import type { UserPosition, InvestorProfile, AdvisorRun } from '@/lib/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts');

// Known FOMC meeting dates (decision day = second day of 2-day meeting)
const FOMC_DATES = [
  '2026-06-18',
  '2026-07-30',
  '2026-09-17',
  '2026-10-29',
  '2026-12-10',
];

function callPython(method: string, params: Record<string, unknown>) {
  try {
    const output = execSync('python3 data_service.py', {
      input: JSON.stringify({ method, params }),
      cwd: SCRIPTS_DIR,
      encoding: 'utf-8',
      timeout: 15000,
    });
    const result = JSON.parse(output);
    return result?.error ? null : result;
  } catch { return null; }
}

export async function POST(req: Request) {
  const { positions, profile, history } = (await req.json()) as {
    positions: UserPosition[];
    profile: InvestorProfile | null;
    history: AdvisorRun[];
  };

  if (!positions?.length) {
    return NextResponse.json({ error: 'No positions provided' }, { status: 400 });
  }

  const symbols = positions.map(p => p.symbol);
  const today = new Date();

  // ── Market data (best-effort; yfinance may be blocked) ──────────
  const quotes =
    (callPython('get_batch_quotes', { symbols }) as Array<{ symbol: string; price: number }>) ?? [];
  const priceMap: Record<string, number> = {};
  for (const q of quotes) if (q.price) priceMap[q.symbol] = q.price;

  const fundamentalsMap: Record<string, unknown> = {};
  const ratingsMap: Record<string, unknown> = {};
  for (const sym of symbols) {
    const f = callPython('get_fundamentals', { symbol: sym });
    if (f) fundamentalsMap[sym] = f;
    const r = callPython('get_analyst_ratings', { symbol: sym });
    if (r) ratingsMap[sym] = r;
  }

  // ── Position data package ───────────────────────────────────────
  const positionData = positions.map(p => {
    const price = priceMap[p.symbol] ?? p.avgCost;
    const equity = price * p.shares;
    return {
      symbol: p.symbol,
      name: p.name,
      shares: p.shares,
      avgCost: p.avgCost,
      currentPrice: price,
      equity,
      unrealizedPnlPct: Number((((price / p.avgCost) - 1) * 100).toFixed(2)),
      holdingDays: p.holdingDays,
      isShortTerm: p.holdingDays < 366,
      accountType: p.accountType,
      assetClass: p.assetClass,
      fundamentals: fundamentalsMap[p.symbol] ?? 'unavailable',
      analystRatings: ratingsMap[p.symbol] ?? 'unavailable',
    };
  });

  const totalEquity = positionData.reduce((s, p) => s + p.equity, 0);

  // ── Upcoming FOMC events ────────────────────────────────────────
  const upcomingFomc = FOMC_DATES
    .map(d => ({
      date: d,
      event: 'FOMC Rate Decision',
      daysUntil: Math.round((new Date(d).getTime() - today.getTime()) / 86400000),
    }))
    .filter(e => e.daysUntil >= 0 && e.daysUntil <= 60);

  // ── Track record context for learning ──────────────────────────
  const historyContext = history.length > 0
    ? `Past ${Math.min(history.length, 5)} advisor runs:\n` +
      history.slice(0, 5).map(r =>
        `• ${r.timestamp.slice(0, 10)}: ${r.executiveSummary}`
      ).join('\n')
    : 'No prior advisor history.';

  // ── GPT-4o structured analysis ─────────────────────────────────
  const systemPrompt = `You are an institutional-grade AI portfolio advisor with CFA-level rigor. You analyze portfolios and return actionable, specific, data-driven recommendations.

CRITICAL RULES:
1. Output valid JSON only — no markdown fences, no prose outside JSON
2. Cite specific numbers in reasoning: % gain/loss, P/E ratios, analyst consensus %, price targets, holding period
3. Flag tax implications: positions held <366 days pay ordinary income tax on gains; losses in taxable accounts = TLH opportunity
4. Respect investor's risk tolerance (${profile?.riskTolerance ?? 'moderate'}) and goal (${profile?.primaryGoal ?? 'growth'})
5. Every recommendation must have a clear "why now" — not generic advice
6. For trim/sell, specify exact % to reduce (trimPct field)
7. Suggest 2-3 buy candidates that FIT the existing portfolio and investor profile
8. Market events must include portfolio-specific impact (name actual holdings affected)

Return exactly this schema:
{
  "executiveSummary": "2-3 sentences. Portfolio health, biggest opportunity, biggest risk. Use specific numbers.",
  "recommendations": [
    {
      "symbol": "AAPL",
      "action": "hold",
      "trimPct": null,
      "conviction": "medium",
      "summary": "Single sentence headline",
      "reasoning": "2-4 sentences with specific data. Cite P/E, analyst consensus, price target, your % gain/loss, days held.",
      "catalysts": ["Specific bull point 1", "Specific bull point 2"],
      "risks": ["Specific risk 1", "Specific risk 2"],
      "taxNote": "Relevant tax note or null"
    }
  ],
  "buyCandidates": [
    {
      "symbol": "TICKER",
      "name": "Company Name",
      "conviction": "medium",
      "summary": "Single sentence headline",
      "reasoning": "Why this fits this portfolio and this investor's profile specifically",
      "catalysts": ["..."],
      "risks": ["..."],
      "suggestedPortfolioWeightPct": 3
    }
  ],
  "marketEvents": [
    {
      "date": "YYYY-MM-DD",
      "event": "Event name",
      "category": "fed",
      "marketExpectation": "What markets are pricing in",
      "portfolioImpact": "Name specific holdings and expected impact in % or $",
      "suggestedAction": "Specific action or 'Hold — no action needed'",
      "urgency": "medium"
    }
  ]
}`;

  const userMessage = `## Portfolio — Total Equity $${totalEquity.toFixed(2)}
${JSON.stringify(positionData, null, 2)}

## Investor Profile
${profile ? JSON.stringify(profile, null, 2) : 'Unknown — assume moderate risk, growth goal, 30-year horizon'}

## Upcoming Macro Events (next 60 days)
${JSON.stringify(upcomingFomc, null, 2)}

## Advisor History (learning context)
${historyContext}

Analyze this portfolio thoroughly and return your structured JSON recommendations.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    temperature: 0.3,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const raw = JSON.parse(response.choices[0].message.content ?? '{}') as {
    executiveSummary?: string;
    recommendations?: Array<Record<string, unknown>>;
    buyCandidates?: Array<Record<string, unknown>>;
    marketEvents?: Array<Record<string, unknown>>;
  };

  const run: AdvisorRun = {
    id: crypto.randomUUID(),
    timestamp: today.toISOString(),
    executiveSummary: (raw.executiveSummary as string) ?? '',
    recommendations: (raw.recommendations ?? []).map(r => ({
      symbol: r.symbol as string,
      priceAtAnalysis: priceMap[r.symbol as string] ?? positions.find(p => p.symbol === r.symbol)?.avgCost ?? 0,
      action: (r.action as 'buy' | 'sell' | 'trim' | 'add' | 'hold') ?? 'hold',
      trimPct: (r.trimPct as number | null) ?? null,
      conviction: (r.conviction as 'high' | 'medium' | 'low') ?? 'medium',
      summary: (r.summary as string) ?? '',
      reasoning: (r.reasoning as string) ?? '',
      catalysts: (r.catalysts as string[]) ?? [],
      risks: (r.risks as string[]) ?? [],
      taxNote: (r.taxNote as string | null) ?? null,
      analystConsensus: (r.analystConsensus as string | null) ?? null,
      analystPriceTarget: (r.analystPriceTarget as number | null) ?? null,
    })),
    buyCandidates: (raw.buyCandidates ?? []).map(c => ({
      symbol: c.symbol as string,
      name: (c.name as string) ?? c.symbol as string,
      priceAtAnalysis: priceMap[c.symbol as string] ?? 0,
      conviction: (c.conviction as 'high' | 'medium' | 'low') ?? 'medium',
      summary: (c.summary as string) ?? '',
      reasoning: (c.reasoning as string) ?? '',
      catalysts: (c.catalysts as string[]) ?? [],
      risks: (c.risks as string[]) ?? [],
      suggestedPortfolioWeightPct: (c.suggestedPortfolioWeightPct as number) ?? 3,
      analystConsensus: (c.analystConsensus as string | null) ?? null,
      analystPriceTarget: (c.analystPriceTarget as number | null) ?? null,
    })),
    marketEvents: (raw.marketEvents ?? []).map(e => ({
      date: e.date as string,
      daysUntil: Math.round((new Date(e.date as string).getTime() - today.getTime()) / 86400000),
      event: e.event as string,
      category: (e.category as 'fed' | 'earnings' | 'economic' | 'geopolitical') ?? 'economic',
      marketExpectation: (e.marketExpectation as string) ?? '',
      portfolioImpact: (e.portfolioImpact as string) ?? '',
      suggestedAction: (e.suggestedAction as string) ?? '',
      urgency: (e.urgency as 'low' | 'medium' | 'high') ?? 'medium',
    })),
    portfolioSnapshot: positionData.map(p => ({
      symbol: p.symbol,
      shares: p.shares,
      price: p.currentPrice,
      equity: p.equity,
    })),
    totalEquityAtAnalysis: totalEquity,
  };

  return NextResponse.json(run);
}
