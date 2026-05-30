'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, RefreshCw, Clock, Settings, ChevronDown, ChevronUp,
  AlertTriangle, TrendingDown, Minus, ArrowUpRight, ArrowDownRight,
  Star, Calendar, BarChart3, Target, Zap,
} from 'lucide-react';
import {
  saveAdvisorRun, loadAdvisorHistory, shouldAutoRun, msUntilNextRun,
  getScheduleHours, setScheduleHours, computeTrackRecord,
} from '@/lib/recommendations';
import { loadPositions, loadProfile } from '@/lib/storage';
import type { AdvisorRun, PositionRecommendation, BuyCandidate, MarketEvent } from '@/lib/types';

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${fmt(n)}%`;
}
function fmtCountdown(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const ACTION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  buy:  { label: 'BUY',  color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', icon: <ArrowUpRight className="h-3 w-3" /> },
  add:  { label: 'ADD',  color: 'bg-blue-500/20 text-blue-300 border-blue-500/40',         icon: <ArrowUpRight className="h-3 w-3" /> },
  hold: { label: 'HOLD', color: 'bg-zinc-600/40 text-zinc-400 border-zinc-600',            icon: <Minus className="h-3 w-3" /> },
  trim: { label: 'TRIM', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',      icon: <ArrowDownRight className="h-3 w-3" /> },
  sell: { label: 'SELL', color: 'bg-red-500/20 text-red-300 border-red-500/40',            icon: <TrendingDown className="h-3 w-3" /> },
};

const CONVICTION_DOTS: Record<string, React.ReactNode> = {
  high:   <span className="flex gap-0.5">{[0,1,2].map(i=><span key={i} className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>)}</span>,
  medium: <span className="flex gap-0.5">{[0,1].map(i=><span key={i} className="h-1.5 w-1.5 rounded-full bg-amber-400"/>)}<span className="h-1.5 w-1.5 rounded-full bg-zinc-700"/></span>,
  low:    <span className="flex gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400"/>{[0,1].map(i=><span key={i} className="h-1.5 w-1.5 rounded-full bg-zinc-700"/>)}</span>,
};

const URGENCY_COLOR: Record<string, string> = {
  high:   'border-red-500/40 bg-red-500/10',
  medium: 'border-amber-500/40 bg-amber-500/10',
  low:    'border-zinc-700 bg-zinc-800/50',
};

function RecommendationCard({ rec }: { rec: PositionRecommendation }) {
  const [expanded, setExpanded] = useState(false);
  const meta = ACTION_META[rec.action] ?? ACTION_META.hold;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <button
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-zinc-800/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Symbol + action */}
        <div className="flex-shrink-0 min-w-[80px]">
          <div className="text-base font-bold text-zinc-100">{rec.symbol}</div>
          <div className={`mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${meta.color}`}>
            {meta.icon}
            {meta.label}{rec.action === 'trim' && rec.trimPct ? ` ${rec.trimPct}%` : ''}
          </div>
        </div>

        {/* Summary + conviction */}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-200 leading-snug">{rec.summary}</div>
          <div className="mt-1.5 flex items-center gap-2">
            {CONVICTION_DOTS[rec.conviction]}
            <span className="text-xs text-zinc-500 capitalize">{rec.conviction} conviction</span>
            {rec.taxNote && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <AlertTriangle className="h-3 w-3" /> Tax note
              </span>
            )}
          </div>
        </div>

        {/* Expand toggle */}
        <div className="flex-shrink-0 text-zinc-600">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-3">
          {/* Reasoning */}
          <p className="text-sm text-zinc-300 leading-relaxed">{rec.reasoning}</p>

          {/* Tax note */}
          {rec.taxNote && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">{rec.taxNote}</p>
            </div>
          )}

          {/* Catalysts + Risks */}
          <div className="grid grid-cols-2 gap-3">
            {rec.catalysts.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-emerald-400 uppercase tracking-wide">Catalysts</div>
                <ul className="space-y-1">
                  {rec.catalysts.map((c, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-300">
                      <span className="text-emerald-500 mt-0.5">+</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rec.risks.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-red-400 uppercase tracking-wide">Risks</div>
                <ul className="space-y-1">
                  {rec.risks.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-300">
                      <span className="text-red-500 mt-0.5">-</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Analyst data */}
          {(rec.analystConsensus || rec.analystPriceTarget) && (
            <div className="flex gap-4 text-xs text-zinc-500">
              {rec.analystConsensus && <span>Analyst consensus: <span className="text-zinc-300">{rec.analystConsensus}</span></span>}
              {rec.analystPriceTarget && <span>Price target: <span className="text-zinc-300">${fmt(rec.analystPriceTarget)}</span></span>}
            </div>
          )}

          {/* Price at analysis */}
          {rec.priceAtAnalysis > 0 && (
            <div className="text-xs text-zinc-600">Analysis price: ${fmt(rec.priceAtAnalysis)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function BuyCandidateCard({ cand }: { cand: BuyCandidate }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-emerald-900/40 bg-zinc-900 overflow-hidden">
      <button
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-zinc-800/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-shrink-0 min-w-[80px]">
          <div className="text-base font-bold text-zinc-100">{cand.symbol}</div>
          <div className="mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
            <ArrowUpRight className="h-3 w-3" /> BUY
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-200 leading-snug">{cand.summary}</div>
          <div className="mt-1.5 flex items-center gap-2">
            {CONVICTION_DOTS[cand.conviction]}
            <span className="text-xs text-zinc-500 capitalize">{cand.conviction} conviction</span>
            <span className="text-xs text-zinc-600">· {cand.suggestedPortfolioWeightPct}% weight</span>
          </div>
        </div>
        <div className="flex-shrink-0 text-zinc-600">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-3">
          <p className="text-sm text-zinc-300 leading-relaxed">{cand.reasoning}</p>
          <div className="grid grid-cols-2 gap-3">
            {cand.catalysts.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-emerald-400 uppercase tracking-wide">Catalysts</div>
                <ul className="space-y-1">{cand.catalysts.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-300"><span className="text-emerald-500 mt-0.5">+</span>{c}</li>
                ))}</ul>
              </div>
            )}
            {cand.risks.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-red-400 uppercase tracking-wide">Risks</div>
                <ul className="space-y-1">{cand.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-300"><span className="text-red-500 mt-0.5">-</span>{r}</li>
                ))}</ul>
              </div>
            )}
          </div>
          {(cand.analystConsensus || cand.analystPriceTarget) && (
            <div className="flex gap-4 text-xs text-zinc-500">
              {cand.analystConsensus && <span>Consensus: <span className="text-zinc-300">{cand.analystConsensus}</span></span>}
              {cand.analystPriceTarget && <span>Target: <span className="text-zinc-300">${fmt(cand.analystPriceTarget)}</span></span>}
            </div>
          )}
          {cand.priceAtAnalysis > 0 && (
            <div className="text-xs text-zinc-600">Analysis price: ${fmt(cand.priceAtAnalysis)}</div>
          )}
        </div>
      )}
    </div>
  );
}

function MarketEventCard({ event }: { event: MarketEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-xl border ${URGENCY_COLOR[event.urgency]} overflow-hidden`}>
      <button
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-shrink-0 text-center min-w-[48px]">
          <div className="text-xs text-zinc-500">{event.daysUntil === 0 ? 'Today' : `${event.daysUntil}d`}</div>
          <div className="text-xs font-medium text-zinc-400">{event.date.slice(5)}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-200">{event.event}</div>
          <div className="text-xs text-zinc-400 mt-0.5 truncate">{event.marketExpectation}</div>
        </div>
        <div className="flex-shrink-0 text-zinc-600">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 space-y-2">
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Portfolio Impact</div>
            <p className="text-sm text-zinc-300">{event.portfolioImpact}</p>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">Suggested Action</div>
            <p className="text-sm text-zinc-300">{event.suggestedAction}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

const SCHEDULE_OPTIONS = [
  { label: '6h', value: 6 },
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
  { label: 'Weekly', value: 168 },
];

export default function AdvisorPage() {
  const router = useRouter();
  const [run, setRun] = useState<AdvisorRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AdvisorRun[]>([]);
  const [scheduleHours, setScheduleHoursState] = useState(12);
  const [countdown, setCountdown] = useState('');
  const [activeTab, setActiveTab] = useState<'recommendations' | 'track-record'>('recommendations');
  const runningRef = useRef(false);

  const analyze = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const positions = loadPositions();
      const profile = loadProfile();
      if (!positions?.length) { router.push('/onboarding'); return; }
      const hist = loadAdvisorHistory();
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions, profile, history: hist.slice(0, 10) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const newRun: AdvisorRun = await res.json();
      saveAdvisorRun(newRun);
      setRun(newRun);
      setHistory(loadAdvisorHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    const positions = loadPositions();
    if (!positions?.length) { router.push('/onboarding'); return; }
    const hist = loadAdvisorHistory();
    setHistory(hist);
    setScheduleHoursState(getScheduleHours());
    if (hist.length > 0) setRun(hist[0]);
    if (shouldAutoRun()) analyze();
  }, [analyze, router]);

  // Countdown ticker
  useEffect(() => {
    const tick = () => {
      const ms = msUntilNextRun();
      setCountdown(ms > 0 ? fmtCountdown(ms) : 'Now');
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [history, scheduleHours]);

  function changeSchedule(hours: number) {
    setScheduleHours(hours);
    setScheduleHoursState(hours);
  }

  // Track record (compute from history with prices from latest snapshot)
  const currentPrices: Record<string, number> = {};
  if (history[0]) {
    for (const p of history[0].portfolioSnapshot) currentPrices[p.symbol] = p.price;
  }
  const trackRecord = history.length > 0 ? computeTrackRecord(history, currentPrices) : null;

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            <span className="text-base font-semibold text-zinc-100">Portfolio AI</span>
          </button>
          <span className="text-zinc-700">/</span>
          <div className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-zinc-200">Advisor</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Schedule selector */}
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            <span>Auto-run:</span>
            {SCHEDULE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => changeSchedule(opt.value)}
                className={`rounded px-2 py-0.5 transition-colors ${
                  scheduleHours === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {countdown && (
            <span className="text-xs text-zinc-600">
              Next: {countdown === 'Now' ? 'running soon' : `in ${countdown}`}
            </span>
          )}
          <button
            onClick={analyze}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Analyzing…' : 'Run Now'}
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-5 space-y-5 max-w-5xl mx-auto w-full">
        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && !run && (
          <div className="space-y-4">
            <Skeleton className="h-24" />
            <div className="grid grid-cols-3 gap-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        )}

        {run && (
          <>
            {/* Executive Summary */}
            <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">Portfolio Assessment</span>
                <span className="ml-auto text-xs text-zinc-600">
                  {new Date(run.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed">{run.executiveSummary}</p>
            </div>

            {/* Market Events */}
            {run.marketEvents.length > 0 && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-zinc-500" />
                  <h2 className="text-sm font-semibold text-zinc-300">Upcoming Market Events</h2>
                </div>
                <div className="space-y-2">
                  {run.marketEvents.sort((a, b) => a.daysUntil - b.daysUntil).map((e, i) => (
                    <MarketEventCard key={i} event={e} />
                  ))}
                </div>
              </div>
            )}

            {/* Tab navigation */}
            <div className="flex gap-1 rounded-lg bg-zinc-900 p-1 w-fit border border-zinc-800">
              <button
                onClick={() => setActiveTab('recommendations')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === 'recommendations'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Target className="h-3.5 w-3.5" />
                Recommendations
                <span className="ml-1 rounded-full bg-zinc-600 px-1.5 py-0.5 text-[10px]">
                  {run.recommendations.length + run.buyCandidates.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('track-record')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTab === 'track-record'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Track Record
                <span className="ml-1 rounded-full bg-zinc-600 px-1.5 py-0.5 text-[10px]">
                  {trackRecord?.totalCalls ?? 0}
                </span>
              </button>
            </div>

            {activeTab === 'recommendations' && (
              <div className="space-y-5">
                {/* Existing positions */}
                <div>
                  <h2 className="mb-3 text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                    Your Positions — {run.recommendations.length} calls
                  </h2>
                  <div className="space-y-2">
                    {run.recommendations
                      .sort((a, b) => {
                        const order = { sell: 0, trim: 1, buy: 2, add: 2, hold: 3 };
                        return (order[a.action] ?? 3) - (order[b.action] ?? 3);
                      })
                      .map(rec => <RecommendationCard key={rec.symbol} rec={rec} />)
                    }
                  </div>
                </div>

                {/* Buy candidates */}
                {run.buyCandidates.length > 0 && (
                  <div>
                    <h2 className="mb-3 text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                      New Ideas — {run.buyCandidates.length} candidates
                    </h2>
                    <div className="space-y-2">
                      {run.buyCandidates.map(c => <BuyCandidateCard key={c.symbol} cand={c} />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'track-record' && (
              <div className="space-y-5">
                {!trackRecord || trackRecord.totalCalls === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-zinc-500">
                    Track record builds after multiple advisor runs. Run the advisor again tomorrow to start tracking.
                  </div>
                ) : (
                  <>
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                        <div className="text-xs text-zinc-500">Total Calls</div>
                        <div className="text-xl font-bold text-zinc-100 mt-1">{trackRecord.totalCalls}</div>
                        <div className="text-xs text-zinc-500">{trackRecord.goodCalls} good</div>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                        <div className="text-xs text-zinc-500">Accuracy</div>
                        <div className={`text-xl font-bold mt-1 ${(trackRecord.accuracyPct ?? 0) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {trackRecord.accuracyPct != null ? `${fmt(trackRecord.accuracyPct, 0)}%` : '—'}
                        </div>
                        <div className="text-xs text-zinc-500">correct direction</div>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                        <div className="text-xs text-zinc-500">Ghost Portfolio</div>
                        <div className={`text-xl font-bold mt-1 ${(trackRecord.ghostPortfolioReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {trackRecord.ghostPortfolioReturnPct != null ? fmtPct(trackRecord.ghostPortfolioReturnPct) : '—'}
                        </div>
                        <div className="text-xs text-zinc-500">avg buy return</div>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                        <div className="text-xs text-zinc-500">Actual Portfolio</div>
                        <div className={`text-xl font-bold mt-1 ${(trackRecord.actualPortfolioReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {trackRecord.actualPortfolioReturnPct != null ? fmtPct(trackRecord.actualPortfolioReturnPct) : '—'}
                        </div>
                        <div className="text-xs text-zinc-500">since tracking started</div>
                      </div>
                    </div>

                    {/* Top wins */}
                    {trackRecord.topWins.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-semibold text-emerald-400 uppercase tracking-wide">Best Calls</div>
                        <div className="space-y-1">
                          {trackRecord.topWins.map((c, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5">
                              <span className="text-sm font-bold text-zinc-200 w-14">{c.symbol}</span>
                              <span className={`text-xs rounded border px-1.5 py-0.5 font-semibold ${ACTION_META[c.action]?.color ?? ''}`}>{c.action.toUpperCase()}</span>
                              <span className="text-xs text-zinc-400 flex-1 truncate">{c.summary}</span>
                              <span className={`text-sm font-semibold ${(c.returnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {c.returnPct != null ? fmtPct(c.returnPct) : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Missed / bad calls */}
                    {trackRecord.topMisses.length > 0 && (
                      <div>
                        <div className="mb-2 text-xs font-semibold text-red-400 uppercase tracking-wide">Learning Opportunities</div>
                        <div className="space-y-1">
                          {trackRecord.topMisses.map((c, i) => (
                            <div key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5">
                              <span className="text-sm font-bold text-zinc-200 w-14">{c.symbol}</span>
                              <span className={`text-xs rounded border px-1.5 py-0.5 font-semibold ${ACTION_META[c.action]?.color ?? ''}`}>{c.action.toUpperCase()}</span>
                              <span className="text-xs text-zinc-400 flex-1 truncate">{c.summary}</span>
                              <span className={`text-sm font-semibold ${(c.returnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {c.returnPct != null ? fmtPct(c.returnPct) : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full history */}
                    <div>
                      <div className="mb-2 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                        All {trackRecord.calls.length} Recommendations
                      </div>
                      <div className="rounded-xl border border-zinc-800 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-900/60">
                              <th className="px-4 py-2.5 text-left text-zinc-500 font-medium">Date</th>
                              <th className="px-4 py-2.5 text-left text-zinc-500 font-medium">Symbol</th>
                              <th className="px-4 py-2.5 text-left text-zinc-500 font-medium">Action</th>
                              <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Rec Price</th>
                              <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Now</th>
                              <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Return</th>
                              <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Call</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trackRecord.calls.map((c, i) => (
                              <tr key={i} className="border-b border-zinc-800/50 bg-zinc-900 hover:bg-zinc-800/40">
                                <td className="px-4 py-2 text-zinc-500">{c.timestamp.slice(0, 10)}</td>
                                <td className="px-4 py-2 font-semibold text-zinc-200">{c.symbol}</td>
                                <td className="px-4 py-2">
                                  <span className={`rounded border px-1.5 py-0.5 font-semibold ${ACTION_META[c.action]?.color ?? ''}`}>
                                    {c.action.toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-zinc-400">${fmt(c.priceAtRec)}</td>
                                <td className="px-4 py-2 text-right text-zinc-400">
                                  {c.currentPrice != null ? `$${fmt(c.currentPrice)}` : '—'}
                                </td>
                                <td className={`px-4 py-2 text-right font-semibold ${(c.returnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {c.returnPct != null ? fmtPct(c.returnPct) : '—'}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  {c.isGoodCall === true && <span className="text-emerald-400">✓</span>}
                                  {c.isGoodCall === false && <span className="text-red-400">✗</span>}
                                  {c.isGoodCall === null && <span className="text-zinc-600">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
