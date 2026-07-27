import { NextResponse } from 'next/server';

export async function GET() {
  const baseUrl = process.env.DATA_SERVICE_URL?.replace(/\/$/, '');
  if (!baseUrl || !process.env.DATA_SERVICE_TOKEN) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  try {
    const response = await fetch(`${baseUrl}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    return NextResponse.json({ ok: response.ok }, { status: response.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
