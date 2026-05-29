---
description: Screen for new stock ideas based on valuation, fundamentals, or sector criteria
argument-hint: "[optional: criteria such as 'value stocks PE < 15' or 'dividend yield > 3% tech sector']"
---

Load the `idea-generation` skill.

Parse any criteria from the argument or ask the user for screening parameters:
- Sector or industry filter
- Valuation (max PE, P/B, EV/EBITDA)
- Income (min dividend yield)
- Quality (max debt/equity, min ROE)
- Size (min market cap)

Use `mcp__market-data__screen_stocks` to run the initial filter, then enrich the top results with analyst ratings and price targets via `mcp__market-data__get_analyst_ratings`.

Present a ranked shortlist of 5–10 ideas with: symbol, name, sector, key metrics, analyst consensus, and a one-sentence investment rationale for each.

Cross-check against the current portfolio to flag if a screened idea is already held (in which case suggest adding to thesis vs. initiating new position).
