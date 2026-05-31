'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import type { AllocationItem } from '@/lib/types';

interface Props {
  allocation: AllocationItem[];
}

const COLORS: Record<string, string> = {
  'US Large Cap': '#3b82f6',
  'International': '#8b5cf6',
  'Emerging Markets': '#f59e0b',
  'Bonds': '#10b981',
  'Cash': '#6b7280',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as AllocationItem;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl">
      <p className="font-semibold text-zinc-100">{d.name}</p>
      <p className="text-zinc-400">Target: <span className="text-zinc-200">{(d.target * 100).toFixed(1)}%</span></p>
      <p className="text-zinc-400">Current: <span className="text-zinc-200">{(d.current * 100).toFixed(1)}%</span></p>
      <p className={d.drift > 0 ? 'text-amber-400' : 'text-sky-400'}>
        Drift: {d.drift > 0 ? '+' : ''}{(d.drift * 100).toFixed(1)}%
      </p>
    </div>
  );
}

export default function AllocationChart({ allocation }: Props) {
  const data = allocation.map(a => ({
    ...a,
    targetPct: +(a.target * 100).toFixed(1),
    currentPct: +(a.current * 100).toFixed(1),
    driftPct: +(a.drift * 100).toFixed(1),
  }));

  return (
    <div className="space-y-3">
      {allocation.map(a => {
        const driftPct = +(a.drift * 100).toFixed(1);
        const overweight = driftPct > 0;
        const breached = Math.abs(driftPct) >= 5;
        return (
          <div key={a.name}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-zinc-300 font-medium">{a.name}</span>
              <div className="flex gap-3 text-zinc-500">
                <span>{(a.current * 100).toFixed(1)}% <span className="text-zinc-600">/ {(a.target * 100).toFixed(0)}% target</span></span>
                <span className={breached ? (overweight ? 'text-amber-400 font-semibold' : 'text-sky-400 font-semibold') : 'text-zinc-600'}>
                  {overweight ? '+' : ''}{driftPct}%
                </span>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(a.current * 100 / 0.7, 100)}%`,
                  backgroundColor: COLORS[a.name] ?? '#6b7280',
                  opacity: breached ? 1 : 0.7,
                }}
              />
            </div>
            {/* Target marker */}
            <div className="relative h-0">
              <div
                className="absolute top-[-8px] w-0.5 h-3 bg-zinc-500"
                style={{ left: `${Math.min((a.target * 100) / 0.7, 100)}%` }}
              />
            </div>
          </div>
        );
      })}

      <div className="pt-2">
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -20 }}>
              <XAxis dataKey="name" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={v => v.split(' ')[0]} />
              <YAxis tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#3f3f46" />
              <Bar dataKey="driftPct" radius={[3, 3, 0, 0]}>
                {data.map(d => (
                  <Cell key={d.name} fill={d.driftPct > 0 ? '#f59e0b' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-center text-xs text-zinc-600 mt-1">Allocation drift (current − target)</p>
      </div>
    </div>
  );
}
