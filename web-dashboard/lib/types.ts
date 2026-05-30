export interface Position {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  equity: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  portfolioWeightPct: number;
  accountType: 'taxable' | 'ira' | 'roth_ira' | '401k';
  holdingDays: number;
  isShortTerm: boolean;
  assetClass: string;
}

export interface PortfolioSummary {
  totalEquity: number;
  dayChange: number;
  dayChangePct: number;
  totalUnrealizedPnl: number;
  totalUnrealizedPnlPct: number;
  buyingPower: number;
  positions: Position[];
}

export interface AllocationItem {
  name: string;
  target: number;
  current: number;
  drift: number;
}

export interface EarningsEvent {
  symbol: string;
  earningsDate: string;
  epsEstimate: number | null;
  daysUntil: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Quote {
  symbol: string;
  price: number;
  error?: string;
}

// User-entered position from onboarding
export interface UserPosition {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  accountType: 'taxable' | 'ira' | 'roth_ira' | '401k';
  holdingDays: number;
  assetClass: string;
  purchaseDate?: string; // ISO date string
}

// User profile / investment goals from onboarding
export interface InvestorProfile {
  currentAge: number;
  retirementAge: number;
  monthlyContribution: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  primaryGoal: 'growth' | 'income' | 'preservation' | 'balanced';
  targetAllocation: Record<string, number>; // asset class → target weight
  strategy?: string; // AI-generated strategy summary
}
