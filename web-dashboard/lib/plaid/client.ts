import 'server-only';

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
} from 'plaid';

export type PlaidEnvironmentName = 'sandbox' | 'production';

interface PlaidApiError {
  response?: {
    data?: {
      error_code?: string;
      error_message?: string;
      display_message?: string | null;
      request_id?: string;
    };
  };
  message?: string;
}

let cachedClient: PlaidApi | null = null;
let cachedClientKey = '';

export function plaidEnvironment(): PlaidEnvironmentName {
  return process.env.PLAID_ENV === 'sandbox' ? 'sandbox' : 'production';
}

export function plaidConfiguration() {
  const missing: string[] = [];
  if (!process.env.PLAID_CLIENT_ID) missing.push('PLAID_CLIENT_ID');
  if (!process.env.PLAID_SECRET) missing.push('PLAID_SECRET');
  if (!process.env.PLAID_TOKEN_ENCRYPTION_KEY) missing.push('PLAID_TOKEN_ENCRYPTION_KEY');
  return {
    configured: missing.length === 0,
    environment: plaidEnvironment(),
    missing,
  };
}

export function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error('Plaid is not configured.');
  }

  const environment = plaidEnvironment();
  const clientKey = `${environment}:${clientId}:${secret}`;
  if (cachedClient && cachedClientKey === clientKey) return cachedClient;

  const configuration = new Configuration({
    basePath: environment === 'sandbox'
      ? PlaidEnvironments.sandbox
      : PlaidEnvironments.production,
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
        'Plaid-Version': '2020-09-14',
      },
    },
  });
  cachedClient = new PlaidApi(configuration);
  cachedClientKey = clientKey;
  return cachedClient;
}

export function plaidError(error: unknown): {
  code: string;
  message: string;
  requestId?: string;
} {
  const candidate = error as PlaidApiError;
  const data = candidate.response?.data;
  return {
    code: data?.error_code ?? 'PLAID_REQUEST_FAILED',
    message: data?.display_message || data?.error_message || candidate.message || 'Plaid request failed.',
    requestId: data?.request_id,
  };
}
