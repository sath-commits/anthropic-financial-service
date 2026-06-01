'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, ChevronLeft, Loader2, TrendingUp, CheckCircle } from 'lucide-react';
import PortfolioEditor from '@/components/PortfolioEditor';
import { hydrateSettings, savePositions, saveProfile } from '@/lib/storage';
import type { UserPosition, InvestorProfile } from '@/lib/types';

// ── Step 2: Investor profile ──────────────────────────────────────────────────

const DEFAULT_TARGETS: Record<string, number> = {
  'US Large Cap': 0.50, 'International': 0.15, 'Emerging Markets': 0.05,
  'Bonds': 0.20, 'Cash': 0.05, 'US Small/Mid Cap': 0.05,
};

function ProfileStep({
  onNext, onBack,
}: {
  onNext: (profile: Omit<InvestorProfile, 'strategy'>) => void;
  onBack: () => void;
}) {
  const [age, setAge] = useState(35);
  const [retireAge, setRetireAge] = useState(65);
  const [monthly, setMonthly] = useState(1000);
  const [risk, setRisk] = useState<InvestorProfile['riskTolerance']>('moderate');
  const [goal, setGoal] = useState<InvestorProfile['primaryGoal']>('balanced');
  const [targets, setTargets] = useState<Record<string, number>>(DEFAULT_TARGETS);

  function updateTarget(cls: string, raw: string) {
    const pct = parseFloat(raw);
    setTargets(prev => ({ ...prev, [cls]: isNaN(pct) ? 0 : pct / 100 }));
  }

  const totalTarget = Object.values(targets).reduce((s, v) => s + v, 0);
  const targetOk = Math.abs(totalTarget - 1) < 0.01;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#1c1612]">Tell us about yourself</h2>
        <p className="mt-1 text-sm text-[#9e9087]">This helps tailor strategy recommendations to your situation.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Current Age</span>
          <input type="number" value={age} onChange={e => setAge(+e.target.value)} min={18} max={90}
            className="w-full rounded-lg bg-white px-3 py-2 text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Retire At</span>
          <input type="number" value={retireAge} onChange={e => setRetireAge(+e.target.value)} min={age + 1} max={90}
            className="w-full rounded-lg bg-white px-3 py-2 text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600" />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Monthly Contribution</span>
          <div className="flex items-center rounded-lg bg-white px-3 py-2 focus-within:ring-1 focus-within:ring-zinc-600">
            <span className="text-[#9e9087]">$</span>
            <input type="number" value={monthly} onChange={e => setMonthly(+e.target.value)} min={0}
              className="w-full bg-transparent text-[#1c1612] outline-none ml-1" />
          </div>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Risk Tolerance</span>
          <select value={risk} onChange={e => setRisk(e.target.value as InvestorProfile['riskTolerance'])}
            className="w-full rounded-lg bg-white px-3 py-2 text-[#4a3d33] outline-none focus:ring-1 focus:ring-zinc-600">
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
          </select>
        </label>
      </div>

      <div>
        <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Primary Goal</span>
        <div className="flex flex-wrap gap-2 mt-2">
          {(['growth', 'income', 'preservation', 'balanced'] as const).map(g => (
            <button key={g} onClick={() => setGoal(g)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                goal === g ? 'bg-blue-600 text-white' : 'border border-[#d4c9bc] text-[#6e5f52] hover:text-[#2d2218]'
              }`}>
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wider text-[#9e9087]">Target Allocation</span>
          <span className={`text-xs font-medium ${targetOk ? 'text-emerald-400' : 'text-amber-400'}`}>
            Total: {(totalTarget * 100).toFixed(0)}% {targetOk ? '✓' : '(must equal 100%)'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(targets).map(([cls, val]) => (
            <label key={cls} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-[#6e5f52]">{cls}</span>
              <div className="flex items-center gap-0.5">
                <input type="number" value={Math.round(val * 100)} min={0} max={100}
                  onChange={e => updateTarget(cls, e.target.value)}
                  className="w-12 rounded bg-white px-2 py-1 text-center text-sm text-[#1c1612] outline-none focus:ring-1 focus:ring-zinc-600" />
                <span className="text-xs text-[#b8ad9e]">%</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-2 rounded-lg border border-[#d4c9bc] px-5 py-2.5 text-sm font-medium text-[#6e5f52] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={() => onNext({ currentAge: age, retirementAge: retireAge, monthlyContribution: monthly, riskTolerance: risk, primaryGoal: goal, targetAllocation: targets })}
          disabled={!targetOk}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-40">
          Continue <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Step 3: AI strategy recommendation ───────────────────────────────────────

function StrategyStep({ positions, profile, onDone, onBack }: {
  positions: UserPosition[];
  profile: Omit<InvestorProfile, 'strategy'>;
  onDone: (strategy: string) => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState('');
  const [started, setStarted] = useState(false);

  async function generate() {
    setLoading(true);
    setStarted(true);
    setStrategy('');

    const portfolioLines = positions.map(p =>
      `${p.symbol}: ${p.shares} shares @ $${p.avgCost} avg cost (${p.accountType}, ${p.assetClass}, held ${p.holdingDays} days)`
    ).join('\n');

    const profileLines = `Age: ${profile.currentAge}, Retirement age: ${profile.retirementAge}
Monthly contribution: $${profile.monthlyContribution}
Risk tolerance: ${profile.riskTolerance}
Primary goal: ${profile.primaryGoal}
Target allocation: ${Object.entries(profile.targetAllocation).map(([k, v]) => `${k} ${(v*100).toFixed(0)}%`).join(', ')}`;

    const prompt = `I have the following portfolio and investor profile. Please:
1. Analyze my current portfolio — asset allocation, concentration risks, and notable positions.
2. Compare it to my stated target allocation and identify the biggest gaps.
3. Based on my age (${profile.currentAge}), risk tolerance (${profile.riskTolerance}), goal (${profile.primaryGoal}), and ${profile.retirementAge - profile.currentAge} years to retirement, assess if my target allocation is appropriate.
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
          if (payload === '[DONE]') { break; }
          try { const { text } = JSON.parse(payload); accumulated += text; setStrategy(accumulated); } catch { /* skip */ }
        }
      }
    } catch (err) {
      setStrategy(`Could not generate strategy: ${err instanceof Error ? err.message : 'Unknown error'}.\n\nYou can still use the dashboard — the Advisor will help you on your next market day.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#1c1612]">Your Investment Strategy</h2>
        <p className="mt-1 text-sm text-[#9e9087]">AI will analyze your portfolio and suggest a starting strategy.</p>
      </div>

      {!started ? (
        <div className="space-y-4">
          <button onClick={generate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
            Generate strategy recommendation
          </button>
          <button onClick={() => onDone('')}
            className="text-sm text-[#9e9087] hover:text-[#4a3d33] transition-colors">
            Skip — go to dashboard
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[#e5ddd3] bg-white p-5 min-h-[200px]">
          {loading && !strategy && (
            <div className="flex items-center gap-2 text-[#9e9087] text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing your portfolio…
            </div>
          )}
          {strategy && (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#2d2218]">{strategy}</pre>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {!started && (
          <button onClick={onBack}
            className="flex items-center gap-2 rounded-lg border border-[#d4c9bc] px-5 py-2.5 text-sm font-medium text-[#6e5f52] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors">
            <ChevronLeft className="h-4 w-4" /> Back
          </button>
        )}
        {strategy && (
          <button onClick={() => onDone(strategy)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors">
            <CheckCircle className="h-4 w-4" />
            Open dashboard
          </button>
        )}
      </div>
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
  const [savedProfile, setSavedProfile] = useState<InvestorProfile | null>(null);
  const [initialPositions, setInitialPositions] = useState<UserPosition[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void hydrateSettings().then(({ positions: savedPositions, profile: storedProfile }) => {
      setInitialPositions(savedPositions ?? []);
      setSavedProfile(storedProfile ?? null);
      setHydrated(true);
    });
  }, []);

  function handlePositions(p: UserPosition[]) {
    savePositions(p);
    if (savedProfile) {
      router.push('/');
      return;
    }
    setPositions(p);
    setStep(1);
  }
  function handleSaveDashboard(p: UserPosition[]) {
    savePositions(p);
    router.push('/');
  }
  function handleProfile(p: Omit<InvestorProfile, 'strategy'>) { setProfile(p); setStep(2); }
  function handleDone(strategy: string) {
    savePositions(positions);
    saveProfile({ ...profile!, strategy });
    router.push('/');
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#f7f2eb] px-4 py-12">
      {/* Header */}
      <div className="mb-10 flex items-center gap-2.5">
        <TrendingUp className="h-6 w-6 text-blue-400" />
        <span className="text-xl font-semibold text-[#1c1612]">Beta than nothing</span>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
              i < step ? 'bg-emerald-600 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-[#ede8df] text-[#9e9087]'
            }`}>
              {i < step ? '✓' : i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'text-[#2d2218]' : 'text-[#b8ad9e]'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="ml-2 h-px w-8 bg-[#ede8df]" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="w-full max-w-4xl rounded-2xl border border-[#e5ddd3] bg-white p-8">
        {step === 0 && hydrated && (
          <div>
            <h1 className="text-2xl font-semibold text-[#1c1612]">What&apos;s in your portfolio?</h1>
            <p className="mt-2 mb-6 text-sm text-[#9e9087]">
              Import your holdings, then review the rows. Purchase date is used for tax calculations.
            </p>
            <PortfolioEditor
              initialPositions={initialPositions}
              onSubmit={handlePositions}
              submitLabel="Continue"
              secondaryAction={{ label: 'Save and open dashboard', onSubmit: handleSaveDashboard }}
            />
          </div>
        )}
        {step === 1 && <ProfileStep onNext={handleProfile} onBack={() => setStep(0)} />}
        {step === 2 && profile !== null && (
          <StrategyStep positions={positions} profile={profile} onDone={handleDone} onBack={() => setStep(1)} />
        )}
      </div>

      <p className="mt-6 text-xs text-[#c8c0b5]">
        Your data stays in your browser — nothing is sent to any server except for AI analysis.
      </p>
    </div>
  );
}
