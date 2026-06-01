'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, RefreshCw, Clock, ChevronDown, ChevronUp,
  AlertTriangle, TrendingDown, Minus, ArrowUpRight, ArrowDownRight,
  Star, Calendar, BarChart3, Target, Zap, Scale, Scissors,
  PiggyBank, Edit2, Check, X, BookOpen,
} from 'lucide-react';
import {
  saveAdvisorRun, loadAdvisorHistory, shouldAutoRun, nextRunLabel,
  getAutoRunEnabled, setAutoRunEnabled, computeTrackRecord,
} from '@/lib/recommendations';
import { hydrateSettings, loadPositions, loadProfile, saveProfile, saveThesis, loadThesis, deleteThesis } from '@/lib/storage';
import type { InvestorProfile } from '@/lib/types';
import type {
  AdvisorRun, PositionRecommendation, BuyCandidate, MarketEvent,
  RebalanceTrade, DriftItem, TLHOpportunity,
} from '@/lib/types';

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${fmt(n)}%`;
}
function fmtM(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${fmt(n, 0)}`;
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

// ── Thesis Note (thesis-tracker skill) ───────────────────────────────────────

function ThesisNote({ symbol }: { symbol: string }) {
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const entry = loadThesis(symbol);
    // Sync the browser-local thesis when this card changes symbols.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNote(entry?.note ?? '');
  }, [symbol]);

  function startEdit() {
    setDraft(note);
    setEditing(true);
  }

  function save() {
    const trimmed = draft.trim();
    if (trimmed) {
      saveThesis({ symbol, note: trimmed, updatedAt: new Date().toISOString() });
      setNote(trimmed);
    } else {
      deleteThesis(symbol);
      setNote('');
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(note);
    setEditing(false);
  }

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          <BookOpen className="h-3 w-3" />
          Your Thesis
        </div>
        {!editing && (
          <button onClick={startEdit} className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            <Edit2 className="h-3 w-3" />
            {note ? 'Edit' : 'Add'}
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Why do you own this? What would make you sell?"
            rows={3}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
          />
          <div className="flex gap-2">
            <button onClick={save} className="flex items-center gap-1 rounded px-2 py-1 bg-emerald-700/40 text-emerald-300 text-xs hover:bg-emerald-700/60 transition-colors">
              <Check className="h-3 w-3" /> Save
            </button>
            <button onClick={cancel} className="flex items-center gap-1 rounded px-2 py-1 bg-zinc-700/40 text-zinc-400 text-xs hover:bg-zinc-700/60 transition-colors">
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </div>
      ) : note ? (
        <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">{note}</p>
      ) : (
        <p className="text-xs text-zinc-600 italic">No thesis recorded — click Add to document your reasoning.</p>
      )}
    </div>
  );
}

// ── Recommendation Card ───────────────────────────────────────────────────────

function RecommendationCard({ rec }: { rec: PositionRecommendation }) {
  const [expanded, setExpanded] = useState(false);
  const meta = ACTION_META[rec.action] ?? ACTION_META.hold;
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <button
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-zinc-800/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-shrink-0 min-w-[80px]">
          <div className="text-base font-bold text-zinc-100">{rec.symbol}</div>
          <div className={`mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${meta.color}`}>
            {meta.icon}
            {meta.label}{rec.action === 'trim' && rec.trimPct ? ` ${rec.trimPct}%` : ''}
          </div>
        </div>
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
        <div className="flex-shrink-0 text-zinc-600">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-3">
          <p className="text-sm text-zinc-300 leading-relaxed">{rec.reasoning}</p>
          {rec.taxNote && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300">{rec.taxNote}</p>
            </div>
          )}
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
          {(rec.analystConsensus || rec.analystPriceTarget) && (
            <div className="flex gap-4 text-xs text-zinc-500">
              {rec.analystConsensus && <span>Analyst consensus: <span className="text-zinc-300">{rec.analystConsensus}</span></span>}
              {rec.analystPriceTarget && <span>Price target: <span className="text-zinc-300">${fmt(rec.analystPriceTarget)}</span></span>}
            </div>
          )}
          {rec.priceAtAnalysis > 0 && (
            <div className="text-xs text-zinc-600">Analysis price: ${fmt(rec.priceAtAnalysis)}</div>
          )}
          {/* thesis-tracker skill integration */}
          <ThesisNote symbol={rec.symbol} />
        </div>
      )}
    </div>
  );
}

// ── Buy Candidate Card ────────────────────────────────────────────────────────

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
          {cand.theme && (
            <div className="rounded-lg bg-blue-950/40 border border-blue-800/30 px-3 py-2 text-xs text-blue-300 font-medium">
              📡 {cand.theme}
            </div>
          )}
          <p className="text-sm text-zinc-300 leading-relaxed">{cand.reasoning}</p>
          {/* 12m price target strip */}
          {(cand.priceTarget12m || cand.analystPriceTarget || cand.analystConsensus) && (
            <div className="flex flex-wrap gap-4 rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2">
              {cand.priceTarget12m && cand.priceAtAnalysis > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">12m Price Target</div>
                  <div className="text-sm font-bold text-emerald-400">
                    ${fmt(cand.priceTarget12m)}
                    <span className="ml-1.5 text-xs font-normal text-zinc-400">
                      ({cand.priceTarget12m > cand.priceAtAnalysis ? '+' : ''}{fmt((cand.priceTarget12m / cand.priceAtAnalysis - 1) * 100, 0)}% upside)
                    </span>
                  </div>
                </div>
              )}
              {cand.analystConsensus && (
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Analyst Consensus</div>
                  <div className="text-sm font-semibold text-zinc-200">{cand.analystConsensus}</div>
                </div>
              )}
              {cand.priceAtAnalysis > 0 && (
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Current Price</div>
                  <div className="text-sm font-semibold text-zinc-400">${fmt(cand.priceAtAnalysis)}</div>
                </div>
              )}
            </div>
          )}
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
        </div>
      )}
    </div>
  );
}

// ── Market Event Card ─────────────────────────────────────────────────────────

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

// ── Rebalance Tab (portfolio-rebalance skill) ─────────────────────────────────

function DriftStatusBadge({ status }: { status: DriftItem['status'] }) {
  if (status === 'ok')    return <span className="text-xs text-emerald-400">✓ On target</span>;
  if (status === 'drift') return <span className="text-xs text-amber-400">⚠ Drift</span>;
  return <span className="text-xs text-red-400">⚑ Major drift</span>;
}

function RebalanceTab({ run }: { run: AdvisorRun }) {
  const plan = run.rebalancePlan;

  if (!plan) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center">
        <Scale className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
        <p className="text-sm text-zinc-400 mb-1">No target allocation configured</p>
        <p className="text-xs text-zinc-600">Set a target allocation in your investor profile during onboarding to enable automated drift analysis.</p>
      </div>
    );
  }

  const driftCount = plan.driftItems.filter(d => d.status !== 'ok').length;

  return (
    <div className="space-y-5">
      {/* Tax note banner */}
      <div className={`rounded-xl border px-4 py-3 flex items-start gap-2 ${
        plan.estimatedTaxNote.includes('short-term') || plan.estimatedTaxNote.includes('Short-term')
          ? 'border-amber-500/30 bg-amber-500/10'
          : plan.trades.length === 0
            ? 'border-emerald-700/40 bg-emerald-900/20'
            : 'border-blue-700/40 bg-blue-900/20'
      }`}>
        <AlertTriangle className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
          plan.estimatedTaxNote.includes('hort-term') ? 'text-amber-400'
          : plan.trades.length === 0 ? 'text-emerald-400' : 'text-blue-400'
        }`} />
        <p className="text-xs text-zinc-300">{plan.estimatedTaxNote}</p>
      </div>

      {/* Drift analysis table */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-300">Allocation Drift  <span className="text-zinc-600 font-normal text-xs">·  ±{plan.bandPct}% rebalancing band</span></h3>
          {driftCount > 0 && <span className="text-xs text-amber-400">{driftCount} class{driftCount > 1 ? 'es' : ''} out of band</span>}
        </div>
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60">
                <th className="px-4 py-2.5 text-left text-zinc-500 font-medium">Asset Class</th>
                <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Target</th>
                <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Current</th>
                <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Drift</th>
                <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">$ Delta</th>
                <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {plan.driftItems.map((item, i) => (
                <tr key={i} className={`border-b border-zinc-800/50 ${item.status !== 'ok' ? 'bg-amber-900/10' : 'bg-zinc-900'}`}>
                  <td className="px-4 py-2.5 font-medium text-zinc-200">{item.assetClass}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-400">{item.targetPct.toFixed(1)}%</td>
                  <td className="px-4 py-2.5 text-right text-zinc-400">{item.currentPct.toFixed(1)}%</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${
                    item.driftPct > 0 ? 'text-amber-400' : item.driftPct < 0 ? 'text-blue-400' : 'text-zinc-500'
                  }`}>
                    {item.driftPct > 0 ? '+' : ''}{item.driftPct.toFixed(1)}%
                  </td>
                  <td className={`px-4 py-2.5 text-right ${item.dollarDelta > 0 ? 'text-amber-400' : item.dollarDelta < 0 ? 'text-blue-400' : 'text-zinc-500'}`}>
                    {item.dollarDelta > 0 ? '+' : ''}{fmtM(item.dollarDelta)}
                  </td>
                  <td className="px-4 py-2.5 text-right"><DriftStatusBadge status={item.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trade plan */}
      {plan.trades.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300">Rebalancing Trade Plan</h3>
            <span className="text-xs text-zinc-500">Total volume: {fmtM(plan.totalRebalanceVolume)}</span>
          </div>
          <div className="space-y-2">
            {plan.trades.map((trade, i) => <RebalanceTradeCard key={i} trade={trade} />)}
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            * Share counts are estimates based on current prices. Verify exact quantities before placing orders.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-700/30 bg-emerald-900/10 px-5 py-4 text-center">
          <p className="text-sm text-emerald-400">Portfolio is within the ±{plan.bandPct}% rebalancing band — no trades needed.</p>
        </div>
      )}
    </div>
  );
}

function RebalanceTradeCard({ trade }: { trade: RebalanceTrade }) {
  const isBuy = trade.action === 'buy';
  return (
    <div className={`rounded-xl border px-4 py-3 ${isBuy ? 'border-emerald-800/40 bg-emerald-900/10' : 'border-red-800/40 bg-red-900/10'}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 rounded border px-2 py-0.5 text-xs font-bold ${
          isBuy ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-red-500/20 text-red-300 border-red-500/40'
        }`}>
          {isBuy ? '↑ BUY' : '↓ SELL'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-zinc-100">{trade.symbol}</span>
            <span className="text-xs text-zinc-400 truncate">{trade.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            {trade.shares > 0 && <span><span className="text-zinc-300 font-semibold">~{trade.shares} shares</span><span className="text-zinc-600 ml-1">(est.)</span></span>}
            <span><span className="text-zinc-300 font-semibold">{fmtM(trade.dollarAmount)}</span></span>
            <span className="text-zinc-600 capitalize">{trade.accountType.replace('_', ' ')}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{trade.reason}</p>
        </div>
      </div>
      {trade.taxImpact && (
        <div className={`mt-2 flex items-start gap-1.5 text-xs rounded px-2 py-1.5 ${
          trade.taxImpact.includes('TLH') ? 'bg-emerald-900/30 text-emerald-400'
          : trade.taxImpact.includes('Short-term') ? 'bg-amber-900/30 text-amber-400'
          : 'bg-zinc-800/60 text-zinc-400'
        }`}>
          <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
          {trade.taxImpact}
        </div>
      )}
    </div>
  );
}

// ── Tax & Harvest Tab (tax-loss-harvesting skill) ─────────────────────────────

function TLHCard({ opp }: { opp: TLHOpportunity }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <button
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-zinc-800/40 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-shrink-0 min-w-[80px]">
          <div className="text-base font-bold text-zinc-100">{opp.symbol}</div>
          <div className="mt-1 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border-amber-500/40">
            <Scissors className="h-3 w-3" /> Harvest
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-200">
            <span className="text-red-400 font-semibold">{fmtM(opp.unrealizedLoss)}</span>
            <span className="text-zinc-500"> unrealized loss</span>
            <span className="text-zinc-600 text-xs ml-2">({opp.unrealizedLossPct.toFixed(1)}%)</span>
          </div>
          <div className="mt-1 text-xs text-zinc-400">
            Est. tax savings: <span className="text-emerald-400 font-semibold">{fmtM(opp.estimatedTaxSavings)}</span>
            <span className="ml-2 text-zinc-600 capitalize">· {opp.holdingType}</span>
          </div>
          {opp.effectiveSaleValue > 0 && (
            <div className="mt-1 text-xs">
              <span className="text-zinc-500">Effective proceeds: </span>
              <span className="text-emerald-400 font-semibold">{fmtM(opp.effectiveSaleValue)}</span>
              <span className="text-zinc-600"> ({fmtM(opp.currentPositionValue)} market + {fmtM(opp.estimatedTaxSavings)} tax credit)</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0 text-zinc-600">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-zinc-500 mb-1">Sell</div>
              <div className="font-semibold text-red-300">{opp.symbol} — {opp.name}</div>
              <div className="text-zinc-400">{fmtM(opp.unrealizedLoss)} loss</div>
            </div>
            <div>
              <div className="text-zinc-500 mb-1">Replace With</div>
              <div className="font-semibold text-emerald-300">{opp.suggestedReplacement}</div>
              <div className="text-zinc-400">{opp.replacementRationale}</div>
            </div>
          </div>
          <div className="rounded-lg bg-amber-900/20 border border-amber-800/30 px-3 py-2 text-xs text-amber-300">
            <span className="font-semibold">Wash Sale Window:</span> Do not repurchase {opp.symbol} before {opp.washSaleWindowEnd}
          </div>
          <div className="text-xs text-zinc-500">
            Account: <span className="text-zinc-300">{opp.accountType.replace('_', ' ')}</span>
            {' · '}
            Tax rate applied: <span className="text-zinc-300">{opp.holdingType === 'short-term' ? '22% (ordinary income)' : '15% (long-term capital gains)'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TaxHarvestTab({ run }: { run: AdvisorRun }) {
  const opps = run.tlhOpportunities ?? [];
  const totalSavings = opps.reduce((s, o) => s + o.estimatedTaxSavings, 0);
  const totalLoss = opps.reduce((s, o) => s + o.unrealizedLoss, 0);

  return (
    <div className="space-y-5">
      {opps.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-10 text-center">
          <Scissors className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm text-zinc-400 mb-1">No harvesting opportunities right now</p>
          <p className="text-xs text-zinc-600">Tax-loss harvesting candidates appear when taxable positions have unrealized losses {'>'} 2%. Check back after market moves.</p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div className="text-xs text-zinc-500">Candidates</div>
              <div className="text-xl font-bold text-zinc-100 mt-1">{opps.length}</div>
              <div className="text-xs text-zinc-500">positions</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div className="text-xs text-zinc-500">Total Losses</div>
              <div className="text-xl font-bold text-red-400 mt-1">{fmtM(totalLoss)}</div>
              <div className="text-xs text-zinc-500">harvestable</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div className="text-xs text-zinc-500">Est. Tax Saved</div>
              <div className="text-xl font-bold text-emerald-400 mt-1">{fmtM(totalSavings)}</div>
              <div className="text-xs text-zinc-500">at marginal rate</div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-800/30 bg-amber-900/10 px-4 py-3 text-xs text-amber-300">
            <span className="font-semibold">Wash sale rule:</span> After selling to harvest, wait 30 days before repurchasing the same or substantially identical security. Coordinate across all accounts (IRA, Roth, spouse).
          </div>

          <div className="space-y-2">
            {opps.map((opp, i) => <TLHCard key={i} opp={opp} />)}
          </div>
          <p className="text-xs text-zinc-600">
            * Tax estimates use 22% for short-term losses and 15% for long-term losses. Consult a tax advisor for your actual rates. Harvesting resets cost basis — more gains when you eventually sell the replacement.
          </p>
        </>
      )}
    </div>
  );
}

// ── Retirement Stats Banner (financial-plan skill) ────────────────────────────

function computeLocalProjection(equity: number, profile: InvestorProfile) {
  const years = Math.max(0, profile.retirementAge - profile.currentAge);
  const annualContrib = profile.monthlyContribution * 12;
  function fv(rate: number) {
    if (years === 0) return equity;
    const lump = equity * Math.pow(1 + rate, years);
    const contrib = rate > 0 ? annualContrib * ((Math.pow(1 + rate, years) - 1) / rate) : annualContrib * years;
    return lump + contrib;
  }
  const base = Math.round(fv(0.07));
  return {
    yearsToRetirement: years,
    projectedBase: base,
    projectedBear: Math.round(fv(0.04)),
    projectedBull: Math.round(fv(0.10)),
    monthlyIncome: Math.round(base * 0.04 / 12),
    safeWithdrawalAnnual: Math.round(base * 0.04),
    assumedReturnPct: 7,
  };
}

function RetirementBanner({ run }: { run: AdvisorRun }) {
  const [editing, setEditing] = useState(false);
  const [proj, setProj] = useState(run.retirementProjection);
  const [draft, setDraft] = useState<{ currentAge: string; retirementAge: string; monthlyContribution: string }>(() => {
    const p = loadProfile();
    return {
      currentAge: String(p?.currentAge ?? 30),
      retirementAge: String(p?.retirementAge ?? 65),
      monthlyContribution: String(p?.monthlyContribution ?? 0),
    };
  });

  if (!proj) return null;

  function saveGoals() {
    const p = loadProfile();
    if (!p) return;
    const updated: InvestorProfile = {
      ...p,
      currentAge: parseInt(draft.currentAge) || p.currentAge,
      retirementAge: parseInt(draft.retirementAge) || p.retirementAge,
      monthlyContribution: parseFloat(draft.monthlyContribution) || 0,
    };
    saveProfile(updated);
    const newProj = computeLocalProjection(proj!.currentPortfolioValue, updated);
    setProj({ ...newProj, currentPortfolioValue: proj!.currentPortfolioValue });
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <PiggyBank className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Retirement Projection</span>
        <span className="ml-auto text-xs text-zinc-600">{proj.assumedReturnPct}% base return · 4% safe withdrawal</span>
        <button
          onClick={() => setEditing(e => !e)}
          className="ml-2 flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          <Edit2 className="h-3 w-3" />
          Edit goals
        </button>
      </div>

      {editing && (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800 p-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Current Age</label>
              <input
                type="number"
                value={draft.currentAge}
                onChange={e => setDraft(d => ({ ...d, currentAge: e.target.value }))}
                className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Retire at Age</label>
              <input
                type="number"
                value={draft.retirementAge}
                onChange={e => setDraft(d => ({ ...d, retirementAge: e.target.value }))}
                className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Monthly Contribution ($)</label>
              <input
                type="number"
                value={draft.monthlyContribution}
                onChange={e => setDraft(d => ({ ...d, monthlyContribution: e.target.value }))}
                className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveGoals} className="flex items-center gap-1 rounded px-3 py-1.5 bg-purple-700/40 text-purple-300 text-xs hover:bg-purple-700/60 transition-colors">
              <Check className="h-3 w-3" /> Save
            </button>
            <button onClick={() => setEditing(false)} className="flex items-center gap-1 rounded px-3 py-1.5 bg-zinc-700/40 text-zinc-400 text-xs hover:bg-zinc-700/60 transition-colors">
              <X className="h-3 w-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-zinc-500">Years to Retire</div>
          <div className="text-2xl font-bold text-zinc-100 mt-0.5">{proj.yearsToRetirement}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Projected (Base)</div>
          <div className="text-2xl font-bold text-purple-300 mt-0.5">{fmtM(proj.projectedBase)}</div>
          <div className="text-xs text-zinc-600 mt-0.5">Bear: {fmtM(proj.projectedBear)}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Bull Case</div>
          <div className="text-2xl font-bold text-emerald-400 mt-0.5">{fmtM(proj.projectedBull)}</div>
        </div>
        <div>
          <div className="text-xs text-zinc-500">Monthly Income</div>
          <div className="text-2xl font-bold text-zinc-100 mt-0.5">{fmtM(proj.monthlyIncome)}</div>
          <div className="text-xs text-zinc-600 mt-0.5">{fmtM(proj.safeWithdrawalAnnual)}/yr</div>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'recommendations' | 'rebalance' | 'tax-harvest' | 'track-record';

export default function AdvisorPage() {
  const router = useRouter();
  const [run, setRun] = useState<AdvisorRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AdvisorRun[]>([]);
  const [autoRunEnabled, setAutoRunState] = useState(true);
  const [runLabel, setRunLabel] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('recommendations');
  const runningRef = useRef(false);

  const analyze = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const positions = loadPositions();
      const profile = loadProfile();
      if (!positions?.length) { router.push('/'); return; }
      const hist = loadAdvisorHistory();
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions, profile, history: hist.slice(0, 10) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      const newRun: AdvisorRun = await res.json();
      saveAdvisorRun(newRun);
      setRun(newRun);
      setRunLabel(nextRunLabel());
      setHistory(loadAdvisorHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
      runningRef.current = false;
    }
  }, [router]);

  useEffect(() => {
    void hydrateSettings().then(({ positions }) => {
      if (!positions?.length) { router.push('/'); return; }
      const hist = loadAdvisorHistory();
      setHistory(hist);
      setAutoRunState(getAutoRunEnabled());
      setRunLabel(nextRunLabel());
      if (hist.length > 0) {
        setRun(hist[0]);
        if (!shouldAutoRun()) setLoading(false);
      } else {
        if (!shouldAutoRun()) setLoading(false);
      }
      if (shouldAutoRun()) analyze();
    });
  }, [analyze, router]);

  useEffect(() => {
    // Refresh the schedule label after browser-local run history changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunLabel(nextRunLabel());
  }, [history]);

  function toggleAutoRun() {
    const next = !autoRunEnabled;
    setAutoRunEnabled(next);
    setAutoRunState(next);
  }

  const currentPrices: Record<string, number> = {};
  if (history[0]) {
    for (const p of history[0].portfolioSnapshot) currentPrices[p.symbol] = p.price;
  }
  const trackRecord = history.length > 0 ? computeTrackRecord(history, currentPrices) : null;

  // Tab badge counts
  const rebalanceCount  = run?.rebalancePlan?.trades.length ?? 0;
  const tlhCount        = run?.tlhOpportunities?.length ?? 0;
  const recCount        = (run?.recommendations.length ?? 0) + (run?.buyCandidates.length ?? 0);

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            <span className="text-base font-semibold text-zinc-100">Beta than nothing</span>
          </button>
          <span className="text-zinc-700">/</span>
          <div className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-zinc-200">Advisor</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            <button
              onClick={toggleAutoRun}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 border transition-colors ${
                autoRunEnabled
                  ? 'border-emerald-700 bg-emerald-900/30 text-emerald-400'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-500'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoRunEnabled ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
              {autoRunEnabled ? 'Auto-run on' : 'Auto-run off'}
            </button>
            {runLabel && <span className="text-zinc-600">{runLabel}</span>}
          </div>
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
            <div className="rounded-xl border border-blue-900/40 bg-blue-950/20 px-5 py-4 flex items-center gap-3">
              <RefreshCw className="h-4 w-4 text-blue-400 animate-spin flex-shrink-0" />
              <span className="text-sm text-zinc-300">Analyzing your portfolio with GPT-4o…</span>
            </div>
            <Skeleton className="h-20" />
            <div className="grid grid-cols-3 gap-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
            {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-20" />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && !run && !error && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
            <Zap className="h-10 w-10 text-amber-400/40 mx-auto mb-4" />
            <p className="text-base font-semibold text-zinc-300 mb-2">No analysis yet</p>
            <p className="text-sm text-zinc-500 mb-6">
              {autoRunEnabled
                ? 'Auto-run is on — the advisor will run automatically on the next market day.'
                : 'Auto-run is off. Click Run Now to get your first portfolio analysis.'}
            </p>
            <button
              onClick={analyze}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Run Analysis Now
            </button>
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

            {/* Retirement projection banner (financial-plan skill) */}
            <RetirementBanner run={run} />

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
            <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-900 p-1 w-fit border border-zinc-800">
              <TabButton id="recommendations" active={activeTab} onClick={setActiveTab} icon={<Target className="h-3.5 w-3.5" />} label="Recommendations" count={recCount} />
              <TabButton id="rebalance"       active={activeTab} onClick={setActiveTab} icon={<Scale className="h-3.5 w-3.5" />}  label="Rebalance"       count={rebalanceCount} alert={rebalanceCount > 0} />
              <TabButton id="tax-harvest"     active={activeTab} onClick={setActiveTab} icon={<Scissors className="h-3.5 w-3.5" />} label="Tax & Harvest" count={tlhCount} alert={tlhCount > 0} />
              <TabButton id="track-record"    active={activeTab} onClick={setActiveTab} icon={<BarChart3 className="h-3.5 w-3.5" />} label="Track Record"  count={trackRecord?.totalCalls ?? 0} />
            </div>

            {activeTab === 'recommendations' && (
              <div className="space-y-5">
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

            {activeTab === 'rebalance' && <RebalanceTab run={run} />}

            {activeTab === 'tax-harvest' && <TaxHarvestTab run={run} />}

            {activeTab === 'track-record' && (
              <div className="space-y-5">
                {history.length < 2 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center">
                    <BarChart3 className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
                    <p className="text-sm font-medium text-zinc-400 mb-1">Track record starts building tomorrow</p>
                    <p className="text-xs text-zinc-600">
                      After the second analysis run, returns are computed by comparing recommendation prices to current prices.
                      {history.length === 1 && ` Today's analysis is logged — check back after the next market day.`}
                    </p>
                  </div>
                ) : !trackRecord || trackRecord.totalCalls === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-zinc-500">
                    No recommendations to track yet.
                  </div>
                ) : (
                  <>
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

// ── Tab Button helper ─────────────────────────────────────────────────────────

function TabButton({
  id, active, onClick, icon, label, count, alert,
}: {
  id: Tab; active: Tab; onClick: (t: Tab) => void;
  icon: React.ReactNode; label: string; count: number; alert?: boolean;
}) {
  const isActive = active === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        isActive ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {icon}
      {label}
      <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${
        alert && count > 0 ? 'bg-amber-600/60 text-amber-200' : 'bg-zinc-600 text-zinc-300'
      }`}>
        {count}
      </span>
    </button>
  );
}
