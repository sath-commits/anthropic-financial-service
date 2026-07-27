import 'server-only';

export function passkeyConfig(request: Request): { rpID: string; origin: string } {
  const requestUrl = new URL(request.url);
  const origin = process.env.PASSKEY_ORIGIN?.replace(/\/$/, '')
    ?? (process.env.NODE_ENV === 'production' ? '' : requestUrl.origin);
  const rpID = process.env.PASSKEY_RP_ID
    ?? (process.env.NODE_ENV === 'production' ? '' : requestUrl.hostname);
  if (!origin || !rpID) {
    throw new Error('PASSKEY_ORIGIN and PASSKEY_RP_ID must be configured in production.');
  }
  return { rpID, origin };
}
