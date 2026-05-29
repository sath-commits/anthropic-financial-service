"""
Market Data MCP Server — free data via yfinance + FRED + SEC EDGAR.
Run: python3 server.py
"""

import json
import os
from datetime import datetime, timedelta
from typing import Optional

import yfinance as yf
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("market-data")

FRED_API_KEY = os.getenv("FRED_API_KEY", "")


def _ticker(symbol: str):
    return yf.Ticker(symbol.upper())


# ── Quotes & prices ──────────────────────────────────────────────────────────

@mcp.tool()
def get_quote(symbol: str) -> dict:
    """Current price, volume, day range, market cap, and 52-week range for a ticker."""
    t = _ticker(symbol)
    info = t.fast_info
    try:
        return {
            "symbol": symbol.upper(),
            "price": info.last_price,
            "open": info.open,
            "day_high": info.day_high,
            "day_low": info.day_low,
            "volume": info.three_month_average_volume,
            "market_cap": info.market_cap,
            "fifty_two_week_high": info.fifty_two_week_high,
            "fifty_two_week_low": info.fifty_two_week_low,
            "currency": info.currency,
        }
    except Exception as e:
        return {"error": str(e), "symbol": symbol.upper()}


@mcp.tool()
def get_price_history(symbol: str, period: str = "1y", interval: str = "1d") -> list[dict]:
    """
    OHLCV history for a ticker.
    period: 1d 5d 1mo 3mo 6mo 1y 2y 5y 10y ytd max
    interval: 1m 5m 15m 30m 60m 1d 1wk 1mo
    """
    t = _ticker(symbol)
    df = t.history(period=period, interval=interval)
    df.index = df.index.astype(str)
    return df[["Open", "High", "Low", "Close", "Volume"]].rename(
        columns={"Open": "open", "High": "high", "Low": "low", "Close": "close", "Volume": "volume"}
    ).reset_index().rename(columns={"Date": "date", "Datetime": "date"}).to_dict(orient="records")


@mcp.tool()
def get_batch_quotes(symbols: list[str]) -> list[dict]:
    """Current prices for a list of tickers — useful for pricing a full portfolio at once."""
    results = []
    for sym in symbols:
        results.append(get_quote(sym))
    return results


# ── Fundamentals ─────────────────────────────────────────────────────────────

@mcp.tool()
def get_fundamentals(symbol: str) -> dict:
    """Key fundamentals: P/E, EPS, revenue, margins, debt/equity, FCF yield, dividend yield."""
    t = _ticker(symbol)
    info = t.info
    return {
        "symbol": symbol.upper(),
        "name": info.get("longName"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "peg_ratio": info.get("pegRatio"),
        "price_to_book": info.get("priceToBook"),
        "price_to_sales": info.get("priceToSalesTrailing12Months"),
        "eps_trailing": info.get("trailingEps"),
        "eps_forward": info.get("forwardEps"),
        "revenue": info.get("totalRevenue"),
        "revenue_growth": info.get("revenueGrowth"),
        "gross_margins": info.get("grossMargins"),
        "operating_margins": info.get("operatingMargins"),
        "profit_margins": info.get("profitMargins"),
        "debt_to_equity": info.get("debtToEquity"),
        "current_ratio": info.get("currentRatio"),
        "return_on_equity": info.get("returnOnEquity"),
        "free_cashflow": info.get("freeCashflow"),
        "dividend_yield": info.get("dividendYield"),
        "payout_ratio": info.get("payoutRatio"),
        "beta": info.get("beta"),
        "short_ratio": info.get("shortRatio"),
        "description": info.get("longBusinessSummary"),
    }


# ── Analyst ratings ───────────────────────────────────────────────────────────

@mcp.tool()
def get_analyst_ratings(symbol: str) -> dict:
    """Analyst consensus: buy/hold/sell counts, mean rating, and price targets."""
    t = _ticker(symbol)
    info = t.info
    recs = t.recommendations
    rec_summary = {}
    if recs is not None and not recs.empty:
        # Latest period summary
        latest = recs.tail(1)
        for col in ["strongBuy", "buy", "hold", "sell", "strongSell"]:
            if col in latest.columns:
                rec_summary[col] = int(latest[col].values[0])
    return {
        "symbol": symbol.upper(),
        "recommendation": info.get("recommendationKey"),
        "mean_rating": info.get("recommendationMean"),
        "number_of_analysts": info.get("numberOfAnalystOpinions"),
        "target_price_mean": info.get("targetMeanPrice"),
        "target_price_high": info.get("targetHighPrice"),
        "target_price_low": info.get("targetLowPrice"),
        "target_price_median": info.get("targetMedianPrice"),
        "current_price": info.get("currentPrice"),
        "upside_pct": (
            round((info["targetMeanPrice"] / info["currentPrice"] - 1) * 100, 1)
            if info.get("targetMeanPrice") and info.get("currentPrice")
            else None
        ),
        "recent_consensus": rec_summary,
    }


# ── Earnings ──────────────────────────────────────────────────────────────────

@mcp.tool()
def get_earnings_history(symbol: str) -> list[dict]:
    """Last 4 quarters of earnings: actual vs. estimate and surprise percentage."""
    t = _ticker(symbol)
    df = t.earnings_dates
    if df is None or df.empty:
        return []
    df = df.dropna(subset=["EPS Estimate", "Reported EPS"]).head(8)
    records = []
    for date, row in df.iterrows():
        estimate = row.get("EPS Estimate")
        actual = row.get("Reported EPS")
        surprise_pct = (
            round((actual - estimate) / abs(estimate) * 100, 1)
            if estimate and estimate != 0
            else None
        )
        records.append({
            "date": str(date.date()),
            "eps_estimate": estimate,
            "eps_actual": actual,
            "surprise_pct": surprise_pct,
            "surprise_direction": "beat" if surprise_pct and surprise_pct > 0 else ("miss" if surprise_pct and surprise_pct < 0 else "in-line"),
        })
    return records


@mcp.tool()
def get_earnings_calendar(symbols: list[str]) -> list[dict]:
    """Upcoming earnings dates for a list of tickers (next 60 days)."""
    results = []
    for sym in symbols:
        try:
            t = yf.Ticker(sym.upper())
            info = t.info
            next_date = info.get("earningsDate") or info.get("earningsTimestamp")
            if next_date:
                if isinstance(next_date, (int, float)):
                    next_date = datetime.fromtimestamp(next_date).strftime("%Y-%m-%d")
                elif isinstance(next_date, list) and next_date:
                    next_date = str(next_date[0])
                results.append({
                    "symbol": sym.upper(),
                    "earnings_date": str(next_date),
                    "eps_estimate": info.get("epsForward"),
                })
        except Exception:
            pass
    results.sort(key=lambda x: x.get("earnings_date", "9999"))
    return results


# ── News ──────────────────────────────────────────────────────────────────────

@mcp.tool()
def get_news(symbol: str, days: int = 7) -> list[dict]:
    """Recent news headlines for a ticker from Yahoo Finance."""
    t = _ticker(symbol)
    news = t.news or []
    cutoff = datetime.now() - timedelta(days=days)
    results = []
    for item in news:
        ts = item.get("providerPublishTime", 0)
        pub = datetime.fromtimestamp(ts)
        if pub >= cutoff:
            results.append({
                "title": item.get("title"),
                "publisher": item.get("publisher"),
                "published": pub.strftime("%Y-%m-%d %H:%M"),
                "url": item.get("link"),
                "type": item.get("type"),
            })
    return results


# ── Macro data (FRED) ─────────────────────────────────────────────────────────

@mcp.tool()
def get_macro_indicator(series_id: str, limit: int = 12) -> list[dict]:
    """
    FRED macroeconomic data. Requires FRED_API_KEY env var (free at fred.stlouisfed.org).
    Common series: FEDFUNDS, CPIAUCSL, UNRATE, GDP, T10Y2Y, BAMLH0A0HYM2, DGS10
    """
    if not FRED_API_KEY:
        return [{"error": "FRED_API_KEY env var not set. Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html"}]
    import requests
    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": series_id,
        "api_key": FRED_API_KEY,
        "file_type": "json",
        "sort_order": "desc",
        "limit": limit,
    }
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()
    return [
        {"date": obs["date"], "value": obs["value"]}
        for obs in data.get("observations", [])
        if obs["value"] != "."
    ]


# ── Stock screener ────────────────────────────────────────────────────────────

@mcp.tool()
def screen_stocks(
    sector: Optional[str] = None,
    max_pe: Optional[float] = None,
    min_dividend_yield: Optional[float] = None,
    max_debt_to_equity: Optional[float] = None,
    min_market_cap_b: Optional[float] = None,
    symbols: Optional[list[str]] = None,
) -> list[dict]:
    """
    Basic stock screener. Filters a provided list of symbols (or an S&P 500 sample if none)
    by PE ratio, dividend yield, debt/equity, and sector.
    min_market_cap_b is in billions USD.
    """
    # Default to a curated watchlist if no symbols provided
    if not symbols:
        symbols = [
            "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "BRK-B",
            "JPM", "JNJ", "V", "PG", "UNH", "HD", "MA", "DIS", "BAC", "ADBE",
            "CRM", "NFLX", "PYPL", "INTC", "AMD", "QCOM", "TXN", "AVGO", "MU",
            "WMT", "KO", "PEP", "MCD", "SBUX", "NKE", "COST", "TGT",
        ]

    results = []
    for sym in symbols:
        try:
            info = yf.Ticker(sym).info
            pe = info.get("trailingPE")
            div = info.get("dividendYield") or 0
            de = info.get("debtToEquity")
            mcap = info.get("marketCap") or 0
            sec = info.get("sector", "")

            if sector and sector.lower() not in sec.lower():
                continue
            if max_pe and pe and pe > max_pe:
                continue
            if min_dividend_yield and div < min_dividend_yield:
                continue
            if max_debt_to_equity and de and de > max_debt_to_equity:
                continue
            if min_market_cap_b and mcap < min_market_cap_b * 1e9:
                continue

            results.append({
                "symbol": sym,
                "name": info.get("shortName"),
                "sector": sec,
                "pe_ratio": pe,
                "dividend_yield_pct": round(div * 100, 2) if div else None,
                "debt_to_equity": de,
                "market_cap_b": round(mcap / 1e9, 1) if mcap else None,
                "recommendation": info.get("recommendationKey"),
                "target_price": info.get("targetMeanPrice"),
                "current_price": info.get("currentPrice"),
            })
        except Exception:
            continue

    return sorted(results, key=lambda x: x.get("market_cap_b") or 0, reverse=True)


if __name__ == "__main__":
    mcp.run()
