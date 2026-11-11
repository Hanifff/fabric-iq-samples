import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Panel({ title, subtitle, actions, footer, className, bodyClassName, children }: PanelProps) {
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50',
        className
      )}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="truncate text-sm font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('min-w-0 flex-1 px-5 pb-5 pt-3', bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500">{footer}</footer>}
    </section>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-100', className)} />;
}

export function ErrorNote({ error, compact }: { error: unknown; compact?: boolean }) {
  const message = error instanceof Error ? error.message : String(error);
  const category = (error as { category?: string })?.category;
  return (
    <div className={cn('rounded-xl border border-rose-200 bg-rose-50 text-rose-800', compact ? 'p-2 text-xs' : 'p-3 text-sm')}>
      <p className="font-medium">Could not load live data{category ? ` (${category})` : ''}</p>
      <p className="mt-1 break-words text-xs text-rose-700">{message}</p>
    </div>
  );
}

/** Renders loading, error or content for a query result. */
export function QueryState<T>({
  query,
  height = 'h-64',
  children,
}: {
  query: { data?: T; error: unknown; isLoading: boolean };
  height?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <Skeleton className={cn('w-full', height)} />;
  if (query.error) return <ErrorNote error={query.error} />;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}

export function Badge({ children, tone = 'slate', className }: { children: ReactNode; tone?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'teal'; className?: string }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset', tones[tone], className)}>
      {children}
    </span>
  );
}

export function SourceNote({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1">{children}</span>;
}
