"""
Robinhood MCP Server — portfolio reads + order execution (with DRY_RUN default).
Run: python3 server.py

Credentials via env vars: RH_USERNAME, RH_PASSWORD
Safety: DRY_RUN=true by default. Set DRY_RUN=false only for live trading.
"""

import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from mcp.server.fastmcp import FastMCP
from risk_guard import RiskGuard, count_orders_today

mcp = FastMCP("robinhood")

DRY_RUN = os.getenv("DRY_RUN", "true").lower() != "false"
MAX_POSITION_PCT = float(os.getenv("MAX_POSITION_PCT", "0.10"))
DAILY_LOSS_LIMIT_PCT = float(os.getenv("DAILY_LOSS_LIMIT_PCT", "0.02"))

TRADE_LOG = Path.home() / ".portfolio-agent" / "trade-log.jsonl"
TRADE_LOG.parent.mkdir(parents=True, exist_ok=True)

_rh_session = None
_last_call_ts = 0.0
_CALL_INTERVAL = 2.0  # min seconds between Robinhood API calls
_call_count = 0
_CALL_BUDGET = 30


def _rh():
    global _rh_session
    if _rh_session is None:
        import robin_stocks.robinhood as rh
        username = os.environ["RH_USERNAME"]
        password = os.environ["RH_PASSWORD"]
        rh.login(username, password)
        _rh_session = rh
    return _rh_session


def _rate_limit():
    global _last_call_ts, _call_count
    _call_count += 1
    if _call_count > _CALL_BUDGET:
        time.sleep(60)
        _call_count = 0
    elapsed = time.time() - _last_call_ts
    if elapsed < _CALL_INTERVAL:
        time.sleep(_CALL_INTERVAL - elapsed)
    _last_call_ts = time.time()


def _log_order(entry: dict):
    with open(TRADE_LOG, "a") as f:
        f.write(json.dumps(entry) + "\n")


# ── Read tools ────────────────────────────────────────────────────────────────

@mcp.tool()
def get_portfolio() -> list[dict]:
    """All current positions: symbol, shares, average cost, current price, unrealized P&L, weight."""
    _rate_limit()
    rh = _rh()
    positions = rh.account.build_holdings()
    total_value = sum(
        float(p.get("equity", 0)) for p in positions.values()
    )
    result = []
    for sym, p in positions.items():
        equity = float(p.get("equity", 0))
        cost = float(p.get("average_buy_price", 0))
        price = float(p.get("price", 0))
        shares = float(p.get("quantity", 0))
        result.append({
            "symbol": sym,
            "shares": shares,
            "average_cost": cost,
            "current_price": price,
            "equity": equity,
            "unrealized_pnl": round(equity - cost * shares, 2),
            "unrealized_pnl_pct": round((price / cost - 1) * 100, 2) if cost > 0 else None,
            "portfolio_weight_pct": round(equity / total_value * 100, 1) if total_value > 0 else None,
        })
    return sorted(result, key=lambda x: x["equity"], reverse=True)


@mcp.tool()
def get_account() -> dict:
    """Account summary: buying power, total equity, cash, day's P&L."""
    _rate_limit()
    rh = _rh()
    profile = rh.profiles.load_account_profile()
    portfolio = rh.profiles.load_portfolio_profile()
    return {
        "buying_power": float(profile.get("buying_power", 0)),
        "cash": float(profile.get("cash", 0)),
        "total_equity": float(portfolio.get("equity", 0)),
        "equity_previous_close": float(portfolio.get("equity_previous_close", 0)),
        "day_change": round(
            float(portfolio.get("equity", 0)) - float(portfolio.get("equity_previous_close", 0)), 2
        ),
        "day_change_pct": round(
            (float(portfolio.get("equity", 0)) / float(portfolio.get("equity_previous_close", 1)) - 1) * 100, 2
        ),
        "excess_margin": float(profile.get("excess_margin", 0)),
    }


@mcp.tool()
def get_order_history(days: int = 30) -> list[dict]:
    """Recent order history (filled and cancelled) for the past N days."""
    _rate_limit()
    rh = _rh()
    orders = rh.orders.get_all_stock_orders()
    result = []
    for o in orders[:50]:  # last 50 orders max
        result.append({
            "id": o.get("id"),
            "symbol": o.get("instrument_data", {}).get("symbol") if isinstance(o.get("instrument_data"), dict) else None,
            "side": o.get("side"),
            "type": o.get("type"),
            "quantity": o.get("quantity"),
            "average_price": o.get("average_price"),
            "state": o.get("state"),
            "created_at": o.get("created_at"),
        })
    return result


@mcp.tool()
def get_quotes(symbols: list[str]) -> list[dict]:
    """Live bid/ask quotes from Robinhood for a list of symbols."""
    _rate_limit()
    rh = _rh()
    quotes = rh.stocks.get_quotes(symbols)
    results = []
    for q in (quotes or []):
        results.append({
            "symbol": q.get("symbol"),
            "ask_price": q.get("ask_price"),
            "bid_price": q.get("bid_price"),
            "last_trade_price": q.get("last_trade_price"),
            "last_extended_hours_trade_price": q.get("last_extended_hours_trade_price"),
        })
    return results


# ── Write tools (always DRY_RUN by default) ───────────────────────────────────

@mcp.tool()
def place_order(
    symbol: str,
    side: str,
    quantity: float,
    order_type: str = "market",
    limit_price: Optional[float] = None,
) -> dict:
    """
    Propose or execute a stock order.

    In DRY_RUN mode (default): formats the order intent, runs RiskGuard checks,
    logs to ~/.portfolio-agent/trade-log.jsonl, and returns a trade_approval_request
    without touching the Robinhood API.

    Live execution only happens when DRY_RUN env var is explicitly set to 'false'
    AND the RiskGuard clears the order.

    side: 'buy' | 'sell'
    order_type: 'market' | 'limit'
    """
    # Gather account context for risk checks
    try:
        acct = get_account()
        total_equity = acct["total_equity"]
        day_change_pct = acct["day_change_pct"] / 100
    except Exception:
        total_equity = 1.0
        day_change_pct = 0.0

    # Get estimated price
    estimated_price = limit_price or 0.0
    if not estimated_price:
        try:
            _rate_limit()
            rh = _rh()
            q = rh.stocks.get_latest_price(symbol)
            estimated_price = float(q[0]) if q else 0.0
        except Exception:
            pass

    orders_today = count_orders_today(TRADE_LOG)

    guard = RiskGuard(
        max_position_pct=MAX_POSITION_PCT,
        max_daily_loss_pct=DAILY_LOSS_LIMIT_PCT,
    )
    approved, reason = guard.check_order(
        symbol=symbol,
        side=side,
        quantity=quantity,
        estimated_price=estimated_price,
        portfolio_total_value=total_equity,
        portfolio_day_change_pct=day_change_pct,
        orders_placed_today=orders_today,
    )

    order_intent = {
        "symbol": symbol.upper(),
        "side": side,
        "quantity": quantity,
        "order_type": order_type,
        "limit_price": limit_price,
        "estimated_price": estimated_price,
        "estimated_value": round(quantity * estimated_price, 2),
        "risk_check": "PASSED" if approved else f"BLOCKED: {reason}",
        "dry_run": DRY_RUN,
        "date": datetime.now().isoformat(),
    }

    if not approved:
        _log_order({**order_intent, "outcome": "blocked_by_risk_guard"})
        return {
            "type": "order_blocked",
            "reason": reason,
            "order": order_intent,
        }

    if DRY_RUN:
        _log_order({**order_intent, "outcome": "dry_run_logged"})
        return {
            "type": "trade_approval_request",
            "message": (
                "DRY_RUN mode: order validated but NOT submitted to Robinhood. "
                "Review the order below and confirm to execute live."
            ),
            "order": order_intent,
            "requires_confirmation": True,
        }

    # Live execution
    _rate_limit()
    rh = _rh()
    try:
        if side == "buy":
            if order_type == "limit" and limit_price:
                result = rh.orders.order_buy_limit(symbol, quantity, limit_price)
            else:
                result = rh.orders.order_buy_market(symbol, quantity)
        else:
            if order_type == "limit" and limit_price:
                result = rh.orders.order_sell_limit(symbol, quantity, limit_price)
            else:
                result = rh.orders.order_sell_market(symbol, quantity)

        outcome = {"outcome": "submitted", "robinhood_id": result.get("id"), "state": result.get("state")}
        _log_order({**order_intent, **outcome})
        return {**order_intent, **outcome}

    except Exception as e:
        _log_order({**order_intent, "outcome": "error", "error": str(e)})
        return {"error": str(e), "order": order_intent}


@mcp.tool()
def cancel_order(order_id: str) -> dict:
    """Cancel a pending Robinhood order by ID."""
    if DRY_RUN:
        return {"message": f"DRY_RUN: would cancel order {order_id}. Set DRY_RUN=false to execute."}
    _rate_limit()
    rh = _rh()
    result = rh.orders.cancel_stock_order(order_id)
    return result or {"status": "cancelled", "order_id": order_id}


if __name__ == "__main__":
    mcp.run()
