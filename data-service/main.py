"""
HTTP data service for the Beta than nothing Next.js app.
Wraps yfinance, FRED, and Alpha Vantage behind a single POST /call endpoint.

Deploy this as a separate Railway service.
Set DATA_SERVICE_URL in the Next.js service to the Railway URL of this service.
"""

from __future__ import annotations

import os
import secrets
import time
import requests
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from typing import Any

app = FastAPI()

ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
FRED_API_KEY = os.getenv("FRED_API_KEY", "")
DATA_SERVICE_TOKEN = os.getenv("DATA_SERVICE_TOKEN", "")

_av_last_call = 0.0


# ── Request / response schema ────────────────────────────────────────────────

class CallRequest(BaseModel):
    method: str
    params: dict = Field(default_factory=dict)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/call")
def call_method(req: CallRequest, authorization: str | None = Header(default=None)) -> Any:
    if not DATA_SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="DATA_SERVICE_TOKEN is not configured")
    expected = f"Bearer {DATA_SERVICE_TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid data-service credentials")

    handlers = {
        "get_quote":            get_quote,
        "get_batch_quotes":     get_batch_quotes,
        "get_fundamentals":     get_fundamentals,
        "get_analyst_ratings":  get_analyst_ratings,
        "get_earnings_history": get_earnings_history,
        "get_earnings_calendar":get_earnings_calendar,
        "get_price_history":    get_price_history,
        "get_news":             get_news,
        "get_macro_indicator":  get_macro_indicator,
        "screen_stocks":        screen_stocks,
    }
    fn = handlers.get(req.method)
    if not fn:
        return {"error": f"Unknown method: {req.method}"}
    try:
        return fn(**req.params)
    except Exception as e:
        return {"error": str(e)}


# ── Alpha Vantage fallback (25 free req/day) ─────────────────────────────────

def _av_quote(symbol: str) -> dict | None:
    global _av_last_call
    if not ALPHA_VANTAGE_KEY:
        return None
    elapsed = time.time() - _av_last_call
    if elapsed < 12:
        time.sleep(12 - elapsed)
    _av_last_call = time.time()
    try:
        r = requests.get(
            "https://www.alphavantage.co/query",
            params={"function": "GLOBAL_QUOTE", "symbol": symbol, "apikey": ALPHA_VANTAGE_KEY},
            timeout=10,
        )
        data = r.json().get("Global Quote", {})
        price = float(data.get("05. price", 0))
        if price:
            return {"symbol": symbol, "price": price, "source": "alphavantage"}
    except Exception:
        pass
    return None


# ── Market data methods ───────────────────────────────────────────────────────

def _yahoo_chart_quote(symbol: str) -> dict | None:
    try:
        r = requests.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
            params={"range": "1d", "interval": "1m"},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=8,
        )
        r.raise_for_status()
        result = r.json().get("chart", {}).get("result", [])
        meta = result[0].get("meta", {}) if result else {}
        price = meta.get("regularMarketPrice") or meta.get("previousClose") or 0
        if price:
            return {"symbol": symbol, "price": price, "source": "yahoo_chart"}
    except Exception:
        pass
    return None


def get_quote(symbol: str) -> dict:
    import yfinance as yf
    try:
        t = yf.Ticker(symbol)
        info = t.info
        fast_info = t.fast_info
        price = info.get("currentPrice") or info.get("regularMarketPrice") or fast_info.get("last_price") or 0
        if not price:
            yahoo = _yahoo_chart_quote(symbol)
            if yahoo:
                return yahoo
            av = _av_quote(symbol)
            if av:
                return av
        return {
            "symbol": symbol,
            "price": price,
            "marketCap": info.get("marketCap"),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
            "volume": info.get("volume"),
        }
    except Exception as e:
        yahoo = _yahoo_chart_quote(symbol)
        if yahoo:
            return yahoo
        av = _av_quote(symbol)
        if av:
            return av
        return {"symbol": symbol, "error": str(e)}


def get_batch_quotes(symbols: list[str]) -> list[dict]:
    import yfinance as yf
    results = []
    try:
        tickers = yf.Tickers(" ".join(symbols))
        for sym in symbols:
            try:
                ticker = tickers.tickers[sym]
                fast_info = ticker.fast_info
                price = fast_info.get("last_price") or 0
                if not price:
                    info = ticker.info
                    price = info.get("currentPrice") or info.get("regularMarketPrice") or 0
                if price:
                    results.append({"symbol": sym, "price": price})
                else:
                    q = _yahoo_chart_quote(sym)
                    results.append(q or {"symbol": sym, "price": 0, "error": "fetch_failed"})
            except Exception:
                q = _yahoo_chart_quote(sym)
                results.append(q or {"symbol": sym, "price": 0, "error": "fetch_failed"})
    except Exception:
        # Keep batch calls fast: Alpha Vantage's free endpoint is intentionally
        # rate-limited and is only suitable for explicit single-symbol quotes.
        for sym in symbols:
            q = _yahoo_chart_quote(sym)
            results.append(q or {"symbol": sym, "price": 0, "error": "fetch_failed"})
    return results


def get_fundamentals(symbol: str) -> dict:
    import yfinance as yf
    try:
        info = yf.Ticker(symbol).info
        return {
            "symbol": symbol,
            "trailingPE": info.get("trailingPE"),
            "forwardPE": info.get("forwardPE"),
            "trailingEps": info.get("trailingEps"),
            "revenueGrowth": info.get("revenueGrowth"),
            "grossMargins": info.get("grossMargins"),
            "operatingMargins": info.get("operatingMargins"),
            "profitMargins": info.get("profitMargins"),
            "debtToEquity": info.get("debtToEquity"),
            "freeCashflow": info.get("freeCashflow"),
            "returnOnEquity": info.get("returnOnEquity"),
            "totalRevenue": info.get("totalRevenue"),
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e)}


def get_analyst_ratings(symbol: str) -> dict:
    import yfinance as yf
    try:
        info = yf.Ticker(symbol).info
        return {
            "symbol": symbol,
            "recommendationMean": info.get("recommendationMean"),
            "recommendationKey": info.get("recommendationKey"),
            "numberOfAnalystOpinions": info.get("numberOfAnalystOpinions"),
            "targetMeanPrice": info.get("targetMeanPrice"),
            "targetHighPrice": info.get("targetHighPrice"),
            "targetLowPrice": info.get("targetLowPrice"),
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e)}


def get_earnings_history(symbol: str) -> list[dict]:
    import yfinance as yf
    try:
        t = yf.Ticker(symbol)
        df = t.quarterly_earnings
        if df is None or df.empty:
            return []
        rows = []
        for date, row in df.head(4).iterrows():
            rows.append({
                "quarter": str(date),
                "actual": row.get("Earnings"),
                "estimate": row.get("Estimate"),
                "surprise_pct": (
                    round((row["Earnings"] - row["Estimate"]) / abs(row["Estimate"]) * 100, 2)
                    if row.get("Estimate") else None
                ),
            })
        return rows
    except Exception as e:
        return [{"error": str(e)}]


def get_earnings_calendar(symbols: list[str]) -> list[dict]:
    import yfinance as yf
    results = []
    for sym in symbols:
        try:
            t = yf.Ticker(sym)
            cal = t.calendar
            if cal is not None and not cal.empty:
                date_val = cal.get("Earnings Date")
                if date_val is not None:
                    dates = date_val if hasattr(date_val, "__iter__") else [date_val]
                    for d in dates:
                        results.append({
                            "symbol": sym,
                            "earnings_date": str(d)[:10],
                            "eps_estimate": cal.get("EPS Estimate", [None])[0] if isinstance(cal.get("EPS Estimate"), list) else cal.get("EPS Estimate"),
                        })
                        break  # just the next date
        except Exception:
            pass
    return results


def get_price_history(symbol: str, period: str = "6mo") -> list[dict]:
    import yfinance as yf
    try:
        hist = yf.Ticker(symbol).history(period=period)
        if hist.empty:
            return []
        return [
            {"date": str(d)[:10], "close": round(float(row["Close"]), 2)}
            for d, row in hist.iterrows()
        ]
    except Exception as e:
        return [{"error": str(e)}]


def get_news(symbol: str, days: int = 7) -> list[dict]:
    import yfinance as yf
    try:
        news = yf.Ticker(symbol).news or []
        return [
            {
                "title": item.get("title", ""),
                "publisher": item.get("publisher", ""),
                "link": item.get("link", ""),
                "published": item.get("providerPublishTime", ""),
            }
            for item in news[:10]
        ]
    except Exception as e:
        return [{"error": str(e)}]


def get_macro_indicator(series_id: str) -> list[dict]:
    if not FRED_API_KEY:
        return [{"error": "FRED_API_KEY not set"}]
    try:
        r = requests.get(
            "https://api.stlouisfed.org/fred/series/observations",
            params={
                "series_id": series_id,
                "api_key": FRED_API_KEY,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 10,
            },
            timeout=10,
        )
        obs = r.json().get("observations", [])
        return [{"date": o["date"], "value": o["value"]} for o in obs]
    except Exception as e:
        return [{"error": str(e)}]


def screen_stocks(
    sector: str | None = None,
    max_pe: float | None = None,
    min_dividend_yield: float | None = None,
    max_debt_to_equity: float | None = None,
    min_market_cap_b: float | None = None,
    symbols: list[str] | None = None,
) -> list[dict]:
    import yfinance as yf
    candidates = symbols or []
    results = []
    for sym in candidates:
        try:
            info = yf.Ticker(sym).info
            pe = info.get("trailingPE")
            div = info.get("dividendYield", 0) or 0
            dte = info.get("debtToEquity")
            mc = info.get("marketCap", 0) or 0
            sec = info.get("sector", "")
            if sector and sector.lower() not in sec.lower():
                continue
            if max_pe and pe and pe > max_pe:
                continue
            if min_dividend_yield and div < min_dividend_yield:
                continue
            if max_debt_to_equity and dte and dte > max_debt_to_equity:
                continue
            if min_market_cap_b and mc < min_market_cap_b * 1e9:
                continue
            results.append({
                "symbol": sym,
                "sector": sec,
                "pe": pe,
                "dividendYield": div,
                "debtToEquity": dte,
                "marketCapB": round(mc / 1e9, 1) if mc else None,
            })
        except Exception:
            pass
    return results


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
