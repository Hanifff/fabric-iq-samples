import type { ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';

import { Skeleton } from '@/components/kit/Panel';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  color: string;
  trend?: { label: string; value: number }[];
  trendFormat?: (v: number) => string;
  loading?: boolean;
  error?: boolean;
  className?: string;
}

/** A headline number with an optional sparkline of its monthly trend. */
export function KpiCard({ label, value, hint, icon, color, trend, trendFormat, loading, error, className }: KpiCardProps) {
  const id = `spark-${label.replace(/\W+/g, '-')}`;
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {icon && (
          <span className="grid size-7 place-items-center rounded-lg" style={{ background: `${color}14`, color }}>
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        <p className={cn('mt-1 text-2xl font-semibold tracking-tight', error ? 'text-rose-600' : 'text-slate-900')}>{error ? 'Error' : value}</p>
      )}
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
      <div className="mt-2 h-10">
        {trend && trend.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip
                cursor={false}
                contentStyle={{ fontSize: 11, padding: '2px 8px', borderRadius: 8 }}
                labelFormatter={(_, p) => (p?.[0]?.payload as { label?: string })?.label ?? ''}
                formatter={(v: number) => [trendFormat ? trendFormat(v) : v, label]}
              />
              <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.8} fill={`url(#${id})`} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
