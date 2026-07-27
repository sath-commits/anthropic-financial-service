import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'btn-session';
// Public paths that never require auth
const PUBLIC_PATHS = ['/', '/api/auth/login', '/api/auth/logout', '/api/plaid/webhook', '/api/plaid/cron', '/api/finance-brain/v1/snapshot'];

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
    const separator = token.lastIndexOf('.');
    if (separator < 1) return false;
    const encoded = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = await computeHmac(encoded, secret);
    if (signature.length !== expected.length) return false;
    let mismatch = 0;
    for (let index = 0; index < expected.length; index += 1) {
      mismatch |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
    }
    if (mismatch !== 0) return false;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      username?: string;
      expires?: number;
      purpose?: string;
    };
    return payload.purpose === 'session'
      && typeof payload.username === 'string'
      && typeof payload.expires === 'number'
      && Date.now() <= payload.expires;
  } catch {
    return false;
  }
}

function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  const developmentScripts = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScripts} https://cdn.plaid.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src https://cdn.plaid.com https://*.plaid.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (process.env.NODE_ENV === 'production') cspDirectives.push('upgrade-insecure-requests');
  const csp = cspDirectives.join('; ');
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  const continueRequest = () => withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
  );

  // Always allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.includes(pathname)
    || pathname.startsWith('/api/auth/passkey/')
    || pathname.startsWith('/_next')
    || pathname.startsWith('/favicon')
  ) {
    return continueRequest();
  }

  const secret = process.env.DASHBOARD_SESSION_SECRET;

  // Local development can run without authentication. Production always fails closed.
  if (!secret) {
    if (process.env.NODE_ENV !== 'production') return continueRequest();
    return withSecurityHeaders(NextResponse.redirect(new URL('/', request.url)), nonce);
  }

  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
  if (sessionCookie && await isValidSession(sessionCookie, secret)) {
    return continueRequest();
  }

  // Redirect unauthenticated requests to the landing/login page
  const loginUrl = new URL('/', request.url);
  return withSecurityHeaders(NextResponse.redirect(loginUrl), nonce);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
