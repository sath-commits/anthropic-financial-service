import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { callDataService } from '@/lib/data-service';
import { shouldPriceAtCostBasis } from '@/lib/cash-equivalents';
import { DEFAULT_USD_TO_SGD_RATE, positionCurrency, toUsd } from '@/lib/currency';

export const maxDuration = 90;
import type {
  UserPosition, InvestorProfile, AdvisorRun,
  RebalancePlan, DriftItem, RebalanceTrade,
  TLHOpportunity, RetirementProjection,
} from '@/lib/types';

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}


// ── Portfolio Rebalance (portfolio-rebalance skill) ─────────────────────────

type PositionRow = {
  symbol: string; name: string; shares: number; avgCost: number;
  currentPrice: number; equity: number; accountType: string; assetClass: string;
  unrealizedPnlPct: number; isShortTerm: boolean;
};

function etfForAssetClass(cls: string): { symbol: string; name: string } {
  const c = cls.toLowerCase();
  if (c.includes('bond') || c.includes('fixed'))   return { symbol: 'BND',  name: 'Vanguard Total Bond Market ETF' };
  if (c.includes('international') || c.includes('intl') || c.includes('developed'))
                                                    return { symbol: 'VEA',  name: 'Vanguard FTSE Developed Markets ETF' };
  if (c.includes('emerging'))                       return { symbol: 'VWO',  name: 'Vanguard Emerging Markets ETF' };
  if (c.includes('small') || c.includes('mid'))    return { symbol: 'VB',   name: 'Vanguard Small-Cap ETF' };
  if (c.includes('reit') || c.includes('real estate')) return { symbol: 'VNQ', name: 'Vanguard Real Estate ETF' };
  if (c.includes('cash') || c.includes('money'))   return { symbol: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF' };
  if (c.includes('tips') || c.includes('inflation')) return { symbol: 'TIP', name: 'iShares TIPS Bond ETF' };
  return { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF' };
}

function computeRebalancePlan(
  positionData: PositionRow[],
  targetAllocation: Record<string, number>,
  totalEquity: number
): RebalancePlan {
  const bandPct = 5;
  const currentByClass: Record<string, number> = {};
  for (const p of positionData) {
    const k = p.assetClass.toLowerCase().trim();
    currentByClass[k] = (currentByClass[k] ?? 0) + p.equity;
  }

  const driftItems: DriftItem[] = Object.entries(targetAllocation).map(([rawClass, targetPct]) => {
    const k = rawClass.toLowerCase().trim();
    const currentEquity = currentByClass[k] ?? 0;
    const currentPct = totalEquity > 0 ? (currentEquity / totalEquity) * 100 : 0;
    const driftPct = parseFloat((currentPct - targetPct).toFixed(1));
    const dollarDelta = Math.round(currentEquity - (totalEquity * targetPct / 100));
    const status = (Math.abs(driftPct) < bandPct ? 'ok' : Math.abs(driftPct) < bandPct * 2 ? 'drift' : 'major') as 'ok' | 'drift' | 'major';
    return { assetClass: rawClass, targetPct, currentPct: parseFloat(currentPct.toFixed(1)), driftPct, dollarDelta, status };
  });

  const trades: RebalanceTrade[] = [];
  for (const drift of driftItems.filter(d => d.status !== 'ok')) {
    const k = drift.assetClass.toLowerCase().trim();

    if (drift.dollarDelta > 0) {
      // Overweight → sell: prefer TLH candidates first, then IRA/Roth, then taxable gains
      const candidates = positionData
        .filter(p => p.assetClass.toLowerCase().trim() === k)
        .sort((a, b) => {
          if (a.unrealizedPnlPct < 0 && b.unrealizedPnlPct >= 0) return -1;
          if (b.unrealizedPnlPct < 0 && a.unrealizedPnlPct >= 0) return 1;
          if (a.accountType !== 'taxable' && b.accountType === 'taxable') return -1;
          if (b.accountType !== 'taxable' && a.accountType === 'taxable') return 1;
          return b.equity - a.equity;
        });
      if (!candidates.length) continue;
      const pos = candidates[0];
      const shares = Math.max(1, Math.round(drift.dollarDelta / pos.currentPrice));
      let taxImpact: string | null = null;
      if (pos.accountType === 'taxable') {
        if (pos.unrealizedPnlPct < 0) {
          const lossAmt = Math.abs(Math.round(drift.dollarDelta * (Math.abs(pos.unrealizedPnlPct) / 100)));
          taxImpact = `TLH opportunity: ~$${lossAmt.toLocaleString()} harvestable loss`;
        } else if (pos.isShortTerm) {
          taxImpact = 'Short-term gain — ordinary income rate. Consider rebalancing in IRA/Roth first.';
        } else {
          taxImpact = 'Long-term gain — 15–20% capital gains rate';
        }
      } else {
        taxImpact = `No tax (${pos.accountType.toUpperCase()})`;
      }
      trades.push({ action: 'sell', symbol: pos.symbol, name: pos.name, shares, dollarAmount: Math.round(drift.dollarDelta), accountType: pos.accountType, reason: `${drift.assetClass} overweight by ${drift.driftPct.toFixed(1)}%`, taxImpact });

    } else {
      // Underweight → buy
      const classPositions = positionData.filter(p => p.assetClass.toLowerCase().trim() === k);
      const dollarToBuy = Math.abs(drift.dollarDelta);
      if (classPositions.length > 0) {
        const pos = classPositions.sort((a, b) => b.equity - a.equity)[0];
        const shares = Math.max(1, Math.round(dollarToBuy / pos.currentPrice));
        trades.push({ action: 'buy', symbol: pos.symbol, name: pos.name, shares, dollarAmount: Math.round(dollarToBuy), accountType: pos.accountType, reason: `${drift.assetClass} underweight by ${Math.abs(drift.driftPct).toFixed(1)}%`, taxImpact: null });
      } else {
        const etf = etfForAssetClass(drift.assetClass);
        trades.push({ action: 'buy', symbol: etf.symbol, name: etf.name, shares: 0, dollarAmount: Math.round(dollarToBuy), accountType: 'taxable', reason: `No ${drift.assetClass} position — new allocation needed`, taxImpact: null });
      }
    }
  }

  const hasSTGains = trades.some(t => t.taxImpact?.includes('Short-term'));
  const estimatedTaxNote = trades.length === 0
    ? 'Portfolio is within ±5% rebalancing bands — no trades needed.'
    : hasSTGains
      ? 'Some sells trigger short-term gains. Prioritize rebalancing in IRA/Roth accounts first.'
      : 'Rebalancing is tax-efficient (long-term gains only or tax-advantaged accounts).';

  return { driftItems, trades, totalRebalanceVolume: trades.reduce((s, t) => s + t.dollarAmount, 0), estimatedTaxNote, bandPct };
}

// ── Tax-Loss Harvesting (tax-loss-harvesting skill) ─────────────────────────

function replacementFor(symbol: string, assetClass: string): { symbol: string; rationale: string } {
  const pairs: Record<string, { symbol: string; rationale: string }> = {
    SPY:  { symbol: 'IVV',  rationale: 'iShares Core S&P 500 — same index, different fund family' },
    IVV:  { symbol: 'SPLG', rationale: 'SPDR Portfolio S&P 500 — lowest cost S&P 500 ETF' },
    VOO:  { symbol: 'SCHB', rationale: 'Schwab Total Market — similar large-cap exposure' },
    QQQ:  { symbol: 'QQQM', rationale: 'Invesco Nasdaq-100 — same index, lower cost version' },
    VTI:  { symbol: 'SCHB', rationale: 'Schwab Total Market — nearly identical total market exposure' },
    SCHB: { symbol: 'VTI',  rationale: 'Vanguard Total Stock Market — same broad exposure' },
    VXUS: { symbol: 'ACWX', rationale: 'iShares MSCI ACWI ex-US — similar international exposure' },
    EFA:  { symbol: 'VEA',  rationale: 'Vanguard Developed Markets — equivalent developed market index' },
    VEA:  { symbol: 'IEFA', rationale: 'iShares Core MSCI EAFE — same developed market exposure' },
    BND:  { symbol: 'AGG',  rationale: 'iShares US Aggregate Bond — same broad bond exposure' },
    AGG:  { symbol: 'BND',  rationale: 'Vanguard Total Bond Market — equivalent fixed income index' },
    TLT:  { symbol: 'IEF',  rationale: 'iShares 7–10yr Treasury — similar duration exposure' },
    GLD:  { symbol: 'IAU',  rationale: 'iShares Gold Trust — same gold exposure, lower fees' },
    IAU:  { symbol: 'GLDM', rationale: 'SPDR Gold MiniShares — same exposure, lowest expense ratio' },
  };
  if (pairs[symbol]) return pairs[symbol];
  const c = assetClass.toLowerCase();
  if (c.includes('tech'))       return { symbol: 'VGT', rationale: 'Vanguard IT ETF — broad tech sector, no single-stock wash sale risk' };
  if (c.includes('health'))     return { symbol: 'VHT', rationale: 'Vanguard Health Care ETF — same sector exposure' };
  if (c.includes('financial'))  return { symbol: 'VFH', rationale: 'Vanguard Financials ETF — maintains sector exposure' };
  if (c.includes('energy'))     return { symbol: 'VDE', rationale: 'Vanguard Energy ETF — same sector, diversified' };
  if (c.includes('consumer'))   return { symbol: 'VDC', rationale: 'Vanguard Consumer Staples ETF — similar exposure' };
  return { symbol: 'VTI', rationale: 'Vanguard Total Stock Market ETF — maintains equity exposure without wash sale risk' };
}

function computeTLH(positionData: PositionRow[]): TLHOpportunity[] {
  const today = new Date();
  return positionData
    .filter(p => p.accountType === 'taxable' && p.unrealizedPnlPct < -2)
    .map(p => {
      const unrealizedLoss = Math.round((p.currentPrice - p.avgCost) * p.shares);
      const holdingType: 'short-term' | 'long-term' = p.isShortTerm ? 'short-term' : 'long-term';
      const taxRate = holdingType === 'short-term' ? 0.22 : 0.15;
      const estimatedTaxSavings = Math.round(Math.abs(unrealizedLoss) * taxRate);
      const currentPositionValue = Math.round(p.currentPrice * p.shares);
      const effectiveSaleValue = currentPositionValue + estimatedTaxSavings;
      const rep = replacementFor(p.symbol, p.assetClass);
      const windowEnd = new Date(today);
      windowEnd.setDate(windowEnd.getDate() + 30);
      return {
        symbol: p.symbol, name: p.name, accountType: p.accountType,
        unrealizedLoss, unrealizedLossPct: p.unrealizedPnlPct,
        holdingType, estimatedTaxSavings,
        currentPositionValue, effectiveSaleValue,
        suggestedReplacement: rep.symbol, replacementRationale: rep.rationale,
        washSaleWindowEnd: windowEnd.toISOString().split('T')[0],
      };
    })
    .sort((a, b) => a.unrealizedLoss - b.unrealizedLoss); // largest loss first
}

// ── Retirement Projection (financial-plan skill) ─────────────────────────────

function computeRetirement(totalEquity: number, profile: InvestorProfile): RetirementProjection {
  const years = Math.max(0, profile.retirementAge - profile.currentAge);
  const annualContrib = profile.monthlyContribution * 12;

  function fv(rate: number): number {
    if (years === 0) return totalEquity;
    const lump = totalEquity * Math.pow(1 + rate, years);
    const contrib = rate > 0
      ? annualContrib * ((Math.pow(1 + rate, years) - 1) / rate)
      : annualContrib * years;
    return lump + contrib;
  }

  const projectedBase = Math.round(fv(0.07));
  return {
    currentPortfolioValue: totalEquity,
    projectedBase,
    projectedBear: Math.round(fv(0.04)),
    projectedBull: Math.round(fv(0.10)),
    yearsToRetirement: years,
    safeWithdrawalAnnual: Math.round(projectedBase * 0.04),
    monthlyIncome: Math.round(projectedBase * 0.04 / 12),
    assumedReturnPct: 7,
  };
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

  // ── Market data — parallel async fetches ────────────────────────
  const [quotesRaw, fxRaw, fundamentalsArr, ratingsArr] = await Promise.all([
    callDataService('get_batch_quotes', { symbols }),
    callDataService('get_quote', { symbol: 'SGD=X' }),
    Promise.all(symbols.map(sym => callDataService('get_fundamentals', { symbol: sym }))),
    Promise.all(symbols.map(sym => callDataService('get_analyst_ratings', { symbol: sym }))),
  ]);

  const quotes = (quotesRaw as Array<{ symbol: string; price: number }>) ?? [];
  const usdToSgdRate = (fxRaw as { price?: number } | null)?.price || DEFAULT_USD_TO_SGD_RATE;
  const priceMap: Record<string, number> = {};
  for (const q of quotes) if (q?.price) priceMap[q.symbol] = q.price;

  const fundamentalsMap: Record<string, unknown> = {};
  const ratingsMap: Record<string, unknown> = {};
  symbols.forEach((sym, i) => {
    if (fundamentalsArr[i]) fundamentalsMap[sym] = fundamentalsArr[i];
    if (ratingsArr[i]) ratingsMap[sym] = ratingsArr[i];
  });

  // ── Position data package ───────────────────────────────────────
  const positionData = positions.map(p => {
    const currency = positionCurrency(p.currency);
    const avgCost = toUsd(p.avgCost, currency, usdToSgdRate);
    const nativePrice = shouldPriceAtCostBasis(p.symbol) ? p.avgCost : priceMap[p.symbol] ?? p.avgCost;
    const price = toUsd(nativePrice, currency, usdToSgdRate);
    const equity = price * p.shares;
    return {
      symbol: p.symbol,
      name: p.name,
      shares: p.shares,
      avgCost,
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
7. Buy candidates MUST be bold and thematic — see rules below
8. Market events: use your own knowledge to identify relevant upcoming events (Fed, CPI, earnings, geopolitical, sector-specific) — not just FOMC. Name actual holdings affected in the portfolioImpact field.
9. Do NOT base buy recommendations on rebalancing to target allocation percentages — that is handled separately. Base all recommendations purely on fundamental, technical, and macro analysis.

BUY CANDIDATE RULES — be specific and thematic:
- Identify 3 high-conviction ideas: aim for a mix of 1-2 specific stocks AND 1 targeted sector/thematic ETF when an ETF is genuinely the best way to express a theme
- Base picks on structural market trends (AI compute, semiconductors, data center energy, nuclear/uranium, biotech, defense tech, critical minerals, etc.) — not just allocation gap-filling
- Every candidate must have a named macro/structural theme (e.g. "EUV semiconductor monopoly", "AI data center power demand", "uranium nuclear renaissance")
- For individual stocks: explain WHY this company outperforms peers in the theme
- For ETFs: only suggest them when they're the best vehicle for a diversified theme exposure, not as filler
- Include a 12-month price target (priceTarget12m) — use analyst consensus if available, else your own estimate
- Include analyst consensus rating and price target when known

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
      "symbol": "ASML",
      "name": "ASML Holding N.V.",
      "conviction": "high",
      "theme": "EUV lithography monopoly — every leading-edge AI chip needs ASML's machines",
      "summary": "Single sentence bold thesis — not generic",
      "reasoning": "Why THIS company specifically, what structural advantage, why now vs. 6 months ago",
      "catalysts": ["Specific near-term catalyst 1", "Structural tail 2"],
      "risks": ["Specific risk 1", "Specific risk 2"],
      "suggestedPortfolioWeightPct": 3,
      "priceTarget12m": 950,
      "analystConsensus": "Buy — 28 of 32 analysts",
      "analystPriceTarget": 950
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

## Today's Date
${today.toISOString().slice(0, 10)}

## Macro Events — Use Your Own Knowledge
Draw on your training knowledge to identify the 3–5 most important macro events in the next 60 days that are relevant to this portfolio. Consider: Fed meetings and rate decisions, CPI/PCE/jobs data releases, major earnings (for held symbols), geopolitical risks, sector-specific catalysts (AI chip export rules, pharma FDA dates, energy policy), currency and emerging-market risks. Populate the marketEvents array with your best assessment — do not limit yourself to FOMC only.

## Advisor History (learning context)
${historyContext}

Analyze this portfolio thoroughly and return your structured JSON recommendations.`;

  let rawContent: string;
  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = response.content.find(b => b.type === 'text');
    rawContent = block?.type === 'text' ? block.text : '{}';
    // Strip markdown fences if Claude wraps the JSON
    rawContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Anthropic API error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  let raw: { executiveSummary?: string; recommendations?: Array<Record<string, unknown>>; buyCandidates?: Array<Record<string, unknown>>; marketEvents?: Array<Record<string, unknown>> };
  try {
    raw = JSON.parse(rawContent);
  } catch {
    return NextResponse.json({ error: 'Failed to parse AI response as JSON' }, { status: 502 });
  }

  // ── Skill integrations (computed server-side, no GPT needed) ──────
  // portfolio-rebalance skill: drift analysis + specific trade quantities
  const rebalancePlan = profile?.targetAllocation && Object.keys(profile.targetAllocation).length > 0
    ? computeRebalancePlan(positionData, profile.targetAllocation, totalEquity)
    : undefined;

  // tax-loss-harvesting skill: taxable positions with unrealized losses > 2%
  const tlhRaw = computeTLH(positionData);
  const tlhOpportunities = tlhRaw.length > 0 ? tlhRaw : undefined;

  // financial-plan skill: retirement projection (base/bear/bull)
  const retirementProjection = profile ? computeRetirement(totalEquity, profile) : undefined;

  const run: AdvisorRun = {
    id: crypto.randomUUID(),
    timestamp: today.toISOString(),
    executiveSummary: (raw.executiveSummary as string) ?? '',
    recommendations: (raw.recommendations ?? []).map(r => ({
      symbol: r.symbol as string,
      priceAtAnalysis: positionData.find(p => p.symbol === r.symbol)?.currentPrice ?? 0,
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
      theme: (c.theme as string | null) ?? null,
      summary: (c.summary as string) ?? '',
      reasoning: (c.reasoning as string) ?? '',
      catalysts: (c.catalysts as string[]) ?? [],
      risks: (c.risks as string[]) ?? [],
      suggestedPortfolioWeightPct: (c.suggestedPortfolioWeightPct as number) ?? 3,
      priceTarget12m: (c.priceTarget12m as number | null) ?? null,
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
    rebalancePlan,
    tlhOpportunities,
    retirementProjection,
  };

  return NextResponse.json(run);
}
