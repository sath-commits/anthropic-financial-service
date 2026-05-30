'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ChevronRight, Loader2, TrendingUp, CheckCircle } from 'lucide-react';
import { savePositions, saveProfile } from '@/lib/storage';
import type { UserPosition, InvestorProfile } from '@/lib/types';

// ── Step 1: Portfolio entry ───────────────────────────────────────────────────

const ASSET_CLASSES = ['US Large Cap', 'US Small/Mid Cap', 'International', 'Emerging Markets', 'Bonds', 'REITs', 'Alternatives', 'Cash'];
const ACCOUNT_TYPES: UserPosition['accountType'][] = ['taxable', 'ira', 'roth_ira', '401k'];

function blankPosition(): Partial<UserPosition> {
  return { symbol: '', name: '', shares: undefined, avgCost: undefined, accountType: 'taxable', holdingDays: 365, assetClass: 'US Large Cap' };
}

function PortfolioStep({ onNext }: { onNext: (positions: UserPosition[]) => void }) {
  const [rows, setRows] = useState<Array<Partial<UserPosition>>>([blankPosition()]);
  const [error, setError] = useState('');

  function update(i: number, field: keyof UserPosition, value: string | number) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function addRow() { setRows(prev => [...prev, blankPosition()]); }
  function removeRow(i: number) { setRows(prev => prev.filter((_, idx) => idx !== i)); }

  function validate() {
    const valid: UserPosition[] = [];
    for (const r of rows) {
      if (!r.symbol?.trim()) continue; // skip empty rows
      if (!r.shares || r.shares <= 0) { setError(`Enter a valid share count for ${r.symbol}`); return; }
      if (!r.avgCost || r.avgCost <= 0) { setError(`Enter a valid avg cost for ${r.symbol}`); return; }
      valid.push({
        symbol: r.symbol.trim().toUpperCase(),
        name: r.name?.trim() || r.symbol.trim().toUpperCase(),
        shares: Number(r.shares),
        avgCost: Number(r.avgCost),
        accountType: r.accountType ?? 'taxable',
        holdingDays: r.holdingDays ?? 365,
        assetClass: r.assetClass ?? 'US Large Cap',
        purchaseDate: r.purchaseDate,
      });
    }
    if (valid.length === 0) { setError('Add at least one position to continue.'); return; }
    setError('');
    onNext(valid);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">What&apos;s in your portfolio?</h2>
        <p className="mt-1 text-sm text-zinc-500">Enter your current holdings. You can edit this later.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              {['Ticker', 'Name (optional)', 'Shares', 'Avg Cost ($)', 'Account', 'Asset Class', ''].map(h => (
                <th key={h} className="pb-2 pr-3 text-xs font-medium uppercase tracking-wider text-zinc-500 last:pr-0">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="space-y-1">
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-zinc-800/40">
                <td className="py-2 pr-3">
                  <input value={r.symbol ?? ''} onChange={e => update(i, 'symbol', e.target.value.toUpperCase())}
                    placeholder="AAPL" maxLength={8}
                    className="w-20 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600 uppercase" />
                </td>
                <td className="py-2 pr-3">
                  <input value={r.name ?? ''} onChange={e => update(i, 'name', e.target.value)}
                    placeholder="Apple Inc."
                    className="w-36 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" value={r.shares ?? ''} onChange={e => update(i, 'shares', parseFloat(e.target.value))}
                    placeholder="10" min="0" step="any"
                    className="w-20 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600" />
                </td>
                <td className="py-2 pr-3">
                  <input type="number" value={r.avgCost ?? ''} onChange={e => update(i, 'avgCost', parseFloat(e.target.value))}
                    placeholder="150.00" min="0" step="any"
                    className="w-24 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600" />
                </td>
                <td className="py-2 pr-3">
                  <select value={r.accountType} onChange={e => update(i, 'accountType', e.target.value)}
                    className="rounded bg-zinc-800 px-2 py-1.5 text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-600">
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <select value={r.assetClass} onChange={e => update(i, 'assetClass', e.target.value)}
                    className="rounded bg-zinc-800 px-2 py-1.5 text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-600">
                    {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="py-2">
                  <button onClick={() => removeRow(i)} className="text-zinc-600 hover:text-red-400 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={addRow}
        className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        <Plus className="h-4 w-4" /> Add position
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button onClick={validate}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
        Continue <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Step 2: Investor profile ──────────────────────────────────────────────────

const DEFAULT_TARGETS: Record<string, number> = {
  'US Large Cap': 0.50, 'International': 0.15, 'Emerging Markets': 0.05,
  'Bonds': 0.20, 'Cash': 0.05, 'US Small/Mid Cap': 0.05,
};

function ProfileStep({ onNext }: { onNext: (profile: Omit<InvestorProfile, 'strategy'>) => void }) {
  const [age, setAge] = useState(35);
  const [retireAge, setRetireAge] = useState(65);
  const [monthly, setMonthly] = useState(1000);
  const [risk, setRisk] = useState<InvestorProfile['riskTolerance']>('moderate');
  const [goal, setGoal] = useState<InvestorProfile['primaryGoal']>('balanced');
  const [targets, setTargets] = useState<Record<string, number>>(DEFAULT_TARGETS);

  function updateTarget(cls: string, pct: string) {
    setTargets(prev => ({ ...prev, [cls]: parseFloat(pct) / 100 || 0 }));
  }

  const totalTarget = Object.values(targets).reduce((s, v) => s + v, 0);
  const targetOk = Math.abs(totalTarget - 1) < 0.01;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">Tell us about yourself</h2>
        <p className="mt-1 text-sm text-zinc-500">This helps Claude tailor strategy recommendations to your situation.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Current Age</span>
          <input type="number" value={age} onChange={e => setAge(+e.target.value)} min={18} max={90}
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-600" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Retire At</span>
          <input type="number" value={retireAge} onChange={e => setRetireAge(+e.target.value)} min={age + 1} max={90}
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-600" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Monthly Contribution</span>
          <div className="flex items-center rounded-lg bg-zinc-800 px-3 py-2 focus-within:ring-1 focus-within:ring-zinc-600">
            <span className="text-zinc-500">$</span>
            <input type="number" value={monthly} onChange={e => setMonthly(+e.target.value)} min={0}
              className="w-full bg-transparent text-zinc-100 outline-none ml-1" />
          </div>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Risk Tolerance</span>
          <select value={risk} onChange={e => setRisk(e.target.value as InvestorProfile['riskTolerance'])}
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-600">
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </label>
      </div>

      <div>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Primary Goal</span>
          <div className="flex flex-wrap gap-2 mt-1">
            {(['growth', 'income', 'preservation', 'balanced'] as const).map(g => (
              <button key={g} onClick={() => setGoal(g)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                  goal === g ? 'bg-blue-600 text-white' : 'border border-zinc-700 text-zinc-400 hover:text-zinc-200'
                }`}>
                {g}
              </button>
            ))}
          </div>
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Target Allocation</span>
          <span className={`text-xs font-medium ${targetOk ? 'text-emerald-400' : 'text-amber-400'}`}>
            Total: {(totalTarget * 100).toFixed(0)}% {targetOk ? '✓' : '(must equal 100%)'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(targets).map(([cls, val]) => (
            <label key={cls} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-zinc-400">{cls}</span>
              <div className="flex items-center gap-0.5">
                <input type="number" value={Math.round(val * 100)} min={0} max={100}
                  onChange={e => updateTarget(cls, e.target.value)}
                  className="w-12 rounded bg-zinc-800 px-2 py-1 text-center text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-600" />
                <span className="text-xs text-zinc-600">%</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <button onClick={() => onNext({ currentAge: age, retirementAge: retireAge, monthlyContribution: monthly, riskTolerance: risk, primaryGoal: goal, targetAllocation: targets })}
        disabled={!targetOk}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-40">
        Continue <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Step 3: AI strategy recommendation ───────────────────────────────────────

function StrategyStep({ positions, profile, onDone }: {
  positions: UserPosition[];
  profile: Omit<InvestorProfile, 'strategy'>;
  onDone: (strategy: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState('');
  const [started, setStarted] = useState(false);

  async function generate() {
    setLoading(true);
    setStarted(true);
    setStrategy('');

    const portfolioLines = positions.map(p =>
      `${p.symbol}: ${p.shares} shares @ $${p.avgCost} avg cost (${p.accountType}, ${p.assetClass})`
    ).join('\n');

    const profileLines = `Age: ${profile.currentAge}, Retirement age: ${profile.retirementAge}
Monthly contribution: $${profile.monthlyContribution}
Risk tolerance: ${profile.riskTolerance}
Primary goal: ${profile.primaryGoal}
Target allocation: ${Object.entries(profile.targetAllocation).map(([k, v]) => `${k} ${(v*100).toFixed(0)}%`).join(', ')}`;

    const prompt = `I have the following portfolio and investor profile. Please:
1. Analyze my current portfolio — what's the asset allocation, concentration risks, and notable positions?
2. Compare it to my stated target allocation and identify the biggest gaps.
3. Based on my age (${profile.currentAge}), risk tolerance (${profile.riskTolerance}), goal (${profile.primaryGoal}), and ${profile.retirementAge - profile.currentAge} years to retirement, tell me if my target allocation is appropriate or if I should adjust it.
4. Suggest 3-5 specific actionable steps I should take in the next 30 days to align my portfolio with my goals.

Current portfolio:
${portfolioLines}

My profile:
${profileLines}

Be specific, direct, and concise. Use bullet points.`;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          portfolioContext: portfolioLines,
          profileContext: profileLines,
        }),
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try { const { text } = JSON.parse(payload); accumulated += text; setStrategy(accumulated); } catch { /* skip */ }
        }
      }
    } catch (err) {
      setStrategy(`Could not generate strategy: ${err instanceof Error ? err.message : 'Unknown error'}.\n\nYou can still use the dashboard — Claude will help you in the chat panel.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">Your Investment Strategy</h2>
        <p className="mt-1 text-sm text-zinc-500">Claude will analyze your portfolio and suggest a starting strategy.</p>
      </div>

      {!started ? (
        <button onClick={generate}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
          Generate strategy recommendation
        </button>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 min-h-[200px]">
          {loading && !strategy && (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing your portfolio…
            </div>
          )}
          {strategy && (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">{strategy}</pre>
          )}
        </div>
      )}

      {strategy && (
        <button onClick={() => onDone(strategy)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
          <CheckCircle className="h-4 w-4" />
          Open dashboard
        </button>
      )}
    </div>
  );
}

// ── Main onboarding shell ─────────────────────────────────────────────────────

const STEPS = ['Portfolio', 'Your profile', 'Strategy'];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [profile, setProfile] = useState<Omit<InvestorProfile, 'strategy'> | null>(null);

  function handlePositions(p: UserPosition[]) { setPositions(p); setStep(1); }
  function handleProfile(p: Omit<InvestorProfile, 'strategy'>) { setProfile(p); setStep(2); }
  function handleDone(strategy: string) {
    savePositions(positions);
    saveProfile({ ...profile!, strategy });
    router.push('/');
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#0a0a0a] px-4 py-12">
      {/* Header */}
      <div className="mb-10 flex items-center gap-2.5">
        <TrendingUp className="h-6 w-6 text-blue-400" />
        <span className="text-xl font-semibold text-zinc-100">Portfolio AI</span>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-500'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'text-zinc-200' : 'text-zinc-600'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="ml-2 h-px w-8 bg-zinc-800" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        {step === 0 && <PortfolioStep onNext={handlePositions} />}
        {step === 1 && profile === null && <ProfileStep onNext={handleProfile} />}
        {step === 2 && profile !== null && (
          <StrategyStep positions={positions} profile={profile} onDone={handleDone} />
        )}
      </div>

      <p className="mt-6 text-xs text-zinc-700">
        Your data stays in your browser — nothing is sent to any server except for AI analysis.
      </p>
    </div>
  );
}
