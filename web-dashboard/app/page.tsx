'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import {
  TrendingUp, PiggyBank, Home, Layers, Brain, Wallet,
  BarChart3, Shield, ArrowRight, ExternalLink, Eye, EyeOff, KeyRound,
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
    description: 'Ask the AI advisor about your portfolio — rebalancing, tax implications, and risk exposure.',
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
    body: 'The advisor reads your portfolio context and answers questions — drift analysis, retirement readiness, tax lots.',
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
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [showEnrollment, setShowEnrollment] = useState(false);

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

  async function handlePasskeyLogin() {
    setError('');
    setLoading(true);
    try {
      if (!username.trim()) throw new Error('Enter your username first.');
      const optionsResponse = await fetch('/api/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const options = await optionsResponse.json() as PublicKeyCredentialRequestOptionsJSON & { error?: string };
      if (!optionsResponse.ok) throw new Error(options.error ?? 'Passkey sign-in is unavailable.');
      const credential = await startAuthentication({ optionsJSON: options });
      const verifyResponse = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credential),
      });
      const result = await verifyResponse.json() as { error?: string };
      if (!verifyResponse.ok) throw new Error(result.error ?? 'Passkey sign-in failed.');
      router.push('/dashboard');
    } catch (passkeyError) {
      setError(passkeyError instanceof Error ? passkeyError.message : 'Passkey sign-in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasskeyEnrollment() {
    setError('');
    setLoading(true);
    try {
      if (!username.trim() || !bootstrapSecret) {
        throw new Error('Enter your username and one-time enrollment secret.');
      }
      const optionsResponse = await fetch('/api/auth/passkey/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, bootstrapSecret }),
      });
      const options = await optionsResponse.json() as PublicKeyCredentialCreationOptionsJSON & { error?: string };
      if (!optionsResponse.ok) throw new Error(options.error ?? 'Passkey enrollment is unavailable.');
      const credential = await startRegistration({ optionsJSON: options });
      const verifyResponse = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credential),
      });
      const result = await verifyResponse.json() as { error?: string };
      if (!verifyResponse.ok) throw new Error(result.error ?? 'Passkey enrollment failed.');
      router.push('/dashboard');
    } catch (enrollmentError) {
      setError(enrollmentError instanceof Error ? enrollmentError.message : 'Passkey enrollment failed.');
    } finally {
      setLoading(false);
      setBootstrapSecret('');
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
                Private, AI-assisted analysis
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
                  Encrypted private storage
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

        {/* ── AI / GitHub section ───────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="rounded-xl border border-[#e5ddd3] bg-white p-8">
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-8">
              {/* AI mark */}
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-[#1c1612]">
                <Brain className="h-8 w-8 text-white" aria-label="AI advisor" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[#1c1612]">AI analysis with explicit guardrails</h3>
                <p className="mt-1.5 text-sm text-[#6e5f52] leading-relaxed max-w-xl">
                  The advisor uses the OpenAI API to analyze the portfolio context you submit. It can recommend,
                  but this dashboard contains no brokerage trading or money-movement capability.
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
                type="button"
                onClick={() => void handlePasskeyLogin()}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {loading ? 'Please wait…' : 'Sign in with passkey'}
              </button>

              <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[#9e9087]">
                <span className="h-px flex-1 bg-[#e5ddd3]" />
                Password fallback
                <span className="h-px flex-1 bg-[#e5ddd3]" />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#d4c9bc] bg-[#f7f2eb] px-4 py-2.5 text-sm font-medium text-[#4a3d33] transition-colors hover:bg-[#ede8df] disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Sign in with password'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => setShowEnrollment(value => !value)}
                className="w-full text-center text-xs text-[#6e5f52] underline-offset-2 hover:underline"
              >
                {showEnrollment ? 'Hide passkey setup' : 'Set up a new passkey'}
              </button>
              {showEnrollment && (
                <div className="space-y-3 rounded-lg border border-[#e5ddd3] bg-[#f7f2eb] p-3">
                  <p className="text-xs leading-relaxed text-[#6e5f52]">
                    Use the one-time enrollment secret from your password manager. Your device will ask for Face ID, Touch ID, or its PIN.
                  </p>
                  <input
                    type="password"
                    autoComplete="one-time-code"
                    value={bootstrapSecret}
                    onChange={event => setBootstrapSecret(event.target.value)}
                    className="w-full rounded-lg border border-[#d4c9bc] bg-white px-3 py-2.5 text-sm text-[#1c1612] outline-none focus:border-blue-400"
                    placeholder="One-time enrollment secret"
                  />
                  <button
                    type="button"
                    onClick={() => void handlePasskeyEnrollment()}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1c1612] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <KeyRound className="h-4 w-4" />
                    Enroll this device
                  </button>
                </div>
              )}
            </form>
          </div>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#e5ddd3] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-[#b8ad9e]">
          <span>Market data via Yahoo Finance. Not financial advice.</span>
          <span>AI analysis via OpenAI</span>
        </div>
      </footer>
    </div>
  );
}
