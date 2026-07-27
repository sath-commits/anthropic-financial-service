const snapshotUrl = process.env.FINANCE_BRAIN_SNAPSHOT_URL;
const readToken = process.env.FINANCE_BRAIN_READ_TOKEN;

if (!snapshotUrl || !readToken) {
  console.error('FINANCE_BRAIN_SNAPSHOT_URL and FINANCE_BRAIN_READ_TOKEN are required.');
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(snapshotUrl);
} catch {
  console.error('FINANCE_BRAIN_SNAPSHOT_URL must be a valid URL.');
  process.exit(1);
}
if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
  console.error('FINANCE_BRAIN_SNAPSHOT_URL must use HTTPS outside local development.');
  process.exit(1);
}

let response;
try {
  response = await fetch(parsedUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${readToken}`,
    },
    signal: AbortSignal.timeout(60_000),
  });
} catch {
  console.error('Could not reach the Finance Brain snapshot endpoint.');
  process.exit(1);
}

if (!response.ok) {
  console.error(`Finance Brain snapshot request failed with HTTP ${response.status}.`);
  process.exit(1);
}

let snapshot;
try {
  snapshot = await response.json();
} catch {
  console.error('Finance Brain endpoint returned invalid JSON.');
  process.exit(1);
}
if (snapshot?.schemaVersion !== 1 || !snapshot?.freshness || !Array.isArray(snapshot?.positions)) {
  console.error('Finance Brain endpoint returned an unsupported snapshot schema.');
  process.exit(1);
}
if (snapshot.freshness.status !== 'fresh') {
  console.error(`Warning: Finance Brain data status is ${snapshot.freshness.status}. Review warnings before acting.`);
}

process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
