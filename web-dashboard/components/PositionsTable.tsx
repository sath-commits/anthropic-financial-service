'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Edit2, Trash2 } from 'lucide-react';
import type { Position } from '@/lib/types';

interface Props {
  positions: Position[];
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
}

const ACCOUNT_ORDER: Position['accountType'][] = ['taxable', '401k', 'ira', 'roth_ira', 'hsa'];
const ACCOUNT_LABELS: Record<Position['accountType'], string> = {
  taxable: 'Taxable brokerage',
  '401k': '401(k)',
  ira: 'Traditional IRA',
  roth_ira: 'Roth IRA',
  hsa: 'HSA',
};

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtUSD(n: number) {
  return '$' + fmt(Math.abs(n));
}

type SortKey = 'symbol' | 'shares' | 'avgCost' | 'currentPrice' | 'equity' | 'unrealizedPnl' | 'unrealizedPnlPct' | 'portfolioWeightPct';
type SortDirection = 'asc' | 'desc';

const COLUMNS: Array<{ label: string; key: SortKey }> = [
  { label: 'Symbol', key: 'symbol' },
  { label: 'Shares', key: 'shares' },
  { label: 'Avg Cost', key: 'avgCost' },
  { label: 'Price', key: 'currentPrice' },
  { label: 'Value', key: 'equity' },
  { label: 'P&L', key: 'unrealizedPnl' },
  { label: 'P&L %', key: 'unrealizedPnlPct' },
  { label: 'Weight', key: 'portfolioWeightPct' },
];

export default function PositionsTable({ positions, onEdit, onDelete }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('equity');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === 'symbol' ? 'asc' : 'desc');
  }

  function sortPositions(accountPositions: Position[]) {
    return [...accountPositions].sort((a, b) => {
      if ((sortKey === 'currentPrice' || sortKey === 'unrealizedPnl' || sortKey === 'unrealizedPnlPct') && a.hasLivePrice !== b.hasLivePrice) {
        return a.hasLivePrice ? -1 : 1;
      }
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      const result = typeof aValue === 'string'
        ? aValue.localeCompare(String(bValue))
        : aValue - Number(bValue);
      return sortDirection === 'asc' ? result : -result;
    });
  }

  return (
    <div className="space-y-6">
      {ACCOUNT_ORDER.map(accountType => {
        const accountPositions = positions.filter(position => position.accountType === accountType);
        if (!accountPositions.length) return null;
        const accountValue = accountPositions.reduce((total, position) => total + position.equity, 0);
        const accountWeight = accountPositions.reduce((total, position) => total + position.portfolioWeightPct, 0);
        const hasCompleteLivePrices = accountPositions.every(position => position.hasLivePrice);
        const accountPnl = accountPositions.reduce((total, position) => total + position.unrealizedPnl, 0);
        const accountPnlPositive = accountPnl >= 0;
        return (
          <section key={accountType} className="overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-700/80 bg-zinc-800/50 px-4 py-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-200">{ACCOUNT_LABELS[accountType]}</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  {accountPositions.length} holding{accountPositions.length === 1 ? '' : 's'} · {fmt(accountWeight, 1)}% of portfolio
                </p>
              </div>
              <div className="flex items-center gap-5 text-right">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Category P&amp;L</div>
                  <div className={`mt-0.5 text-sm font-medium ${hasCompleteLivePrices ? accountPnlPositive ? 'text-emerald-400' : 'text-red-400' : 'text-zinc-500'}`}>
                    {hasCompleteLivePrices ? `${accountPnlPositive ? '+' : '-'}${fmtUSD(accountPnl)}` : 'Unavailable'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Category Total</div>
                  <div className="mt-0.5 text-sm font-semibold text-zinc-100">{fmtUSD(accountValue)}</div>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left">
                    {COLUMNS.map(column => (
                      <th key={column.key} className="py-2.5 pr-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
                        <button
                          type="button"
                          onClick={() => changeSort(column.key)}
                          className="flex items-center gap-1 transition-colors hover:text-zinc-200"
                          aria-label={`Sort by ${column.label}`}
                        >
                          {column.label}
                          {sortKey === column.key && (
                            sortDirection === 'asc'
                              ? <ChevronUp className="h-3 w-3" />
                              : <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      </th>
                    ))}
                    <th className="py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500" />
                  </tr>
                </thead>
                <tbody>
                  {sortPositions(accountPositions).map((p, index) => {
                    const gain = p.unrealizedPnl >= 0;
                    return (
                      <tr key={`${p.symbol}-${p.accountType}-${index}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="py-2.5 pr-4">
                          <div className="font-semibold text-zinc-100">{p.symbol}</div>
                          <div className="text-xs text-zinc-500 truncate max-w-[140px]">{p.name}</div>
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-300">{fmt(p.shares)}</td>
                        <td className="py-2.5 pr-4 text-zinc-300">${fmt(p.avgCost)}</td>
                        <td className="py-2.5 pr-4 text-zinc-100 font-medium">
                          {p.hasLivePrice ? `$${fmt(p.currentPrice)}` : <span className="text-amber-300">Unavailable</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-100">{fmtUSD(p.equity)}</td>
                        <td className={`py-2.5 pr-4 font-medium ${gain ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.hasLivePrice ? `${gain ? '+' : '-'}${fmtUSD(p.unrealizedPnl)}` : <span className="text-zinc-500">—</span>}
                        </td>
                        <td className={`py-2.5 pr-4 font-medium ${gain ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.hasLivePrice ? `${gain ? '+' : ''}${fmt(p.unrealizedPnlPct)}%` : <span className="text-zinc-500">—</span>}
                        </td>
                        <td className="py-2.5 pr-4 text-zinc-400">{fmt(p.portfolioWeightPct, 1)}%</td>
                        <td className="py-2.5 pl-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => onEdit(p)} title={`Edit ${p.symbol}`}
                              className="rounded p-1 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => onDelete(p)} title={`Delete ${p.symbol}`}
                              className="rounded p-1 text-zinc-600 transition-colors hover:bg-red-500/10 hover:text-red-400">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
