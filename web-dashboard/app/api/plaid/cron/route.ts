import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { syncPlaidHoldings } from '@/lib/plaid/holdings';

function matchesSecret(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export async function POST(req: Request) {
  const expected = process.env.PLAID_SYNC_SECRET;
  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected || !provided || !matchesSecret(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const snapshot = await syncPlaidHoldings();
  return NextResponse.json({
    synced: true,
    snapshotAt: snapshot.capturedAt,
    positionCount: snapshot.positions.length,
    errors: snapshot.errors,
  });
}
