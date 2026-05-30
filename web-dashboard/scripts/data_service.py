"""
Thin JSON I/O wrapper around the market-data MCP server functions.
Called by Next.js API routes via child_process.execSync.
Input (stdin): { "method": "...", "params": { ... } }
Output (stdout): JSON result
"""

import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'mcp-servers', 'market-data'))

try:
    cmd = json.loads(sys.stdin.read())
    method = cmd.get('method')
    params = cmd.get('params', {})

    if method == 'get_batch_quotes':
        from server import get_batch_quotes
        result = get_batch_quotes(**params)
    elif method == 'get_quote':
        from server import get_quote
        result = get_quote(**params)
    elif method == 'get_fundamentals':
        from server import get_fundamentals
        result = get_fundamentals(**params)
    elif method == 'get_analyst_ratings':
        from server import get_analyst_ratings
        result = get_analyst_ratings(**params)
    elif method == 'get_earnings_calendar':
        from server import get_earnings_calendar
        result = get_earnings_calendar(**params)
    elif method == 'get_price_history':
        from server import get_price_history
        result = get_price_history(**params)
    elif method == 'get_macro_indicator':
        from server import get_macro_indicator
        result = get_macro_indicator(**params)
    elif method == 'get_news':
        from server import get_news
        result = get_news(**params)
    elif method == 'screen_stocks':
        from server import screen_stocks
        result = screen_stocks(**params)
    else:
        result = {'error': f'Unknown method: {method}'}

    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'error': str(e)}))
    sys.exit(1)
