---
description: Daily portfolio digest — P&L, top movers, sector exposure, upcoming earnings, and macro pulse
argument-hint: "[optional: focus area such as 'tech positions' or 'fixed income']"
---

Load the `portfolio-snapshot` skill and generate a morning digest covering:

1. **Portfolio summary** — total value, day change ($ and %), vs. S&P 500 today
2. **Top movers** — 3 biggest gainers and losers in the portfolio with a one-line reason
3. **Asset allocation** — current weights vs. targets from `config/targets.yaml`; flag any band breaches
4. **Upcoming earnings** — any held positions reporting in the next 14 days with EPS estimate
5. **Macro pulse** — current Fed Funds rate, latest CPI print, 10Y yield from FRED
6. **Action items** — TLH opportunities > $500 unrealized loss, rebalancing trades needed

Use `mcp__market-data__get_batch_quotes` to price the portfolio and `mcp__robinhood__get_portfolio` if Robinhood credentials are available. Fall back to portfolio data from context if no live connection.

If a focus area is provided, expand that section and compress others.
