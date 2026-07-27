import { NextResponse } from 'next/server';
import { plaidConfiguration } from '@/lib/plaid/client';
import { readLatestPlaidSnapshot } from '@/lib/plaid/snapshots';
import { listPlaidItemStatuses } from '@/lib/plaid/store';

export async function GET() {
  const configuration = plaidConfiguration();
  if (!configuration.configured) {
    return NextResponse.json({
      ...configuration,
      items: [],
      snapshotAt: null,
    });
  }

  try {
    const [items, snapshot] = await Promise.all([
      listPlaidItemStatuses(),
      readLatestPlaidSnapshot(),
    ]);
    return NextResponse.json({
      ...configuration,
      items,
      snapshotAt: snapshot?.capturedAt ?? null,
    });
  } catch {
    return NextResponse.json({
      ...configuration,
      configured: false,
      items: [],
      snapshotAt: null,
      error: 'Could not read the encrypted Plaid connection status.',
    });
  }
}
