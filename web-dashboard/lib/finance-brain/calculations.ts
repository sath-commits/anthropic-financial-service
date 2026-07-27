import { createHash } from 'node:crypto';

export interface MortgageTerms {
  ownership?: 'outright' | 'mortgage';
  originalLoan?: number;
  annualInterestRate?: number;
  loanTermYears?: number;
  loanStartDate?: string;
}

export function stableRef(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

export function estimatedMortgageBalance(property: MortgageTerms, now = new Date()): number {
  if (property.ownership !== 'mortgage' || !property.originalLoan) return 0;
  if (!property.annualInterestRate || !property.loanTermYears || !property.loanStartDate) return property.originalLoan;
  const monthlyRate = property.annualInterestRate / 100 / 12;
  const payments = property.loanTermYears * 12;
  const [year, month] = property.loanStartDate.split('-').map(Number);
  const start = new Date(year, (month || 1) - 1, 1);
  const elapsed = Math.min(payments, Math.max(0, Math.floor((now.getTime() - start.getTime()) / (86400000 * 30.44))));
  if (monthlyRate === 0) return property.originalLoan * (1 - elapsed / payments);
  const full = Math.pow(1 + monthlyRate, payments);
  const paid = Math.pow(1 + monthlyRate, elapsed);
  return Math.max(0, property.originalLoan * (full - paid) / (full - 1));
}
