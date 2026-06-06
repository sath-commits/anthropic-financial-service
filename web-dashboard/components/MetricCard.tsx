'use client';

import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  positive?: boolean | null;
  sparkData?: number[];
}

function SparkTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number }> }) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(v));
  return (
    <div className="rounded-md border border-[#e5ddd3] bg-white px-2 py-1 text-xs text-[#4a3d33] shadow-sm">
      {v < 0 ? '-' : ''}{formatted}
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

  const chartData = sparkData?.map(v => ({ v }));
  const hasChart = chartData && chartData.length > 1;

  return (
    <div className="rounded-xl border border-[#e5ddd3] bg-white px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-widest text-[#9e9087]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#1c1612]">{value}</p>
      {subValue && <p className={`mt-0.5 text-sm font-medium ${subColor}`}>{subValue}</p>}
      {hasChart && (
        <div className="mt-3 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Tooltip content={<SparkTooltip />} />
              <Line
                type="monotone"
                dataKey="v"
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
