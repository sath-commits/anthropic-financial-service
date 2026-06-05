import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const COOKIE_NAME = 'btn-session';

export async function POST() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return NextResponse.json({ ok: true });
}
