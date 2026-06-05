'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, PiggyBank, Home, Layers, Brain, Wallet,
  BarChart3, Shield, ArrowRight, ExternalLink, Eye, EyeOff,
} from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: <BarChart3 className="h-5 w-5 text-blue-500" />,
    title: 'Investment Dashboard',
    description: 'Track stocks, ETFs, and funds across all your brokerage accounts in one place with live prices.',
  },
  {
    icon: <PiggyBank className="h-5 w-5 text-emerald-500" />,
    title: 'Retirement Planner',
    description: 'Model your retirement trajectory — 401k, IRA, Roth, CPF — with Monte Carlo projections.',
  },
  {
    icon: <Home className="h-5 w-5 text-amber-500" />,
    title: 'Real Estate',
    description: 'Track property values, mortgage equity, and your real estate allocation as part of net worth.',
  },
  {
    icon: <Layers className="h-5 w-5 text-purple-500" />,
    title: 'Other Assets',
    description: 'Gold, crypto, vehicles, private equity — every asset class counted toward total wealth.',
  },
  {
    icon: <Wallet className="h-5 w-5 text-orange-500" />,
    title: 'Net Worth Summary',
    description: 'A single-screen view of all assets and liabilities across currencies — USD, SGD, INR.',
  },
  {
    icon: <Brain className="h-5 w-5 text-rose-500" />,
    title: 'AI Financial Advisor',
    description: 'Ask Claude anything about your portfolio — rebalancing, tax implications, risk exposure.',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Add your holdings',
    body: 'Enter your positions manually or paste a brokerage export. Supports stocks, ETFs, real estate, and more.',
  },
  {
    step: '02',
    title: 'Get live valuations',
    body: 'Prices update automatically via Yahoo Finance. Multi-currency support with live FX rates.',
  },
  {
    step: '03',
    title: 'Ask the advisor',
    body: 'Claude reads your actual portfolio and answers questions — drift analysis, retirement readiness, tax lots.',
  },
];

export default function LandingPage() {
  const router = useRouter();
  const loginRef = useRef<HTMLDivElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function scrollToLogin() {
    loginRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      (loginRef.current?.querySelector('input') as HTMLInputElement | null)?.focus();
    }, 400);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push('/dashboard');
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Sign in failed. Check your credentials.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f2eb]">
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header className="border-b border-[#e5ddd3] bg-[#f7f2eb]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            <span className="text-sm font-semibold text-[#1c1612]">Beta than nothing</span>
          </div>
          <button
            onClick={scrollToLogin}
            className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] bg-white px-3 py-1.5 text-xs font-medium text-[#4a3d33] transition-colors hover:bg-[#ede8df]"
          >
            Sign in <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d4c9bc] bg-white px-3 py-1 text-xs text-[#6e5f52] mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
            Powered by Anthropic Claude
          </div>
          <h1 className="text-3xl font-bold text-[#1c1612] sm:text-4xl lg:text-5xl leading-tight">
            Your entire financial life,<br />
            <span className="text-blue-500">intelligently tracked</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-[#6e5f52] leading-relaxed">
            One dashboard for stocks, retirement accounts, real estate, and every other asset — with an AI advisor that knows your actual numbers.
          </p>
          <button
            onClick={scrollToLogin}
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        {/* ── Features grid ────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <p className="text-[10px] uppercase tracking-widest text-[#9e9087] text-center mb-8">What's included</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon, title, description }) => (
              <div key={title} className="rounded-xl border border-[#e5ddd3] bg-white p-5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-[#f7f2eb] border border-[#e5ddd3]">
                  {icon}
                </div>
                <h3 className="text-sm font-semibold text-[#1c1612]">{title}</h3>
                <p className="mt-1.5 text-xs text-[#6e5f52] leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="border-y border-[#e5ddd3] bg-white py-14">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <p className="text-[10px] uppercase tracking-widest text-[#9e9087] text-center mb-8">How it works</p>
            <div className="grid gap-8 sm:grid-cols-3">
              {HOW_IT_WORKS.map(({ step, title, body }) => (
                <div key={step} className="flex flex-col gap-3">
                  <span className="text-2xl font-bold text-[#e5ddd3]">{step}</span>
                  <h3 className="text-sm font-semibold text-[#1c1612]">{title}</h3>
                  <p className="text-xs text-[#6e5f52] leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Anthropic / GitHub section ────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="rounded-xl border border-[#e5ddd3] bg-white p-8">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#f7f2eb] border border-[#e5ddd3]">
                <Shield className="h-6 w-6 text-[#4a3d33]" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[#1c1612]">Built on Anthropic Claude</h3>
                <p className="mt-1.5 text-sm text-[#6e5f52] leading-relaxed max-w-xl">
                  The AI advisor uses Claude — Anthropic&apos;s frontier model — to analyze your real portfolio data.
                  No hallucinated numbers, no generic advice. Claude reads your actual positions and answers accordingly.
                </p>
                <a
                  href="https://github.com/anthropics"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#d4c9bc] bg-[#f7f2eb] px-3.5 py-2 text-xs font-medium text-[#4a3d33] transition-colors hover:bg-[#ede8df]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Anthropic on GitHub
                  <ArrowRight className="h-3 w-3 text-[#9e9087]" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Login form ───────────────────────────────────────────────────── */}
        <section ref={loginRef} className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-sm rounded-xl border border-[#e5ddd3] bg-white p-8">
            <div className="mb-6 flex items-center gap-2.5">
              <TrendingUp className="h-5 w-5 text-blue-400" />
              <h2 className="text-base font-semibold text-[#1c1612]">Sign in</h2>
            </div>

            <form onSubmit={(e) => void handleLogin(e)} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-[#9e9087]">Username</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[#d4c9bc] bg-[#f7f2eb] px-3 py-2.5 text-sm text-[#1c1612] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
                  placeholder="your username"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[10px] uppercase tracking-wider text-[#9e9087]">Password</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full rounded-lg border border-[#d4c9bc] bg-[#f7f2eb] px-3 py-2.5 pr-10 text-sm text-[#1c1612] outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition-colors"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-[#9e9087] hover:text-[#4a3d33]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign in'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#e5ddd3] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-[#b8ad9e]">
          <span>Market data via Yahoo Finance. Not financial advice.</span>
          <span>Powered by Claude</span>
        </div>
      </footer>
    </div>
  );
}
