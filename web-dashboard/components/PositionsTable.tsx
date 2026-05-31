'use client';

import { Edit2, Trash2 } from 'lucide-react';
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

export default function PositionsTable({ positions, onEdit, onDelete }: Props) {
  return (
    <div className="space-y-6">
      {ACCOUNT_ORDER.map(accountType => {
        const accountPositions = positions.filter(position => position.accountType === accountType);
        if (!accountPositions.length) return null;
        const accountValue = accountPositions.reduce((total, position) => total + position.equity, 0);
        return (
          <section key={accountType}>
            <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{ACCOUNT_LABELS[accountType]}</h3>
              <span className="text-xs text-zinc-500">{fmtUSD(accountValue)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left">
                    {['Symbol', 'Shares', 'Avg Cost', 'Price', 'Value', 'P&L', 'P&L %', 'Weight', ''].map(h => (
                      <th key={h} className="pb-2 pr-4 text-xs font-medium uppercase tracking-wider text-zinc-500 last:pr-0">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accountPositions.map((p, index) => {
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
