import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'btn-session';
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

function sessionSecret(): string {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('DASHBOARD_SESSION_SECRET must be configured with at least 32 characters.');
  }
  return secret;
}

function sign(message: string): string {
  return createHmac('sha256', sessionSecret()).update(message).digest('hex');
}

export function createSignedValue(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifySignedValue<T extends object>(value: string): T | null {
  const separator = value.lastIndexOf('.');
  if (separator < 1) return null;
  const encoded = value.slice(0, separator);
  const supplied = Buffer.from(value.slice(separator + 1), 'hex');
  const expected = Buffer.from(sign(encoded), 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export async function issueSession(username: string): Promise<void> {
  const expires = Date.now() + SESSION_MAX_AGE_S * 1000;
  const token = createSignedValue({ username, expires, purpose: 'session' });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_S,
    path: '/',
    sameSite: 'lax',
  });
}
