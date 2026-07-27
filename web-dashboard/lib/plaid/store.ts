import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import {
  decodeSensitiveJson,
  encodeSensitiveJson,
  requireDataEncryption,
} from '@/lib/security/encrypted-file';

interface EncryptedToken {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface StoredPlaidItem {
  itemId: string;
  accessToken: EncryptedToken;
  institutionId: string | null;
  institutionName: string;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastWebhookAt: string | null;
  lastError: string | null;
}

export type PlaidItemStatus = Omit<StoredPlaidItem, 'accessToken'>;

interface PlaidStore {
  version: 1;
  items: StoredPlaidItem[];
}

const storagePath = process.env.PLAID_STORAGE_PATH
  ?? (process.env.NODE_ENV === 'production'
    ? '/data/plaid-items.json'
    : '/tmp/beta-than-nothing-plaid-items.json');
const backupPath = `${storagePath}.backup`;
let writeQueue = Promise.resolve();

function encryptionKey(): Buffer {
  const raw = process.env.PLAID_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('PLAID_TOKEN_ENCRYPTION_KEY is not configured.');

  const key = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('PLAID_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}

function encryptToken(token: string): EncryptedToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export function decryptPlaidAccessToken(item: StoredPlaidItem): string {
  const encrypted = item.accessToken;
  if (encrypted.version !== 1) throw new Error('Unsupported Plaid token encryption version.');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(encrypted.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function parseStore(raw: string): PlaidStore | null {
  try {
    const value = decodeSensitiveJson<PlaidStore>(raw).value;
    if (value.version !== 1 || !Array.isArray(value.items)) return null;
    if (value.items.some(item => !item.itemId || !item.accessToken?.ciphertext)) return null;
    return value;
  } catch {
    return null;
  }
}

async function readStore(): Promise<PlaidStore> {
  requireDataEncryption();
  for (const candidate of [storagePath, backupPath]) {
    try {
      const raw = await readFile(/* turbopackIgnore: true */ candidate, 'utf8');
      const decoded = decodeSensitiveJson<PlaidStore>(raw);
      const parsed = parseStore(raw);
      if (parsed) {
        if (!decoded.wasEncrypted) {
          await writeFile(/* turbopackIgnore: true */ candidate, encodeSensitiveJson(parsed), { mode: 0o600 });
        }
        return parsed;
      }
    } catch {
      // A new installation has no Plaid store yet.
    }
  }
  return { version: 1, items: [] };
}

async function mutateStore(
  mutate: (store: PlaidStore) => PlaidStore,
): Promise<PlaidStore> {
  let result: PlaidStore = { version: 1, items: [] };
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const current = await readStore();
    result = mutate(current);
    const storageDirectory = storagePath.slice(0, storagePath.lastIndexOf('/')) || '.';
    await mkdir(/* turbopackIgnore: true */ storageDirectory, { recursive: true });
    const temporaryPath = `${storagePath}.tmp`;
    await writeFile(
      /* turbopackIgnore: true */ temporaryPath,
      encodeSensitiveJson(result),
      { mode: 0o600 },
    );
    try {
      await copyFile(
        /* turbopackIgnore: true */ storagePath,
        /* turbopackIgnore: true */ backupPath,
      );
    } catch {
      // The first write has no previous file to preserve.
    }
    await rename(
      /* turbopackIgnore: true */ temporaryPath,
      /* turbopackIgnore: true */ storagePath,
    );
  });
  await writeQueue;
  return result;
}

export async function listPlaidItems(): Promise<StoredPlaidItem[]> {
  return (await readStore()).items;
}

export async function listPlaidItemStatuses(): Promise<PlaidItemStatus[]> {
  return (await listPlaidItems()).map(item => ({
    itemId: item.itemId,
    institutionId: item.institutionId,
    institutionName: item.institutionName,
    connectedAt: item.connectedAt,
    lastSyncedAt: item.lastSyncedAt,
    lastWebhookAt: item.lastWebhookAt,
    lastError: item.lastError,
  }));
}

export async function upsertPlaidItem(input: {
  itemId: string;
  accessToken: string;
  institutionId?: string | null;
  institutionName?: string | null;
}): Promise<PlaidItemStatus> {
  const now = new Date().toISOString();
  const encryptedToken = encryptToken(input.accessToken);
  let saved: StoredPlaidItem | null = null;
  await mutateStore(store => {
    const previous = store.items.find(item => item.itemId === input.itemId);
    saved = {
      itemId: input.itemId,
      accessToken: encryptedToken,
      institutionId: input.institutionId ?? previous?.institutionId ?? null,
      institutionName: input.institutionName?.trim() || previous?.institutionName || 'Connected brokerage',
      connectedAt: previous?.connectedAt ?? now,
      lastSyncedAt: previous?.lastSyncedAt ?? null,
      lastWebhookAt: previous?.lastWebhookAt ?? null,
      lastError: null,
    };
    return {
      version: 1,
      items: [...store.items.filter(item => item.itemId !== input.itemId), saved],
    };
  });
  return {
    itemId: saved!.itemId,
    institutionId: saved!.institutionId,
    institutionName: saved!.institutionName,
    connectedAt: saved!.connectedAt,
    lastSyncedAt: saved!.lastSyncedAt,
    lastWebhookAt: saved!.lastWebhookAt,
    lastError: saved!.lastError,
  };
}

export async function updatePlaidItemStatus(
  itemId: string,
  patch: Partial<Pick<StoredPlaidItem, 'lastSyncedAt' | 'lastWebhookAt' | 'lastError'>>,
): Promise<void> {
  await mutateStore(store => ({
    version: 1,
    items: store.items.map(item => item.itemId === itemId ? { ...item, ...patch } : item),
  }));
}

export async function removePlaidItem(itemId: string): Promise<void> {
  await mutateStore(store => ({
    version: 1,
    items: store.items.filter(item => item.itemId !== itemId),
  }));
}
