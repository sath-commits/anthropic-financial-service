import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientAddress(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export function rateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [bucketKey, bucketValue] of buckets) {
      if (bucketValue.resetAt <= now) buckets.delete(bucketKey);
    }
    while (buckets.size > 10_000) {
      const oldestKey = buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      buckets.delete(oldestKey);
    }
  }
  const key = `${scope}:${clientAddress(request)}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count <= limit) return null;
  return NextResponse.json(
    { error: 'Too many requests. Please wait and try again.' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil((bucket.resetAt - now) / 1000)) } },
  );
}

export function requireSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const requestOrigin = new URL(request.url).origin;
  if (origin === requestOrigin) return null;
  return NextResponse.json({ error: 'Cross-site request rejected.' }, { status: 403 });
}

export async function readJsonBody<T>(
  request: Request,
  maxBytes = 256 * 1024,
): Promise<{ value: T | null; error: NextResponse | null }> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > maxBytes) {
    return {
      value: null,
      error: NextResponse.json({ error: 'Request body is too large.' }, { status: 413 }),
    };
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    return {
      value: null,
      error: NextResponse.json({ error: 'Request body is too large.' }, { status: 413 }),
    };
  }
  try {
    return { value: JSON.parse(raw) as T, error: null };
  } catch {
    return {
      value: null,
      error: NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 }),
    };
  }
}

export function secretMatches(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
