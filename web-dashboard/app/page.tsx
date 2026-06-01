'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, Upload, RefreshCw, TrendingUp, Calendar, Bot, Brain, Plus, X, Edit2, PiggyBank, Home, Layers, Wallet } from 'lucide-react';
import MetricCard from '@/components/MetricCard';
import PositionsTable from '@/components/PositionsTable';
import AllocationChart from '@/components/AllocationChart';
import PnLChart from '@/components/PnLChart';
import EarningsStrip from '@/components/EarningsStrip';
import ChatPanel from '@/components/ChatPanel';
import PortfolioEditor from '@/components/PortfolioEditor';
import { downloadSettingsBackup, hydrateSettings, savePositions, saveProfile, savePortfolioCache, loadPortfolioCache } from '@/lib/storage';
import { TARGET_ALLOCATION } from '@/lib/mock-portfolio';
import { formatCurrency, toUsd, positionCurrency, DEFAULT_USD_TO_INR_RATE, type Currency } from '@/lib/currency';
import { isCashEquivalent } from '@/lib/cash-equivalents';
import type { PortfolioSummary, AllocationItem, EarningsEvent, UserPosition, InvestorProfile, Position } from '@/lib/types';

const ASSET_CLASSES = ['US Large Cap', 'US Small/Mid Cap', 'International', 'Emerging Markets', 'Bonds', 'REITs', 'Real Estate', 'Gold / Commodities', 'Alternatives', 'Cash'];
const ACCOUNT_TYPES: UserPosition['accountType'][] = ['taxable', 'ira', 'roth_ira', '401k', 'hsa', 'cpf'];

interface HoldingDraft {
  symbol: string;
  name: string;
  shares: string;
  avgCost: string;
  accountType: UserPosition['accountType'] | '';
  currency: Currency;
  assetClass: string;
  purchaseDate: string;
  brokerage: string;
  currentValue: string;
}

function holdingDraft(position: UserPosition): HoldingDraft {
  return {
    symbol: position.symbol, name: position.name, shares: String(position.shares), avgCost: String(position.avgCost),
    accountType: position.accountType, currency: position.currency ?? (position.accountType === 'cpf' ? 'SGD' : 'USD'), assetClass: position.assetClass, purchaseDate: position.purchaseDate ?? '',
    brokerage: position.brokerage ?? 'Fidelity',
    currentValue: position.currentValue != null ? String(position.currentValue) : '',
  };
}

function daysHeld(dateStr: string): number {
  if (!dateStr) return 365;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

function matchesStoredPosition(stored: UserPosition, displayed: Position): boolean {
  // avgCost is excluded: route.ts converts it to USD, so native-currency values won't match
  return stored.symbol === displayed.symbol
    && stored.accountType === displayed.accountType
    && stored.assetClass === displayed.assetClass
    && Math.abs(stored.shares - displayed.shares) < 0.001;
}

// ─── Client-side position recompute (avoids full API round-trip on edits) ────

function recomputePositionFast(
  userPos: UserPosition,
  currentPriceUsd: number,
  hasLivePrice: boolean,
  usdToSgdRate: number,
  usdToInrRate: number,
): Position {
  const currency = positionCurrency(userPos.currency);
  const isCpf = userPos.accountType === 'cpf';
  let priceUsd: number;
  let live: boolean;
  if (isCpf) {
    priceUsd = toUsd(userPos.avgCost * Math.pow(1.045, userPos.holdingDays / 365), currency, usdToSgdRate, usdToInrRate);
    live = true;
  } else if (userPos.currentValue != null) {
    priceUsd = toUsd(userPos.currentValue, currency, usdToSgdRate, usdToInrRate);
    live = true;
  } else {
    priceUsd = currentPriceUsd;
    live = hasLivePrice;
  }
  const avgCostUsd = toUsd(userPos.avgCost, currency, usdToSgdRate, usdToInrRate);
  const equity = priceUsd * userPos.shares;
  const costTotal = avgCostUsd * userPos.shares;
  const cpfGrowthFactor = Math.pow(1.045, userPos.holdingDays / 365);
  return {
    symbol: userPos.symbol, name: userPos.name, shares: userPos.shares, avgCost: avgCostUsd,
    currentPrice: priceUsd, hasLivePrice: live, equity,
    unrealizedPnl: isCpf ? Math.max(0, equity - costTotal) : equity - costTotal,
    unrealizedPnlPct: isCpf
      ? Math.max(0, (cpfGrowthFactor - 1) * 100)
      : ((priceUsd / userPos.avgCost) - 1) * 100,
    portfolioWeightPct: 0,
    accountType: userPos.accountType, currency,
    brokerage: userPos.brokerage ?? 'Fidelity',
    holdingDays: userPos.holdingDays,
    isShortTerm: userPos.holdingDays < 366,
    assetClass: userPos.assetClass,
  };
}

function applyLocalPositionUpdate(
  rawPositions: Position[],
  summaryBase: PortfolioSummary,
  profile: InvestorProfile | null,
  earnings: EarningsEvent[],
): { summary: PortfolioSummary; allocation: AllocationItem[] } {
  const totalEquity = rawPositions.reduce((s, p) => s + p.equity, 0);
  const withWeights = [...rawPositions]
    .sort((a, b) => b.equity - a.equity)
    .map(p => ({ ...p, portfolioWeightPct: totalEquity > 0 ? (p.equity / totalEquity) * 100 : 0 }));
  const totalCost = withWeights.reduce((s, p) => s + p.avgCost * p.shares, 0);
  const totalUnrealizedPnl = withWeights.reduce((s, p) => s + p.unrealizedPnl, 0);
  const cashPositions = withWeights.filter(p => isCashEquivalent(p.symbol, p.assetClass));
  const cashEquivalentsByAccount = cashPositions.reduce<PortfolioSummary['cashEquivalentsByAccount']>((acc, p) => {
    acc[p.accountType] = (acc[p.accountType] ?? 0) + p.equity;
    return acc;
  }, {});
  const summary: PortfolioSummary = {
    ...summaryBase,
    positions: withWeights,
    totalEquity,
    totalUnrealizedPnl,
    totalUnrealizedPnlPct: totalCost > 0 ? (totalUnrealizedPnl / totalCost) * 100 : 0,
    buyingPower: cashPositions.reduce((s, p) => s + p.equity, 0),
    cashEquivalentsByAccount,
    missingPriceSymbols: withWeights.filter(p => !p.hasLivePrice).map(p => p.symbol),
  };
  const targets = profile?.targetAllocation ?? TARGET_ALLOCATION;
  const actualByClass: Record<string, number> = {};
  for (const p of withWeights) actualByClass[p.assetClass] = (actualByClass[p.assetClass] ?? 0) + p.equity;
  const allocation: AllocationItem[] = Object.entries(targets).map(([name, target]) => {
    const current = totalEquity > 0 ? (actualByClass[name] ?? 0) / totalEquity : 0;
    return { name, target, current, drift: current - target };
  });
  return { summary, allocation };
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#ede8df] ${className}`} />;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [allocation, setAllocation] = useState<AllocationItem[]>([]);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [chartSymbol, setChartSymbol] = useState('');
  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const [userPositions, setUserPositions] = useState<UserPosition[] | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [holding, setHolding] = useState<HoldingDraft | null>(null);
  const [holdingError, setHoldingError] = useState('');
  const [addingPortfolio, setAddingPortfolio] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('USD');
  const [brokerageFilter, setBrokerageFilter] = useState<string>('All');
  const [liquidityFilter, setLiquidityFilter] = useState<'All' | 'Liquid' | 'Illiquid'>('All');
  const [editingAllocation, setEditingAllocation] = useState(false);
  const [allocationDraft, setAllocationDraft] = useState<Record<string, string>>({});
  const [allocationError, setAllocationError] = useState('');
  const restoreInputRef = useRef<HTMLInputElement>(null);

  async function load(positions?: UserPosition[] | null, prof?: InvestorProfile | null, silent = false) {
    if (!silent) setLoading(true);
    try {
      const posToSend = positions ?? userPositions;
      // Use explicitly-passed profile first, then state (for refresh calls)
      const profileToUse = prof !== undefined ? prof : profile;
      const res = posToSend
        ? await fetch('/api/portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              positions: posToSend,
              targetAllocation: profileToUse?.targetAllocation ?? null,
            }),
          })
        : await fetch('/api/portfolio');
      const data = await res.json();
      setSummary(data.summary);
      setAllocation(data.allocation);
      setEarnings(data.earnings);
      setLastUpdated(new Date().toLocaleTimeString());
      savePortfolioCache(data);
      if (!chartSymbol && data.summary?.positions?.length) {
        setChartSymbol(data.summary.positions[0].symbol);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Show last-known portfolio instantly from localStorage while live prices load
    type CacheShape = { summary: PortfolioSummary; allocation: AllocationItem[]; earnings: EarningsEvent[] };
    const cached = loadPortfolioCache<CacheShape>();
    let hadCache = false;
    if (cached?.summary) {
      hadCache = true;
      setSummary(cached.summary);
      setAllocation(cached.allocation ?? []);
      setEarnings(cached.earnings ?? []);
      setLoading(false);
      if (cached.summary.positions?.length) setChartSymbol(cached.summary.positions[0].symbol);
    }

    void hydrateSettings().then(({ positions, profile: savedProfile }) => {
      const savedPositions = positions ?? [];
      setUserPositions(savedPositions);
      setProfile(savedProfile ?? null);
      // Pass values directly because React state may not reflect them yet.
      // silent=true when cache already rendered — no flash of skeletons
      load(savedPositions, savedProfile ?? null, hadCache);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPnlPositive = (summary?.totalUnrealizedPnl ?? 0) >= 0;
  const hasCompleteLivePrices = summary?.missingPriceSymbols.length === 0;
  const hsaCashEquivalents = summary?.cashEquivalentsByAccount.hsa ?? 0;

  function openAddHolding() {
    setAddingPortfolio(true);
  }

  function openEditHolding(position: Position) {
    const index = (userPositions ?? []).findIndex(stored => matchesStoredPosition(stored, position));
    if (index < 0) return;
    setEditingIndex(index);
    setHolding(holdingDraft(userPositions![index]));
    setHoldingError('');
  }

  function deleteHolding(position: Position) {
    const positions = userPositions ?? [];
    const index = positions.findIndex(stored => matchesStoredPosition(stored, position));
    if (index < 0 || !window.confirm(`Delete ${position.symbol} from your portfolio?`)) return;
    const next = positions.filter((_, positionIndex) => positionIndex !== index);
    savePositions(next, { allowEmptyPositions: next.length === 0 });
    setUserPositions(next);
    setChartSymbol(next[0]?.symbol ?? '');
    if (summary) {
      const rawPositions = summary.positions.filter(p => p !== position);
      const { summary: s, allocation: a } = applyLocalPositionUpdate(rawPositions, summary, profile, earnings);
      setSummary(s);
      setAllocation(a);
      savePortfolioCache({ summary: s, allocation: a, earnings });
      return;
    }
    load(next, profile);
  }

  function saveHolding() {
    if (!holding || editingIndex === null) return;
    const shares = Number(holding.shares);
    const avgCost = Number(holding.avgCost);
    const symbol = holding.symbol.trim().toUpperCase();
    if (!symbol || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgCost) || avgCost <= 0 || !holding.accountType || !holding.assetClass) {
      setHoldingError('Enter a ticker, positive shares, positive average cost, account, and asset class.');
      return;
    }
    const oldUserPos = (userPositions ?? [])[editingIndex];
    const updated: UserPosition = {
      symbol, name: holding.name.trim() || symbol, shares, avgCost, accountType: holding.accountType, currency: holding.currency,
      assetClass: holding.assetClass, purchaseDate: holding.purchaseDate || undefined, holdingDays: daysHeld(holding.purchaseDate),
      brokerage: holding.brokerage.trim() || 'Fidelity',
      currentValue: holding.currentValue ? Number(holding.currentValue) : undefined,
    };
    const next = [...(userPositions ?? [])];
    next[editingIndex] = updated;
    savePositions(next);
    setUserPositions(next);
    setHolding(null);
    // Fast path: same symbol — recompute this row client-side, no API call
    if (summary && oldUserPos && symbol === oldUserPos.symbol) {
      // Match by symbol+accountType; fall back to symbol-only so a stale
      // accountType never silently drops through to the full API reload.
      const existingPos =
        summary.positions.find(p => p.symbol === oldUserPos.symbol && p.accountType === oldUserPos.accountType)
        ?? summary.positions.find(p => p.symbol === oldUserPos.symbol);
      const inrRate = summary.usdToInrRate ?? DEFAULT_USD_TO_INR_RATE;
      const cachedPrice = existingPos?.currentPrice ?? 0;
      const hasLive = existingPos?.hasLivePrice ?? false;
      const newPos = recomputePositionFast(updated, cachedPrice, hasLive, summary.usdToSgdRate, inrRate);
      const rawPositions = existingPos
        ? summary.positions.map(p => p === existingPos ? newPos : p)
        : [...summary.positions, newPos];
      const { summary: s, allocation: a } = applyLocalPositionUpdate(rawPositions, summary, profile, earnings);
      setSummary(s);
      setAllocation(a);
      savePortfolioCache({ summary: s, allocation: a, earnings });
      return;
    }
    // Slow path: ticker changed — fetch live price for new symbol
    load(next, profile);
  }

  function appendPositions(positions: UserPosition[]) {
    const next = [...(userPositions ?? []), ...positions];
    savePositions(next);
    setUserPositions(next);
    setAddingPortfolio(false);
    load(next, profile);
  }

  async function restoreSettingsBackup(file: File | undefined) {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as { positions?: UserPosition[]; profile?: InvestorProfile | null };
      if (!Array.isArray(backup.positions) || !backup.positions.length) throw new Error('Backup does not contain any holdings.');
      if (!window.confirm(`Restore ${backup.positions.length} holdings from this backup? This replaces the current portfolio after preserving a snapshot.`)) return;
      savePositions(backup.positions);
      if (backup.profile) saveProfile(backup.profile);
      setUserPositions(backup.positions);
      setProfile(backup.profile ?? profile);
      setChartSymbol(backup.positions[0]?.symbol ?? '');
      load(backup.positions, backup.profile ?? profile);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not restore that portfolio backup.');
    } finally {
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  }

  const portfolioContext = summary
    ? `Total equity: $${fmt(summary.totalEquity)}\nTotal P&L: ${totalPnlPositive ? '+' : '-'}$${fmt(Math.abs(summary.totalUnrealizedPnl))} (${fmt(summary.totalUnrealizedPnlPct)}%)\nBuying power: $${fmt(summary.buyingPower)}\n\nPositions:\n${summary.positions.map(p => `${p.symbol} (${p.accountType}): ${p.shares} shares @ $${fmt(p.currentPrice)}, cost $${fmt(p.avgCost)}, equity $${fmt(p.equity)}, P&L ${p.unrealizedPnl >= 0 ? '+' : ''}$${fmt(p.unrealizedPnl)} (${fmt(p.unrealizedPnlPct)}%), weight ${fmt(p.portfolioWeightPct)}%, ${p.isShortTerm ? 'short-term' : 'long-term'}`).join('\n')}`
    : undefined;

  const profileContext = profile
    ? `Age: ${profile.currentAge}, retirement age: ${profile.retirementAge}\nMonthly contribution: $${profile.monthlyContribution}\nRisk tolerance: ${profile.riskTolerance}, primary goal: ${profile.primaryGoal}\nTarget allocation: ${Object.entries(profile.targetAllocation).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ')}${profile.strategy ? `\nStrategy: ${profile.strategy}` : ''}`
    : undefined;

  const isOwnPortfolio = userPositions !== null;

  const uniqueBrokerages = summary?.positions
    ? [...new Set(summary.positions.map(p => p.brokerage).filter(Boolean))].sort() as string[]
    : [];
  const isLiquid = (p: Position) => p.accountType !== 'cpf' && p.assetClass !== 'Real Estate';
  const filteredPositions = (summary?.positions ?? []).filter(p => {
    if (brokerageFilter !== 'All' && p.brokerage !== brokerageFilter) return false;
    if (liquidityFilter === 'Liquid' && !isLiquid(p)) return false;
    if (liquidityFilter === 'Illiquid' && isLiquid(p)) return false;
    return true;
  });

  function openAllocationEditor() {
    const targets = profile?.targetAllocation ?? TARGET_ALLOCATION;
    const draft: Record<string, string> = {};
    for (const cls of ASSET_CLASSES) {
      draft[cls] = targets[cls] != null ? String(Math.round(targets[cls] * 100)) : '0';
    }
    setAllocationDraft(draft);
    setAllocationError('');
    setEditingAllocation(true);
  }

  function saveAllocation() {
    const total = Object.values(allocationDraft).reduce((sum, v) => sum + (Number(v) || 0), 0);
    if (Math.abs(total - 100) > 0.5) {
      setAllocationError(`Total is ${total.toFixed(0)}% — must equal 100%.`);
      return;
    }
    const targetAllocation: Record<string, number> = {};
    for (const [cls, v] of Object.entries(allocationDraft)) {
      const pct = Number(v) || 0;
      if (pct > 0) targetAllocation[cls] = pct / 100;
    }
    const updatedProfile: InvestorProfile = {
      ...(profile ?? { currentAge: 30, retirementAge: 65, monthlyContribution: 0, riskTolerance: 'moderate', primaryGoal: 'growth', targetAllocation: {} }),
      targetAllocation,
    };
    saveProfile(updatedProfile);
    setProfile(updatedProfile);
    setEditingAllocation(false);
    load(userPositions, updatedProfile);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f2eb]">
      {/* Top bar */}
      <header className="border-b border-[#e5ddd3]">
      <div className="flex items-center justify-between px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <TrendingUp className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <span className="text-sm sm:text-base font-semibold text-[#1c1612] whitespace-nowrap">Beta than nothing</span>

          <nav className="ml-1 sm:ml-3 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            <Link href="/summary" className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0">
              <Wallet className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Net Worth</span>
            </Link>
            <span className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 text-xs font-medium text-[#4a3d33] bg-[#ede8df] whitespace-nowrap flex-shrink-0">
              <span className="hidden sm:inline">Dashboard</span>
              <span className="sm:hidden text-[10px]">Dash</span>
            </span>
            <Link href="/advisor" className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0">
              <Brain className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Advisor</span>
            </Link>
            <Link href="/retirement" className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0">
              <PiggyBank className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Retirement</span>
            </Link>
            <Link href="/real-estate" className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0">
              <Home className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Real Estate</span>
            </Link>
            <Link href="/other-assets" className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0">
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Other</span>
            </Link>
          </nav>
        </div>
        {/* Action buttons — always visible, right side of top row */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] bg-white px-2.5 py-1.5 text-xs text-[#4a3d33] hover:bg-[#ede8df] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={openAddHolding}
            className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] bg-white px-2.5 py-1.5 text-xs text-[#6e5f52] hover:bg-white hover:text-[#2d2218] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add holding</span>
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#e5ddd3]/60 px-3 py-2 sm:px-6 text-xs text-[#9e9087]">
        <select
          value={displayCurrency}
          onChange={event => setDisplayCurrency(event.target.value as Currency)}
          className="rounded-lg border border-[#d4c9bc] bg-white px-2 py-1.5 text-[#4a3d33] outline-none"
          aria-label="Display currency"
        >
          <option value="USD">USD</option>
          <option value="SGD">SGD</option>
        </select>
        {uniqueBrokerages.length > 1 && (
          <select
            value={brokerageFilter}
            onChange={event => setBrokerageFilter(event.target.value)}
            className="rounded-lg border border-[#d4c9bc] bg-white px-2 py-1.5 text-[#4a3d33] outline-none"
            aria-label="Filter by brokerage"
          >
            <option value="All">All brokerages</option>
            {uniqueBrokerages.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <select
          value={liquidityFilter}
          onChange={event => setLiquidityFilter(event.target.value as typeof liquidityFilter)}
          className="rounded-lg border border-[#d4c9bc] bg-white px-2 py-1.5 text-[#4a3d33] outline-none"
          aria-label="Filter by liquidity"
        >
          <option value="All">All assets</option>
          <option value="Liquid">Liquid only</option>
          <option value="Illiquid">Illiquid only</option>
        </select>
        {displayCurrency === 'SGD' && summary && (
          <span className={summary.hasLiveUsdToSgdRate ? 'text-[#9e9087]' : 'text-amber-400'}>
            1 USD = {summary.usdToSgdRate.toFixed(4)} SGD
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadSettingsBackup(userPositions ?? [], profile)}
            className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] bg-white px-2.5 py-1.5 text-[#4a3d33] hover:bg-[#ede8df] transition-colors"
            title="Download portfolio backup"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <input ref={restoreInputRef} type="file" accept="application/json,.json" className="hidden"
            onChange={event => void restoreSettingsBackup(event.target.files?.[0])} />
          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] bg-white px-2.5 py-1.5 text-[#4a3d33] hover:bg-[#ede8df] transition-colors"
            title="Restore portfolio backup"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Restore</span>
          </button>
        </div>
      </div>
      </header>

      {editingAllocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#d4c9bc] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[#1c1612]">Target Allocation</h2>
              <button onClick={() => setEditingAllocation(false)} className="rounded p-1 text-[#9e9087] hover:bg-white hover:text-[#2d2218]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-[#9e9087]">Set target percentages. Must total 100%.</p>
            <div className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto">
              {ASSET_CLASSES.map(cls => (
                <label key={cls} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-[#4a3d33] truncate">{cls}</span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <input
                      type="number" min="0" max="100" step="1"
                      value={allocationDraft[cls] ?? '0'}
                      onChange={e => setAllocationDraft(d => ({ ...d, [cls]: e.target.value }))}
                      className="w-14 rounded bg-white px-2 py-1 text-right text-sm text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600"
                    />
                    <span className="text-sm text-[#9e9087]">%</span>
                  </div>
                </label>
              ))}
            </div>
            {(() => {
              const total = Object.values(allocationDraft).reduce((sum, v) => sum + (Number(v) || 0), 0);
              return (
                <p className={`mt-3 text-sm font-medium ${Math.abs(total - 100) < 0.5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  Total: {total.toFixed(0)}%
                </p>
              );
            })()}
            {allocationError && <p className="mt-2 text-sm text-red-400">{allocationError}</p>}
            <div className="mt-5 flex gap-3">
              <button onClick={saveAllocation} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                Save
              </button>
              <button onClick={() => setEditingAllocation(false)} className="rounded-lg border border-[#d4c9bc] px-4 py-2 text-sm text-[#6e5f52] hover:bg-[#ede8df]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {addingPortfolio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-[#d4c9bc] bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[#1c1612]">Add holdings</h2>
                <p className="mt-1 text-sm text-[#9e9087]">
                  Import brokerage holdings, review the rows, then add them to your portfolio.
                </p>
              </div>
              <button
                onClick={() => setAddingPortfolio(false)}
                className="rounded-lg p-1.5 text-[#9e9087] transition-colors hover:bg-white hover:text-[#2d2218]"
                aria-label="Close add holdings"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <PortfolioEditor onSubmit={appendPositions} submitLabel="Add reviewed holdings" />
          </div>
        </div>
      )}

      {holding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#d4c9bc] bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[#1c1612]">Edit {holding.symbol}</h2>
              <button onClick={() => setHolding(null)} className="rounded p-1 text-[#9e9087] hover:bg-white hover:text-[#2d2218]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Ticker</span>
                <input value={holding.symbol} onChange={e => setHolding({ ...holding, symbol: e.target.value.toUpperCase() })}
                  placeholder="AAPL" maxLength={10}
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Name optional</span>
                <input value={holding.name} onChange={e => setHolding({ ...holding, name: e.target.value })}
                  placeholder="Apple Inc."
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Shares</span>
                <input type="number" value={holding.shares} onChange={e => setHolding({ ...holding, shares: e.target.value })}
                  min="0" step="any"
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Average cost</span>
                <input type="number" value={holding.avgCost} onChange={e => setHolding({ ...holding, avgCost: e.target.value })}
                  min="0" step="any"
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Account</span>
                <select value={holding.accountType} onChange={e => {
                  const accountType = e.target.value as UserPosition['accountType'];
                  setHolding({ ...holding, accountType, currency: accountType === 'cpf' ? 'SGD' : holding.currency });
                }}
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#4a3d33] outline-none focus:ring-1 focus:ring-zinc-600">
                  {ACCOUNT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Currency</span>
                <select value={holding.currency} onChange={e => setHolding({ ...holding, currency: e.target.value as Currency })}
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#4a3d33] outline-none focus:ring-1 focus:ring-zinc-600">
                  <option value="USD">USD</option>
                  <option value="SGD">SGD</option>
                  <option value="INR">INR (₹)</option>
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Asset class</span>
                <select value={holding.assetClass} onChange={e => setHolding({ ...holding, assetClass: e.target.value })}
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#4a3d33] outline-none focus:ring-1 focus:ring-zinc-600">
                  {ASSET_CLASSES.map(assetClass => <option key={assetClass} value={assetClass}>{assetClass}</option>)}
                </select>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Purchase date optional</span>
                <input type="date" value={holding.purchaseDate} onChange={e => setHolding({ ...holding, purchaseDate: e.target.value })}
                  max={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#4a3d33] outline-none focus:ring-1 focus:ring-zinc-600" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Brokerage</span>
                <input value={holding.brokerage} onChange={e => setHolding({ ...holding, brokerage: e.target.value })}
                  placeholder="Fidelity"
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600" />
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Current market value optional</span>
                <input type="number" value={holding.currentValue} onChange={e => setHolding({ ...holding, currentValue: e.target.value })}
                  placeholder="For real estate, gold — overrides live price"
                  min="0" step="any"
                  className="w-full rounded-lg bg-white px-3 py-2 text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600" />
              </label>
            </div>
            {holdingError && <p className="mt-4 text-sm text-red-400">{holdingError}</p>}
            <div className="mt-6 flex items-center gap-3">
              <button onClick={saveHolding} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500">
                Save changes
              </button>
              <button onClick={() => setHolding(null)} className="rounded-lg border border-[#d4c9bc] px-4 py-2 text-sm text-[#6e5f52] transition-colors hover:bg-white hover:text-[#2d2218]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-5">
        {summary && !hasCompleteLivePrices && (
          <div className="rounded-lg border border-amber-300 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            Live prices are unavailable for {summary.missingPriceSymbols.join(', ')}. Values are temporarily estimated from cost basis.
            Check that <code className="mx-1 rounded bg-black/20 px-1 py-0.5">DATA_SERVICE_URL</code> and
            <code className="mx-1 rounded bg-black/20 px-1 py-0.5">DATA_SERVICE_TOKEN</code> are configured on the dashboard service,
            and that the same token is configured on the Python service.
          </div>
        )}
        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : summary ? (
            <>
              <MetricCard
                label="Portfolio Value"
                value={formatCurrency(summary.totalEquity, displayCurrency, summary.usdToSgdRate)}
                positive={null}
              />
              <MetricCard
                label="Total P&L"
                value={hasCompleteLivePrices ? `${totalPnlPositive ? '+' : '-'}${formatCurrency(Math.abs(summary.totalUnrealizedPnl), displayCurrency, summary.usdToSgdRate)}` : '—'}
                subValue={hasCompleteLivePrices ? `${totalPnlPositive ? '+' : ''}${fmt(summary.totalUnrealizedPnlPct)}%` : 'Waiting for live prices'}
                positive={hasCompleteLivePrices ? totalPnlPositive : null}
              />
              <MetricCard
                label="Day Change"
                value={summary.dayChange === 0 ? '—' : `${summary.dayChange >= 0 ? '+' : '-'}$${fmt(Math.abs(summary.dayChange))}`}
                subValue={summary.dayChange === 0 ? 'Live prices not connected' : `${fmt(summary.dayChangePct)}%`}
                positive={summary.dayChange === 0 ? null : summary.dayChange >= 0}
              />
              <MetricCard
                label="Cash Equivalents"
                value={formatCurrency(summary.buyingPower, displayCurrency, summary.usdToSgdRate)}
                subValue={hsaCashEquivalents > 0
                  ? `Includes ${formatCurrency(hsaCashEquivalents, displayCurrency, summary.usdToSgdRate)} in HSA`
                  : 'Available across accounts'}
                positive={null}
              />
            </>
          ) : null}
        </div>

        {/* Main grid: positions + charts | allocation + chat */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          {/* Left column */}
          <div className="space-y-5">
            {/* Positions table */}
            <div className="rounded-xl border border-[#e5ddd3] bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#2d2218]">Positions</h2>
                <button onClick={openAddHolding}
                  className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] px-3 py-1.5 text-xs text-[#6e5f52] transition-colors hover:bg-white hover:text-[#2d2218]">
                  <Plus className="h-3.5 w-3.5" /> Add holding
                </button>
              </div>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : summary ? (
                summary.positions.length
                  ? <PositionsTable positions={filteredPositions} onEdit={openEditHolding} onDelete={deleteHolding} displayCurrency={displayCurrency} usdToSgdRate={summary.usdToSgdRate} />
                  : <p className="py-8 text-center text-sm text-[#9e9087]">No holdings yet. Add your first position to start tracking your portfolio.</p>
              ) : null}
            </div>

            {/* Price chart */}
            <div className="rounded-xl border border-[#e5ddd3] bg-white p-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {(summary?.positions ?? []).slice(0, 8).map(p => (
                  <button
                    key={p.symbol}
                    onClick={() => setChartSymbol(p.symbol)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      chartSymbol === p.symbol
                        ? 'bg-blue-600 text-white'
                        : 'border border-[#d4c9bc] text-[#6e5f52] hover:text-[#2d2218]'
                    }`}
                  >
                    {p.symbol}
                  </button>
                ))}
              </div>
              <PnLChart
                symbol={chartSymbol}
                holdingCurrency={summary?.positions.find(position => position.symbol === chartSymbol)?.currency}
                displayCurrency={displayCurrency}
                usdToSgdRate={summary?.usdToSgdRate ?? 1.35}
              />
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            {/* Allocation */}
            <div className="rounded-xl border border-[#e5ddd3] bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#2d2218]">Asset Allocation</h2>
                <button
                  onClick={openAllocationEditor}
                  className="rounded p-1 text-[#b8ad9e] transition-colors hover:bg-white hover:text-[#4a3d33]"
                  title="Edit target allocation"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
                </div>
              ) : (
                <AllocationChart allocation={allocation} />
              )}
            </div>

            {/* AI chat */}
            <ChatPanel portfolioContext={portfolioContext} profileContext={profileContext} />
          </div>
        </div>

        {/* Earnings strip */}
        <div className="rounded-xl border border-[#e5ddd3] bg-white px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#9e9087]" />
            <h2 className="text-sm font-semibold text-[#2d2218]">Upcoming Earnings</h2>
          </div>
          {loading ? (
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
            </div>
          ) : (
            <EarningsStrip earnings={earnings} hasPositions={isOwnPortfolio} />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e5ddd3] px-6 py-3 text-xs text-[#b8ad9e]">
        <div className="flex items-center justify-between">
          <span>Market data via Yahoo Finance (unofficial). Not financial advice.</span>
          <div className="flex items-center gap-1.5">
            <Bot className="h-3 w-3" />
            <span>AI powered by GPT-4o</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
