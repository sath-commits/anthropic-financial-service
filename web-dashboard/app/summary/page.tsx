'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, Brain, PiggyBank, Home, Layers, LayoutDashboard,
  Wallet, Building2, Car, ChevronRight,
} from 'lucide-react';
import { loadPortfolioCache, hydrateSettings } from '@/lib/storage';
import { DEFAULT_USD_TO_SGD_RATE, DEFAULT_USD_TO_INR_RATE } from '@/lib/currency';
import type { PortfolioSummary, AllocationItem, EarningsEvent } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Currency = 'USD' | 'SGD' | 'INR';
const SYMBOLS: Record<Currency, string> = { USD: '$', SGD: 'S$', INR: '₹' };

interface Rates { usdToSgd: number; usdToInr: number }

interface Property {
  id: string; name: string; location: string; currency: Currency;
  purchasePrice: number; currentPrice: number; ownership: 'outright' | 'mortgage';
  originalLoan?: number; annualInterestRate?: number;
  loanTermYears?: number; loanStartDate?: string;
}

interface OtherAsset {
  id: string; name: string; category: string; currency: Currency;
  purchasePrice: number; currentValue: number;
}

// ── Currency helpers ──────────────────────────────────────────────────────────

function toUsd(amount: number, currency: Currency, rates: Rates): number {
  if (currency === 'SGD') return amount / rates.usdToSgd;
  if (currency === 'INR') return amount / rates.usdToInr;
  return amount;
}
function fromUsd(amount: number, display: Currency, rates: Rates): number {
  if (display === 'SGD') return amount * rates.usdToSgd;
  if (display === 'INR') return amount * rates.usdToInr;
  return amount;
}
function fmt(n: number, display: Currency): string {
  const sym = SYMBOLS[display];
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${sym}${abs.toFixed(0)}`;
}

// ── Mortgage math (same as real-estate page) ──────────────────────────────────

function remainingLoan(p: Property): number {
  if (p.ownership !== 'mortgage' || !p.originalLoan) return 0;
  if (!p.annualInterestRate || !p.loanTermYears || !p.loanStartDate) return p.originalLoan;
  const r = p.annualInterestRate / 100 / 12;
  const n = p.loanTermYears * 12;
  const [year, month] = p.loanStartDate.split('-').map(Number);
  const start = new Date(year, (month || 1) - 1, 1);
  const elapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  const k = Math.min(elapsed, n);
  if (r === 0) return Math.round(p.originalLoan * (1 - k / n));
  const pn = Math.pow(1 + r, n);
  const pk = Math.pow(1 + r, k);
  return Math.max(0, Math.round(p.originalLoan * (pn - pk) / (pn - 1)));
}

// ── Storage loaders ───────────────────────────────────────────────────────────

function loadProperties(): Property[] {
  try { return JSON.parse(localStorage.getItem('portfolio-ai:real-estate-v1') ?? '[]'); } catch { return []; }
}
function loadOtherAssets(): OtherAsset[] {
  try { return JSON.parse(localStorage.getItem('portfolio-ai:other-assets-v1') ?? '[]'); } catch { return []; }
}

// ── Row component ─────────────────────────────────────────────────────────────

function Row({ label, value, sub, color = 'text-[#1c1612]', indent = false }: {
  label: string; value: string; sub?: string; color?: string; indent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${indent ? 'pl-4 border-l border-[#e5ddd3]' : ''}`}>
      <div>
        <div className={`text-sm ${indent ? 'text-[#6e5f52]' : 'text-[#4a3d33] font-medium'}`}>{label}</div>
        {sub && <div className="text-xs text-[#b8ad9e] mt-0.5">{sub}</div>}
      </div>
      <div className={`text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-[#e5ddd3] my-1" />;
}

// ── Section card ──────────────────────────────────────────────────────────────

function Section({ title, icon, onClick, children }: {
  title: string; icon: React.ReactNode; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#e5ddd3] bg-white overflow-hidden">
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between px-5 py-3 border-b border-[#e5ddd3] hover:bg-[#ede8df]/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-[#2d2218]">
          {icon}{title}
        </div>
        <ChevronRight className="h-4 w-4 text-[#b8ad9e]" />
      </button>
      <div className="px-5 divide-y divide-zinc-800/50">{children}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',   path: '/dashboard',    icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { label: 'Advisor',     path: '/advisor',       icon: <Brain className="h-3.5 w-3.5" /> },
  { label: 'Retirement',  path: '/retirement',    icon: <PiggyBank className="h-3.5 w-3.5" /> },
  { label: 'Real Estate', path: '/real-estate',   icon: <Home className="h-3.5 w-3.5" /> },
  { label: 'Other',       path: '/other-assets',  icon: <Layers className="h-3.5 w-3.5" /> },
];

export default function SummaryPage() {
  const router = useRouter();
  const [display, setDisplay] = useState<Currency>('USD');
  const [rates, setRates] = useState<Rates>({ usdToSgd: DEFAULT_USD_TO_SGD_RATE, usdToInr: DEFAULT_USD_TO_INR_RATE });

  // Portfolio data from cache
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [portfolioCost, setPortfolioCost] = useState(0);
  const [cashEquivalents, setCashEquivalents] = useState(0);

  // Real estate
  const [properties, setProperties] = useState<Property[]>([]);

  // Other assets
  const [otherAssets, setOtherAssets] = useState<OtherAsset[]>([]);

  useEffect(() => {
    type CacheShape = { summary: PortfolioSummary; allocation: AllocationItem[]; earnings: EarningsEvent[] };
    const cached = loadPortfolioCache<CacheShape>();
    if (cached?.summary) {
      setPortfolioValue(cached.summary.totalEquity);
      setPortfolioCost(cached.summary.positions?.reduce((s, p) => s + p.avgCost * p.shares, 0) ?? 0);
      setCashEquivalents(cached.summary.buyingPower ?? 0);
      setRates({
        usdToSgd: cached.summary.usdToSgdRate ?? DEFAULT_USD_TO_SGD_RATE,
        usdToInr: (cached.summary as PortfolioSummary & { usdToInrRate?: number }).usdToInrRate ?? DEFAULT_USD_TO_INR_RATE,
      });
    }
    void hydrateSettings().then(() => {
      setProperties(loadProperties());
      setOtherAssets(loadOtherAssets());
    });
  }, []);

  // ── Computed values ────────────────────────────────────────────────────────

  const toD = (n: number, currency: Currency = 'USD') =>
    fromUsd(toUsd(n, currency, rates), display, rates);

  // Investment portfolio
  const portfolioValueD = toD(portfolioValue);
  const portfolioPnlD   = toD(portfolioValue - portfolioCost);

  // Real estate
  const reTotal    = properties.reduce((s, p) => s + toD(p.currentPrice, p.currency), 0);
  const reLoans    = properties.reduce((s, p) => s + toD(remainingLoan(p), p.currency), 0);
  const reEquity   = reTotal - reLoans;
  const reCost     = properties.reduce((s, p) => s + toD(p.purchasePrice, p.currency), 0);
  const rePnl      = reTotal - reCost;

  // Other assets — insurance completely excluded from this page
  const visibleOther = otherAssets.filter(a => a.category !== 'Insurance (Cash Value)');
  const otherValue   = visibleOther.reduce((s, a) => s + toD(a.currentValue, a.currency), 0);

  // Net worth
  const totalAssets      = portfolioValueD + reTotal + otherValue;
  const totalLiabilities = reLoans;
  const netWorth         = totalAssets - totalLiabilities;

  const pnlColor = (n: number) => n >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f2eb]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#e5ddd3] px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <TrendingUp className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <span className="text-sm sm:text-base font-semibold text-[#1c1612] whitespace-nowrap">Beta than nothing</span>
          <nav className="ml-1 sm:ml-3 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            <span className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#4a3d33] bg-[#ede8df] flex-shrink-0">
              <Wallet className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden sm:inline">Net Worth</span>
            </span>
            {NAV.map(({ label, path, icon }) => (
              <button key={path} onClick={() => router.push(path)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0"
              >
                {icon}<span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>
        </div>
        <select
          value={display}
          onChange={e => setDisplay(e.target.value as Currency)}
          className="rounded-lg border border-[#d4c9bc] bg-white px-2 py-1.5 text-xs text-[#4a3d33] outline-none flex-shrink-0"
        >
          <option value="USD">USD</option>
          <option value="SGD">SGD</option>
          <option value="INR">INR</option>
        </select>
      </header>

      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-5 space-y-5 max-w-4xl mx-auto w-full">

        {/* Net Worth hero */}
        <div className="rounded-2xl border border-[#d4c9bc] bg-white px-5 py-5 sm:px-8 sm:py-6">
          <div className="text-xs font-semibold text-[#9e9087] uppercase tracking-widest mb-1">Total Net Worth</div>
          <div className="text-4xl sm:text-5xl font-bold text-[#1c1612]">{fmt(netWorth, display)}</div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#9e9087]">
            <span>Total assets: <span className="text-[#4a3d33] font-semibold">{fmt(totalAssets, display)}</span></span>
            <span>Liabilities: <span className="text-red-400 font-semibold">{fmt(-totalLiabilities, display)}</span></span>
          </div>
        </div>

        {/* Assets / Liabilities grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Investments', value: fmt(portfolioValueD, display), sub: 'stocks & ETFs', color: 'text-blue-400' },
            { label: 'Real Estate', value: fmt(reEquity, display), sub: 'equity after loans', color: 'text-orange-400' },
            { label: 'Other Assets', value: fmt(otherValue, display), sub: 'gold, vehicles, etc.', color: 'text-teal-400' },
            { label: 'Outstanding Loans', value: fmt(-reLoans, display), sub: 'mortgage principal', color: 'text-red-400' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="rounded-xl border border-[#e5ddd3] bg-white px-4 py-3">
              <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">{label}</div>
              <div className={`text-xl font-bold mt-1 ${color}`}>{value}</div>
              <div className="text-[10px] text-[#b8ad9e] mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* Investment portfolio section */}
        <Section title="Investment Portfolio" icon={<LayoutDashboard className="h-4 w-4 text-blue-400" />} onClick={() => router.push('/dashboard')}>
          <Row label="Market Value" value={fmt(portfolioValueD, display)} color="text-blue-400" />
          <Row label="Total P&L" value={`${portfolioPnlD >= 0 ? '+' : ''}${fmt(portfolioPnlD, display)}`} color={pnlColor(portfolioPnlD)} sub="vs cost basis" />
          <Row label="Cash & Equivalents" value={fmt(toD(cashEquivalents), display)} color="text-[#6e5f52]" indent sub="money market, SGOV, etc." />
        </Section>

        {/* Real estate section */}
        <Section title="Real Estate" icon={<Home className="h-4 w-4 text-orange-400" />} onClick={() => router.push('/real-estate')}>
          <Row label="Portfolio Value" value={fmt(reTotal, display)} color="text-orange-400" />
          <Row label="Outstanding Loans" value={fmt(-reLoans, display)} color="text-red-400" />
          <Row label="Net Equity" value={fmt(reEquity, display)} color="text-[#1c1612]" />
          <Row label="Unrealised P&L" value={`${rePnl >= 0 ? '+' : ''}${fmt(rePnl, display)}`} color={pnlColor(rePnl)} sub="current value vs purchase price" />
          {properties.length > 0 && <Divider />}
          {properties.map(p => (
            <Row
              key={p.id}
              label={p.name}
              value={fmt(toD(p.currentPrice - remainingLoan(p), p.currency), display)}
              sub={`${p.location} · equity`}
              color="text-[#6e5f52]"
              indent
            />
          ))}
        </Section>

        {/* Other assets section (insurance excluded entirely) */}
        {visibleOther.length > 0 && (
          <Section title="Other Assets" icon={<Layers className="h-4 w-4 text-teal-400" />} onClick={() => router.push('/other-assets')}>
            <Row label="Total Value" value={fmt(otherValue, display)} color="text-teal-400" />
            {visibleOther.length > 0 && <Divider />}
            {visibleOther.map(a => (
              <Row
                key={a.id}
                label={a.name}
                value={fmt(toD(a.currentValue, a.currency), display)}
                sub={a.category}
                color="text-[#6e5f52]"
                indent
              />
            ))}
          </Section>
        )}

        {/* Balance sheet summary */}
        <div className="rounded-xl border border-[#e5ddd3] bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e5ddd3]">
            <h2 className="text-sm font-semibold text-[#2d2218]">Balance Sheet</h2>
          </div>
          <div className="px-5 divide-y divide-zinc-800/50">
            <div className="py-2">
              <div className="text-xs font-semibold text-[#9e9087] uppercase tracking-wide mb-2">Assets</div>
              <Row label="Investment portfolio" value={fmt(portfolioValueD, display)} indent />
              <Row label="Real estate (gross)" value={fmt(reTotal, display)} indent />
              {otherValue > 0 && <Row label="Other assets" value={fmt(otherValue, display)} indent />}
            </div>
            <div className="py-2">
              <div className="text-xs font-semibold text-[#9e9087] uppercase tracking-wide mb-2">Liabilities</div>
              {reLoans > 0
                ? <Row label="Mortgage loans" value={fmt(-reLoans, display)} color="text-red-400" indent />
                : <div className="py-1 pl-4 text-sm text-[#b8ad9e]">No outstanding loans</div>}
            </div>
            <div className="py-3 flex items-center justify-between">
              <span className="text-base font-bold text-[#1c1612]">Net Worth</span>
              <span className="text-xl font-bold text-[#1c1612]">{fmt(netWorth, display)}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-[#c8c0b5] pb-4">
          Investment values from last portfolio refresh. Real estate and other assets are manually updated.
        </p>
      </main>
    </div>
  );
}
