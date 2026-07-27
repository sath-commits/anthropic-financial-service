import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

interface EncryptedEnvelope {
  encrypted: true;
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function encryptionKey(): Buffer | null {
  const raw = process.env.PORTFOLIO_DATA_ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PORTFOLIO_DATA_ENCRYPTION_KEY is not configured.');
    }
    return null;
  }
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('PORTFOLIO_DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  }
  return key;
}

export function requireDataEncryption(): void {
  void encryptionKey();
}

function isEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<EncryptedEnvelope>;
  return envelope.encrypted === true
    && envelope.version === 1
    && typeof envelope.iv === 'string'
    && typeof envelope.authTag === 'string'
    && typeof envelope.ciphertext === 'string';
}

export function encodeSensitiveJson(value: unknown): string {
  const key = encryptionKey();
  if (!key) return JSON.stringify(value, null, 2);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  const envelope: EncryptedEnvelope = {
    encrypted: true,
    version: 1,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  return JSON.stringify(envelope);
}

export function decodeSensitiveJson<T>(raw: string): { value: T; wasEncrypted: boolean } {
  const parsed = JSON.parse(raw) as T | EncryptedEnvelope;
  if (!isEnvelope(parsed)) return { value: parsed as T, wasEncrypted: false };
  const key = encryptionKey();
  if (!key) throw new Error('Encrypted financial data cannot be read without its encryption key.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return { value: JSON.parse(plaintext) as T, wasEncrypted: true };
}
