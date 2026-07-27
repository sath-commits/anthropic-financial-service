"""
HTTP data service for the Beta than nothing Next.js app.
Wraps yfinance, FRED, and Alpha Vantage behind a single POST /call endpoint.

Deploy this as a separate Railway service.
Set DATA_SERVICE_URL in the Next.js service to the Railway URL of this service.
"""

from __future__ import annotations

import asyncio
import os
import json
import re
import secrets
import time
from curl_cffi import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
FRED_API_KEY = os.getenv("FRED_API_KEY", "")
DATA_SERVICE_TOKEN = os.getenv("DATA_SERVICE_TOKEN", "")
MAX_REQUEST_BYTES = 64 * 1024

_av_last_call = 0.0
YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0"}


# ── Minimal authenticated ASGI surface ───────────────────────────────────────

class RequestError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


async def _send_json(send, status: int, value: Any) -> None:
    body = json.dumps(value, separators=(",", ":")).encode("utf-8")
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [
            (b"content-type", b"application/json"),
            (b"cache-control", b"no-store"),
            (b"x-content-type-options", b"nosniff"),
        ],
    })
    await send({"type": "http.response.body", "body": body})


async def app(scope, receive, send) -> None:
    if scope["type"] != "http":
        return
    method = scope.get("method", "")
    path = scope.get("path", "")
    if method == "GET" and path == "/health":
        await _send_json(send, 200, {"status": "ok"})
        return
    if method != "POST" or path != "/call":
        await _send_json(send, 404, {"error": "not_found"})
        return

    headers = {key.lower(): value for key, value in scope.get("headers", [])}
    expected = f"Bearer {DATA_SERVICE_TOKEN}".encode()
    provided = headers.get(b"authorization", b"")
    if not DATA_SERVICE_TOKEN:
        await _send_json(send, 503, {"error": "service_not_configured"})
        return
    if not provided or not secrets.compare_digest(provided, expected):
        await _send_json(send, 401, {"error": "unauthorized"})
        return

    body = bytearray()
    while True:
        message = await receive()
        if message["type"] == "http.disconnect":
            return
        body.extend(message.get("body", b""))
        if len(body) > MAX_REQUEST_BYTES:
            await _send_json(send, 413, {"error": "request_too_large"})
            return
        if not message.get("more_body", False):
            break
    try:
        payload = json.loads(body)
        request_method = payload.get("method")
        params = payload.get("params", {})
        if not isinstance(request_method, str) or not 1 <= len(request_method) <= 40:
            raise RequestError(400, "invalid_method")
        if not isinstance(params, dict):
            raise RequestError(400, "invalid_params")
        result = await asyncio.to_thread(call_method, request_method, params)
        await _send_json(send, 200, result)
    except RequestError as error:
        await _send_json(send, error.status, {"error": error.message})
    except (json.JSONDecodeError, UnicodeDecodeError):
        await _send_json(send, 400, {"error": "invalid_json"})
    except Exception:
        await _send_json(send, 502, {"error": "market_data_unavailable"})


def call_method(method: str, params: dict) -> Any:
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
    fn = handlers.get(method)
    if not fn:
        raise RequestError(400, "unknown_method")
    _validate_params(method, params)
    try:
        return fn(**params)
    except Exception:
        return {"error": "market_data_unavailable"}


SYMBOL_PATTERN = re.compile(r"^[A-Za-z0-9.^=_-]{1,20}$")
ALLOWED_PERIODS = {"1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"}


def _validate_symbol(value: Any) -> None:
    if not isinstance(value, str) or not SYMBOL_PATTERN.fullmatch(value):
        raise RequestError(400, "invalid_symbol")


def _validate_params(method: str, params: dict) -> None:
    if len(json.dumps(params, separators=(",", ":"))) > 50_000:
        raise RequestError(413, "request_too_large")
    if "symbol" in params:
        _validate_symbol(params["symbol"])
    if "symbols" in params:
        symbols = params["symbols"]
        if not isinstance(symbols, list) or len(symbols) > 500:
            raise RequestError(400, "invalid_symbol_list")
        for symbol in symbols:
            _validate_symbol(symbol)
    if "series_id" in params:
        _validate_symbol(params["series_id"])
    if method == "get_price_history" and params.get("period", "6mo") not in ALLOWED_PERIODS:
        raise RequestError(400, "invalid_period")
    if "days" in params:
        days = params["days"]
        if not isinstance(days, int) or not 1 <= days <= 90:
            raise RequestError(400, "invalid_news_range")


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
            headers=YAHOO_HEADERS,
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


def _quote_from_yahoo_record(record: dict) -> dict | None:
    symbol = record.get("symbol")
    price = (
        record.get("regularMarketPrice")
        or record.get("postMarketPrice")
        or record.get("preMarketPrice")
        or 0
    )
    if not symbol or not price:
        return None
    quote: dict = {
        "symbol": symbol,
        "price": price,
        "source": "yahoo_quote",
    }
    previous_close = record.get("regularMarketPreviousClose")
    if previous_close:
        quote["previousClose"] = previous_close
    if record.get("marketCap"):
        quote["marketCap"] = record.get("marketCap")
    if record.get("regularMarketVolume"):
        quote["volume"] = record.get("regularMarketVolume")
    return quote


def _yahoo_quote_batch(symbols: list[str]) -> dict[str, dict]:
    quotes: dict[str, dict] = {}
    for i in range(0, len(symbols), 50):
        chunk = symbols[i:i + 50]
        try:
            r = requests.get(
                "https://query1.finance.yahoo.com/v7/finance/quote",
                params={"symbols": ",".join(chunk)},
                headers=YAHOO_HEADERS,
                timeout=8,
            )
            r.raise_for_status()
            records = r.json().get("quoteResponse", {}).get("result", [])
            for record in records:
                quote = _quote_from_yahoo_record(record)
                if quote:
                    quotes[quote["symbol"].upper()] = quote
        except Exception:
            pass
    return quotes


def get_quote(symbol: str) -> dict:
    direct = _yahoo_quote_batch([symbol]).get(symbol.strip().upper())
    if direct:
        return direct

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
    except Exception:
        yahoo = _yahoo_chart_quote(symbol)
        if yahoo:
            return yahoo
        av = _av_quote(symbol)
        if av:
            return av
        return {"symbol": symbol, "error": "fetch_failed"}


def get_batch_quotes(symbols: list[str]) -> list[dict]:
    normalized_symbols = list(dict.fromkeys(sym.strip().upper() for sym in symbols if sym.strip()))
    if not normalized_symbols:
        return []

    quotes = _yahoo_quote_batch(normalized_symbols)
    missing_symbols = [sym for sym in normalized_symbols if sym not in quotes]

    prices: dict[str, float] = {sym: quote["price"] for sym, quote in quotes.items()}
    prev_closes: dict[str, float] = {}
    for sym, quote in quotes.items():
        if quote.get("previousClose"):
            prev_closes[sym] = quote["previousClose"]

    if missing_symbols:
        try:
            import yfinance as yf
            # Fetch one compact daily-price frame for symbols still missing from
            # the direct quote API. Keep this as a fallback because yfinance can
            # be slow or rate-limited in hosted environments.
            history = yf.download(
                tickers=" ".join(missing_symbols),
                period="5d",
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                progress=False,
                threads=True,
                timeout=5,
            )
            for sym in missing_symbols:
                try:
                    close = history["Close"] if len(missing_symbols) == 1 else history[sym]["Close"]
                    valid = close.dropna()
                    if not valid.empty:
                        prices[sym] = float(valid.iloc[-1])
                        if len(valid) >= 2:
                            prev_closes[sym] = float(valid.iloc[-2])
                except Exception:
                    pass
        except Exception:
            pass

    chart_missing = [sym for sym in normalized_symbols if sym not in prices]
    if chart_missing:
        with ThreadPoolExecutor(max_workers=min(8, len(chart_missing))) as executor:
            futures = {executor.submit(_yahoo_chart_quote, sym): sym for sym in chart_missing}
            for future in as_completed(futures):
                sym = futures[future]
                try:
                    quote = future.result()
                    if quote and quote.get("price"):
                        prices[sym] = quote["price"]
                        if quote.get("previousClose"):
                            prev_closes[sym] = quote["previousClose"]
                except Exception:
                    pass

    results = []
    for sym in normalized_symbols:
        if sym in prices:
            source = quotes.get(sym, {}).get("source", "yahoo_batch")
            entry: dict = {"symbol": sym, "price": prices[sym], "source": source}
            if sym in prev_closes:
                entry["previousClose"] = prev_closes[sym]
            results.append(entry)
        else:
            results.append({"symbol": sym, "price": 0, "error": "fetch_failed"})
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
    except Exception:
        return {"symbol": symbol, "error": "fetch_failed"}


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
    except Exception:
        return {"symbol": symbol, "error": "fetch_failed"}


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
    except Exception:
        return [{"error": "fetch_failed"}]


def get_earnings_calendar(symbols: list[str]) -> list[dict]:
    import yfinance as yf
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def fetch_one(sym: str) -> dict | None:
        try:
            t = yf.Ticker(sym)
            # Primary: t.calendar
            cal = t.calendar
            if cal is not None and not cal.empty:
                date_val = cal.get("Earnings Date")
                if date_val is not None:
                    dates = list(date_val) if hasattr(date_val, "__iter__") else [date_val]
                    for d in dates:
                        date_str = str(d)[:10]
                        if date_str >= today:
                            eps_raw = cal.get("EPS Estimate")
                            eps = None
                            if eps_raw is not None:
                                try:
                                    eps = float(list(eps_raw)[0]) if hasattr(eps_raw, "__iter__") else float(eps_raw)
                                except (TypeError, ValueError, StopIteration):
                                    pass
                            return {"symbol": sym, "earnings_date": date_str, "eps_estimate": eps}
            # Fallback: earnings_dates index
            ed = t.earnings_dates
            if ed is not None and not ed.empty:
                future = ed[ed.index.strftime("%Y-%m-%d") >= today]
                if not future.empty:
                    date_str = future.index[-1].strftime("%Y-%m-%d")
                    eps = None
                    if "EPS Estimate" in future.columns:
                        try:
                            import math
                            v = future.iloc[-1]["EPS Estimate"]
                            if v is not None and not math.isnan(float(v)):
                                eps = round(float(v), 2)
                        except (TypeError, ValueError):
                            pass
                    return {"symbol": sym, "earnings_date": date_str, "eps_estimate": eps}
        except Exception:
            pass
        return None

    results = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(fetch_one, sym): sym for sym in symbols}
        for future in as_completed(futures, timeout=12):
            try:
                result = future.result()
                if result:
                    results.append(result)
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
    except Exception:
        return [{"error": "fetch_failed"}]


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
    except Exception:
        return [{"error": "fetch_failed"}]


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
    except Exception:
        return [{"error": "fetch_failed"}]


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
