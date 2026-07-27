import { NextResponse } from 'next/server';
import {
  CountryCode,
  InvestmentAccountSubtype,
  Products,
} from 'plaid';
import { getPlaidClient, plaidError } from '@/lib/plaid/client';
import { rateLimit, requireSameOrigin } from '@/lib/security/request';

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const limited = rateLimit(request, 'plaid-link-token', 10, 30 * 60 * 1000);
  if (limited) return limited;
  try {
    const redirectUri = process.env.PLAID_REDIRECT_URI?.trim();
    const webhook = process.env.PLAID_WEBHOOK_URL?.trim();
    const response = await getPlaidClient().linkTokenCreate({
      user: {
        client_user_id: process.env.PLAID_CLIENT_USER_ID?.trim() || 'beta-than-nothing-owner',
      },
      client_name: 'Beta than nothing',
      products: [Products.Investments],
      country_codes: [CountryCode.Us],
      language: 'en',
      account_filters: {
        investment: {
          account_subtypes: [InvestmentAccountSubtype.All],
        },
      },
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
      ...(webhook ? { webhook } : {}),
    });
    return NextResponse.json({
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    });
  } catch (error) {
    const detail = plaidError(error);
    return NextResponse.json(
      { error: detail.message, code: detail.code, requestId: detail.requestId },
      { status: 502 },
    );
  }
}
