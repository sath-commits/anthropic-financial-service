---
description: One-page portfolio health snapshot — quick status check without full analysis
argument-hint: ""
---

Load the `portfolio-snapshot` skill to generate a compact health check.

Produce a single-page markdown report covering:
- **Header**: total portfolio value, day change, YTD change (if available)
- **Allocation bar**: current weights vs. targets; highlight bands breached in bold
- **5 biggest winners / 5 biggest losers** (by unrealized %)
- **TLH flags**: positions with > $500 unrealized loss in taxable accounts
- **Earnings this week**: any held positions reporting in next 7 days
- **Rebalance needed?**: yes/no with 1-line summary

This command should complete in under 60 seconds. Use cached data if a full portfolio fetch would take too long. No detailed analysis — save that for `/portfolio` or `/morning-digest`.
