# Portfolio Snapshot Skill

## Purpose

Generate a compact, one-page portfolio health snapshot using free market data. Designed for quick daily checks — not a replacement for a full rebalancing or TLH analysis.

## Trigger conditions

Invoke this skill when the user asks for:
- A quick portfolio check or health check
- "How's my portfolio today?"
- A morning digest or daily briefing
- A snapshot (vs. a full portfolio review)

## Inputs required

- Portfolio positions (from `mcp__robinhood__get_portfolio` or user-provided list)
- Live prices (from `mcp__market-data__get_batch_quotes`)
- Target allocation (from `plugins/vertical-plugins/personal-finance/config/targets.yaml`)

## Output format

Produce a single markdown document:

```
## Portfolio Snapshot — {date}

**Total Value:** ${total:,.0f}   **Day Change:** ${day_change:+,.0f} ({day_change_pct:+.1f}%)

### Allocation vs. Target
| Asset Class      | Target | Current | Drift   | Status  |
|-----------------|--------|---------|---------|---------|
| US Large Cap    | 40%    | 43.2%   | +3.2%   | ✓ OK    |
| Bonds           | 20%    | 14.1%   | -5.9%   | ⚠ Drift |
...

### Top Movers Today
**Gainers:** NVDA +3.1% · AAPL +1.8% · MSFT +1.2%
**Losers:**  INTC -2.4% · DIS -1.9% · BA -1.1%

### Flags
- 🔴 TLH opportunity: INTC −$1,240 unrealized loss (taxable, long-term)
- 🟡 Earnings this week: NVDA reports Thu 5/30 (est. $0.68 EPS)
- 🟡 Rebalancing needed: Bonds underweight by 5.9%
```

## Constraints

- Complete within 60 seconds — avoid fetching full fundamentals for every position
- Use batch quotes, not individual calls, to minimize API round-trips
- If allocation targets are not configured, skip the allocation section and note it
- Never show individual tax basis or account numbers in the output
- Flag items, don't prescribe — keep action items to 1 sentence each

## Asset class classification

Map tickers to asset classes using this heuristic (adjust for user's actual holdings):

| ETF/Ticker pattern | Asset class |
|-------------------|-------------|
| SPY, VOO, IVV, SCHB, VTI | US Large Cap |
| IWM, VBR, VIOO | US Small/Mid |
| VEA, EFA, IEFA | International Developed |
| VWO, EEM | Emerging Markets |
| BND, AGG, TLT, IEF | Bonds |
| Individual stocks (non-ETF) | Classify by sector; default to US Large Cap if market cap > $10B |
| Cash, SGOV, BIL, SHV | Cash |
| REIT, GLD, BTC | Alternatives |
