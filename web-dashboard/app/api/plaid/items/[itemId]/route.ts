import { NextResponse } from 'next/server';
import { getPlaidClient, plaidError } from '@/lib/plaid/client';
import { removeItemFromCurrentSnapshot } from '@/lib/plaid/snapshots';
import {
  decryptPlaidAccessToken,
  listPlaidItems,
  removePlaidItem,
} from '@/lib/plaid/store';

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  const item = (await listPlaidItems()).find(candidate => candidate.itemId === itemId);
  if (!item) return NextResponse.json({ error: 'Plaid Item not found.' }, { status: 404 });

  try {
    await getPlaidClient().itemRemove({
      access_token: decryptPlaidAccessToken(item),
    });
    await removePlaidItem(itemId);
    await removeItemFromCurrentSnapshot(itemId);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    const detail = plaidError(error);
    return NextResponse.json(
      { error: detail.message, code: detail.code, requestId: detail.requestId },
      { status: 502 },
    );
  }
}
