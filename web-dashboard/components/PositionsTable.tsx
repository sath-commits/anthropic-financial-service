'use client';

import type { Position } from '@/lib/types';

interface Props {
  positions: Position[];
}

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtUSD(n: number) {
  return '$' + fmt(Math.abs(n));
}

export default function PositionsTable({ positions }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left">
            {['Symbol', 'Shares', 'Avg Cost', 'Price', 'Value', 'P&L', 'P&L %', 'Weight', 'Account'].map(h => (
              <th key={h} className="pb-2 pr-4 text-xs font-medium uppercase tracking-wider text-zinc-500 last:pr-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map(p => {
            const gain = p.unrealizedPnl >= 0;
            return (
              <tr key={p.symbol} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="py-2.5 pr-4">
                  <div className="font-semibold text-zinc-100">{p.symbol}</div>
                  <div className="text-xs text-zinc-500 truncate max-w-[140px]">{p.name}</div>
                </td>
                <td className="py-2.5 pr-4 text-zinc-300">{fmt(p.shares)}</td>
                <td className="py-2.5 pr-4 text-zinc-300">${fmt(p.avgCost)}</td>
                <td className="py-2.5 pr-4 text-zinc-100 font-medium">${fmt(p.currentPrice)}</td>
                <td className="py-2.5 pr-4 text-zinc-100">{fmtUSD(p.equity)}</td>
                <td className={`py-2.5 pr-4 font-medium ${gain ? 'text-emerald-400' : 'text-red-400'}`}>
                  {gain ? '+' : '-'}{fmtUSD(p.unrealizedPnl)}
                </td>
                <td className={`py-2.5 pr-4 font-medium ${gain ? 'text-emerald-400' : 'text-red-400'}`}>
                  {gain ? '+' : ''}{fmt(p.unrealizedPnlPct)}%
                </td>
                <td className="py-2.5 pr-4 text-zinc-400">{fmt(p.portfolioWeightPct, 1)}%</td>
                <td className="py-2.5 text-zinc-500 uppercase text-xs">{p.accountType}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
