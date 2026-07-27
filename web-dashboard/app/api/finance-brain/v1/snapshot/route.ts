import { NextResponse } from 'next/server';
import { buildFinanceBrainSnapshot } from '@/lib/finance-brain/snapshot';
import { rateLimit, secretMatches } from '@/lib/security/request';

export const maxDuration = 60;

export async function GET(request: Request) {
  const limited = rateLimit(request, 'finance-brain-read', 30, 60 * 60 * 1000);
  if (limited) return limited;

  const expected = process.env.FINANCE_BRAIN_READ_TOKEN ?? '';
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (expected.length < 64 || !provided || !secretMatches(provided, expected)) {
    return NextResponse.json(
      { error: 'Unauthorized.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    return NextResponse.json(await buildFinanceBrainSnapshot(), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    console.error('[finance-brain] Snapshot generation failed.');
    return NextResponse.json(
      { error: 'The household snapshot is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
