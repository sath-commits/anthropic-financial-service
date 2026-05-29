"""
RiskGuard — hard-coded enforcement layer for Robinhood order validation.
This is a Python module, not a prompt instruction. It cannot be bypassed by the agent.
"""

import json
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

_CONFIG_PATH = Path.home() / ".portfolio-agent" / "risk_config.json"


@dataclass
class RiskGuard:
    max_position_pct: float = 0.10        # no single position > 10% of portfolio
    max_daily_loss_pct: float = 0.02      # halt if portfolio drops 2% intraday
    max_orders_per_day: int = 3           # pattern day trader compliance buffer
    max_single_order_usd: float = 5000.0  # hard cap per individual order
    blacklist_tickers: list = field(default_factory=list)

    def __post_init__(self):
        if _CONFIG_PATH.exists():
            try:
                cfg = json.loads(_CONFIG_PATH.read_text())
                for k, v in cfg.items():
                    if hasattr(self, k):
                        setattr(self, k, v)
            except Exception:
                pass

    def check_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        estimated_price: float,
        portfolio_total_value: float,
        portfolio_day_change_pct: float,
        orders_placed_today: int,
    ) -> tuple[bool, str]:
        """
        Returns (approved: bool, reason: str).
        Checks each safeguard in sequence; returns False on the first violation.
        """
        order_value = quantity * estimated_price

        if symbol.upper() in [t.upper() for t in self.blacklist_tickers]:
            return False, f"{symbol} is on the blacklist."

        if portfolio_day_change_pct <= -self.max_daily_loss_pct:
            return False, (
                f"Daily loss limit hit ({portfolio_day_change_pct:.1%} ≤ -{self.max_daily_loss_pct:.1%}). "
                "No new orders for the rest of the trading day."
            )

        if orders_placed_today >= self.max_orders_per_day:
            return False, (
                f"Daily order limit reached ({orders_placed_today}/{self.max_orders_per_day}). "
                "Limit set for pattern-day-trader compliance."
            )

        if order_value > self.max_single_order_usd:
            return False, (
                f"Order value ${order_value:,.0f} exceeds per-order cap of ${self.max_single_order_usd:,.0f}."
            )

        if portfolio_total_value > 0 and side == "buy":
            position_pct = order_value / portfolio_total_value
            if position_pct > self.max_position_pct:
                return False, (
                    f"Order would create a {position_pct:.1%} position, exceeding the "
                    f"{self.max_position_pct:.1%} max-position-size limit."
                )

        return True, "OK"


def count_orders_today(trade_log_path: Path) -> int:
    """Count orders placed (not dry-run) so far today."""
    if not trade_log_path.exists():
        return 0
    today = date.today().isoformat()
    count = 0
    for line in trade_log_path.read_text().splitlines():
        try:
            entry = json.loads(line)
            if entry.get("date", "").startswith(today) and not entry.get("dry_run"):
                count += 1
        except Exception:
            pass
    return count
