# Beta than nothing Dashboard

Personal portfolio dashboard and AI advisor. The production deployment uses a
separate Python market-data service over Railway private networking.

Portfolio onboarding supports screenshot upload, pasted holdings, and manual
entry. Screenshot and pasted imports are sent to OpenAI for structured
extraction, returned to the browser for review, and not stored as screenshots.
Reviewed portfolio settings are stored on the dashboard service's persistent
volume using AES-256-GCM encryption. The browser keeps only a tab-scoped
working copy, clears it on logout, and does not retain financial data after the
tab is closed.

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
ALLOW_PASSWORD_LOGIN=true
DASHBOARD_SESSION_SECRET=<independent random session-signing secret>
PASSKEY_ALLOWED_USERS=<comma-separated private usernames>
PASSKEY_RP_ID=<dashboard hostname without https://>
PASSKEY_ORIGIN=https://<dashboard-domain>
PASSKEY_BOOTSTRAP_SECRET=<one-time passkey enrollment secret>
PORTFOLIO_DATA_ENCRYPTION_KEY=<32 random bytes encoded as base64>
PLAID_CLIENT_ID=<Plaid client ID>
PLAID_SECRET=<Plaid Production secret for real Fidelity data>
PLAID_ENV=production
PLAID_TOKEN_ENCRYPTION_KEY=<32 random bytes encoded as base64>
PLAID_REDIRECT_URI=https://<dashboard-domain>/dashboard
PLAID_WEBHOOK_URL=https://<dashboard-domain>/api/plaid/webhook
PLAID_SYNC_SECRET=<shared random secret for the scheduled fallback sync>
FINANCE_BRAIN_READ_TOKEN=<independent 32-byte hex read-only secret>
```

Set the same `DATA_SERVICE_TOKEN` value on the private Python data service.
Do not expose the Python service publicly.

Generate independent secrets once and keep the encryption keys stable across
deployments:

```bash
openssl rand -base64 48  # DASHBOARD_SESSION_SECRET
openssl rand -base64 32  # PORTFOLIO_DATA_ENCRYPTION_KEY
openssl rand -base64 32  # PLAID_TOKEN_ENCRYPTION_KEY
openssl rand -hex 32     # PASSKEY_BOOTSTRAP_SECRET
openssl rand -hex 32     # PLAID_SYNC_SECRET
openssl rand -hex 32     # DATA_SERVICE_TOKEN
```

Use a separate command output for every variable. Store them in a password
manager and Railway sealed variables; never reuse one secret for two purposes.

Add the exact `PLAID_REDIRECT_URI` to **Plaid Dashboard → Developers → API
keys → Allowed redirect URIs**. Real Fidelity connections use Plaid's
Production environment even while the Plaid account is on the Free Trial.
Fidelity credentials are entered only in the institution OAuth flow opened by
Plaid Link.

Attach a Railway volume to the dashboard service at `/data`. This preserves
portfolio settings across dashboard redeployments and restores them when a new
browser session opens the app.

Portfolio writes are atomic, encrypted, and versioned. The dashboard keeps up
to 500 encrypted historical snapshots on the `/data` volume. If the active
server file is damaged, the API restores the newest valid server snapshot
automatically. Use the dashboard's `Export` button periodically to keep an
off-platform JSON copy in an encrypted vault; exported files are intentionally
plaintext so they can be restored.

The `/data` Railway volume is required for durable server-side storage. Removing
that volume also removes its server snapshots, so keep occasional exported JSON
copies outside Railway.

## Fidelity / Plaid holdings sync

Plaid access tokens are encrypted with AES-256-GCM and stored separately from
downloadable portfolio settings at `/data/plaid-items.json`. Do not rotate
`PLAID_TOKEN_ENCRYPTION_KEY` while Items are connected; a changed key cannot
decrypt existing access tokens.

Portfolio settings, Plaid item metadata, current holdings, and holdings history
are independently encrypted with `PORTFOLIO_DATA_ENCRYPTION_KEY`. Do not rotate
that key without an explicit data migration. On the first authenticated read
after this release, legacy plaintext settings and backups are rewritten in
encrypted form. Opening `/api/plaid/history` while signed in migrates legacy
holdings history; a manual or scheduled Plaid sync encrypts current and future
snapshots.

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

### Production setup, step by step

1. Before deploying this release, generate and add these dashboard security
   variables in **Railway → dashboard service → Variables**:

   ```text
   DASHBOARD_SESSION_SECRET=<output from: openssl rand -base64 48>
   PORTFOLIO_DATA_ENCRYPTION_KEY=<output from: openssl rand -base64 32>
   PASSKEY_ALLOWED_USERS=<username1,username2>
   PASSKEY_RP_ID=<dashboard hostname, with no scheme or path>
   PASSKEY_ORIGIN=https://<dashboard-domain>
   PASSKEY_BOOTSTRAP_SECRET=<output from: openssl rand -hex 32>
   DASHBOARD_AUTH_USERNAME=<existing fallback username>
   DASHBOARD_AUTH_PASSWORD=<existing fallback password>
   ALLOW_PASSWORD_LOGIN=true
   ```

   Seal the session, encryption, bootstrap, and password values after
   deployment. Keep backup copies of both encryption keys in the family
   password manager. Losing a key makes the corresponding encrypted data
   unrecoverable.
2. Deploy, open the sign-in page, enter an allowed username, select **Set up a
   new passkey**, and paste `PASSKEY_BOOTSTRAP_SECRET`. Complete Face ID, Touch
   ID, Windows Hello, or the device PIN prompt. Repeat on the second family
   member's device using their own username.
3. Sign out and verify that both passkeys can sign in. Then set
   `ALLOW_PASSWORD_LOGIN=false` and replace `PASSKEY_BOOTSTRAP_SECRET` with a
   newly generated unknown value (or remove it). Keep password fallback enabled
   until both passkeys have been tested. Passkeys are bound to
   `PASSKEY_RP_ID`; changing the dashboard hostname requires new enrollment.
4. Sign in once and open `/api/settings`, then `/api/plaid/history`. This
   performs the one-time in-place encryption migration for legacy files. The
   API responses are decrypted for your authenticated browser; files on the
   `/data` volume remain encrypted.
5. In **Plaid Dashboard → Developers → API keys**, copy the Client ID and the
   **Production** secret. Do not put either value in Git, a committed `.env`
   file, a browser setting, or a `NEXT_PUBLIC_*` variable.
6. Confirm the dashboard has a stable public HTTPS domain, for example
   `https://portfolio.example.com` or the Railway-generated domain.
7. In Plaid's Allowed redirect URIs, add the exact URL
   `https://<dashboard-domain>/dashboard`. It must use HTTPS, contain no query
   string, and exactly match `PLAID_REDIRECT_URI`.
8. In the Railway **dashboard service → Variables** tab, add:

   ```text
   PLAID_CLIENT_ID=<Plaid Client ID>
   PLAID_SECRET=<Plaid Production secret>
   PLAID_ENV=production
   PLAID_TOKEN_ENCRYPTION_KEY=<output from: openssl rand -base64 32>
   PLAID_REDIRECT_URI=https://<dashboard-domain>/dashboard
   PLAID_WEBHOOK_URL=https://<dashboard-domain>/api/plaid/webhook
   PLAID_SYNC_SECRET=<output from: openssl rand -hex 32>
   ```

   Keep a backup of `PLAID_TOKEN_ENCRYPTION_KEY` in a password manager. Seal
   `PLAID_SECRET`, `PLAID_TOKEN_ENCRYPTION_KEY`, and `PLAID_SYNC_SECRET` in
   Railway after verifying them. No Plaid variable should use the
   `NEXT_PUBLIC_` prefix.
9. Attach a persistent volume to the dashboard service with the absolute mount
   path `/data`. Do this before connecting Fidelity; otherwise the encrypted
   access token and holdings history will be lost on a redeploy.
10. Review Railway's staged variable/volume changes and deploy the dashboard.
   Open `https://<dashboard-domain>/api/plaid/status` while signed in. It should
   return `"configured": true` and `"environment": "production"`.
11. Open the dashboard, sign in, and click **Connect Fidelity** in the
   **U.S. brokerage connection** card. Complete Fidelity's OAuth and consent
   screens. Fidelity credentials go to the institution flow, never into this
   application's settings.
12. Return to the dashboard. The connection card should show Fidelity and a
   snapshot time. The first extraction can take a little time; a Plaid webhook
   will update the stored snapshot when new holdings are ready. Plaid receives
   the webhook URL through Link, so no separate Investments webhook
   subscription is required in the Plaid Dashboard.
13. Add a second Railway service from the same repository as a fallback
   scheduler:

   - Root directory: `web-dashboard`
   - Start command: `npm run plaid:sync`
   - Variables:

     ```text
     DASHBOARD_URL=https://<dashboard-domain>
     PLAID_SYNC_SECRET=<the same value used by the dashboard service>
     ```

   - Cron schedule: `0 10 * * 2-6`
   - Public domain: none
   - Persistent volume: none

   Railway cron schedules use UTC. This schedule runs Tuesday through Saturday
   at 10:00 UTC, after the preceding U.S. trading day and Plaid's normal
   overnight update window. The command calls the protected endpoint once and
   exits, as required for a Railway cron service.
14. Verify the cron service's first run in Railway logs. A successful line
    resembles:

    ```json
    {"synced":true,"snapshotAt":"...","positionCount":12,"errorCount":0}
    ```

    Also check **Plaid Dashboard → Logs** for Link, holdings, or webhook errors.
    Never paste access tokens, secrets, or Fidelity credentials into logs or
    support messages.

The dashboard fails closed in production if `DASHBOARD_SESSION_SECRET` is
missing or too short. Password login can be disabled after passkey enrollment.
The Python `/call` endpoint fails closed if `DATA_SERVICE_TOKEN` is missing or
incorrect. Its generic `/health` endpoint remains unauthenticated so Railway
can perform deployment health checks.

## Read-only Household Finance Brain

The existing dashboard exposes a machine-only snapshot at:

```text
GET https://<dashboard-domain>/api/finance-brain/v1/snapshot
Authorization: Bearer <FINANCE_BRAIN_READ_TOKEN>
```

This route reads the stored encrypted settings and latest Plaid snapshot; it
does not refresh Plaid. It adds current pricing, compact one-year history,
property equity, estimated mortgage balances, other assets, allocation, and
upcoming earnings. It removes Plaid identifiers, account masks, credentials,
property names, and addresses. It has no write or trading capability.

Generate and seal a token in Railway:

```bash
openssl rand -hex 32
```

Configure the Claude Code cloud environment with:

```text
FINANCE_BRAIN_SNAPSHOT_URL=https://<dashboard-domain>/api/finance-brain/v1/snapshot
FINANCE_BRAIN_READ_TOKEN=<same sealed read-only token>
```

Never add either real value to this public repository or to the scheduled-task
prompt. Test the handoff from a cloud session:

```bash
npm --prefix web-dashboard run finance-brain:fetch
```

The command prints JSON to standard output and does not create a data file. The
copy-ready Sunday analysis prompt is in
`docs/finance-brain-weekly-prompt.md`. Rotate this token independently of Plaid
and the dashboard encryption keys.

## Security boundary

This repository has no order-placement, brokerage-trading, ACH, wire, or
money-movement endpoint. The AI routes return analysis only and explicitly say
that no action was taken. OpenAI requests set `store: false`; provider errors
and raw model output are not written to application logs. A Claude household
routine can receive the separate read-only minimized snapshot above, but must
not receive Plaid tokens, dashboard session cookies, encryption keys, or
credentials. OpenAI may still retain abuse-monitoring logs under its published
[API data controls](https://developers.openai.com/api/docs/guides/your-data);
do not submit brokerage credentials, Plaid tokens, or unrelated documents to
the advisor or screenshot importer.
