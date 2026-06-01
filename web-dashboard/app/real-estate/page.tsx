'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, Brain, PiggyBank, Home, Layers, Wallet, Plus, Edit2, Trash2,
  X, Check, MapPin, TrendingUp as TrendUp, TrendingDown,
} from 'lucide-react';
import { loadPortfolioCache } from '@/lib/storage';
import { DEFAULT_USD_TO_SGD_RATE, DEFAULT_USD_TO_INR_RATE } from '@/lib/currency';
import type { PortfolioSummary, AllocationItem, EarningsEvent } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Currency = 'USD' | 'SGD' | 'INR';
type Ownership = 'outright' | 'mortgage';

interface Property {
  id: string;
  name: string;
  location: string;
  currency: Currency;
  purchasePrice: number;
  purchaseYear: number;     // e.g. 2018
  currentPrice: number;
  ownership: Ownership;
  currentPriceUpdatedAt?: string; // ISO date — when current value was last entered
  // Mortgage fields (optional)
  originalLoan?: number;
  annualInterestRate?: number;  // e.g. 3.5 for 3.5%
  loanTermYears?: number;       // e.g. 30
  loanStartDate?: string;       // YYYY-MM  e.g. "2018-06"
}

interface PropertyDraft {
  name: string;
  location: string;
  currency: Currency;
  purchasePrice: string;
  purchaseYear: string;
  currentPrice: string;
  ownership: Ownership;
  originalLoan: string;
  annualInterestRate: string;
  loanTermYears: string;
  loanStartDate: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'portfolio-ai:real-estate-v1';

function loadProperties(): Property[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveProperties(props: Property[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(props));
}

// ── Mortgage math ─────────────────────────────────────────────────────────────

function remainingLoan(p: Property): number {
  if (p.ownership !== 'mortgage') return 0;
  if (!p.originalLoan) return 0;
  if (!p.annualInterestRate || !p.loanTermYears || !p.loanStartDate) return p.originalLoan;

  const r = p.annualInterestRate / 100 / 12;
  const n = p.loanTermYears * 12;
  const [year, month] = p.loanStartDate.split('-').map(Number);
  const start = new Date(year, (month || 1) - 1, 1);
  const elapsed = Math.max(0, Math.floor(
    (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  ));
  const k = Math.min(elapsed, n);

  if (r === 0) return Math.round(p.originalLoan * (1 - k / n));
  const pn = Math.pow(1 + r, n);
  const pk = Math.pow(1 + r, k);
  return Math.max(0, Math.round(p.originalLoan * (pn - pk) / (pn - 1)));
}

function annualGrowthRate(p: Property): number {
  const years = new Date().getFullYear() - p.purchaseYear;
  if (years <= 0 || p.purchasePrice <= 0 || p.currentPrice <= 0) return 0;
  return (Math.pow(p.currentPrice / p.purchasePrice, 1 / years) - 1) * 100;
}

// ── Currency helpers ──────────────────────────────────────────────────────────

function toUsd(amount: number, currency: Currency, rates: Rates): number {
  if (currency === 'SGD') return amount / rates.usdToSgd;
  if (currency === 'INR') return amount / rates.usdToInr;
  return amount;
}

function fromUsd(amount: number, display: Currency, rates: Rates): number {
  if (display === 'SGD') return amount * rates.usdToSgd;
  if (display === 'INR') return amount * rates.usdToInr;
  return amount;
}

interface Rates { usdToSgd: number; usdToInr: number }

const SYMBOLS: Record<Currency, string> = { USD: '$', SGD: 'S$', INR: '₹' };

function fmt(n: number, display: Currency): string {
  const sym = SYMBOLS[display];
  if (Math.abs(n) >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${sym}${(n / 1_000).toFixed(0)}K`;
  return `${sym}${n.toFixed(0)}`;
}

// ── Blank draft ───────────────────────────────────────────────────────────────

function blankDraft(): PropertyDraft {
  return {
    name: '', location: '', currency: 'USD',
    purchasePrice: '', purchaseYear: String(new Date().getFullYear() - 5),
    currentPrice: '', ownership: 'outright',
    originalLoan: '', annualInterestRate: '', loanTermYears: '', loanStartDate: '',
  };
}

function propToDraft(p: Property): PropertyDraft {
  return {
    name: p.name, location: p.location, currency: p.currency,
    purchasePrice: String(p.purchasePrice), purchaseYear: String(p.purchaseYear),
    currentPrice: String(p.currentPrice), ownership: p.ownership,
    originalLoan: p.originalLoan != null ? String(p.originalLoan) : '',
    annualInterestRate: p.annualInterestRate != null ? String(p.annualInterestRate) : '',
    loanTermYears: p.loanTermYears != null ? String(p.loanTermYears) : '',
    loanStartDate: p.loanStartDate ?? '',
  };
}

function draftToProperty(d: PropertyDraft, id: string): Property {
  const p: Property = {
    id, name: d.name.trim(), location: d.location.trim(), currency: d.currency,
    purchasePrice: Number(d.purchasePrice) || 0,
    purchaseYear: Number(d.purchaseYear) || new Date().getFullYear(),
    currentPrice: Number(d.currentPrice) || 0,
    ownership: d.ownership,
  };
  if (d.ownership === 'mortgage') {
    if (d.originalLoan) p.originalLoan = Number(d.originalLoan);
    if (d.annualInterestRate) p.annualInterestRate = Number(d.annualInterestRate);
    if (d.loanTermYears) p.loanTermYears = Number(d.loanTermYears);
    if (d.loanStartDate) p.loanStartDate = d.loanStartDate;
  }
  return p;
}

// ── Field input ───────────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string;
  onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] text-[#9e9087] uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded bg-white border border-[#d4c9bc] px-2 py-1.5 text-sm text-[#2d2218] placeholder-zinc-600 focus:outline-none focus:border-[#da7756]"
      />
    </div>
  );
}

// ── Property card ─────────────────────────────────────────────────────────────

function PropertyCard({
  prop, display, rates,
  onEdit, onDelete,
}: {
  prop: Property; display: Currency; rates: Rates;
  onEdit: () => void; onDelete: () => void;
}) {
  const loan = remainingLoan(prop);
  const equity = prop.currentPrice - loan;
  const pnl = prop.currentPrice - prop.purchasePrice;
  const pnlPct = prop.purchasePrice > 0 ? (pnl / prop.purchasePrice) * 100 : 0;
  const cagr = annualGrowthRate(prop);
  const years = new Date().getFullYear() - prop.purchaseYear;

  const toDisp = (n: number) => fmt(fromUsd(toUsd(n, prop.currency, rates), display, rates), display);
  const pnlPos = pnl >= 0;

  return (
    <div className="rounded-xl border border-[#e5ddd3] bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e5ddd3]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-[#1c1612]">{prop.name}</span>
              <span className={`text-[10px] rounded-full border px-2 py-0.5 font-medium ${
                prop.ownership === 'mortgage'
                  ? 'border-amber-700/50 bg-amber-950/40 text-amber-300'
                  : 'border-emerald-700/50 bg-emerald-950/40 text-emerald-300'
              }`}>
                {prop.ownership === 'mortgage' ? 'Mortgage' : 'Owned'}
              </span>
              <span className="text-[10px] rounded border border-[#d4c9bc] bg-white px-2 py-0.5 text-[#6e5f52]">
                {prop.currency}
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-[#9e9087]">
              <MapPin className="h-3 w-3" />
              {prop.location}
            </div>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={onEdit} className="rounded p-1.5 text-[#b8ad9e] hover:text-[#4a3d33] hover:bg-[#ede8df] transition-colors">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="rounded p-1.5 text-[#b8ad9e] hover:text-red-400 hover:bg-[#ede8df] transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">Purchase Price</div>
          <div className="text-sm font-semibold text-[#4a3d33] mt-0.5">{toDisp(prop.purchasePrice)}</div>
          <div className="text-[10px] text-[#b8ad9e]">{prop.purchaseYear} · {years}y ago</div>
        </div>
        <div>
          <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">Current Value</div>
          <div className="text-sm font-semibold text-[#1c1612] mt-0.5">{toDisp(prop.currentPrice)}</div>
          {prop.currentPriceUpdatedAt && (
            <div className="text-[10px] text-[#b8ad9e] mt-0.5">
              updated {new Date(prop.currentPriceUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">P&L</div>
          <div className={`text-sm font-semibold mt-0.5 flex items-center gap-1 ${pnlPos ? 'text-emerald-400' : 'text-red-400'}`}>
            {pnlPos ? <TrendUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {pnlPos ? '+' : ''}{toDisp(pnl)}
          </div>
          <div className={`text-[10px] ${pnlPos ? 'text-emerald-500' : 'text-red-500'}`}>
            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% total
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">Annual Growth</div>
          <div className={`text-sm font-bold mt-0.5 ${cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {cagr >= 0 ? '+' : ''}{cagr.toFixed(1)}% / yr
          </div>
          <div className="text-[10px] text-[#b8ad9e]">CAGR</div>
        </div>
      </div>

      {/* Mortgage details */}
      {prop.ownership === 'mortgage' && (
        <div className="px-5 py-3 border-t border-[#e5ddd3] bg-[#f0ebe1]/60 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <div>
            <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">Original Loan</div>
            <div className="text-xs font-semibold text-amber-300 mt-0.5">
              {prop.originalLoan != null ? toDisp(prop.originalLoan) : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">Remaining Principal</div>
            <div className="text-xs font-semibold text-amber-400 mt-0.5">
              {prop.originalLoan != null ? toDisp(loan) : '—'}
              {prop.annualInterestRate && <span className="ml-1 text-[#b8ad9e] font-normal">@ {prop.annualInterestRate}%</span>}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">Net Equity</div>
            <div className="text-xs font-bold text-[#1c1612] mt-0.5">{toDisp(equity)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#9e9087] uppercase tracking-wide">LTV</div>
            <div className="text-xs font-semibold text-[#4a3d33] mt-0.5">
              {prop.currentPrice > 0 ? `${((loan / prop.currentPrice) * 100).toFixed(0)}%` : '—'}
            </div>
            <div className="text-[10px] text-[#b8ad9e]">loan-to-value</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

function PropertyModal({
  draft, setDraft, onSave, onClose, editing,
}: {
  draft: PropertyDraft;
  setDraft: React.Dispatch<React.SetStateAction<PropertyDraft>>;
  onSave: () => void;
  onClose: () => void;
  editing: boolean;
}) {
  const set = (key: keyof PropertyDraft) => (v: string) => setDraft(d => ({ ...d, [key]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[#d4c9bc] bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5ddd3]">
          <h2 className="text-sm font-semibold text-[#1c1612]">{editing ? 'Edit Property' : 'Add Property'}</h2>
          <button onClick={onClose} className="text-[#b8ad9e] hover:text-[#4a3d33]"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Field label="Property Name" value={draft.name} onChange={set('name')} placeholder="e.g. Bishan HDB, SF Condo" /></div>
            <Field label="Location (City / Country)" value={draft.location} onChange={set('location')} placeholder="e.g. Singapore, San Francisco CA" />
            <div>
              <label className="block text-[10px] text-[#9e9087] uppercase tracking-wide mb-1">Currency</label>
              <select
                value={draft.currency}
                onChange={e => setDraft(d => ({ ...d, currency: e.target.value as Currency }))}
                className="w-full rounded bg-white border border-[#d4c9bc] px-2 py-1.5 text-sm text-[#2d2218] focus:outline-none focus:border-[#da7756]"
              >
                <option value="USD">USD ($)</option>
                <option value="SGD">SGD (S$)</option>
                <option value="INR">INR (₹)</option>
              </select>
            </div>
            <Field label="Purchase Price" value={draft.purchasePrice} onChange={set('purchasePrice')} type="number" placeholder="0" />
            <Field label="Purchase Year" value={draft.purchaseYear} onChange={set('purchaseYear')} type="number" placeholder="2018" />
            <div className="col-span-2"><Field label="Current Estimated Value" value={draft.currentPrice} onChange={set('currentPrice')} type="number" placeholder="0" /></div>
          </div>

          {/* Ownership */}
          <div>
            <label className="block text-[10px] text-[#9e9087] uppercase tracking-wide mb-2">Ownership Status</label>
            <div className="flex gap-3">
              {(['outright', 'mortgage'] as Ownership[]).map(o => (
                <button
                  key={o}
                  onClick={() => setDraft(d => ({ ...d, ownership: o }))}
                  className={`flex-1 rounded-lg border px-4 py-2 text-xs font-medium transition-colors ${
                    draft.ownership === o
                      ? o === 'mortgage' ? 'border-amber-600 bg-amber-100 text-amber-300' : 'border-emerald-700 bg-emerald-50 text-emerald-300'
                      : 'border-[#d4c9bc] text-[#9e9087] hover:border-[#da7756]'
                  }`}
                >
                  {o === 'outright' ? 'Owned Outright' : 'On Mortgage'}
                </button>
              ))}
            </div>
          </div>

          {/* Mortgage fields */}
          {draft.ownership === 'mortgage' && (
            <div className="rounded-xl border border-amber-300 bg-amber-950/20 p-4 space-y-4">
              <div className="text-xs font-semibold text-amber-300 uppercase tracking-wide">Mortgage Details</div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Original Loan Amount" value={draft.originalLoan} onChange={set('originalLoan')} type="number" placeholder="0" />
                <Field label="Annual Interest Rate (%)" value={draft.annualInterestRate} onChange={set('annualInterestRate')} type="number" placeholder="e.g. 3.5" />
                <Field label="Loan Term (years)" value={draft.loanTermYears} onChange={set('loanTermYears')} type="number" placeholder="e.g. 30" />
                <Field label="Loan Start Date (YYYY-MM)" value={draft.loanStartDate} onChange={set('loanStartDate')} placeholder="e.g. 2018-06" />
              </div>
              <p className="text-[10px] text-[#b8ad9e]">Remaining principal is auto-computed from loan amount, rate, term, and elapsed months.</p>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-[#e5ddd3]">
          <button onClick={onSave} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors">
            <Check className="h-3.5 w-3.5" /> {editing ? 'Save Changes' : 'Add Property'}
          </button>
          <button onClick={onClose} className="rounded-lg border border-[#d4c9bc] px-4 py-2 text-xs text-[#6e5f52] hover:bg-[#ede8df] transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RealEstatePage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [display, setDisplay] = useState<Currency>('USD');
  const [rates, setRates] = useState<Rates>({ usdToSgd: DEFAULT_USD_TO_SGD_RATE, usdToInr: DEFAULT_USD_TO_INR_RATE });
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PropertyDraft>(blankDraft());

  useEffect(() => {
    setProperties(loadProperties());
    // Load exchange rates from portfolio cache
    type CacheShape = { summary: PortfolioSummary; allocation: AllocationItem[]; earnings: EarningsEvent[] };
    const cached = loadPortfolioCache<CacheShape>();
    if (cached?.summary) {
      setRates({
        usdToSgd: cached.summary.usdToSgdRate ?? DEFAULT_USD_TO_SGD_RATE,
        usdToInr: (cached.summary as PortfolioSummary & { usdToInrRate?: number }).usdToInrRate ?? DEFAULT_USD_TO_INR_RATE,
      });
    }
  }, []);

  function openAdd() { setDraft(blankDraft()); setEditingId(null); setShowModal(true); }
  function openEdit(p: Property) { setDraft(propToDraft(p)); setEditingId(p.id); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditingId(null); }

  function saveModal() {
    if (!draft.name.trim() || !draft.purchasePrice || !draft.currentPrice) return;
    const id = editingId ?? crypto.randomUUID();
    const prop = draftToProperty(draft, id);
    const existing = editingId ? properties.find(p => p.id === editingId) : null;
    // Stamp current value date only when the value actually changes (or is new)
    const priceChanged = !existing || existing.currentPrice !== prop.currentPrice;
    prop.currentPriceUpdatedAt = priceChanged
      ? new Date().toISOString().slice(0, 10)
      : existing?.currentPriceUpdatedAt;
    const next = editingId
      ? properties.map(p => p.id === editingId ? prop : p)
      : [...properties, prop];
    setProperties(next);
    saveProperties(next);
    closeModal();
  }

  function deleteProperty(id: string) {
    if (!window.confirm('Delete this property?')) return;
    const next = properties.filter(p => p.id !== id);
    setProperties(next);
    saveProperties(next);
  }

  // ── Summary stats ────────────────────────────────────────────────────────

  const toD = (n: number, currency: Currency) =>
    fromUsd(toUsd(n, currency, rates), display, rates);

  const totalValue = properties.reduce((s, p) => s + toD(p.currentPrice, p.currency), 0);
  const totalLoan = properties.reduce((s, p) => s + toD(remainingLoan(p), p.currency), 0);
  const totalEquity = totalValue - totalLoan;
  const totalCost = properties.reduce((s, p) => s + toD(p.purchasePrice, p.currency), 0);
  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const sym = SYMBOLS[display];

  function fmtDisp(n: number) {
    if (Math.abs(n) >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000)     return `${sym}${(n / 1_000).toFixed(0)}K`;
    return `${sym}${n.toFixed(0)}`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f2eb]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#e5ddd3] px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <TrendingUp className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <span className="text-sm sm:text-base font-semibold text-[#1c1612] whitespace-nowrap">Beta than nothing</span>
          <nav className="ml-1 sm:ml-3 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            <button onClick={() => router.push('/summary')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0">
              <Wallet className="h-3.5 w-3.5" /><span className="hidden sm:inline">Net Worth</span>
            </button>
            {[
              { label: 'Dashboard', path: '/', icon: null },
              { label: 'Advisor', path: '/advisor', icon: <Brain className="h-3.5 w-3.5" /> },
              { label: 'Retirement', path: '/retirement', icon: <PiggyBank className="h-3.5 w-3.5" /> },
            ].map(({ label, path, icon }) => (
              <button
                key={path}
                onClick={() => router.push(path)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0"
              >
                {icon}
                {label}
              </button>
            ))}
            <span className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#4a3d33] bg-[#ede8df] flex-shrink-0">
              <Home className="h-3.5 w-3.5 text-orange-400" />
              <span className="hidden sm:inline">Real Estate</span>
            </span>
            <button onClick={() => router.push('/other-assets')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-[#9e9087] hover:text-[#2d2218] hover:bg-[#ede8df] transition-colors flex-shrink-0">
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Other</span>
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <select
            value={display}
            onChange={e => setDisplay(e.target.value as Currency)}
            className="rounded-lg border border-[#d4c9bc] bg-white px-2.5 py-1.5 text-[#4a3d33] outline-none"
          >
            <option value="USD">USD ($)</option>
            <option value="SGD">SGD (S$)</option>
            <option value="INR">INR (₹)</option>
          </select>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg border border-[#d4c9bc] bg-white px-3 py-1.5 text-[#4a3d33] hover:bg-[#ede8df] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Property
          </button>
        </div>
      </header>

      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-5 max-w-5xl mx-auto w-full">

        {/* Summary */}
        {properties.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[#e5ddd3] bg-white px-4 py-3">
              <div className="text-xs text-[#9e9087]">Portfolio Value</div>
              <div className="text-2xl font-bold text-[#1c1612] mt-1">{fmtDisp(totalValue)}</div>
              <div className="text-xs text-[#b8ad9e] mt-0.5">{properties.length} propert{properties.length === 1 ? 'y' : 'ies'}</div>
            </div>
            <div className="rounded-xl border border-[#e5ddd3] bg-white px-4 py-3">
              <div className="text-xs text-[#9e9087]">Net Equity</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{fmtDisp(totalEquity)}</div>
              <div className="text-xs text-[#b8ad9e] mt-0.5">after loans</div>
            </div>
            <div className="rounded-xl border border-[#e5ddd3] bg-white px-4 py-3">
              <div className="text-xs text-[#9e9087]">Total P&L</div>
              <div className={`text-2xl font-bold mt-1 ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{fmtDisp(totalPnl)}
              </div>
              <div className={`text-xs mt-0.5 ${totalPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(1)}% vs purchase
              </div>
            </div>
            <div className="rounded-xl border border-[#e5ddd3] bg-white px-4 py-3">
              <div className="text-xs text-[#9e9087]">Outstanding Loans</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">{fmtDisp(totalLoan)}</div>
              <div className="text-xs text-[#b8ad9e] mt-0.5">remaining principal</div>
            </div>
          </div>
        )}

        {/* Property list */}
        {properties.length === 0 ? (
          <div className="rounded-xl border border-[#e5ddd3] bg-white px-6 py-16 text-center">
            <Home className="h-10 w-10 text-[#c8c0b5] mx-auto mb-4" />
            <p className="text-base font-semibold text-[#4a3d33] mb-2">No properties yet</p>
            <p className="text-sm text-[#9e9087] mb-6">Add your real estate holdings to track value, P&L, and mortgage paydown.</p>
            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
              <Plus className="h-4 w-4" /> Add First Property
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {properties.map(p => (
              <PropertyCard
                key={p.id} prop={p} display={display} rates={rates}
                onEdit={() => openEdit(p)}
                onDelete={() => deleteProperty(p.id)}
              />
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <PropertyModal
          draft={draft} setDraft={setDraft}
          onSave={saveModal} onClose={closeModal}
          editing={editingId !== null}
        />
      )}
    </div>
  );
}
