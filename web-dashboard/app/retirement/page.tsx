'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, PiggyBank, Brain, Edit2, Check, X, LayoutDashboard, Home, Layers } from 'lucide-react';
import { loadProfile, saveProfile, loadPortfolioCache } from '@/lib/storage';
import type { InvestorProfile, PortfolioSummary, AllocationItem, EarningsEvent } from '@/lib/types';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Inputs {
  currentAge: number;
  retirementAge: number;
  annualTaxable: number;
  annualStockGrants: number;
  annual401k: number;
}

interface DataPoint { age: number; year: number; bear: number; base: number; bull: number }

// ── Math ──────────────────────────────────────────────────────────────────────

const RATES = { bear: 0.04, base: 0.07, bull: 0.10 };

function fv(prev: number, rate: number, contrib: number) {
  return Math.round(prev * (1 + rate) + contrib);
}

function computePlan(currentValue: number, inputs: Inputs) {
  const { currentAge, retirementAge, annualTaxable, annualStockGrants, annual401k } = inputs;
  const contrib = annualTaxable + annualStockGrants + annual401k;
  const yearsToRetire = Math.max(0, retirementAge - currentAge);
  const now = new Date().getFullYear();

  // Phase 1 — accumulation
  const acc: DataPoint[] = [{
    age: currentAge, year: now,
    bear: currentValue, base: currentValue, bull: currentValue,
  }];
  for (let y = 1; y <= yearsToRetire; y++) {
    const p = acc[y - 1];
    acc.push({
      age: currentAge + y, year: now + y,
      bear: fv(p.bear, RATES.bear, contrib),
      base: fv(p.base, RATES.base, contrib),
      bull: fv(p.bull, RATES.bull, contrib),
    });
  }

  const ret = acc[acc.length - 1];

  // Phase 2 — drawdown (4% of initial retirement value, fixed)
  const wBear = ret.bear * 0.04;
  const wBase = ret.base * 0.04;
  const wBull = ret.bull * 0.04;
  const DRAW_YEARS = 35;
  const draw: DataPoint[] = [ret];
  for (let y = 1; y <= DRAW_YEARS; y++) {
    const p = draw[y - 1];
    draw.push({
      age: retirementAge + y, year: ret.year + y,
      bear: Math.max(0, Math.round(p.bear * (1 + RATES.bear) - wBear)),
      base: Math.max(0, Math.round(p.base * (1 + RATES.base) - wBase)),
      bull: Math.max(0, Math.round(p.bull * (1 + RATES.bull) - wBull)),
    });
  }

  return {
    acc, draw, ret,
    monthly: { bear: wBear / 12, base: wBase / 12, bull: wBull / 12 },
    annual: { bear: wBear, base: wBase, bull: wBull },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtAge(age: number) { return `${age}`; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="text-zinc-400 font-medium">Age {label}</p>
      {payload.map((entry: { name: string; value: number; color: string }) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {fmtM(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function Stat({ label, value, sub, color = 'text-zinc-100' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
      <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RetirementPage() {
  const router = useRouter();

  // Portfolio value from cache — populated when user visits dashboard
  const [currentValue, setCurrentValue] = useState(0);

  // Editable inputs
  const [inputs, setInputs] = useState<Inputs>({
    currentAge: 30,
    retirementAge: 65,
    annualTaxable: 40_000,
    annualStockGrants: 50_000,
    annual401k: 40_000,
  });
  const [editingInputs, setEditingInputs] = useState(false);
  const [draft, setDraft] = useState<Inputs>(inputs);

  useEffect(() => {
    // Load profile
    const p = loadProfile();
    if (p) {
      setInputs(prev => ({
        ...prev,
        currentAge: p.currentAge,
        retirementAge: p.retirementAge,
      }));
      setDraft(prev => ({
        ...prev,
        currentAge: p.currentAge,
        retirementAge: p.retirementAge,
      }));
    }

    // Load portfolio value from cache
    type CacheShape = { summary: PortfolioSummary; allocation: AllocationItem[]; earnings: EarningsEvent[] };
    const cached = loadPortfolioCache<CacheShape>();
    if (cached?.summary?.totalEquity) {
      setCurrentValue(cached.summary.totalEquity);
    }
  }, []);

  function saveInputs() {
    setInputs(draft);
    // Persist age changes to profile
    const p = loadProfile();
    if (p) {
      saveProfile({ ...p, currentAge: draft.currentAge, retirementAge: draft.retirementAge });
    }
    setEditingInputs(false);
  }

  const plan = computePlan(currentValue, inputs);
  const yearsToRetire = Math.max(0, inputs.retirementAge - inputs.currentAge);
  const totalAnnualContrib = inputs.annualTaxable + inputs.annualStockGrants + inputs.annual401k;

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center border-b border-zinc-800 px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <TrendingUp className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <span className="text-sm sm:text-base font-semibold text-zinc-100 whitespace-nowrap">Beta than nothing</span>
          <nav className="ml-1 sm:ml-3 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            <button onClick={() => router.push('/')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0">
              <LayoutDashboard className="h-3.5 w-3.5" /><span className="hidden sm:inline">Dashboard</span>
            </button>
            <button onClick={() => router.push('/advisor')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0">
              <Brain className="h-3.5 w-3.5" /><span className="hidden sm:inline">Advisor</span>
            </button>
            <span className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 flex-shrink-0">
              <PiggyBank className="h-3.5 w-3.5 text-purple-400" /><span className="hidden sm:inline">Retirement</span>
            </span>
            <button onClick={() => router.push('/real-estate')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0">
              <Home className="h-3.5 w-3.5" /><span className="hidden sm:inline">Real Estate</span>
            </button>
            <button onClick={() => router.push('/other-assets')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0">
              <Layers className="h-3.5 w-3.5" /><span className="hidden sm:inline">Other</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full">

        {/* No portfolio data warning */}
        {currentValue === 0 && (
          <div className="rounded-xl border border-amber-700/40 bg-amber-900/20 px-4 py-3 text-xs text-amber-300">
            Portfolio value not loaded — visit the <button onClick={() => router.push('/')} className="underline">Dashboard</button> first to load live prices, then return here.
          </div>
        )}

        {/* Page title + edit button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Retirement Planning</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Projection from age {inputs.currentAge} → {inputs.retirementAge} · {yearsToRetire} years to retire
            </p>
          </div>
          <button
            onClick={() => { setDraft(inputs); setEditingInputs(e => !e); }}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <Edit2 className="h-3 w-3" />
            Edit assumptions
          </button>
        </div>

        {/* Edit panel */}
        {editingInputs && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {([
                { label: 'Current Age', key: 'currentAge', prefix: '' },
                { label: 'Retire at Age', key: 'retirementAge', prefix: '' },
                { label: 'Annual Taxable ($)', key: 'annualTaxable', prefix: '$' },
                { label: 'Annual Stock Grants ($)', key: 'annualStockGrants', prefix: '$' },
                { label: 'Annual 401k ($)', key: 'annual401k', prefix: '$' },
              ] as { label: string; key: keyof Inputs; prefix: string }[]).map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</label>
                  <input
                    type="number"
                    value={draft[key]}
                    onChange={e => setDraft(d => ({ ...d, [key]: Number(e.target.value) || 0 }))}
                    className="w-full rounded bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={saveInputs} className="flex items-center gap-1 rounded px-3 py-1.5 bg-purple-700/40 text-purple-300 text-xs hover:bg-purple-700/60 transition-colors">
                <Check className="h-3 w-3" /> Save
              </button>
              <button onClick={() => setEditingInputs(false)} className="flex items-center gap-1 rounded px-3 py-1.5 bg-zinc-700/40 text-zinc-400 text-xs hover:bg-zinc-700/60 transition-colors">
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Contribution summary */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2 font-semibold">Annual Contributions</div>
          <div className="flex flex-wrap gap-6 text-xs">
            <div>
              <span className="text-zinc-500">After-tax taxable </span>
              <span className="text-zinc-200 font-semibold">{fmtM(inputs.annualTaxable)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Stock grants (taxable) </span>
              <span className="text-zinc-200 font-semibold">{fmtM(inputs.annualStockGrants)}</span>
            </div>
            <div>
              <span className="text-zinc-500">401k (pre-tax) </span>
              <span className="text-zinc-200 font-semibold">{fmtM(inputs.annual401k)}</span>
            </div>
            <div className="border-l border-zinc-700 pl-6">
              <span className="text-zinc-500">Total / year </span>
              <span className="text-purple-300 font-bold">{fmtM(totalAnnualContrib)}</span>
            </div>
          </div>
        </div>

        {/* At-retirement stats */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">At Retirement (Age {inputs.retirementAge})</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Base Case Portfolio" value={fmtM(plan.ret.base)} sub={`${fmtM(plan.monthly.base)}/mo income`} color="text-purple-300" />
            <Stat label="Bear Case (4%/yr)" value={fmtM(plan.ret.bear)} sub={`${fmtM(plan.monthly.bear)}/mo income`} color="text-blue-400" />
            <Stat label="Bull Case (10%/yr)" value={fmtM(plan.ret.bull)} sub={`${fmtM(plan.monthly.bull)}/mo income`} color="text-emerald-400" />
            <Stat label="Current Portfolio" value={fmtM(currentValue)} sub={`${yearsToRetire}y of growth ahead`} />
          </div>
        </div>

        {/* Accumulation chart */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-200">Portfolio Growth — Now to Retirement</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Age {inputs.currentAge} to {inputs.retirementAge} · {fmtM(totalAnnualContrib)}/yr contributions · 3 growth scenarios</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={plan.acc} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="age"
                tickFormatter={fmtAge}
                tick={{ fontSize: 11, fill: '#71717a' }}
                label={{ value: 'Age', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: '#71717a' }}
              />
              <YAxis
                tickFormatter={v => fmtM(v as number)}
                tick={{ fontSize: 11, fill: '#71717a' }}
                width={60}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Line dataKey="bear" name="Bear (4%)" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line dataKey="base" name="Base (7%)" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
              <Line dataKey="bull" name="Bull (10%)" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Drawdown chart */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">Retirement Drawdown — 4% Withdrawal Rule</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Age {inputs.retirementAge} to {inputs.retirementAge + 35} · 4% of retirement portfolio withdrawn annually · remaining balance continues to grow
            </p>
          </div>

          {/* Monthly income by scenario */}
          <div className="flex flex-wrap gap-6 mb-4 text-xs">
            <div><span className="text-blue-400 font-semibold">Bear: </span><span className="text-zinc-300">{fmtM(plan.monthly.bear)}/mo · {fmtM(plan.annual.bear)}/yr</span></div>
            <div><span className="text-purple-400 font-semibold">Base: </span><span className="text-zinc-300">{fmtM(plan.monthly.base)}/mo · {fmtM(plan.annual.base)}/yr</span></div>
            <div><span className="text-emerald-400 font-semibold">Bull: </span><span className="text-zinc-300">{fmtM(plan.monthly.bull)}/mo · {fmtM(plan.annual.bull)}/yr</span></div>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={plan.draw} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="age"
                tickFormatter={fmtAge}
                tick={{ fontSize: 11, fill: '#71717a' }}
                label={{ value: 'Age', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: '#71717a' }}
              />
              <YAxis
                tickFormatter={v => fmtM(v as number)}
                tick={{ fontSize: 11, fill: '#71717a' }}
                width={60}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <ReferenceLine x={inputs.retirementAge} stroke="#52525b" strokeDasharray="4 2" label={{ value: 'Retire', fontSize: 10, fill: '#71717a' }} />
              <Line dataKey="bear" name="Bear (4%)" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line dataKey="base" name="Base (7%)" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
              <Line dataKey="bull" name="Bull (10%)" stroke="#34d399" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>

          <p className="mt-3 text-xs text-zinc-600">
            Bear (4% growth): portfolio stays near-flat — withdrawal ≈ growth. Base & Bull cases: portfolio continues to grow during retirement, leaving an estate.
          </p>
        </div>

        {/* Year-by-year table — key milestones */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Accumulation Milestones</h2>
          <div className="rounded-xl border border-zinc-800 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60">
                  <th className="px-4 py-2.5 text-left text-zinc-500 font-medium">Age</th>
                  <th className="px-4 py-2.5 text-left text-zinc-500 font-medium">Year</th>
                  <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Bear (4%)</th>
                  <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Base (7%)</th>
                  <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">Bull (10%)</th>
                </tr>
              </thead>
              <tbody>
                {plan.acc
                  .filter((_, i) => i === 0 || i % 5 === 0 || i === plan.acc.length - 1)
                  .map(row => (
                    <tr key={row.age} className={`border-b border-zinc-800/50 ${row.age === inputs.retirementAge ? 'bg-purple-900/20' : 'bg-zinc-900'}`}>
                      <td className={`px-4 py-2.5 font-medium ${row.age === inputs.retirementAge ? 'text-purple-300' : 'text-zinc-200'}`}>
                        {row.age}{row.age === inputs.retirementAge ? ' ★' : ''}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">{row.year}</td>
                      <td className="px-4 py-2.5 text-right text-blue-400">{fmtM(row.bear)}</td>
                      <td className="px-4 py-2.5 text-right text-purple-300 font-semibold">{fmtM(row.base)}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-400">{fmtM(row.bull)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-zinc-700 pb-6">
          Projections assume constant annual returns and fixed contributions. Actual results will differ due to market volatility, tax changes, and life events. This is not financial advice.
        </p>
      </main>
    </div>
  );
}
