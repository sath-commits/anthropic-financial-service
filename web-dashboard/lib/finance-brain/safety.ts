const FORBIDDEN_KEYS = new Set([
  'accessToken',
  'accountMask',
  'address',
  'externalId',
  'itemId',
  'location',
  'password',
  'plaidAccountId',
  'plaidItemId',
  'plaidSecurityId',
  'secret',
  'token',
]);

export function assertFinanceBrainSafe(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFinanceBrainSafe(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Forbidden Finance Brain field at ${path}.${key}`);
    if (key === 'accountType' && entry === 'cpf') {
      throw new Error(`CPF account data is not permitted outside net worth at ${path}.${key}`);
    }
    if (key === 'category' && typeof entry === 'string' && entry.toLowerCase().includes('insurance')) {
      throw new Error(`Insurance data is not permitted in Finance Brain at ${path}.${key}`);
    }
    assertFinanceBrainSafe(entry, `${path}.${key}`);
  }
}
