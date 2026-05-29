---
description: Find tax-loss harvesting opportunities in taxable accounts
argument-hint: "[optional: minimum loss threshold in dollars, default $500]"
---

Load the `tax-loss-harvesting` skill. Focus on taxable account positions only.

Filter to positions with unrealized losses. For each candidate:
- Show the unrealized loss amount and holding period
- Check if a 30-day wash-sale window is open
- Suggest a substantially similar replacement security (different ETF tracking the same index, or a peer stock in the same sector)
- Calculate the estimated tax savings at the user's rate from `config/targets.yaml`

Minimum loss threshold: use the argument if provided, otherwise $500.

Do not recommend selling positions where the loss is short-term and would be offset by imminent wash-sale risk from prior purchases.
