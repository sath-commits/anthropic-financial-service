---
description: Show upcoming catalysts — earnings, ex-dividend dates, and events — for held positions
argument-hint: "[optional: number of days to look ahead, default 30]"
---

Load the `catalyst-calendar` skill.

Pull the current portfolio holdings, then use `mcp__market-data__get_earnings_calendar` to build a catalyst timeline. For each position:
- Earnings date and consensus EPS estimate
- Analyst price target vs. current price
- Recent news that may signal a pre-earnings move

Sort by date ascending. Flag any positions reporting within 7 days as high-urgency.

Lookahead window: use the argument if provided, otherwise 30 days.
