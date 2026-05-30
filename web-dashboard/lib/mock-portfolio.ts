// Mock portfolio — cost basis and account info.
// Live prices are fetched from yfinance at runtime; mockCurrentPrice is the fallback.

export interface MockPosition {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  mockCurrentPrice: number; // fallback when live price fetch fails
  accountType: 'taxable' | 'ira' | 'roth_ira' | '401k';
  holdingDays: number;
  assetClass: string;
}

export const MOCK_POSITIONS: MockPosition[] = [
  { symbol: 'VOO',  name: 'Vanguard S&P 500 ETF',          shares: 15,  avgCost: 420.50, mockCurrentPrice: 548.20, accountType: 'taxable', holdingDays: 450, assetClass: 'US Large Cap' },
  { symbol: 'AAPL', name: 'Apple Inc.',                     shares: 50,  avgCost: 165.20, mockCurrentPrice: 211.45, accountType: 'taxable', holdingDays: 380, assetClass: 'US Large Cap' },
  { symbol: 'MSFT', name: 'Microsoft Corp.',                shares: 25,  avgCost: 380.00, mockCurrentPrice: 461.80, accountType: 'taxable', holdingDays: 520, assetClass: 'US Large Cap' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.',                   shares: 20,  avgCost: 520.00, mockCurrentPrice: 1138.60, accountType: 'taxable', holdingDays: 600, assetClass: 'US Large Cap' },
  { symbol: 'INTC', name: 'Intel Corp.',                    shares: 100, avgCost: 35.00,  mockCurrentPrice: 19.82,  accountType: 'taxable', holdingDays: 280, assetClass: 'US Large Cap' },
  { symbol: 'VEA',  name: 'Vanguard FTSE Developed Mkts',  shares: 60,  avgCost: 46.00,  mockCurrentPrice: 58.33,  accountType: 'ira',     holdingDays: 720, assetClass: 'International' },
  { symbol: 'BND',  name: 'Vanguard Total Bond Market ETF', shares: 50,  avgCost: 74.50,  mockCurrentPrice: 70.15,  accountType: 'ira',     holdingDays: 365, assetClass: 'Bonds' },
  { symbol: 'JNJ',  name: 'Johnson & Johnson',              shares: 30,  avgCost: 162.00, mockCurrentPrice: 144.70, accountType: 'taxable', holdingDays: 150, assetClass: 'US Large Cap' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.',                shares: 10,  avgCost: 180.00, mockCurrentPrice: 226.10, accountType: 'taxable', holdingDays: 200, assetClass: 'US Large Cap' },
  { symbol: 'VWO',  name: 'Vanguard FTSE Emerging Markets', shares: 40,  avgCost: 42.50,  mockCurrentPrice: 47.90,  accountType: 'ira',     holdingDays: 480, assetClass: 'Emerging Markets' },
];

export const TARGET_ALLOCATION: Record<string, number> = {
  'US Large Cap':    0.60,
  'International':   0.15,
  'Emerging Markets': 0.05,
  'Bonds':           0.20,
};
