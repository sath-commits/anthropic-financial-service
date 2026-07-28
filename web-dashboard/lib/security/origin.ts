export function isAllowedRequestOrigin(
  origin: string | null,
  requestUrl: string,
  configuredPublicOrigin?: string,
): boolean {
  if (!origin) return true;
  const expectedOrigin = configuredPublicOrigin?.replace(/\/+$/, '')
    || new URL(requestUrl).origin;
  return origin === expectedOrigin;
}
