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
PLAID_CLIENT_ID=<Plaid client ID>
PLAID_SECRET=<Plaid Production secret for real Fidelity data>
PLAID_ENV=production
PLAID_TOKEN_ENCRYPTION_KEY=<32 random bytes encoded as base64>
PLAID_REDIRECT_URI=https://<dashboard-domain>/dashboard
PLAID_WEBHOOK_URL=https://<dashboard-domain>/api/plaid/webhook
PLAID_SYNC_SECRET=<shared random secret for the scheduled fallback sync>
```

Set the same `DATA_SERVICE_TOKEN` value on the private Python data service.
Do not expose the Python service publicly.

Generate the Plaid encryption and scheduled-sync secrets once and keep them
stable across deployments:

```bash
openssl rand -base64 32
openssl rand -hex 32
```

Add the exact `PLAID_REDIRECT_URI` to **Plaid Dashboard → Developers → API
keys → Allowed redirect URIs**. Real Fidelity connections use Plaid's
Production environment even while the Plaid account is on the Free Trial.
Fidelity credentials are entered only in the institution OAuth flow opened by
Plaid Link.

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

## Fidelity / Plaid holdings sync

Plaid access tokens are encrypted with AES-256-GCM and stored separately from
downloadable portfolio settings at `/data/plaid-items.json`. Do not rotate
`PLAID_TOKEN_ENCRYPTION_KEY` while Items are connected; a changed key cannot
decrypt existing access tokens.

The dashboard does not call Plaid whenever the page loads. Instead:

1. Connecting Fidelity creates the first holdings snapshot.
2. Plaid checks investment data after market hours and sends a signed holdings
   webhook when an update is available.
3. The verified webhook fetches and stores the new snapshot.
4. The dashboard reads `/data/plaid-holdings.json`, then combines quantities and
   cost basis with live prices from the existing market-data service.

Immutable changed snapshots are retained in `/data/plaid-holdings-history` for
longitudinal analysis. Up to 2,500 snapshots are kept. If Plaid temporarily
fails for one connected Item, the last successful positions for that Item
remain in the current snapshot and the UI shows the connection error.

These snapshots support allocation history, end-of-day value history, and
position-change analysis. Accurate time-weighted returns and performance
attribution also require cash-flow and investment-transaction history; that is
a separate follow-on from the holdings connection.

As a webhook fallback, schedule one daily authenticated request after U.S.
market close:

```bash
curl -X POST \
  -H "Authorization: Bearer $PLAID_SYNC_SECRET" \
  https://<dashboard-domain>/api/plaid/cron
```

This fallback retrieves Plaid's latest cached Investments data; it does not call
the separately billed Investments Refresh endpoint.

The dashboard fails closed in production if its username or password is
missing. The Python `/call` endpoint fails closed if `DATA_SERVICE_TOKEN` is
missing or incorrect. Its `/health` endpoint remains unauthenticated so Railway
can perform deployment health checks.
