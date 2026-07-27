import { NextResponse } from 'next/server';
import { plaidError } from '@/lib/plaid/client';
import { syncPlaidHoldings } from '@/lib/plaid/holdings';

export async function POST() {
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
