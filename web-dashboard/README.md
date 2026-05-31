# Beta than nothing Dashboard

Personal portfolio dashboard and AI advisor. The production deployment uses a
separate Python market-data service over Railway private networking.

Portfolio onboarding supports screenshot upload, pasted holdings, and manual
entry. Screenshot and pasted imports are sent to OpenAI for structured
extraction, returned to the browser for review, and not stored as screenshots.
Reviewed portfolio settings are saved to browser storage and the dashboard
service's persistent volume.

## Local Development

```bash
npm ci
OPENAI_API_KEY=sk-... npm run dev
```

Without `DATA_SERVICE_URL`, the dashboard invokes `scripts/data_service.py`
locally. Dashboard authentication is optional outside production.

## Railway Deployment

Deploy this directory as the public Next.js service with root directory
`web-dashboard`.

Required variables:

```text
OPENAI_API_KEY
DATA_SERVICE_URL=http://<data-service>.railway.internal:8000
DATA_SERVICE_TOKEN=<shared random secret>
DASHBOARD_AUTH_USERNAME=<private username>
DASHBOARD_AUTH_PASSWORD=<strong random password>
```

Set the same `DATA_SERVICE_TOKEN` value on the private Python data service.
Do not expose the Python service publicly.

Attach a Railway volume to the dashboard service at `/data`. This preserves
portfolio settings across dashboard redeployments and restores them when a new
browser session opens the app.

Portfolio writes are atomic and versioned. The dashboard keeps up to 500
historical snapshots on the `/data` volume and up to 100 additional snapshots
in browser storage. If the active server JSON file is damaged, the API restores
the newest valid server snapshot automatically. Use the dashboard's `Export`
button periodically to keep an off-platform JSON copy and `Restore` to load it.

The `/data` Railway volume is required for durable server-side storage. Removing
that volume also removes its server snapshots, so keep occasional exported JSON
copies outside Railway.

The dashboard fails closed in production if its username or password is
missing. The Python `/call` endpoint fails closed if `DATA_SERVICE_TOKEN` is
missing or incorrect. Its `/health` endpoint remains unauthenticated so Railway
can perform deployment health checks.
