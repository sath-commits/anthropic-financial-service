import { NextResponse } from 'next/server';
import { plaidConfiguration } from '@/lib/plaid/client';
import { readLatestPlaidSnapshot } from '@/lib/plaid/snapshots';
import { listPlaidItemStatuses } from '@/lib/plaid/store';

export async function GET() {
  const configuration = plaidConfiguration();
  if (!configuration.configured) {
    return NextResponse.json({
      configured: false,
      positions: [],
      items: [],
      snapshotAt: null,
      errors: [],
    });
  }

  try {
    const [snapshot, items] = await Promise.all([
      readLatestPlaidSnapshot(),
      listPlaidItemStatuses(),
    ]);
    return NextResponse.json({
      configured: true,
      positions: snapshot?.positions ?? [],
      items,
      snapshotAt: snapshot?.capturedAt ?? null,
      errors: snapshot?.errors ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not read the Plaid holdings snapshot.' },
      { status: 500 },
    );
  }
}
