'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, PiggyBank, Home, Layers, Brain, Wallet,
  BarChart3, Shield, ArrowRight, ExternalLink, Eye, EyeOff,
} from 'lucide-react';
import DashboardPreview from '@/components/DashboardPreview';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  iconBg: string;
}

const FEATURES: Feature[] = [
  {
    icon: <BarChart3 className="h-6 w-6 text-blue-500" />,
    title: 'Investment Dashboard',
    description: 'Track stocks, ETFs, and funds across all your brokerage accounts in one place with live prices.',
    iconBg: 'bg-blue-50 border-blue-100',
  },
  {
    icon: <PiggyBank className="h-6 w-6 text-emerald-500" />,
    title: 'Retirement Planner',
    description: 'Model your retirement trajectory — 401k, IRA, Roth, CPF — with Monte Carlo projections.',
    iconBg: 'bg-emerald-50 border-emerald-100',
  },
  {
    icon: <Home className="h-6 w-6 text-amber-500" />,
    title: 'Real Estate',
    description: 'Track property values, mortgage equity, and your real estate allocation as part of net worth.',
    iconBg: 'bg-amber-50 border-amber-100',
  },
  {
    icon: <Layers className="h-6 w-6 text-purple-500" />,
    title: 'Other Assets',
    description: 'Gold, crypto, vehicles, private equity — every asset class counted toward total wealth.',
    iconBg: 'bg-purple-50 border-purple-100',
  },
  {
    icon: <Wallet className="h-6 w-6 text-orange-500" />,
    title: 'Net Worth Summary',
    description: 'A single-screen view of all assets and liabilities across currencies — USD, SGD, INR.',
    iconBg: 'bg-orange-50 border-orange-100',
  },
  {
    icon: <Brain className="h-6 w-6 text-rose-500" />,
    title: 'AI Financial Advisor',
    description: 'Ask Claude anything about your portfolio — rebalancing, tax implications, risk exposure.',
    iconBg: 'bg-rose-50 border-rose-100',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Add your holdings',
    body: 'Enter your positions manually or paste a brokerage export. Supports stocks, ETFs, real estate, and more.',
    accent: 'text-blue-400',
  },
  {
    step: '02',
    title: 'Get live valuations',
    body: 'Prices update automatically via Yahoo Finance. Multi-currency support with live FX rates.',
    accent: 'text-emerald-400',
  },
  {
    step: '03',
    title: 'Ask the advisor',
    body: 'Claude reads your actual portfolio and answers questions — drift analysis, retirement readiness, tax lots.',
    accent: 'text-purple-400',
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
        <section className="mx-auto max-w-5xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            {/* Left: copy */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[#d4c9bc] bg-white px-3 py-1 text-xs text-[#6e5f52] mb-6">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                Powered by Anthropic Claude
              </div>
              <h1 className="text-3xl font-bold text-[#1c1612] sm:text-4xl lg:text-5xl leading-tight">
                Your entire financial life,{' '}
                <span className="text-blue-500">intelligently&nbsp;tracked</span>
              </h1>
              <p className="mt-5 max-w-md text-base text-[#6e5f52] leading-relaxed">
                One dashboard for stocks, retirement accounts, real estate, and every other asset — with an AI advisor that knows your actual numbers.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={scrollToLogin}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                >
                  Get started <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="https://github.com/anthropics/financial-services"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#d4c9bc] bg-white px-6 py-3 text-sm font-medium text-[#4a3d33] transition-colors hover:bg-[#ede8df]"
                >
                  {/* GitHub SVG icon */}
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  View source
                </a>
              </div>

              {/* Trust badges */}
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[#9e9087]">
                <span className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-emerald-400" />
                  Data stays in your browser
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-[#d4c9bc]" />
                  No third-party tracking
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-[#d4c9bc]" />
                  Open source
                </span>
              </div>
            </div>

            {/* Right: dashboard preview */}
            <div className="relative">
              {/* Glow behind the preview */}
              <div className="absolute -inset-4 rounded-2xl bg-blue-400/10 blur-2xl" />
              <div className="relative">
                <DashboardPreview />
              </div>
            </div>
          </div>
        </section>

        {/* ── Features grid ────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
          <p className="text-[10px] uppercase tracking-widest text-[#9e9087] text-center mb-8">What&apos;s included</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon, title, description, iconBg }) => (
              <div key={title} className="rounded-xl border border-[#e5ddd3] bg-white p-5 hover:border-[#d4c9bc] transition-colors">
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl border ${iconBg}`}>
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
              {HOW_IT_WORKS.map(({ step, title, body, accent }) => (
                <div key={step} className="flex flex-col gap-3">
                  <span className={`text-3xl font-bold ${accent} opacity-70`}>{step}</span>
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
              {/* Anthropic "A" logomark in SVG */}
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-[#1c1612]">
                <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white" aria-label="Anthropic">
                  <path d="M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017L3.674 20H0L6.569 3.52zm4.132 9.959L8.453 7.687 6.205 13.479h4.496z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[#1c1612]">Built on Anthropic Claude</h3>
                <p className="mt-1.5 text-sm text-[#6e5f52] leading-relaxed max-w-xl">
                  The AI advisor uses Claude — Anthropic&apos;s frontier model — to analyze your real portfolio data.
                  No hallucinated numbers, no generic advice. Claude reads your actual positions and answers accordingly.
                </p>
                <a
                  href="https://github.com/anthropics/financial-services"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#d4c9bc] bg-[#f7f2eb] px-3.5 py-2 text-xs font-medium text-[#4a3d33] transition-colors hover:bg-[#ede8df]"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  anthropics/financial-services
                  <ExternalLink className="h-3 w-3 text-[#9e9087]" />
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
