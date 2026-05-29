---
description: Generate or update a personal financial plan — retirement, savings rate, and cash-flow projections
argument-hint: "[optional: scenario to model such as 'retire at 55' or 'add $1000/month']"
---

Load the `financial-plan` skill.

Before running the plan, gather context:
- Current portfolio value (from `mcp__robinhood__get_account` or user input)
- Monthly contribution rate and income (ask if not in context)
- Target retirement age and spending goal

Run Monte Carlo projections for three scenarios: base case, optimistic (+1% annual return), and conservative (-1% annual return). Show probability of meeting retirement goal for each.

If a specific scenario is provided as an argument, model that scenario in detail.
