import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'btn-session';
const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60; // 7 days

function computeHmac(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('hex');
}

function createToken(username: string, secret: string): string {
  const expires = Date.now() + SESSION_MAX_AGE_S * 1000;
  const sig = computeHmac(`${username}:${expires}`, secret);
  return Buffer.from(`${username}:${expires}:${sig}`).toString('base64');
}

export async function POST(request: Request) {
  const body = await request.json() as { username?: string; password?: string };
  const { username = '', password = '' } = body;

  const expectedUsername = process.env.DASHBOARD_AUTH_USERNAME;
  const expectedPassword = process.env.DASHBOARD_AUTH_PASSWORD;

  // Dev mode: no credentials configured — accept any login
  if (!expectedUsername || !expectedPassword) {
    if (process.env.NODE_ENV !== 'production') {
      const token = createToken(username || 'dev', 'dev-secret');
      const jar = await cookies();
      jar.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: false,
        maxAge: SESSION_MAX_AGE_S,
        path: '/',
        sameSite: 'lax',
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Auth not configured' }, { status: 503 });
  }

  if (username !== expectedUsername || password !== expectedPassword) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const token = createToken(username, expectedPassword);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE_S,
    path: '/',
    sameSite: 'lax',
  });
  return NextResponse.json({ ok: true });
}
