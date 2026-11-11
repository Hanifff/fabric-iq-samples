const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-GB', opts);

export function compact(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return nf({ notation: 'compact', maximumFractionDigits: digits }).format(value);
}

export function nok(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return `NOK ${compact(value, 1)}`;
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return nf({ style: 'percent', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

export function num(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '–';
  return nf({ maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

/** '2026-10' -> 'Oct 26' */
export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function dateLabel(value: string | null | undefined): string {
  if (!value) return '–';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : d.toLocaleDateString('en-GB');
}
