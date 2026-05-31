'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Trash2, ChevronRight, ChevronLeft, Loader2, TrendingUp, CheckCircle,
  Camera, ClipboardPaste, PencilLine, Upload,
} from 'lucide-react';
import { hydrateSettings, savePositions, saveProfile } from '@/lib/storage';
import type { UserPosition, InvestorProfile } from '@/lib/types';

// ── Step 1: Portfolio entry ───────────────────────────────────────────────────

const ASSET_CLASSES = ['US Large Cap', 'US Small/Mid Cap', 'International', 'Emerging Markets', 'Bonds', 'REITs', 'Alternatives', 'Cash'];
const ACCOUNT_TYPES: UserPosition['accountType'][] = ['taxable', 'ira', 'roth_ira', '401k', 'hsa'];

// Use strings for editing to avoid NaN in controlled inputs
interface RowDraft {
  symbol: string;
  name: string;
  shares: string;
  avgCost: string;
  accountType: UserPosition['accountType'] | '';
  purchaseDate: string; // YYYY-MM-DD — used to compute holdingDays
  assetClass: string;
}

interface ImportedPosition {
  symbol: string;
  name: string | null;
  shares: number | null;
  avgCost: number | null;
  accountType: UserPosition['accountType'] | null;
  purchaseDate: string | null;
  assetClass: string | null;
}

interface PortfolioImportResponse {
  error?: string;
  positions?: ImportedPosition[];
  warnings?: string[];
}

function blankRow(): RowDraft {
  return {
    symbol: '', name: '', shares: '', avgCost: '',
    accountType: 'taxable',
    purchaseDate: '',
    assetClass: 'US Large Cap',
  };
}

function importedRow(position: ImportedPosition): RowDraft {
  return {
    symbol: position.symbol,
    name: position.name ?? '',
    shares: position.shares?.toString() ?? '',
    avgCost: position.avgCost?.toString() ?? '',
    accountType: position.accountType ?? '',
    purchaseDate: position.purchaseDate ?? '',
    assetClass: position.assetClass ?? '',
  };
}

function savedRow(position: UserPosition): RowDraft {
  return {
    symbol: position.symbol,
    name: position.name,
    shares: position.shares.toString(),
    avgCost: position.avgCost.toString(),
    accountType: position.accountType,
    purchaseDate: position.purchaseDate ?? '',
    assetClass: position.assetClass,
  };
}

function daysHeld(dateStr: string): number {
  if (!dateStr) return 365;
  const purchase = new Date(dateStr);
  const today = new Date();
  return Math.max(0, Math.floor((today.getTime() - purchase.getTime()) / 86400000));
}

function PortfolioStep({
  initialPositions, onNext, onSaveDashboard,
}: {
  initialPositions: UserPosition[];
  onNext: (positions: UserPosition[]) => void;
  onSaveDashboard: (positions: UserPosition[]) => void;
}) {
  const [rows, setRows] = useState<RowDraft[]>(() => initialPositions.length ? initialPositions.map(savedRow) : [blankRow()]);
  const [error, setError] = useState('');
  const [importMode, setImportMode] = useState<'screenshot' | 'paste' | 'manual'>('screenshot');
  const [pasteText, setPasteText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [selectedScreenshotCount, setSelectedScreenshotCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof RowDraft>(i: number, field: K, value: RowDraft[K]) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  function addRow() { setRows(prev => [...prev, blankRow()]); }
  function removeRow(i: number) { setRows(prev => prev.filter((_, idx) => idx !== i)); }

  async function importPortfolio(payload: { imageDataUrls?: string[]; text?: string }) {
    setImporting(true);
    setError('');
    setImportWarnings([]);
    try {
      const res = await fetch('/api/import-portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responseText = await res.text();
      let body: PortfolioImportResponse = {};
      try {
        body = JSON.parse(responseText) as PortfolioImportResponse;
      } catch {
        if (res.status === 413) {
          throw new Error('Those screenshots are too large to upload together. Try fewer screenshots or smaller image files.');
        }
        if (res.status === 401) {
          throw new Error('Your dashboard login expired. Reload the page and sign in again.');
        }
        throw new Error(`Screenshot import failed with HTTP ${res.status}. Try fewer screenshots or paste the holdings as text.`);
      }
      if (!res.ok || !body.positions?.length) throw new Error(body.error ?? 'No holdings detected.');
      setRows(body.positions.map(importedRow));
      setImportWarnings(body.warnings ?? []);
      setImportMode('manual');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portfolio import failed.');
    } finally {
      setImporting(false);
    }
  }

  async function importScreenshots(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;
    if (files.length > 5) {
      setError('Upload no more than 5 screenshots at a time.');
      return;
    }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
      setError('Upload PNG, JPEG, or WEBP screenshots.');
      return;
    }
    if (files.some(file => file.size > 8 * 1024 * 1024)) {
      setError('Each screenshot must be smaller than 8 MB.');
      return;
    }
    if (files.reduce((total, file) => total + file.size, 0) > 24 * 1024 * 1024) {
      setError('Combined screenshots must be smaller than 24 MB.');
      return;
    }
    setSelectedScreenshotCount(files.length);
    setImporting(true);
    setError('');
    try {
      const imageDataUrls = await Promise.all(files.map(file => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read one of those screenshots.'));
        reader.readAsDataURL(file);
      })));
      await importPortfolio({ imageDataUrls });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read those screenshots.');
      setImporting(false);
    }
  }

  function validate(onValid: (positions: UserPosition[]) => void) {
    const valid: UserPosition[] = [];
    for (const r of rows) {
      if (!r.symbol.trim()) continue; // skip empty rows
      const shares = parseFloat(r.shares);
      const avgCost = parseFloat(r.avgCost);
      if (!r.shares || isNaN(shares) || shares <= 0) {
        setError(`Enter a valid share count for ${r.symbol || 'new row'}`); return;
      }
      if (!r.avgCost || isNaN(avgCost) || avgCost <= 0) {
        setError(`Enter a valid avg cost for ${r.symbol}`); return;
      }
      if (!r.accountType) {
        setError(`Choose an account type for ${r.symbol}`); return;
      }
      if (!r.assetClass) {
        setError(`Choose an asset class for ${r.symbol}`); return;
      }
      valid.push({
        symbol: r.symbol.trim().toUpperCase(),
        name: r.name.trim() || r.symbol.trim().toUpperCase(),
        shares,
        avgCost,
        accountType: r.accountType,
        holdingDays: daysHeld(r.purchaseDate),
        assetClass: r.assetClass,
        purchaseDate: r.purchaseDate || undefined,
      });
    }
    if (valid.length === 0) { setError('Add at least one position to continue.'); return; }
    setError('');
    onValid(valid);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">What&apos;s in your portfolio?</h2>
        <p className="mt-1 text-sm text-zinc-500">Import your holdings, then review the rows. Purchase date is used for tax calculations.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { id: 'screenshot', label: 'Upload screenshot', detail: 'Fastest option', icon: Camera },
          { id: 'paste', label: 'Paste holdings', detail: 'Copy a table or list', icon: ClipboardPaste },
          { id: 'manual', label: 'Enter manually', detail: 'Edit each position', icon: PencilLine },
        ].map(option => {
          const Icon = option.icon;
          return (
            <button key={option.id} type="button" onClick={() => setImportMode(option.id as typeof importMode)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                importMode === option.id ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-800 bg-zinc-950/30 hover:border-zinc-700'
              }`}>
              <Icon className={`h-5 w-5 ${importMode === option.id ? 'text-blue-400' : 'text-zinc-500'}`} />
              <div className="mt-3 text-sm font-medium text-zinc-200">{option.label}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{option.detail}</div>
            </button>
          );
        })}
      </div>

      {importMode === 'screenshot' && (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/30 p-5">
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden"
            onChange={e => importScreenshots(e.target.files)} />
          <button type="button" disabled={importing} onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importing ? `Reading ${selectedScreenshotCount} screenshot${selectedScreenshotCount === 1 ? '' : 's'}...` : 'Choose portfolio screenshots'}
          </button>
          <p className="mt-3 text-xs text-zinc-500">Upload up to 5 PNG, JPEG, or WEBP screenshots, 8 MB each and 24 MB combined. Crop out account numbers and personal details. Screenshot contents are sent securely to OpenAI for extraction and are not stored by this app.</p>
        </div>
      )}

      {importMode === 'paste' && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/30 p-4">
          <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
            placeholder={'Paste a brokerage table, CSV rows, or a list such as:\nAAPL | 10 shares | avg cost $150 | taxable'}
            rows={5}
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600" />
          <button type="button" disabled={importing || !pasteText.trim()} onClick={() => importPortfolio({ text: pasteText })}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
            {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            Extract holdings
          </button>
          <p className="text-xs text-zinc-500">Remove account numbers and personal details. Pasted contents are sent securely to OpenAI for extraction and are not stored by this app.</p>
        </div>
      )}

      {importWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Review imported values</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-200/80">
            {importWarnings.map(warning => <li key={warning}>- {warning}</li>)}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              {['Ticker', 'Name (optional)', 'Shares', 'Avg Cost ($)', 'Account', 'Asset Class', 'Purchase Date', ''].map(h => (
                <th key={h} className="pb-2 pr-3 text-xs font-medium uppercase tracking-wider text-zinc-500 last:pr-0">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-zinc-800/40">
                <td className="py-2 pr-3">
                  <input
                    value={r.symbol}
                    onChange={e => update(i, 'symbol', e.target.value.toUpperCase())}
                    placeholder="AAPL" maxLength={8}
                    className="w-20 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600 uppercase"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    value={r.name}
                    onChange={e => update(i, 'name', e.target.value)}
                    placeholder="Apple Inc."
                    className="w-32 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number" value={r.shares}
                    onChange={e => update(i, 'shares', e.target.value)}
                    placeholder="10" min="0" step="any"
                    className="w-20 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number" value={r.avgCost}
                    onChange={e => update(i, 'avgCost', e.target.value)}
                    placeholder="150.00" min="0" step="any"
                    className="w-24 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-zinc-600"
                  />
                </td>
                <td className="py-2 pr-3">
                  <select
                    value={r.accountType}
                    onChange={e => update(i, 'accountType', e.target.value as RowDraft['accountType'])}
                    className="rounded bg-zinc-800 px-2 py-1.5 text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-600"
                  >
                    <option value="">Choose account</option>
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <select
                    value={r.assetClass}
                    onChange={e => update(i, 'assetClass', e.target.value)}
                    className="rounded bg-zinc-800 px-2 py-1.5 text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-600"
                  >
                    <option value="">Choose class</option>
                    {ASSET_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="date" value={r.purchaseDate}
                    onChange={e => update(i, 'purchaseDate', e.target.value)}
                    max={today}
                    className="rounded bg-zinc-800 px-2 py-1.5 text-zinc-300 outline-none focus:ring-1 focus:ring-zinc-600 text-xs"
                  />
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

      <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        <Plus className="h-4 w-4" /> Add position
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => validate(onNext)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
          Continue <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={() => validate(onSaveDashboard)}
          className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200">
          Save and open dashboard
        </button>
      </div>
    </div>
  );
}

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
        <h2 className="text-xl font-semibold text-zinc-100">Tell us about yourself</h2>
        <p className="mt-1 text-sm text-zinc-500">This helps tailor strategy recommendations to your situation.</p>
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
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Primary Goal</span>
        <div className="flex flex-wrap gap-2 mt-2">
          {(['growth', 'income', 'preservation', 'balanced'] as const).map(g => (
            <button key={g} onClick={() => setGoal(g)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                goal === g ? 'bg-blue-600 text-white' : 'border border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}>
              {g}
            </button>
          ))}
        </div>
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

      <div className="flex items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
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
        <h2 className="text-xl font-semibold text-zinc-100">Your Investment Strategy</h2>
        <p className="mt-1 text-sm text-zinc-500">AI will analyze your portfolio and suggest a starting strategy.</p>
      </div>

      {!started ? (
        <div className="space-y-4">
          <button onClick={generate}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
            Generate strategy recommendation
          </button>
          <button onClick={() => onDone('')}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Skip — go to dashboard
          </button>
        </div>
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

      <div className="flex items-center gap-3">
        {!started && (
          <button onClick={onBack}
            className="flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
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
    <div className="flex min-h-screen flex-col items-center bg-[#0a0a0a] px-4 py-12">
      {/* Header */}
      <div className="mb-10 flex items-center gap-2.5">
        <TrendingUp className="h-6 w-6 text-blue-400" />
        <span className="text-xl font-semibold text-zinc-100">Beta than nothing</span>
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
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8">
        {step === 0 && hydrated && <PortfolioStep initialPositions={initialPositions} onNext={handlePositions} onSaveDashboard={handleSaveDashboard} />}
        {step === 1 && <ProfileStep onNext={handleProfile} onBack={() => setStep(0)} />}
        {step === 2 && profile !== null && (
          <StrategyStep positions={positions} profile={profile} onDone={handleDone} onBack={() => setStep(1)} />
        )}
      </div>

      <p className="mt-6 text-xs text-zinc-700">
        Your data stays in your browser — nothing is sent to any server except for AI analysis.
      </p>
    </div>
  );
}
