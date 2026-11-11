import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Tone = 'primary' | 'plain' | 'danger';

/** Small buttons for the operations screens. */
export function Btn({ tone = 'plain', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    primary: 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700',
    plain: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  };
  return (
    <button
      type="button"
      className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50', tones[tone], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A row of toggle buttons. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition', value === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800')}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export const fieldClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
export const labelClass = 'block text-xs font-medium text-slate-600';
/** The input style with overrides merged (later classes win). */
export const field = (extra: string) => cn(fieldClass, extra);

export const fmtDate = (value?: Date, year = true) =>
  value ? value.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }) : '-';
export const isoDate = (value?: Date) => (value ? value.toISOString().slice(0, 10) : '');
export const fromIso = (value: string) => (value ? new Date(`${value}T00:00:00Z`) : undefined);
