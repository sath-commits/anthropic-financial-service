'use client';

import { useEffect, useState, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface HistoryPoint {
  date: string;
  close: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400">{label}</p>
      <p className="font-semibold text-zinc-100">${payload[0].value.toFixed(2)}</p>
    </div>
  );
}

export default function PnLChart({ symbol = 'VOO' }: { symbol?: string }) {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('6mo');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!symbol) return;
    // Cancel any in-flight request before starting a new one
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Show loading immediately when the requested chart series changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/history?symbol=${symbol}&period=${period}`, { signal: controller.signal })
      .then(r => r.json())
      .then((rows: HistoryPoint[]) => {
        setData(rows.slice(-120));
        setLoading(false);
      })
      .catch(err => {
        if (err.name !== 'AbortError') setLoading(false);
      });

    return () => controller.abort();
  }, [symbol, period]);

  const isUp = data.length >= 2 && data[data.length - 1].close >= data[0].close;
  const strokeColor = isUp ? '#22c55e' : '#ef4444';

  const periods = ['1mo', '3mo', '6mo', '1y', '2y'];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-zinc-300">{symbol} Price History</h3>
        <div className="flex gap-1">
          {periods.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                period === p ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-xs text-zinc-600">No data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fill: '#71717a', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => v.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `$${v}`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="close"
              stroke={strokeColor}
              strokeWidth={1.5}
              fill={`url(#grad-${symbol})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
