'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, TrendingUp, Calendar, Bot, Settings, Brain } from 'lucide-react';
import MetricCard from '@/components/MetricCard';
import PositionsTable from '@/components/PositionsTable';
import AllocationChart from '@/components/AllocationChart';
import PnLChart from '@/components/PnLChart';
import EarningsStrip from '@/components/EarningsStrip';
import ChatPanel from '@/components/ChatPanel';
import { loadPositions, loadProfile, clearAll } from '@/lib/storage';
import type { PortfolioSummary, AllocationItem, EarningsEvent, UserPosition, InvestorProfile } from '@/lib/types';

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

export default function Dashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [allocation, setAllocation] = useState<AllocationItem[]>([]);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [chartSymbol, setChartSymbol] = useState('');
  const [profile, setProfile] = useState<InvestorProfile | null>(null);
  const [userPositions, setUserPositions] = useState<UserPosition[] | null>(null);

  async function load(positions?: UserPosition[] | null, prof?: InvestorProfile | null) {
    setLoading(true);
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
    const positions = loadPositions();
    const prof = loadProfile();
    if (!positions || positions.length === 0) {
      router.push('/onboarding');
      return;
    }
    setUserPositions(positions);
    setProfile(prof);
    // Pass prof directly — React state may not reflect yet at this point
    load(positions, prof);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPnlPositive = (summary?.totalUnrealizedPnl ?? 0) >= 0;

  function resetPortfolio() {
    clearAll();
    router.push('/onboarding');
  }

  const portfolioContext = summary
    ? `Total equity: $${fmt(summary.totalEquity)}\nTotal P&L: ${totalPnlPositive ? '+' : '-'}$${fmt(Math.abs(summary.totalUnrealizedPnl))} (${fmt(summary.totalUnrealizedPnlPct)}%)\nBuying power: $${fmt(summary.buyingPower)}\n\nPositions:\n${summary.positions.map(p => `${p.symbol} (${p.accountType}): ${p.shares} shares @ $${fmt(p.currentPrice)}, cost $${fmt(p.avgCost)}, equity $${fmt(p.equity)}, P&L ${p.unrealizedPnl >= 0 ? '+' : ''}$${fmt(p.unrealizedPnl)} (${fmt(p.unrealizedPnlPct)}%), weight ${fmt(p.portfolioWeightPct)}%, ${p.isShortTerm ? 'short-term' : 'long-term'}`).join('\n')}`
    : undefined;

  const profileContext = profile
    ? `Age: ${profile.currentAge}, retirement age: ${profile.retirementAge}\nMonthly contribution: $${profile.monthlyContribution}\nRisk tolerance: ${profile.riskTolerance}, primary goal: ${profile.primaryGoal}\nTarget allocation: ${Object.entries(profile.targetAllocation).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ')}${profile.strategy ? `\nStrategy: ${profile.strategy}` : ''}`
    : undefined;

  const isOwnPortfolio = userPositions !== null;

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a]">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-2.5">
          <TrendingUp className="h-5 w-5 text-blue-400" />
          <span className="text-base font-semibold text-zinc-100">Portfolio AI</span>
          <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
            {isOwnPortfolio ? 'Your portfolio' : 'Demo portfolio · DRY_RUN=true'}
          </span>
          <nav className="ml-3 flex items-center gap-0.5">
            <span className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800">
              Dashboard
            </span>
            <Link
              href="/advisor"
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <Brain className="h-3.5 w-3.5" />
              Advisor
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {lastUpdated && <span>Updated {lastUpdated}</span>}
          <button
            onClick={() => load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={resetPortfolio}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            title="Change portfolio / re-run onboarding"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-5 space-y-5">
        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : summary ? (
            <>
              <MetricCard
                label="Portfolio Value"
                value={`$${fmt(summary.totalEquity)}`}
                positive={null}
              />
              <MetricCard
                label="Total P&L"
                value={`${totalPnlPositive ? '+' : '-'}$${fmt(Math.abs(summary.totalUnrealizedPnl))}`}
                subValue={`${totalPnlPositive ? '+' : ''}${fmt(summary.totalUnrealizedPnlPct)}%`}
                positive={totalPnlPositive}
              />
              <MetricCard
                label="Day Change"
                value={summary.dayChange === 0 ? '—' : `${summary.dayChange >= 0 ? '+' : '-'}$${fmt(Math.abs(summary.dayChange))}`}
                subValue={summary.dayChange === 0 ? 'Live prices not connected' : `${fmt(summary.dayChangePct)}%`}
                positive={summary.dayChange === 0 ? null : summary.dayChange >= 0}
              />
              <MetricCard
                label="Buying Power"
                value={`$${fmt(summary.buyingPower)}`}
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
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="mb-4 text-sm font-semibold text-zinc-200">Positions</h2>
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : summary ? (
                <PositionsTable positions={summary.positions} />
              ) : null}
            </div>

            {/* Price chart */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {(summary?.positions ?? []).slice(0, 8).map(p => (
                  <button
                    key={p.symbol}
                    onClick={() => setChartSymbol(p.symbol)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      chartSymbol === p.symbol
                        ? 'bg-blue-600 text-white'
                        : 'border border-zinc-700 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {p.symbol}
                  </button>
                ))}
              </div>
              <PnLChart symbol={chartSymbol} />
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-5">
            {/* Allocation */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="mb-4 text-sm font-semibold text-zinc-200">Asset Allocation</h2>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
                </div>
              ) : (
                <AllocationChart allocation={allocation} />
              )}
            </div>

            {/* AI chat */}
            <div className="flex-1 min-h-[420px]">
              <ChatPanel portfolioContext={portfolioContext} profileContext={profileContext} />
            </div>
          </div>
        </div>

        {/* Earnings strip */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="mb-3 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-200">Upcoming Earnings</h2>
          </div>
          {loading ? (
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
            </div>
          ) : (
            <EarningsStrip earnings={earnings} />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-3 text-xs text-zinc-600">
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
