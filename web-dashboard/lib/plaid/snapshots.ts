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
    const snapshot = JSON.parse(raw) as PlaidHoldingsSnapshot;
    if (snapshot.version !== 1 || !Array.isArray(snapshot.positions) || !Array.isArray(snapshot.items)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export async function readLatestPlaidSnapshot(): Promise<PlaidHoldingsSnapshot | null> {
  try {
    return parseSnapshot(await readFile(/* turbopackIgnore: true */ currentPath, 'utf8'));
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
    return parseSnapshot(await readFile(
      /* turbopackIgnore: true */ `${historyDirectory}/${files[0]}`,
      'utf8',
    ));
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
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const currentDirectory = currentPath.slice(0, currentPath.lastIndexOf('/')) || '.';
    await mkdir(/* turbopackIgnore: true */ currentDirectory, { recursive: true });
    await mkdir(/* turbopackIgnore: true */ historyDirectory, { recursive: true });
    const temporaryPath = `${currentPath}.tmp`;
    await writeFile(
      /* turbopackIgnore: true */ temporaryPath,
      JSON.stringify(snapshot, null, 2),
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
        JSON.stringify(snapshot, null, 2),
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
  try {
    const files = (await readdir(/* turbopackIgnore: true */ historyDirectory))
      .filter(file => file.endsWith('.json'))
      .sort();
    const points: PlaidHistoryPoint[] = [];
    for (const file of files) {
      const snapshot = parseSnapshot(await readFile(
        /* turbopackIgnore: true */ `${historyDirectory}/${file}`,
        'utf8',
      ));
      if (!snapshot) continue;
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
