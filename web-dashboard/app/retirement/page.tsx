'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, PiggyBank, Brain, Edit2, Check, X, LayoutDashboard, Home, Layers, Wallet } from 'lucide-react';
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

interface CpfInputs {
  cpfBalanceSgd: number;         // current total CPF balance in SGD
  cpfGrowthRate: number;         // annual % (default 4.0 — SA/RA rate)
  cpfRaAge: number;              // age when RA is created (default 55)
  cpfPayoutAge: number;          // CPF Life payout start age (default 65, max 70)
  cpfMonthlyPayoutSgd: number;   // expected monthly CPF Life payout in SGD
  cpfAnnualContribSgd: number;   // annual employee + employer CPF contributions in SGD
}

interface DataPoint {
  age: number; year: number;
  bear: number; base: number; bull: number;
  cpfIncome?: number;    // annual CPF Life income in USD (0 before payout age)
  cpfBalance?: number;   // CPF balance in USD (accumulation phase only)
}

// ── Math ──────────────────────────────────────────────────────────────────────

const RATES = { bear: 0.04, base: 0.07, bull: 0.10 };

function fv(prev: number, rate: number, contrib: number) {
  return Math.round(prev * (1 + rate) + contrib);
}

function computePlan(
  currentValue: number,
  inputs: Inputs,
  cpf: CpfInputs,
  usdToSgd: number,
) {
  const { currentAge, retirementAge, annualTaxable, annualStockGrants, annual401k } = inputs;
  const investContrib = annualTaxable + annualStockGrants + annual401k;
  const yearsToRetire = Math.max(0, retirementAge - currentAge);
  const now = new Date().getFullYear();

  const cpfUsd = cpf.cpfBalanceSgd / usdToSgd;
  const cpfContribUsd = cpf.cpfAnnualContribSgd / usdToSgd;
  const cpfRate = cpf.cpfGrowthRate / 100;

  // Phase 1 — accumulation: track CPF year-by-year with contributions
  let cpfBal = cpfUsd;
  let cpfAtRa = -1; // captured when thisAge === cpfRaAge

  const acc: DataPoint[] = [{
    age: currentAge, year: now,
    bear: currentValue, base: currentValue, bull: currentValue,
    cpfBalance: Math.round(cpfBal),
  }];

  for (let y = 1; y <= yearsToRetire; y++) {
    const p = acc[y - 1];
    const thisAge = currentAge + y;
    cpfBal = fv(cpfBal, cpfRate, cpfContribUsd);
    if (thisAge === cpf.cpfRaAge) cpfAtRa = cpfBal;
    acc.push({
      age: thisAge, year: now + y,
      bear: fv(p.bear, RATES.bear, investContrib),
      base: fv(p.base, RATES.base, investContrib),
      bull: fv(p.bull, RATES.bull, investContrib),
      cpfBalance: Math.round(cpfBal),
    });
  }

  // cpfBal is now the balance at retirementAge
  if (cpfAtRa === -1) {
    // cpfRaAge wasn't hit in the loop (already past it, or retire before 55)
    cpfAtRa = cpf.cpfRaAge <= currentAge
      ? Math.round(cpfUsd)
      : Math.round(cpfBal * Math.pow(1 + cpfRate, cpf.cpfRaAge - retirementAge));
  }

  const ret = acc[acc.length - 1];

  // CPF grows from retirement to payout age (no more contributions)
  const yearsRetireToPayoutAge = Math.max(0, cpf.cpfPayoutAge - retirementAge);
  const cpfAtPayout = Math.round(cpfBal * Math.pow(1 + cpfRate, yearsRetireToPayoutAge));

  const cpfAnnualUsd = Math.round((cpf.cpfMonthlyPayoutSgd * 12) / usdToSgd);

  // Phase 2 — drawdown: 4% withdrawal offset by CPF Life income once payouts begin
  const wBear = ret.bear * 0.04;
  const wBase = ret.base * 0.04;
  const wBull = ret.bull * 0.04;
  const DRAW_YEARS = 35;
  const draw: DataPoint[] = [{ ...ret, cpfIncome: 0 }];

  for (let y = 1; y <= DRAW_YEARS; y++) {
    const p = draw[y - 1];
    const age = retirementAge + y;
    const cpfIncome = age >= cpf.cpfPayoutAge ? cpfAnnualUsd : 0;
    const netBear = Math.max(0, wBear - cpfIncome);
    const netBase = Math.max(0, wBase - cpfIncome);
    const netBull = Math.max(0, wBull - cpfIncome);
    draw.push({
      age, year: ret.year + y,
      bear: Math.max(0, Math.round(p.bear * (1 + RATES.bear) - netBear)),
      base: Math.max(0, Math.round(p.base * (1 + RATES.base) - netBase)),
      bull: Math.max(0, Math.round(p.bull * (1 + RATES.bull) - netBull)),
      cpfIncome,
    });
  }

  return {
    acc, draw, ret,
    monthly: { bear: wBear / 12, base: wBase / 12, bull: wBull / 12 },
    annual:  { bear: wBear,       base: wBase,       bull: wBull },
    cpf: { cpfAtRa, cpfAtPayout, cpfAnnualUsd, cpfMonthlyUsd: Math.round(cpfAnnualUsd / 12) },
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

  const [currentValue, setCurrentValue] = useState(0);
  const [usdToSgd, setUsdToSgd] = useState(1.35);

  const [inputs, setInputs] = useState<Inputs>({
    currentAge: 30, retirementAge: 65,
    annualTaxable: 40_000, annualStockGrants: 50_000, annual401k: 40_000,
  });
  const [cpfInputs, setCpfInputs] = useState<CpfInputs>({
    cpfBalanceSgd: 0,
    cpfGrowthRate: 4.0,
    cpfRaAge: 55,
    cpfPayoutAge: 65,
    cpfMonthlyPayoutSgd: 0,
    cpfAnnualContribSgd: 0,
  });
  const [editingInputs, setEditingInputs] = useState(false);
  const [editingCpf, setEditingCpf] = useState(false);
  const [draft, setDraft] = useState<Inputs>(inputs);
  const [cpfDraft, setCpfDraft] = useState<CpfInputs>(cpfInputs);

  useEffect(() => {
    const p = loadProfile();
    if (p) {
      setInputs(prev => ({ ...prev, currentAge: p.currentAge, retirementAge: p.retirementAge }));
      setDraft(prev => ({ ...prev, currentAge: p.currentAge, retirementAge: p.retirementAge }));
    }

    type CacheShape = { summary: PortfolioSummary; allocation: AllocationItem[]; earnings: EarningsEvent[] };
    const cached = loadPortfolioCache<CacheShape>();
    if (cached?.summary) {
      // Investment portfolio value (exclude CPF — CPF tracked separately)
      const nonCpfValue = cached.summary.positions
        ?.filter(pos => pos.accountType !== 'cpf')
        .reduce((s, pos) => s + pos.equity, 0) ?? cached.summary.totalEquity;
      setCurrentValue(nonCpfValue);

      const rate = cached.summary.usdToSgdRate ?? 1.35;
      setUsdToSgd(rate);

      // Pre-fill CPF balance from CPF positions
      const cpfValueUsd = cached.summary.positions
        ?.filter(pos => pos.accountType === 'cpf')
        .reduce((s, pos) => s + pos.equity, 0) ?? 0;
      const cpfValueSgd = Math.round(cpfValueUsd * rate);
      if (cpfValueSgd > 0) {
        setCpfInputs(prev => ({ ...prev, cpfBalanceSgd: cpfValueSgd }));
        setCpfDraft(prev => ({ ...prev, cpfBalanceSgd: cpfValueSgd }));
      }
    }
  }, []);

  function saveInputs() {
    setInputs(draft);
    const p = loadProfile();
    if (p) saveProfile({ ...p, currentAge: draft.currentAge, retirementAge: draft.retirementAge });
    setEditingInputs(false);
  }

  function saveCpf() {
    setCpfInputs(cpfDraft);
    setEditingCpf(false);
  }

  const plan = computePlan(currentValue, inputs, cpfInputs, usdToSgd);
  const yearsToRetire = Math.max(0, inputs.retirementAge - inputs.currentAge);
  const totalAnnualContrib = inputs.annualTaxable + inputs.annualStockGrants + inputs.annual401k;
  const hasCpf = cpfInputs.cpfBalanceSgd > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center border-b border-zinc-800 px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <TrendingUp className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <span className="text-sm sm:text-base font-semibold text-zinc-100 whitespace-nowrap">Beta than nothing</span>
          <nav className="ml-1 sm:ml-3 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            <button onClick={() => router.push('/summary')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0">
              <Wallet className="h-3.5 w-3.5" /><span className="hidden sm:inline">Net Worth</span>
            </button>
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

        {/* Page title + edit buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Retirement Planning</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Projection from age {inputs.currentAge} → {inputs.retirementAge} · {yearsToRetire} years to retire
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setDraft(inputs); setEditingInputs(e => !e); setEditingCpf(false); }}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
              <Edit2 className="h-3 w-3" /> Edit assumptions
            </button>
            <button onClick={() => { setCpfDraft(cpfInputs); setEditingCpf(e => !e); setEditingInputs(false); }}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-900/40 transition-colors">
              <Edit2 className="h-3 w-3" /> CPF settings
            </button>
          </div>
        </div>

        {/* Investment assumptions edit panel */}
        {editingInputs && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {([
                { label: 'Current Age', key: 'currentAge' },
                { label: 'Retire at Age', key: 'retirementAge' },
                { label: 'Annual Taxable ($)', key: 'annualTaxable' },
                { label: 'Annual Stock Grants ($)', key: 'annualStockGrants' },
                { label: 'Annual 401k ($)', key: 'annual401k' },
              ] as { label: string; key: keyof Inputs }[]).map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</label>
                  <input type="number" value={draft[key]}
                    onChange={e => setDraft(d => ({ ...d, [key]: Number(e.target.value) || 0 }))}
                    className="w-full rounded bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500" />
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

        {/* CPF edit panel */}
        {editingCpf && (
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 space-y-4">
            <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">CPF & Singapore Retirement Settings</div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {([
                { label: 'CPF Balance (SGD)', key: 'cpfBalanceSgd' },
                { label: 'Annual Contrib (SGD)', key: 'cpfAnnualContribSgd' },
                { label: 'CPF Growth Rate (%)', key: 'cpfGrowthRate' },
                { label: 'RA Created at Age', key: 'cpfRaAge' },
                { label: 'CPF Life Payout Age', key: 'cpfPayoutAge' },
                { label: 'Monthly Payout (SGD)', key: 'cpfMonthlyPayoutSgd' },
              ] as { label: string; key: keyof CpfInputs }[]).map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</label>
                  <input type="number" value={cpfDraft[key]}
                    onChange={e => setCpfDraft(d => ({ ...d, [key]: Number(e.target.value) || 0 }))}
                    className="w-full rounded bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500" />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-zinc-600">
              CPF balance auto-filled from portfolio. Annual contrib: employee + employer (e.g. S$30,600/yr at wage ceiling, age &lt;35). RA created at 55 (OA+SA → RA). CPF Life payout age: 65–70 (later = higher). Monthly payout: BRS ~S$900, FRS ~S$1,800, ERS ~S$3,300 (2024 est).
            </p>
            <div className="flex gap-2">
              <button onClick={saveCpf} className="flex items-center gap-1 rounded px-3 py-1.5 bg-emerald-700/40 text-emerald-300 text-xs hover:bg-emerald-700/60 transition-colors">
                <Check className="h-3 w-3" /> Save
              </button>
              <button onClick={() => setEditingCpf(false)} className="flex items-center gap-1 rounded px-3 py-1.5 bg-zinc-700/40 text-zinc-400 text-xs hover:bg-zinc-700/60 transition-colors">
                <X className="h-3 w-3" /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* Contribution summary */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2 font-semibold">Annual Contributions (Investment Portfolio)</div>
          <div className="flex flex-wrap gap-6 text-xs">
            <div><span className="text-zinc-500">After-tax taxable </span><span className="text-zinc-200 font-semibold">{fmtM(inputs.annualTaxable)}</span></div>
            <div><span className="text-zinc-500">Stock grants </span><span className="text-zinc-200 font-semibold">{fmtM(inputs.annualStockGrants)}</span></div>
            <div><span className="text-zinc-500">401k (pre-tax) </span><span className="text-zinc-200 font-semibold">{fmtM(inputs.annual401k)}</span></div>
            <div className="border-l border-zinc-700 pl-6">
              <span className="text-zinc-500">Total / year </span>
              <span className="text-purple-300 font-bold">{fmtM(totalAnnualContrib)}</span>
            </div>
          </div>
        </div>

        {/* CPF milestones card */}
        {hasCpf && (
          <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/10 px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">🇸🇬 CPF & Singapore Retirement</span>
              <span className="ml-auto text-xs text-zinc-600">
                Current balance: S${(cpfInputs.cpfBalanceSgd).toLocaleString()} · {cpfInputs.cpfGrowthRate}%/yr
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
              <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                <div className="text-zinc-500 mb-1">Age {cpfInputs.cpfRaAge} — RA Created</div>
                <div className="font-bold text-emerald-300 text-sm">S${Math.round(plan.cpf.cpfAtRa * usdToSgd).toLocaleString()}</div>
                <div className="text-zinc-600 mt-0.5">OA+SA → Retirement Account</div>
              </div>
              <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                <div className="text-zinc-500 mb-1">Age {cpfInputs.cpfPayoutAge} — CPF Life Starts</div>
                <div className="font-bold text-emerald-300 text-sm">S${Math.round(plan.cpf.cpfAtPayout * usdToSgd).toLocaleString()}</div>
                <div className="text-zinc-600 mt-0.5">Projected RA balance</div>
              </div>
              <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                <div className="text-zinc-500 mb-1">CPF Life Monthly</div>
                <div className="font-bold text-emerald-400 text-sm">S${cpfInputs.cpfMonthlyPayoutSgd.toLocaleString()}</div>
                <div className="text-zinc-600 mt-0.5">{fmtM(plan.cpf.cpfMonthlyUsd)} USD/mo</div>
              </div>
              <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
                <div className="text-zinc-500 mb-1">CPF Life Annual</div>
                <div className="font-bold text-emerald-400 text-sm">{fmtM(plan.cpf.cpfAnnualUsd)}</div>
                <div className="text-zinc-600 mt-0.5">reduces portfolio drawdown</div>
              </div>
            </div>
          </div>
        )}

        {/* At-retirement stats */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">At Retirement (Age {inputs.retirementAge})</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Base Case Portfolio" value={fmtM(plan.ret.base)} sub={`${fmtM(plan.monthly.base)}/mo from investments`} color="text-purple-300" />
            <Stat label="Bear Case (4%/yr)" value={fmtM(plan.ret.bear)} sub={`${fmtM(plan.monthly.bear)}/mo from investments`} color="text-blue-400" />
            <Stat label="Bull Case (10%/yr)" value={fmtM(plan.ret.bull)} sub={`${fmtM(plan.monthly.bull)}/mo from investments`} color="text-emerald-400" />
            <Stat label="Current Portfolio" value={fmtM(currentValue)} sub={`${yearsToRetire}y of growth ahead`} />
          </div>
          {hasCpf && cpfInputs.cpfMonthlyPayoutSgd > 0 && (
            <div className="mt-3 rounded-lg border border-emerald-800/30 bg-emerald-950/20 px-4 py-2.5 text-xs text-emerald-300">
              <span className="font-semibold">Total income at age {cpfInputs.cpfPayoutAge}+:</span>{' '}
              Investments {fmtM(plan.monthly.base)}/mo + CPF Life {fmtM(plan.cpf.cpfMonthlyUsd)}/mo
              {' = '}<span className="font-bold">{fmtM(plan.monthly.base + plan.cpf.cpfMonthlyUsd)}/mo</span> combined (base case)
            </div>
          )}
        </div>

        {/* Accumulation chart */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">Investment Portfolio Growth — Now to Retirement</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Age {inputs.currentAge} → {inputs.retirementAge} · {fmtM(totalAnnualContrib)}/yr contributions · CPF tracked separately</p>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={plan.acc} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="age" tickFormatter={fmtAge} tick={{ fontSize: 11, fill: '#71717a' }}
                label={{ value: 'Age', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: '#71717a' }} />
              <YAxis tickFormatter={v => fmtM(v as number)} tick={{ fontSize: 11, fill: '#71717a' }} width={60} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {hasCpf && inputs.currentAge < cpfInputs.cpfRaAge && cpfInputs.cpfRaAge < inputs.retirementAge && (
                <ReferenceLine x={cpfInputs.cpfRaAge} stroke="#34d399" strokeDasharray="3 2"
                  label={{ value: `RA (${cpfInputs.cpfRaAge})`, fontSize: 9, fill: '#34d399', position: 'top' }} />
              )}
              <Line dataKey="bear" name="Bear (4%)" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line dataKey="base" name="Base (7%)" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
              <Line dataKey="bull" name="Bull (10%)" stroke="#34d399" strokeWidth={2} dot={false} />
              {hasCpf && (
                <Line dataKey="cpfBalance" name="CPF" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Drawdown chart */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-zinc-200">Retirement Drawdown — 4% Rule
              {hasCpf && cpfInputs.cpfMonthlyPayoutSgd > 0 && <span className="ml-2 text-emerald-400 font-normal text-xs">+ CPF Life from age {cpfInputs.cpfPayoutAge}</span>}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Investment portfolio only · CPF Life income offsets withdrawals from age {cpfInputs.cpfPayoutAge}
            </p>
          </div>

          <div className="flex flex-wrap gap-6 mb-4 text-xs">
            <div><span className="text-blue-400 font-semibold">Bear: </span><span className="text-zinc-300">{fmtM(plan.monthly.bear)}/mo investments</span></div>
            <div><span className="text-purple-400 font-semibold">Base: </span><span className="text-zinc-300">{fmtM(plan.monthly.base)}/mo investments</span></div>
            <div><span className="text-emerald-400 font-semibold">Bull: </span><span className="text-zinc-300">{fmtM(plan.monthly.bull)}/mo investments</span></div>
            {hasCpf && cpfInputs.cpfMonthlyPayoutSgd > 0 && (
              <div><span className="text-emerald-300 font-semibold">CPF Life: </span><span className="text-zinc-300">+{fmtM(plan.cpf.cpfMonthlyUsd)}/mo from age {cpfInputs.cpfPayoutAge}</span></div>
            )}
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={plan.draw} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="age" tickFormatter={fmtAge} tick={{ fontSize: 11, fill: '#71717a' }}
                label={{ value: 'Age', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: '#71717a' }} />
              <YAxis tickFormatter={v => fmtM(v as number)} tick={{ fontSize: 11, fill: '#71717a' }} width={60} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <ReferenceLine x={inputs.retirementAge} stroke="#52525b" strokeDasharray="4 2"
                label={{ value: 'Retire', fontSize: 10, fill: '#71717a' }} />
              {hasCpf && cpfInputs.cpfPayoutAge > inputs.retirementAge && (
                <ReferenceLine x={cpfInputs.cpfPayoutAge} stroke="#34d399" strokeDasharray="3 2"
                  label={{ value: `CPF Life (${cpfInputs.cpfPayoutAge})`, fontSize: 9, fill: '#34d399', position: 'top' }} />
              )}
              <Line dataKey="bear" name="Bear (4%)" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line dataKey="base" name="Base (7%)" stroke="#a78bfa" strokeWidth={2.5} dot={false} />
              <Line dataKey="bull" name="Bull (10%)" stroke="#34d399" strokeWidth={2} dot={false} />
              {hasCpf && cpfInputs.cpfMonthlyPayoutSgd > 0 && (
                <Line dataKey="cpfIncome" name="CPF Life income" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              )}
            </LineChart>
          </ResponsiveContainer>

          <p className="mt-3 text-xs text-zinc-600">
            CPF Life income reduces the amount drawn from your investment portfolio each year — the portfolio depletes more slowly or keeps growing.
            {hasCpf && cpfInputs.cpfMonthlyPayoutSgd === 0 && ' Enter your expected CPF Life monthly payout in CPF settings above.'}
          </p>
        </div>

        {/* Milestone table */}
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
                  {hasCpf && <th className="px-4 py-2.5 text-right text-zinc-500 font-medium">CPF</th>}
                </tr>
              </thead>
              <tbody>
                {plan.acc
                  .filter((_, i) => i === 0 || i % 5 === 0 || i === plan.acc.length - 1)
                  .map(row => {
                    const isCpfRa = hasCpf && row.age === cpfInputs.cpfRaAge;
                    const isRetire = row.age === inputs.retirementAge;
                    return (
                      <tr key={row.age} className={`border-b border-zinc-800/50 ${isRetire ? 'bg-purple-900/20' : isCpfRa ? 'bg-emerald-900/10' : 'bg-zinc-900'}`}>
                        <td className={`px-4 py-2.5 font-medium ${isRetire ? 'text-purple-300' : isCpfRa ? 'text-emerald-400' : 'text-zinc-200'}`}>
                          {row.age}{isRetire ? ' ★' : isCpfRa ? ' 🇸🇬' : ''}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500">{row.year}{isCpfRa ? ' · RA' : ''}</td>
                        <td className="px-4 py-2.5 text-right text-blue-400">{fmtM(row.bear)}</td>
                        <td className="px-4 py-2.5 text-right text-purple-300 font-semibold">{fmtM(row.base)}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-400">{fmtM(row.bull)}</td>
                        {hasCpf && <td className="px-4 py-2.5 text-right text-emerald-300">{row.cpfBalance ? fmtM(row.cpfBalance) : '—'}</td>}
                      </tr>
                    );
                  })}
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
