import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { AuthenticatorTransportFuture, Base64URLString, WebAuthnCredential } from '@simplewebauthn/server';

export interface StoredPasskey {
  id: Base64URLString;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
}

interface PasskeyStore {
  version: 1;
  users: Record<string, StoredPasskey[]>;
}

const storePath = process.env.PASSKEY_STORAGE_PATH
  ?? (process.env.NODE_ENV === 'production'
    ? '/data/passkeys.json'
    : '/tmp/beta-than-nothing-passkeys.json');
let writeQueue = Promise.resolve();

function allowedUsers(): string[] {
  return (process.env.PASSKEY_ALLOWED_USERS ?? process.env.DASHBOARD_AUTH_USERNAME ?? '')
    .split(',')
    .map(user => user.trim())
    .filter(Boolean);
}

export function isAllowedPasskeyUser(username: string): boolean {
  return allowedUsers().includes(username);
}

async function readStore(): Promise<PasskeyStore> {
  try {
    const parsed = JSON.parse(await readFile(/* turbopackIgnore: true */ storePath, 'utf8')) as PasskeyStore;
    if (parsed.version === 1 && parsed.users && typeof parsed.users === 'object') return parsed;
  } catch {
    // A new deployment has no passkeys yet.
  }
  return { version: 1, users: {} };
}

async function mutateStore(mutator: (store: PasskeyStore) => void): Promise<void> {
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const store = await readStore();
    mutator(store);
    const directory = storePath.slice(0, storePath.lastIndexOf('/')) || '.';
    await mkdir(/* turbopackIgnore: true */ directory, { recursive: true });
    const temporaryPath = `${storePath}.tmp`;
    await writeFile(/* turbopackIgnore: true */ temporaryPath, JSON.stringify(store, null, 2), { mode: 0o600 });
    await rename(
      /* turbopackIgnore: true */ temporaryPath,
      /* turbopackIgnore: true */ storePath,
    );
  });
  await writeQueue;
}

export async function listPasskeys(username: string): Promise<StoredPasskey[]> {
  return (await readStore()).users[username] ?? [];
}

export function asWebAuthnCredential(passkey: StoredPasskey): WebAuthnCredential {
  return {
    id: passkey.id,
    publicKey: new Uint8Array(Buffer.from(passkey.publicKey, 'base64url')),
    counter: passkey.counter,
    transports: passkey.transports,
  };
}

export async function savePasskey(username: string, passkey: StoredPasskey): Promise<void> {
  await mutateStore(store => {
    const existing = store.users[username] ?? [];
    store.users[username] = [...existing.filter(item => item.id !== passkey.id), passkey];
  });
}

export async function updatePasskeyCounter(
  username: string,
  credentialId: string,
  counter: number,
): Promise<void> {
  await mutateStore(store => {
    store.users[username] = (store.users[username] ?? []).map(passkey =>
      passkey.id === credentialId ? { ...passkey, counter } : passkey,
    );
  });
}
