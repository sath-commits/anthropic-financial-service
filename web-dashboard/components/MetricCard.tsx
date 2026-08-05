'use client';

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

interface SparkPoint {
  date: string;
  value: number;
}

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  positive?: boolean | null;
  sparkData?: SparkPoint[];
}

function SparkTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SparkPoint }> }) {
  if (!active || !payload?.length) return null;
  const { date, value } = payload[0].payload;
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(value));
  return (
    <div className="rounded-md border border-[#e5ddd3] bg-white px-2 py-1 text-xs text-[#4a3d33] shadow-sm">
      <div className="text-[#9e9087]">{date}</div>
      <div>{value < 0 ? '-' : ''}{formatted}</div>
    </div>
  );
}

export default function MetricCard({ label, value, subValue, positive, sparkData }: MetricCardProps) {
  const subColor =
    positive === null || positive === undefined
      ? 'text-[#6e5f52]'
      : positive
        ? 'text-emerald-500'
        : 'text-red-400';

  const lineColor =
    positive === null || positive === undefined
      ? '#b8ad9e'
      : positive
        ? '#10b981'
        : '#f87171';

  const hasChart = sparkData && sparkData.length > 1;

  return (
    <div className="rounded-xl border border-[#e5ddd3] bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-widest text-[#9e9087]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#1c1612]">{value}</p>
      {subValue && <p className={`mt-0.5 text-sm font-medium ${subColor}`}>{subValue}</p>}
      {hasChart && (
        <div className="mt-3 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Tooltip content={<SparkTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
