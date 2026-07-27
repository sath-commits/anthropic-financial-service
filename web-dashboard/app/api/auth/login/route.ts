import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { rateLimit, readJsonBody, requireSameOrigin } from '@/lib/security/request';
import { issueSession } from '@/lib/security/session';

function matches(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const limited = rateLimit(request, 'password-login', 5, 15 * 60 * 1000);
  if (limited) return limited;
  const { value: body, error } = await readJsonBody<{ username?: string; password?: string }>(request, 8 * 1024);
  if (error) return error;
  const { username = '', password = '' } = body ?? {};

  const expectedUsername = process.env.DASHBOARD_AUTH_USERNAME;
  const expectedPassword = process.env.DASHBOARD_AUTH_PASSWORD;

  // Dev mode: no credentials configured — accept any login
  if (!expectedUsername || !expectedPassword) {
    if (process.env.NODE_ENV !== 'production') {
      try {
        await issueSession(username || 'dev');
        return NextResponse.json({ ok: true });
      } catch {
        return NextResponse.json({ error: 'Set DASHBOARD_SESSION_SECRET for local login.' }, { status: 503 });
      }
    }
    return NextResponse.json({ error: 'Auth not configured' }, { status: 503 });
  }

  if (
    process.env.ALLOW_PASSWORD_LOGIN === 'false'
    || !matches(username, expectedUsername)
    || !matches(password, expectedPassword)
  ) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  try {
    await issueSession(username);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Secure session authentication is not configured.' }, { status: 503 });
  }
}
