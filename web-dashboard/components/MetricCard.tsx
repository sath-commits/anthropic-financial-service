'use client';

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  positive?: boolean | null; // null = neutral
}

export default function MetricCard({ label, value, subValue, positive }: MetricCardProps) {
  const subColor =
    positive === null || positive === undefined
      ? 'text-zinc-400'
      : positive
        ? 'text-emerald-400'
        : 'text-red-400';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-50">{value}</p>
      {subValue && <p className={`mt-0.5 text-sm font-medium ${subColor}`}>{subValue}</p>}
    </div>
  );
}
