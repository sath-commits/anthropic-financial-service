import { createHash, timingSafeEqual } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import {
  decodeProtectedHeader,
  importJWK,
  jwtVerify,
  type JWK,
} from 'jose';
import { getPlaidClient } from '@/lib/plaid/client';
import { syncPlaidHoldings } from '@/lib/plaid/holdings';
import { updatePlaidItemStatus } from '@/lib/plaid/store';

interface PlaidWebhook {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: {
    error_code?: string;
    error_message?: string;
  } | null;
}

const keyCache = new Map<string, { key: Awaited<ReturnType<typeof importJWK>>; expiredAt: number | null }>();

async function verifyWebhook(rawBody: string, signedJwt: string): Promise<boolean> {
  const header = decodeProtectedHeader(signedJwt);
  if (header.alg !== 'ES256' || !header.kid) return false;

  let cached = keyCache.get(header.kid);
  if (!cached || (cached.expiredAt !== null && cached.expiredAt * 1000 <= Date.now())) {
    const response = await getPlaidClient().webhookVerificationKeyGet({
      key_id: header.kid,
    });
    cached = {
      key: await importJWK(response.data.key as JWK, 'ES256'),
      expiredAt: response.data.key.expired_at ?? null,
    };
    keyCache.set(header.kid, cached);
  }

  const verified = await jwtVerify(signedJwt, cached.key, {
    algorithms: ['ES256'],
    maxTokenAge: '5m',
  });
  const claimedHash = verified.payload.request_body_sha256;
  if (typeof claimedHash !== 'string') return false;

  const actual = Buffer.from(createHash('sha256').update(rawBody).digest('hex'));
  const claimed = Buffer.from(claimedHash);
  return actual.length === claimed.length && timingSafeEqual(actual, claimed);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const verification = req.headers.get('plaid-verification');
  if (!verification || !await verifyWebhook(rawBody, verification).catch(() => false)) {
    return NextResponse.json({ error: 'Invalid Plaid webhook signature.' }, { status: 401 });
  }

  const webhook = JSON.parse(rawBody) as PlaidWebhook;
  if (webhook.item_id) {
    await updatePlaidItemStatus(webhook.item_id, {
      lastWebhookAt: new Date().toISOString(),
      lastError: webhook.error
        ? `${webhook.error.error_code ?? 'PLAID_ERROR'}: ${webhook.error.error_message ?? 'Plaid reported an Item error.'}`
        : null,
    });
  }

  const shouldSync =
    webhook.webhook_code === 'DEFAULT_UPDATE'
    && (webhook.webhook_type === 'HOLDINGS' || webhook.webhook_type === 'INVESTMENTS_TRANSACTIONS');
  if (shouldSync) {
    after(async () => {
      await syncPlaidHoldings().catch(() => undefined);
    });
  }

  return NextResponse.json({ received: true });
}
