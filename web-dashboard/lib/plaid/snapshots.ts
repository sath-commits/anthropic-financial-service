import 'server-only';

import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import type { UserPosition } from '@/lib/types';
import {
  decodeSensitiveJson,
  encodeSensitiveJson,
  requireDataEncryption,
} from '@/lib/security/encrypted-file';
import type { PlaidItemStatus } from './store';

export interface PlaidHoldingsSnapshot {
  version: 1;
  capturedAt: string;
  positions: UserPosition[];
  items: PlaidItemStatus[];
  errors: Array<{ itemId: string; code: string; message: string }>;
}

export interface PlaidHistoryPoint {
  capturedAt: string;
  totalInstitutionValue: number;
  positionCount: number;
  itemCount: number;
}

const currentPath = process.env.PLAID_HOLDINGS_PATH
  ?? (process.env.NODE_ENV === 'production'
    ? '/data/plaid-holdings.json'
    : '/tmp/beta-than-nothing-plaid-holdings.json');
const historyDirectory = process.env.PLAID_HOLDINGS_HISTORY_DIR
  ?? (process.env.NODE_ENV === 'production'
    ? '/data/plaid-holdings-history'
    : '/tmp/beta-than-nothing-plaid-holdings-history');
const MAX_HISTORY_SNAPSHOTS = 2500;
let writeQueue = Promise.resolve();

function parseSnapshot(raw: string): PlaidHoldingsSnapshot | null {
  try {
    const snapshot = decodeSensitiveJson<PlaidHoldingsSnapshot>(raw).value;
    if (snapshot.version !== 1 || !Array.isArray(snapshot.positions) || !Array.isArray(snapshot.items)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export async function readLatestPlaidSnapshot(): Promise<PlaidHoldingsSnapshot | null> {
  requireDataEncryption();
  try {
    const raw = await readFile(/* turbopackIgnore: true */ currentPath, 'utf8');
    const decoded = decodeSensitiveJson<PlaidHoldingsSnapshot>(raw);
    const snapshot = parseSnapshot(raw);
    if (snapshot && !decoded.wasEncrypted) {
      const temporaryPath = `${currentPath}.migration.tmp`;
      await writeFile(temporaryPath, encodeSensitiveJson(snapshot), { mode: 0o600 });
      await rename(temporaryPath, currentPath);
    }
    return snapshot;
  } catch {
    return null;
  }
}

function holdingsFingerprint(snapshot: PlaidHoldingsSnapshot): string {
  const comparable = snapshot.positions
    .map(position => ({
      externalId: position.externalId,
      shares: position.shares,
      avgCost: position.avgCost,
      fallbackPrice: position.fallbackPrice,
      hasCostBasis: position.hasCostBasis,
    }))
    .sort((a, b) => String(a.externalId).localeCompare(String(b.externalId)));
  return createHash('sha256').update(JSON.stringify(comparable)).digest('hex');
}

async function newestHistorySnapshot(): Promise<PlaidHoldingsSnapshot | null> {
  try {
    const files = (await readdir(/* turbopackIgnore: true */ historyDirectory))
      .filter(file => file.endsWith('.json'))
      .sort()
      .reverse();
    if (!files[0]) return null;
    const filePath = `${historyDirectory}/${files[0]}`;
    const raw = await readFile(
      /* turbopackIgnore: true */ `${historyDirectory}/${files[0]}`,
      'utf8',
    );
    const decoded = decodeSensitiveJson<PlaidHoldingsSnapshot>(raw);
    const snapshot = parseSnapshot(raw);
    if (snapshot && !decoded.wasEncrypted) {
      await writeFile(/* turbopackIgnore: true */ filePath, encodeSensitiveJson(snapshot), { mode: 0o600 });
    }
    return snapshot;
  } catch {
    return null;
  }
}

async function pruneHistory(): Promise<void> {
  const files = (await readdir(/* turbopackIgnore: true */ historyDirectory))
    .filter(file => file.endsWith('.json'))
    .sort();
  await Promise.all(
    files.slice(0, -MAX_HISTORY_SNAPSHOTS)
      .map(file => unlink(/* turbopackIgnore: true */ `${historyDirectory}/${file}`)),
  );
}

export async function writePlaidSnapshot(snapshot: PlaidHoldingsSnapshot): Promise<void> {
  requireDataEncryption();
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const currentDirectory = currentPath.slice(0, currentPath.lastIndexOf('/')) || '.';
    await mkdir(/* turbopackIgnore: true */ currentDirectory, { recursive: true });
    await mkdir(/* turbopackIgnore: true */ historyDirectory, { recursive: true });
    const temporaryPath = `${currentPath}.tmp`;
    await writeFile(
      /* turbopackIgnore: true */ temporaryPath,
      encodeSensitiveJson(snapshot),
      { mode: 0o600 },
    );
    await rename(
      /* turbopackIgnore: true */ temporaryPath,
      /* turbopackIgnore: true */ currentPath,
    );

    const newest = await newestHistorySnapshot();
    const sameDay = newest?.capturedAt.slice(0, 10) === snapshot.capturedAt.slice(0, 10);
    const unchanged = newest && holdingsFingerprint(newest) === holdingsFingerprint(snapshot);
    if (!sameDay || !unchanged) {
      const historyName = `${snapshot.capturedAt.replace(/[:.]/g, '-')}.json`;
      await writeFile(
        /* turbopackIgnore: true */ `${historyDirectory}/${historyName}`,
        encodeSensitiveJson(snapshot),
        { mode: 0o600 },
      );
      await pruneHistory();
    }
  });
  await writeQueue;
}

export async function removeItemFromCurrentSnapshot(itemId: string): Promise<void> {
  const current = await readLatestPlaidSnapshot();
  if (!current) return;
  await writePlaidSnapshot({
    ...current,
    capturedAt: new Date().toISOString(),
    positions: current.positions.filter(position => position.plaidItemId !== itemId),
    items: current.items.filter(item => item.itemId !== itemId),
    errors: current.errors.filter(error => error.itemId !== itemId),
  });
}

export async function readPlaidHistory(): Promise<PlaidHistoryPoint[]> {
  requireDataEncryption();
  try {
    const files = (await readdir(/* turbopackIgnore: true */ historyDirectory))
      .filter(file => file.endsWith('.json'))
      .sort();
    const points: PlaidHistoryPoint[] = [];
    for (const file of files) {
      const filePath = `${historyDirectory}/${file}`;
      const raw = await readFile(/* turbopackIgnore: true */ filePath, 'utf8');
      const decoded = decodeSensitiveJson<PlaidHoldingsSnapshot>(raw);
      const snapshot = parseSnapshot(raw);
      if (!snapshot) continue;
      if (!decoded.wasEncrypted) {
        await writeFile(/* turbopackIgnore: true */ filePath, encodeSensitiveJson(snapshot), { mode: 0o600 });
      }
      points.push({
        capturedAt: snapshot.capturedAt,
        totalInstitutionValue: snapshot.positions.reduce(
          (total, position) => total + (position.fallbackPrice ?? position.avgCost) * position.shares,
          0,
        ),
        positionCount: snapshot.positions.length,
        itemCount: snapshot.items.length,
      });
    }
    return points;
  } catch {
    return [];
  }
}

export async function readPlaidSnapshotHistory(since: Date): Promise<PlaidHoldingsSnapshot[]> {
  requireDataEncryption();
  try {
    const files = (await readdir(/* turbopackIgnore: true */ historyDirectory))
      .filter(file => file.endsWith('.json'))
      .sort();
    const snapshots: PlaidHoldingsSnapshot[] = [];
    for (const file of files) {
      const raw = await readFile(/* turbopackIgnore: true */ `${historyDirectory}/${file}`, 'utf8');
      const snapshot = parseSnapshot(raw);
      if (!snapshot || new Date(snapshot.capturedAt) < since) continue;
      snapshots.push(snapshot);
    }
    return snapshots;
  } catch {
    return [];
  }
}
