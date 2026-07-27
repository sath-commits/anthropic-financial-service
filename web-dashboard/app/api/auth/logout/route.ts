import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireSameOrigin } from '@/lib/security/request';

const COOKIE_NAME = 'btn-session';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const jar = await cookies();
  jar.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return NextResponse.json(
    { ok: true },
    { headers: { 'Clear-Site-Data': '"cache", "storage"' } },
  );
}
