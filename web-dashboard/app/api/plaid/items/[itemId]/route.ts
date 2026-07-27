import { NextResponse } from 'next/server';
import { getPlaidClient, plaidError } from '@/lib/plaid/client';
import { removeItemFromCurrentSnapshot } from '@/lib/plaid/snapshots';
import {
  decryptPlaidAccessToken,
  listPlaidItems,
  removePlaidItem,
} from '@/lib/plaid/store';
import { rateLimit, requireSameOrigin } from '@/lib/security/request';

export async function DELETE(
  req: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const limited = rateLimit(req, 'plaid-disconnect', 5, 30 * 60 * 1000);
  if (limited) return limited;
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
