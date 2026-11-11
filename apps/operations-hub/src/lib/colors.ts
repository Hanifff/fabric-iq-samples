/** Shared palette so every chart, map and badge uses the same colours. */
export const PALETTE = {
  indigo: '#4f46e5',
  sky: '#0ea5e9',
  teal: '#14b8a6',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  violet: '#8b5cf6',
  slate: '#64748b',
  orange: '#f97316',
  lime: '#84cc16',
};

export const SERIES = [
  PALETTE.indigo,
  PALETTE.sky,
  PALETTE.teal,
  PALETTE.amber,
  PALETTE.rose,
  PALETTE.violet,
  PALETTE.emerald,
  PALETTE.orange,
  PALETTE.lime,
  PALETTE.slate,
];

export const DOMAIN = {
  planning: PALETTE.indigo,
  maintenance: PALETTE.teal,
  procurement: PALETTE.amber,
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Interpolates across colour stops for t in [0, 1]. */
export function ramp(stops: string[], t: number): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const HEAT = ['#eef2ff', '#c7d2fe', '#818cf8', '#4f46e5', '#312e81'];
/** Red (poor) to green (good). */
export const PERFORMANCE = ['#e11d48', '#f59e0b', '#facc15', '#22c55e', '#059669'];
