const dashboardUrl = process.env.DASHBOARD_URL?.trim().replace(/\/+$/, '');
const syncSecret = process.env.PLAID_SYNC_SECRET?.trim();

if (!dashboardUrl || !syncSecret) {
  console.error('DASHBOARD_URL and PLAID_SYNC_SECRET are required.');
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`${dashboardUrl}/api/plaid/cron`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${syncSecret}`,
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error || `Sync endpoint returned HTTP ${response.status}.`);
    }

    console.log(JSON.stringify({
      synced: body?.synced === true,
      snapshotAt: body?.snapshotAt ?? null,
      positionCount: body?.positionCount ?? 0,
      errorCount: Array.isArray(body?.errors) ? body.errors.length : 0,
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Plaid sync failed.');
    process.exitCode = 1;
  }
}
