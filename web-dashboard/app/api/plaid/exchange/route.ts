import { NextResponse } from 'next/server';
import { getPlaidClient, plaidError } from '@/lib/plaid/client';
import { syncPlaidHoldings } from '@/lib/plaid/holdings';
import { upsertPlaidItem } from '@/lib/plaid/store';
import { rateLimit, readJsonBody, requireSameOrigin } from '@/lib/security/request';

interface ExchangeRequest {
  publicToken?: string;
  institution?: {
    institutionId?: string | null;
    name?: string | null;
  };
}

export async function POST(req: Request) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const limited = rateLimit(req, 'plaid-exchange', 5, 30 * 60 * 1000);
  if (limited) return limited;
  const { value: body, error } = await readJsonBody<ExchangeRequest>(req, 32 * 1024);
  if (error) return error;
  if (!body?.publicToken) {
    return NextResponse.json({ error: 'A Plaid public token is required.' }, { status: 400 });
  }

  try {
    const exchange = await getPlaidClient().itemPublicTokenExchange({
      public_token: body.publicToken,
    });
    await upsertPlaidItem({
      itemId: exchange.data.item_id,
      accessToken: exchange.data.access_token,
      institutionId: body.institution?.institutionId,
      institutionName: body.institution?.name,
    });
    const snapshot = await syncPlaidHoldings();
    return NextResponse.json({
      connected: true,
      itemId: exchange.data.item_id,
      snapshotAt: snapshot.capturedAt,
      positionCount: snapshot.positions.filter(position => position.plaidItemId === exchange.data.item_id).length,
      errors: snapshot.errors.filter(error => error.itemId === exchange.data.item_id),
    });
  } catch (error) {
    const detail = plaidError(error);
    return NextResponse.json(
      { error: detail.message, code: detail.code, requestId: detail.requestId },
      { status: 502 },
    );
  }
}
