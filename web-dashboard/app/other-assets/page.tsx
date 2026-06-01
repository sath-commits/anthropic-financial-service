'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  TrendingUp, Brain, PiggyBank, Home, Layers, Plus, Edit2, Trash2,
  X, Check, TrendingUp as TrendUp, TrendingDown,
} from 'lucide-react';
import { loadPortfolioCache } from '@/lib/storage';
import { DEFAULT_USD_TO_SGD_RATE, DEFAULT_USD_TO_INR_RATE } from '@/lib/currency';
import type { PortfolioSummary, AllocationItem, EarningsEvent } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type Currency = 'USD' | 'SGD' | 'INR';

const CATEGORIES = [
  'Gold / Precious Metals',
  'Vehicle / Car',
  'Insurance (Cash Value)',
  'Cryptocurrency',
  'Art / Collectibles',
  'Business Equity',
  'Jewellery',
  'Other',
] as const;
type Category = typeof CATEGORIES[number];

interface Asset {
  id: string;
  name: string;
  category: Category;
  currency: Currency;
  purchasePrice: number;
  purchaseYear: number;
  currentValue: number;
  currentValueUpdatedAt?: string;
  notes?: string;
}

interface AssetDraft {
  name: string;
  category: Category;
  currency: Currency;
  purchasePrice: string;
  purchaseYear: string;
  currentValue: string;
  notes: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'portfolio-ai:other-assets-v1';

function loadAssets(): Asset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveAssets(assets: Asset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function annualGrowthRate(a: Asset): number {
  const years = new Date().getFullYear() - a.purchaseYear;
  if (years <= 0 || a.purchasePrice <= 0 || a.currentValue <= 0) return 0;
  return (Math.pow(a.currentValue / a.purchasePrice, 1 / years) - 1) * 100;
}

interface Rates { usdToSgd: number; usdToInr: number }
const SYMBOLS: Record<Currency, string> = { USD: '$', SGD: 'S$', INR: '₹' };

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
function fmt(n: number, display: Currency): string {
  const sym = SYMBOLS[display];
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${sym}${abs.toFixed(0)}`;
}

const CATEGORY_COLORS: Record<Category, string> = {
  'Gold / Precious Metals':   'border-yellow-700/50 bg-yellow-950/30 text-yellow-300',
  'Vehicle / Car':            'border-blue-700/50 bg-blue-950/30 text-blue-300',
  'Insurance (Cash Value)':   'border-teal-700/50 bg-teal-950/30 text-teal-300',
  'Cryptocurrency':           'border-orange-700/50 bg-orange-950/30 text-orange-300',
  'Art / Collectibles':       'border-purple-700/50 bg-purple-950/30 text-purple-300',
  'Business Equity':          'border-emerald-700/50 bg-emerald-950/30 text-emerald-300',
  'Jewellery':                'border-pink-700/50 bg-pink-950/30 text-pink-300',
  'Other':                    'border-zinc-600 bg-zinc-800/50 text-zinc-400',
};

// ── Draft helpers ─────────────────────────────────────────────────────────────

function blankDraft(): AssetDraft {
  return {
    name: '', category: 'Other', currency: 'USD',
    purchasePrice: '', purchaseYear: String(new Date().getFullYear()),
    currentValue: '', notes: '',
  };
}

function assetToDraft(a: Asset): AssetDraft {
  return {
    name: a.name, category: a.category, currency: a.currency,
    purchasePrice: String(a.purchasePrice), purchaseYear: String(a.purchaseYear),
    currentValue: String(a.currentValue), notes: a.notes ?? '',
  };
}

function draftToAsset(d: AssetDraft, id: string): Asset {
  return {
    id, name: d.name.trim(), category: d.category, currency: d.currency,
    purchasePrice: Number(d.purchasePrice) || 0,
    purchaseYear: Number(d.purchaseYear) || new Date().getFullYear(),
    currentValue: Number(d.currentValue) || 0,
    notes: d.notes.trim() || undefined,
  };
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
      />
    </div>
  );
}

// ── Asset card ────────────────────────────────────────────────────────────────

function AssetCard({ asset, display, rates, onEdit, onDelete }: {
  asset: Asset; display: Currency; rates: Rates;
  onEdit: () => void; onDelete: () => void;
}) {
  const pnl = asset.currentValue - asset.purchasePrice;
  const pnlPct = asset.purchasePrice > 0 ? (pnl / asset.purchasePrice) * 100 : 0;
  const cagr = annualGrowthRate(asset);
  const years = new Date().getFullYear() - asset.purchaseYear;
  const pnlPos = pnl >= 0;

  const toDisp = (n: number) => fmt(fromUsd(toUsd(n, asset.currency, rates), display, rates), display);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-zinc-100">{asset.name}</span>
              <span className={`text-[10px] rounded-full border px-2 py-0.5 font-medium ${CATEGORY_COLORS[asset.category]}`}>
                {asset.category}
              </span>
              <span className="text-[10px] rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-zinc-400">
                {asset.currency}
              </span>
            </div>
            {asset.notes && (
              <p className="text-xs text-zinc-500 mt-1 truncate">{asset.notes}</p>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={onEdit} className="rounded p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="rounded p-1.5 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Purchase Price</div>
            <div className="text-sm font-semibold text-zinc-300 mt-0.5">{toDisp(asset.purchasePrice)}</div>
            <div className="text-[10px] text-zinc-600">{asset.purchaseYear} · {years}y ago</div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Current Value</div>
            <div className="text-sm font-semibold text-zinc-100 mt-0.5">{toDisp(asset.currentValue)}</div>
            {asset.currentValueUpdatedAt && (
              <div className="text-[10px] text-zinc-600 mt-0.5">
                updated {new Date(asset.currentValueUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">P&L</div>
            <div className={`text-sm font-semibold mt-0.5 flex items-center gap-1 ${pnlPos ? 'text-emerald-400' : 'text-red-400'}`}>
              {pnlPos ? <TrendUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {pnlPos ? '+' : ''}{toDisp(pnl)}
            </div>
            <div className={`text-[10px] ${pnlPos ? 'text-emerald-500' : 'text-red-500'}`}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% total
            </div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide">Annual Growth</div>
            <div className={`text-sm font-bold mt-0.5 ${cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {cagr >= 0 ? '+' : ''}{cagr.toFixed(1)}% / yr
            </div>
            <div className="text-[10px] text-zinc-600">CAGR</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function AssetModal({ draft, setDraft, onSave, onClose, editing }: {
  draft: AssetDraft;
  setDraft: React.Dispatch<React.SetStateAction<AssetDraft>>;
  onSave: () => void; onClose: () => void; editing: boolean;
}) {
  const set = (key: keyof AssetDraft) => (v: string) => setDraft(d => ({ ...d, [key]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-100">{editing ? 'Edit Asset' : 'Add Asset'}</h2>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Asset Name" value={draft.name} onChange={set('name')} placeholder="e.g. Gold bars, Toyota Camry, Life Insurance" />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Category</label>
              <select
                value={draft.category}
                onChange={e => setDraft(d => ({ ...d, category: e.target.value as Category }))}
                className="w-full rounded bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Currency</label>
              <select
                value={draft.currency}
                onChange={e => setDraft(d => ({ ...d, currency: e.target.value as Currency }))}
                className="w-full rounded bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              >
                <option value="USD">USD ($)</option>
                <option value="SGD">SGD (S$)</option>
                <option value="INR">INR (₹)</option>
              </select>
            </div>
            <Field label="Purchase Price" value={draft.purchasePrice} onChange={set('purchasePrice')} type="number" placeholder="0" />
            <Field label="Purchase Year" value={draft.purchaseYear} onChange={set('purchaseYear')} type="number" placeholder={String(new Date().getFullYear())} />
          </div>

          <Field label="Current Value" value={draft.currentValue} onChange={set('currentValue')} type="number" placeholder="0" />

          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Notes (optional)</label>
            <textarea
              value={draft.notes}
              onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              placeholder="e.g. Policy #12345, coverage $500K · 100g bar stored at UOB · 2020 model, 45K miles"
              rows={2}
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-zinc-800">
          <button onClick={onSave} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors">
            <Check className="h-3.5 w-3.5" /> {editing ? 'Save Changes' : 'Add Asset'}
          </button>
          <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-400 hover:bg-zinc-800 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OtherAssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [display, setDisplay] = useState<Currency>('USD');
  const [rates, setRates] = useState<Rates>({ usdToSgd: DEFAULT_USD_TO_SGD_RATE, usdToInr: DEFAULT_USD_TO_INR_RATE });
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssetDraft>(blankDraft());

  useEffect(() => {
    setAssets(loadAssets());
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
  function openEdit(a: Asset) { setDraft(assetToDraft(a)); setEditingId(a.id); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditingId(null); }

  function saveModal() {
    if (!draft.name.trim() || !draft.currentValue) return;
    const id = editingId ?? crypto.randomUUID();
    const asset = draftToAsset(draft, id);
    const existing = editingId ? assets.find(a => a.id === editingId) : null;
    const valueChanged = !existing || existing.currentValue !== asset.currentValue;
    asset.currentValueUpdatedAt = valueChanged
      ? new Date().toISOString().slice(0, 10)
      : existing?.currentValueUpdatedAt;
    const next = editingId
      ? assets.map(a => a.id === editingId ? asset : a)
      : [...assets, asset];
    setAssets(next);
    saveAssets(next);
    closeModal();
  }

  function deleteAsset(id: string) {
    if (!window.confirm('Delete this asset?')) return;
    const next = assets.filter(a => a.id !== id);
    setAssets(next);
    saveAssets(next);
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  const toD = (n: number, currency: Currency) =>
    fromUsd(toUsd(n, currency, rates), display, rates);

  const totalValue = assets.reduce((s, a) => s + toD(a.currentValue, a.currency), 0);
  const totalCost  = assets.reduce((s, a) => s + toD(a.purchasePrice, a.currency), 0);
  const totalPnl   = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const sym = SYMBOLS[display];

  function fmtDisp(n: number) {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000)     return `${sign}${sym}${(abs / 1_000).toFixed(0)}K`;
    return `${sign}${sym}${abs.toFixed(0)}`;
  }

  const usedCategories = Array.from(new Set(assets.map(a => a.category)));
  const filtered = categoryFilter === 'All' ? assets : assets.filter(a => a.category === categoryFilter);

  const NAV = [
    { label: 'Dashboard',   path: '/',             icon: null },
    { label: 'Advisor',     path: '/advisor',       icon: <Brain className="h-3.5 w-3.5" /> },
    { label: 'Retirement',  path: '/retirement',    icon: <PiggyBank className="h-3.5 w-3.5" /> },
    { label: 'Real Estate', path: '/real-estate',   icon: <Home className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a0a]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 sm:px-6 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <TrendingUp className="h-5 w-5 text-blue-400 flex-shrink-0" />
          <span className="text-sm sm:text-base font-semibold text-zinc-100 whitespace-nowrap">Beta than nothing</span>
          <nav className="ml-1 sm:ml-3 flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
            {NAV.map(({ label, path, icon }) => (
              <button key={path} onClick={() => router.push(path)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors flex-shrink-0"
              >
                {icon}<span className="hidden sm:inline">{label}</span>
              </button>
            ))}
            <span className="flex items-center gap-1 rounded-lg px-2 py-1.5 sm:px-3 sm:gap-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 flex-shrink-0">
              <Layers className="h-3.5 w-3.5 text-teal-400" />
              <span className="hidden sm:inline">Other Assets</span>
            </span>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {usedCategories.length > 1 && (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-zinc-300 outline-none"
            >
              <option value="All">All categories</option>
              {usedCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select
            value={display}
            onChange={e => setDisplay(e.target.value as Currency)}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-zinc-300 outline-none"
          >
            <option value="USD">USD ($)</option>
            <option value="SGD">SGD (S$)</option>
            <option value="INR">INR (₹)</option>
          </select>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" /> Add Asset
          </button>
        </div>
      </header>

      <main className="flex-1 px-3 py-4 sm:px-6 sm:py-5 space-y-4 sm:space-y-5 max-w-5xl mx-auto w-full">

        {/* Summary */}
        {assets.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div className="text-xs text-zinc-500">Total Value</div>
              <div className="text-2xl font-bold text-zinc-100 mt-1">{fmtDisp(totalValue)}</div>
              <div className="text-xs text-zinc-600 mt-0.5">{assets.length} asset{assets.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div className="text-xs text-zinc-500">Total P&L</div>
              <div className={`text-2xl font-bold mt-1 ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}{fmtDisp(totalPnl)}
              </div>
              <div className={`text-xs mt-0.5 ${totalPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(1)}% vs purchase
              </div>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
              <div className="text-xs text-zinc-500">Total Cost Basis</div>
              <div className="text-2xl font-bold text-zinc-400 mt-1">{fmtDisp(totalCost)}</div>
              <div className="text-xs text-zinc-600 mt-0.5">what you paid</div>
            </div>
          </div>
        )}

        {/* Asset list */}
        {assets.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-16 text-center">
            <Layers className="h-10 w-10 text-zinc-700 mx-auto mb-4" />
            <p className="text-base font-semibold text-zinc-300 mb-2">No other assets yet</p>
            <p className="text-sm text-zinc-500 mb-6">Track gold, vehicles, insurance cash value, crypto, collectibles, and more.</p>
            <button onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add First Asset
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(a => (
              <AssetCard key={a.id} asset={a} display={display} rates={rates}
                onEdit={() => openEdit(a)} onDelete={() => deleteAsset(a.id)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-8 text-center text-sm text-zinc-500">
                No assets in this category.
              </div>
            )}
          </div>
        )}
      </main>

      {showModal && (
        <AssetModal draft={draft} setDraft={setDraft}
          onSave={saveModal} onClose={closeModal} editing={editingId !== null}
        />
      )}
    </div>
  );
}
