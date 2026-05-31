'use client';

import { useRef, useState } from 'react';
import { Camera, ClipboardPaste, Loader2, PencilLine, Plus, Trash2, Upload } from 'lucide-react';
import type { UserPosition } from '@/lib/types';
import type { Currency } from '@/lib/currency';

const ASSET_CLASSES = ['US Large Cap', 'US Small/Mid Cap', 'International', 'Emerging Markets', 'Bonds', 'REITs', 'Alternatives', 'Cash'];
const ACCOUNT_TYPES: UserPosition['accountType'][] = ['taxable', 'ira', 'roth_ira', '401k', 'hsa', 'cpf'];

interface RowDraft {
  symbol: string;
  name: string;
  shares: string;
  avgCost: string;
  accountType: UserPosition['accountType'] | '';
  currency: Currency;
  purchaseDate: string;
  assetClass: string;
}

interface ImportedPosition {
  symbol: string;
  name: string | null;
  shares: number | null;
  avgCost: number | null;
  accountType: UserPosition['accountType'] | null;
  currency?: Currency | null;
  purchaseDate: string | null;
  assetClass: string | null;
}

interface Props {
  initialPositions?: UserPosition[];
  onSubmit: (positions: UserPosition[]) => void;
  submitLabel: string;
  secondaryAction?: { label: string; onSubmit: (positions: UserPosition[]) => void };
}

function blankRow(): RowDraft {
  return { symbol: '', name: '', shares: '', avgCost: '', accountType: 'taxable', currency: 'USD', purchaseDate: '', assetClass: 'US Large Cap' };
}

function importedRow(position: ImportedPosition): RowDraft {
  return {
    symbol: position.symbol,
    name: position.name ?? '',
    shares: position.shares?.toString() ?? '',
    avgCost: position.avgCost?.toString() ?? '',
    accountType: position.accountType ?? '',
    currency: position.currency ?? (position.accountType === 'cpf' ? 'SGD' : 'USD'),
    purchaseDate: position.purchaseDate ?? '',
    assetClass: position.assetClass ?? '',
  };
}

function savedRow(position: UserPosition): RowDraft {
  return {
    symbol: position.symbol, name: position.name, shares: position.shares.toString(), avgCost: position.avgCost.toString(),
    accountType: position.accountType, currency: position.currency ?? (position.accountType === 'cpf' ? 'SGD' : 'USD'), purchaseDate: position.purchaseDate ?? '', assetClass: position.assetClass,
  };
}

function daysHeld(dateStr: string): number {
  if (!dateStr) return 365;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

export default function PortfolioEditor({ initialPositions = [], onSubmit, submitLabel, secondaryAction }: Props) {
  const [rows, setRows] = useState<RowDraft[]>(() => initialPositions.length ? initialPositions.map(savedRow) : [blankRow()]);
  const [error, setError] = useState('');
  const [importMode, setImportMode] = useState<'screenshot' | 'paste' | 'manual'>('screenshot');
  const [pasteText, setPasteText] = useState('');
  const [importing, setImporting] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [screenshotCount, setScreenshotCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function update<K extends keyof RowDraft>(index: number, field: K, value: RowDraft[K]) {
    setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  }

  async function importPortfolio(payload: { imageDataUrls?: string[]; text?: string }) {
    setImporting(true);
    setError('');
    setWarnings([]);
    try {
      const res = await fetch('/api/import-portfolio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const responseText = await res.text();
      let body: { error?: string; positions?: ImportedPosition[]; warnings?: string[] };
      try {
        body = JSON.parse(responseText);
      } catch {
        if (res.status === 413) {
          throw new Error('Those screenshots are too large to upload together. Try fewer screenshots or smaller image files.');
        }
        if (res.status === 401) {
          throw new Error('Your dashboard login expired. Reload the page and sign in again.');
        }
        throw new Error(`Portfolio import failed with HTTP ${res.status}. Try fewer screenshots or paste the holdings as text.`);
      }
      if (!res.ok || !body.positions?.length) throw new Error(body.error ?? 'No holdings detected.');
      setRows(body.positions.map(importedRow));
      setWarnings(body.warnings ?? []);
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
    if (files.length > 5) { setError('Upload no more than 5 screenshots at a time.'); return; }
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
      setError('Upload PNG, JPEG, or WEBP screenshots.'); return;
    }
    if (files.some(file => file.size > 8 * 1024 * 1024)) { setError('Each screenshot must be smaller than 8 MB.'); return; }
    if (files.reduce((total, file) => total + file.size, 0) > 24 * 1024 * 1024) {
      setError('Combined screenshots must be smaller than 24 MB.'); return;
    }
    setScreenshotCount(files.length);
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

  function validate(action: (positions: UserPosition[]) => void) {
    const positions: UserPosition[] = [];
    for (const row of rows) {
      if (!row.symbol.trim()) continue;
      const shares = Number(row.shares);
      const avgCost = Number(row.avgCost);
      if (!Number.isFinite(shares) || shares <= 0) { setError(`Enter a valid share count for ${row.symbol}.`); return; }
      if (!Number.isFinite(avgCost) || avgCost <= 0) { setError(`Enter a valid average cost for ${row.symbol}.`); return; }
      if (!row.accountType) { setError(`Choose an account type for ${row.symbol}.`); return; }
      if (!row.assetClass) { setError(`Choose an asset class for ${row.symbol}.`); return; }
      positions.push({
        symbol: row.symbol.trim().toUpperCase(), name: row.name.trim() || row.symbol.trim().toUpperCase(),
        shares, avgCost, accountType: row.accountType, currency: row.currency, assetClass: row.assetClass,
        purchaseDate: row.purchaseDate || undefined, holdingDays: daysHeld(row.purchaseDate),
      });
    }
    if (!positions.length) { setError('Add at least one position to continue.'); return; }
    setError('');
    action(positions);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { id: 'screenshot', label: 'Screenshots', icon: Camera },
          { id: 'paste', label: 'Paste holdings', icon: ClipboardPaste },
          { id: 'manual', label: 'Manual entry', icon: PencilLine },
        ].map(option => {
          const Icon = option.icon;
          return <button key={option.id} type="button" onClick={() => setImportMode(option.id as typeof importMode)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${importMode === option.id ? 'border-blue-500 bg-blue-500/10 text-blue-200' : 'border-zinc-800 text-zinc-500'}`}>
            <Icon className="h-4 w-4" /> {option.label}
          </button>;
        })}
      </div>
      {importMode === 'screenshot' && <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-950/30 p-4">
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={e => importScreenshots(e.target.files)} />
        <button type="button" disabled={importing} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {importing ? `Reading ${screenshotCount} screenshot${screenshotCount === 1 ? '' : 's'}...` : 'Choose brokerage screenshots'}
        </button>
        <p className="mt-3 text-xs text-zinc-500">Upload up to 5 PNG, JPEG, or WEBP screenshots, 8 MB each and 24 MB combined. Crop out account numbers and personal details. Contents are sent securely to OpenAI for extraction and are not stored as screenshots.</p>
      </div>}
      {importMode === 'paste' && <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/30 p-4">
        <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={5}
          placeholder={'Paste a brokerage table, CSV rows, or a list such as:\nAAPL | 10 shares | avg cost $150 | taxable'}
          className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none" />
        <button type="button" disabled={importing || !pasteText.trim()} onClick={() => importPortfolio({ text: pasteText })}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {importing && <Loader2 className="h-4 w-4 animate-spin" />} Extract holdings
        </button>
      </div>}
      {warnings.length > 0 && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Review imported values</p>
        <ul className="mt-2 space-y-1 text-xs text-amber-200/80">{warnings.map(warning => <li key={warning}>- {warning}</li>)}</ul>
      </div>}
      <div className="max-h-[45vh] overflow-x-auto overflow-y-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-zinc-800 text-left">{['Ticker', 'Name', 'Shares', 'Avg Cost', 'Account', 'Currency', 'Asset Class', 'Purchase Date', ''].map(header => <th key={header} className="pb-2 pr-3 text-xs uppercase tracking-wider text-zinc-500">{header}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index} className="border-b border-zinc-800/40">
            <td className="py-2 pr-3"><input value={row.symbol} onChange={e => update(index, 'symbol', e.target.value.toUpperCase())} placeholder="AAPL" className="w-20 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100" /></td>
            <td className="py-2 pr-3"><input value={row.name} onChange={e => update(index, 'name', e.target.value)} placeholder="Apple Inc." className="w-32 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100" /></td>
            <td className="py-2 pr-3"><input type="number" value={row.shares} onChange={e => update(index, 'shares', e.target.value)} placeholder="10" className="w-20 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100" /></td>
            <td className="py-2 pr-3"><input type="number" value={row.avgCost} onChange={e => update(index, 'avgCost', e.target.value)} placeholder="150" className="w-24 rounded bg-zinc-800 px-2 py-1.5 text-zinc-100" /></td>
            <td className="py-2 pr-3"><select value={row.accountType} onChange={e => {
              const accountType = e.target.value as RowDraft['accountType'];
              update(index, 'accountType', accountType);
              if (accountType === 'cpf') update(index, 'currency', 'SGD');
            }} className="rounded bg-zinc-800 px-2 py-1.5 text-zinc-300"><option value="">Choose account</option>{ACCOUNT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></td>
            <td className="py-2 pr-3"><select value={row.currency} onChange={e => update(index, 'currency', e.target.value as Currency)} className="rounded bg-zinc-800 px-2 py-1.5 text-zinc-300"><option value="USD">USD</option><option value="SGD">SGD</option></select></td>
            <td className="py-2 pr-3"><select value={row.assetClass} onChange={e => update(index, 'assetClass', e.target.value)} className="rounded bg-zinc-800 px-2 py-1.5 text-zinc-300"><option value="">Choose class</option>{ASSET_CLASSES.map(assetClass => <option key={assetClass} value={assetClass}>{assetClass}</option>)}</select></td>
            <td className="py-2 pr-3"><input type="date" value={row.purchaseDate} onChange={e => update(index, 'purchaseDate', e.target.value)} max={today} className="rounded bg-zinc-800 px-2 py-1.5 text-xs text-zinc-300" /></td>
            <td className="py-2"><button onClick={() => setRows(current => current.filter((_, rowIndex) => rowIndex !== index))} className="text-zinc-600 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <button onClick={() => setRows(current => [...current, blankRow()])} className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"><Plus className="h-4 w-4" /> Add position</button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => validate(onSubmit)} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500">{submitLabel}</button>
        {secondaryAction && <button onClick={() => validate(secondaryAction.onSubmit)} className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800">{secondaryAction.label}</button>}
      </div>
    </div>
  );
}
