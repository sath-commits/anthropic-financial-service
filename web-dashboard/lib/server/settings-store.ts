import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { InvestorProfile, UserPosition } from '@/lib/types';
import {
  decodeSensitiveJson,
  encodeSensitiveJson,
  requireDataEncryption,
} from '@/lib/security/encrypted-file';

export interface StoredSettings {
  positions?: UserPosition[];
  profile?: InvestorProfile;
  properties?: unknown[];
  otherAssets?: unknown[];
}

const useTestStorage = process.env.PORTFOLIO_STORAGE_TEST === '1';
const settingsPath = useTestStorage
  ? '/tmp/beta-than-nothing-storage-test/portfolio-settings.json'
  : process.env.NODE_ENV === 'production'
    ? '/data/portfolio-settings.json'
    : '/tmp/beta-than-nothing-settings.json';
const backupsDirectory = useTestStorage
  ? '/tmp/beta-than-nothing-storage-test/backups'
  : process.env.NODE_ENV === 'production'
    ? '/data/portfolio-backups'
    : '/tmp/beta-than-nothing-backups';
let writeQueue = Promise.resolve();
let backupMigration: Promise<void> | null = null;
const MAX_SERVER_BACKUPS = 500;

function parseSettings(raw: string): StoredSettings | null {
  try {
    const settings = decodeSensitiveJson<StoredSettings>(raw).value;
    if (settings.positions !== undefined && !Array.isArray(settings.positions)) return null;
    if (settings.profile !== undefined && (!settings.profile || typeof settings.profile !== 'object')) return null;
    return settings;
  } catch {
    return null;
  }
}

async function readLatestBackup(): Promise<StoredSettings | null> {
  try {
    const files = (await readdir(backupsDirectory)).filter(file => file.endsWith('.json')).sort().reverse();
    for (const file of files) {
      const filePath = path.join(backupsDirectory, file);
      const raw = await readFile(filePath, 'utf8');
      const decoded = decodeSensitiveJson<StoredSettings>(raw);
      const settings = parseSettings(raw);
      if (settings && !decoded.wasEncrypted) {
        await writeFile(filePath, encodeSensitiveJson(settings), { mode: 0o600 });
      }
      if (settings) return settings;
    }
  } catch {
    // A new installation has no backups yet.
  }
  return null;
}

async function migrateBackups(): Promise<void> {
  if (!backupMigration) {
    backupMigration = (async () => {
      try {
        const files = (await readdir(backupsDirectory)).filter(file => file.endsWith('.json'));
        for (const file of files) {
          const filePath = path.join(backupsDirectory, file);
          const raw = await readFile(filePath, 'utf8');
          const decoded = decodeSensitiveJson<StoredSettings>(raw);
          const settings = parseSettings(raw);
          if (settings && !decoded.wasEncrypted) {
            await writeFile(filePath, encodeSensitiveJson(settings), { mode: 0o600 });
          }
        }
      } catch {
        // New installations do not have a backup directory yet.
      }
    })();
  }
  await backupMigration;
}

export async function readSettings(): Promise<StoredSettings> {
  requireDataEncryption();
  await migrateBackups();
  try {
    const raw = await readFile(settingsPath, 'utf8');
    const decoded = decodeSensitiveJson<StoredSettings>(raw);
    const settings = parseSettings(raw);
    if (settings) {
      if (!decoded.wasEncrypted) {
        const temporaryPath = `${settingsPath}.migration.tmp`;
        await writeFile(temporaryPath, encodeSensitiveJson(settings), { mode: 0o600 });
        await rename(temporaryPath, settingsPath);
      }
      return settings;
    }
  } catch {
    // Restore from the historical snapshots below.
  }
  return await readLatestBackup() ?? {};
}

async function writeBackup(settings: StoredSettings) {
  const backupName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.json`;
  await writeFile(path.join(backupsDirectory, backupName), encodeSensitiveJson(settings), { mode: 0o600 });
}

async function pruneBackups() {
  const files = (await readdir(backupsDirectory)).filter(file => file.endsWith('.json')).sort();
  await Promise.all(files.slice(0, -MAX_SERVER_BACKUPS).map(file => unlink(path.join(backupsDirectory, file))));
}

export async function writeSettings(patch: StoredSettings): Promise<StoredSettings> {
  let result: StoredSettings = {};
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const previous = await readSettings();
    result = { ...previous };
    if (patch.positions !== undefined) result.positions = patch.positions;
    if (patch.profile !== undefined) result.profile = patch.profile;
    if (patch.properties !== undefined) result.properties = patch.properties;
    if (patch.otherAssets !== undefined) result.otherAssets = patch.otherAssets;
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await mkdir(backupsDirectory, { recursive: true });
    if (previous.positions?.length || previous.profile) await writeBackup(previous);
    const temporaryPath = `${settingsPath}.tmp`;
    await writeFile(temporaryPath, encodeSensitiveJson(result), { mode: 0o600 });
    await rename(temporaryPath, settingsPath);
    await writeBackup(result);
    await pruneBackups();
  });
  await writeQueue;
  return result;
}
