import type { InvestorProfile, UserPosition } from '@/lib/types';

export interface FinanceBrainPosition {
  accountRef: string;
  institution: string;
  accountType: UserPosition['accountType'];
  managementMode: 'agentic_satellite' | 'user_managed';
  symbol: string;
  name: string;
  assetClass: string;
  currency: 'USD' | 'SGD' | 'INR';
  shares: number;
  averageCostUsd: number;
  currentPriceUsd: number;
  marketValueUsd: number;
  unrealizedGainLossUsd?: number;
  unrealizedGainLossPct?: number;
  holdingDays?: number;
  hasCostBasis: boolean;
  priceSource: 'live' | 'institution' | 'manual' | 'cost_basis';
}

export interface FinanceBrainSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  baseCurrency: 'USD';
  freshness: {
    plaidSnapshotAt: string | null;
    pricedAt: string;
    ageHours: number | null;
    status: 'fresh' | 'stale' | 'partial' | 'unavailable';
  };
  household: {
    investmentValue: number;
    propertyEquity: number;
    otherAssetsValue: number;
    liabilities: number;
    estimatedNetWorth: number;
  };
  profile: Pick<InvestorProfile, 'currentAge' | 'retirementAge' | 'monthlyContribution' | 'riskTolerance' | 'primaryGoal' | 'targetAllocation'> | null;
  accounts: Array<{
    accountRef: string;
    institution: string;
    accountType: UserPosition['accountType'];
    managementMode: 'agentic_satellite' | 'user_managed';
    marketValueUsd: number;
  }>;
  positions: FinanceBrainPosition[];
  allocation: Array<{ assetClass: string; currentPct: number; targetPct?: number; driftPct?: number; marketValueUsd: number }>;
  properties: Array<{
    propertyRef: string;
    currency: 'USD' | 'SGD' | 'INR';
    currentValueUsd: number;
    estimatedMortgageBalanceUsd: number;
    equityUsd: number;
    annualInterestRate?: number;
    loanTermYears?: number;
    loanStartDate?: string;
  }>;
  otherAssets: Array<{ assetRef: string; category: string; currency: 'USD' | 'SGD' | 'INR'; currentValueUsd: number }>;
  history: {
    portfolioValues: Array<{ capturedAt: string; institutionReportedValueUsd: number; positionCount: number }>;
    holdingChanges: Array<{
      capturedAt: string;
      institution: string;
      accountRef: string;
      symbol: string;
      previousShares: number;
      currentShares: number;
      shareChange: number;
    }>;
  };
  upcomingEarnings: Array<{ symbol: string; earningsDate: string; epsEstimate: number | null; daysUntil: number }>;
  warnings: string[];
}
