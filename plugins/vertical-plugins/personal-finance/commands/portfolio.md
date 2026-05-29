---
description: Show current portfolio holdings with live prices, P&L, and allocation weights
argument-hint: "[optional: account filter such as 'taxable' or 'IRA']"
---

Fetch the current portfolio using `mcp__robinhood__get_portfolio` (or ask the user to paste their holdings if no live connection). Price every position with `mcp__market-data__get_batch_quotes`.

Display a clean table with:
- Symbol, name, shares, average cost, current price
- Unrealized P&L ($ and %)
- Portfolio weight %
- Holding period (short-term / long-term)

Then load the `portfolio-rebalance` skill to check allocation drift vs. `config/targets.yaml`.
