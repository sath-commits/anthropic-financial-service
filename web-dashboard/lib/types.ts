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

// ─── Advisor types ────────────────────────────────────────────────

export interface PositionRecommendation {
  symbol: string;
  priceAtAnalysis: number;
  action: 'buy' | 'sell' | 'trim' | 'add' | 'hold';
  trimPct?: number | null; // % of shares to sell if action=trim
  conviction: 'high' | 'medium' | 'low';
  summary: string; // one-line headline
  reasoning: string; // 2-4 sentences with specific data
  catalysts: string[];
  risks: string[];
  taxNote?: string | null;
  analystConsensus?: string | null;
  analystPriceTarget?: number | null;
}

export interface BuyCandidate {
  symbol: string;
  name: string;
  priceAtAnalysis: number;
  conviction: 'high' | 'medium' | 'low';
  summary: string;
  reasoning: string;
  catalysts: string[];
  risks: string[];
  suggestedPortfolioWeightPct: number;
  analystConsensus?: string | null;
  analystPriceTarget?: number | null;
}

export interface MarketEvent {
  date: string; // ISO YYYY-MM-DD
  daysUntil: number;
  event: string;
  category: 'fed' | 'earnings' | 'economic' | 'geopolitical';
  marketExpectation: string;
  portfolioImpact: string;
  suggestedAction: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface AdvisorRun {
  id: string;
  timestamp: string; // ISO
  executiveSummary: string;
  recommendations: PositionRecommendation[];
  buyCandidates: BuyCandidate[];
  marketEvents: MarketEvent[];
  portfolioSnapshot: Array<{ symbol: string; shares: number; price: number; equity: number }>;
  totalEquityAtAnalysis: number;
}

