import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function safeEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isAuthorized(request: NextRequest): boolean {
  const expectedUsername = process.env.DASHBOARD_AUTH_USERNAME;
  const expectedPassword = process.env.DASHBOARD_AUTH_PASSWORD;
  if (!expectedUsername || !expectedPassword) return false;

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    return safeEqual(decoded.slice(0, separator), expectedUsername)
      && safeEqual(decoded.slice(separator + 1), expectedPassword);
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

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== 'production' && !process.env.DASHBOARD_AUTH_PASSWORD) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!process.env.DASHBOARD_AUTH_USERNAME || !process.env.DASHBOARD_AUTH_PASSWORD) {
    return withSecurityHeaders(new NextResponse(
      'Dashboard authentication is not configured.',
      { status: 503 },
    ));
  }

  if (!isAuthorized(request)) {
    return withSecurityHeaders(new NextResponse('Authentication required.', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Beta than nothing", charset="UTF-8"' },
    }));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
