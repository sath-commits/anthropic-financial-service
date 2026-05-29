# Personal Portfolio Agent — managed-agent template

## Overview

Personal AI investment management: daily digest, portfolio rebalancing, tax-loss harvesting, thesis tracking, earnings alerts, and stock screening. Uses free market data (yfinance + FRED) and your Robinhood account via the unofficial `robin_stocks` library.

Same source as the [`personal-portfolio-agent`](../../plugins/agent-plugins/personal-portfolio-agent) plugin — this directory is the Managed Agent cookbook for `POST /v1/agents`.

## Setup

```bash
# 1. Install MCP server dependencies
pip install -r ../../mcp-servers/market-data/requirements.txt
pip install -r ../../mcp-servers/robinhood/requirements.txt

# 2. Configure credentials
cp ../../mcp-servers/robinhood/.env.example ~/.portfolio-agent/.env
# Edit ~/.portfolio-agent/.env with your Robinhood username/password

# 3. Get a free FRED API key at https://fred.stlouisfed.org/docs/api/api_key.html
export FRED_API_KEY=your_key_here

# 4. Deploy (leave DRY_RUN=true until you've tested the agent)
export ANTHROPIC_API_KEY=sk-ant-...
export RH_USERNAME=your@email.com
export RH_PASSWORD=yourpassword
export DRY_RUN=true
../../scripts/deploy-managed-agent.sh personal-portfolio-agent
```

## Steering events

See [`steering-examples.json`](./steering-examples.json). Send any of these as a steering event to the deployed agent, or phrase naturally — the agent understands intent.

## Security tiers

| Tier | Agent | Tools | Data access |
|------|-------|-------|-------------|
| Fetcher (read-only) | `portfolio-data-fetcher` | Read, MCP read tools | Robinhood portfolio + market-data |
| Analyzer (read-only) | `portfolio-analyzer` | Read, Grep | Skills only — no live data |
| **Writer** (Write-holder) | `portfolio-report-writer` | Read, **Write**, Edit | None — formats analyzer output |

The orchestrator holds the Robinhood write tools. Trade execution only happens after explicit human confirmation; the subagents cannot trigger it.

## Safety notes

- **DRY_RUN=true by default.** Orders are logged to `~/.portfolio-agent/trade-log.jsonl` but never submitted to Robinhood until you explicitly set `DRY_RUN=false`.
- **RiskGuard** (in `mcp-servers/robinhood/risk_guard.py`) enforces position-size limits, daily loss limits, PDT compliance, and per-order caps at the Python level — not just in prompts.
- **`robin_stocks` uses the unofficial Robinhood API.** Robinhood may rate-limit or block accounts making excessive calls. The server enforces a 2-second minimum between calls and a 30-call session budget.
- **Credentials:** Store in environment variables or `~/.portfolio-agent/.env` only. Never commit to git (`.env` is gitignored).

## Adjusting risk limits

Edit `~/.portfolio-agent/risk_config.json` (created on first run) or set env vars:

```json
{
  "max_position_pct": 0.10,
  "max_daily_loss_pct": 0.02,
  "max_orders_per_day": 3,
  "max_single_order_usd": 5000.0,
  "blacklist_tickers": ["GME", "AMC"]
}
```
