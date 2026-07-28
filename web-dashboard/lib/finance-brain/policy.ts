import type { UserPosition } from '@/lib/types';

interface PropertyPolicyInput {
  name?: string;
  location?: string;
  currency?: string;
  annualInterestRate?: number;
  loanTermYears?: number;
}

export function managementMode(
  position: Pick<UserPosition, 'brokerage' | 'accountMask'>,
  agenticAccountMask = process.env.FINANCE_BRAIN_AGENTIC_ACCOUNT_MASK,
): 'agentic_satellite' | 'user_managed' {
  const isRobinhood = position.brokerage?.toLowerCase().includes('robinhood') ?? false;
  const configuredMask = agenticAccountMask?.trim();
  return isRobinhood && Boolean(configuredMask) && position.accountMask?.trim() === configuredMask
    ? 'agentic_satellite'
    : 'user_managed';
}

export function isInsuranceCategory(category?: string): boolean {
  return category?.toLowerCase().includes('insurance') ?? false;
}

export function isSingaporeHdb(property: PropertyPolicyInput): boolean {
  const description = `${property.name ?? ''} ${property.location ?? ''}`.toLowerCase();
  const explicitlyHdb = /\bhdb\b/.test(description);
  const matchesKnownLoan = property.currency === 'SGD'
    && Math.abs((property.annualInterestRate ?? 0) - 2.5) < 0.0001
    && property.loanTermYears === 30;
  return explicitlyHdb || matchesKnownLoan;
}
