---
description: Post-earnings analysis for a held position
argument-hint: "<ticker symbol>"
---

Load the `earnings-analysis` skill for the provided ticker.

Gather data:
- Earnings history (last 4 quarters actuals vs. estimates) via `mcp__market-data__get_earnings_history`
- Recent news headlines around the earnings date via `mcp__market-data__get_news`
- Current fundamentals and analyst ratings via `mcp__market-data__get_fundamentals` and `mcp__market-data__get_analyst_ratings`

Produce an earnings update note covering:
1. Beat/miss vs. EPS and revenue estimates
2. Key guidance commentary (from news if earnings transcript unavailable)
3. Analyst reaction (rating changes, price target revisions)
4. Thesis impact: does this strengthen, weaken, or leave unchanged the investment case?
5. Recommended action: hold, add, trim, or exit

If no ticker is provided, ask for one.
