---
description: Track and update investment theses for held positions
argument-hint: "[optional: ticker symbol to focus on, or 'all' to review all]"
---

Load the `thesis-tracker` skill.

If a specific ticker is provided:
- Pull the latest fundamentals with `mcp__market-data__get_fundamentals`
- Pull recent news with `mcp__market-data__get_news`
- Pull analyst ratings with `mcp__market-data__get_analyst_ratings`
- Update the thesis scorecard: original thesis, current status, key catalysts, risks, conviction level

If 'all' or no argument is provided, show a summary scorecard for every position in the portfolio with conviction ratings and whether the original thesis is intact, evolving, or broken.
