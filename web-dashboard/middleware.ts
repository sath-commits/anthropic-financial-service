import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'btn-session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Public paths that never require auth
const PUBLIC_PATHS = ['/', '/api/auth/login', '/api/auth/logout'];

async function computeHmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function isValidSession(token: string, secret: string): Promise<boolean> {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length < 3) return false;
    const username = parts[0];
    const expires = parseInt(parts[1], 10);
    const sig = parts.slice(2).join(':');
    if (Date.now() > expires) return false;
    const expected = await computeHmac(`${username}:${expires}`, secret);
    return sig === expected;
  } catch {
    return false;
  }
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public paths and Next.js internals
  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return withSecurityHeaders(NextResponse.next());
  }

  const secret = process.env.DASHBOARD_AUTH_PASSWORD;

  // Dev mode: no password configured — allow everything through
  if (!secret) {
    return withSecurityHeaders(NextResponse.next());
  }

  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
  if (sessionCookie && await isValidSession(sessionCookie, secret)) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Redirect unauthenticated requests to the landing/login page
  const loginUrl = new URL('/', request.url);
  return NextResponse.redirect(loginUrl);
}

export { SESSION_MAX_AGE_MS };

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
