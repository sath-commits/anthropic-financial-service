'use client';

import type { EarningsEvent } from '@/lib/types';
import { Calendar } from 'lucide-react';

interface Props {
  earnings: EarningsEvent[];
  hasPositions?: boolean;
}

export default function EarningsStrip({ earnings, hasPositions }: Props) {
  if (!earnings.length) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-600">
        <Calendar className="h-3.5 w-3.5" />
        {hasPositions
          ? 'No earnings found in the next 60 days — calendar data may be temporarily unavailable'
          : 'No earnings in the next 60 days'}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {earnings.map(e => {
        const urgent = e.daysUntil <= 7;
        return (
          <div
            key={e.symbol}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border ${
              urgent
                ? 'border-amber-700/50 bg-amber-950/40 text-amber-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-300'
            }`}
          >
            <span className="font-bold">{e.symbol}</span>
            <span className={urgent ? 'text-amber-400' : 'text-zinc-500'}>
              {e.daysUntil === 0 ? 'today' : e.daysUntil === 1 ? 'tomorrow' : `in ${e.daysUntil}d`}
            </span>
            {e.epsEstimate != null && (
              <span className="text-zinc-600">est. ${e.epsEstimate.toFixed(2)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
