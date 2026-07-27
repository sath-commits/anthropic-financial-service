import { NextResponse } from 'next/server';
import { plaidError } from '@/lib/plaid/client';
import { syncPlaidHoldings } from '@/lib/plaid/holdings';
import { rateLimit, requireSameOrigin } from '@/lib/security/request';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const limited = rateLimit(request, 'plaid-manual-sync', 5, 15 * 60 * 1000);
  if (limited) return limited;
  try {
    const snapshot = await syncPlaidHoldings();
    return NextResponse.json({
      synced: true,
      snapshotAt: snapshot.capturedAt,
      positionCount: snapshot.positions.length,
      errors: snapshot.errors,
    });
  } catch (error) {
    const detail = plaidError(error);
    return NextResponse.json(
      { error: detail.message, code: detail.code, requestId: detail.requestId },
      { status: 502 },
    );
  }
}
