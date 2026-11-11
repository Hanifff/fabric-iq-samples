import { ramp, PERFORMANCE } from '@/lib/colors';

interface GaugeProps {
  value: number | null | undefined;
  label: string;
  caption?: string;
  /** Where the needle turns green: higher is better unless `lowerIsBetter`. */
  lowerIsBetter?: boolean;
  format?: (v: number) => string;
}

const R = 70;
const CX = 90;
const CY = 86;

function arc(from: number, to: number): string {
  const a0 = Math.PI * (1 - from);
  const a1 = Math.PI * (1 - to);
  const x0 = CX + R * Math.cos(a0);
  const y0 = CY - R * Math.sin(a0);
  const x1 = CX + R * Math.cos(a1);
  const y1 = CY - R * Math.sin(a1);
  return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`;
}

/** Semicircle gauge for a 0..1 ratio. */
export function Gauge({ value, label, caption, lowerIsBetter, format }: GaugeProps) {
  const v = value == null || !Number.isFinite(value) ? null : Math.min(1, Math.max(0, value));
  const score = v == null ? 0 : lowerIsBetter ? 1 - v : v;
  const color = ramp(PERFORMANCE, score);
  const angle = Math.PI * (1 - (v ?? 0));
  const nx = CX + (R - 18) * Math.cos(angle);
  const ny = CY - (R - 18) * Math.sin(angle);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 100" className="w-full max-w-[220px]" role="img" aria-label={`${label}: ${v == null ? 'no data' : (format ? format(v) : v)}`}>
        <path d={arc(0, 1)} stroke="#e2e8f0" strokeWidth={14} fill="none" strokeLinecap="round" />
        {v != null && v > 0 && <path d={arc(0, v)} stroke={color} strokeWidth={14} fill="none" strokeLinecap="round" />}
        {v != null && (
          <>
            <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#0f172a" strokeWidth={2.5} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={4.5} fill="#0f172a" />
          </>
        )}
        <text x={CX} y={CY - 22} textAnchor="middle" className="fill-slate-900" style={{ fontSize: 20, fontWeight: 600 }}>
          {v == null ? '–' : format ? format(v) : v.toFixed(2)}
        </text>
      </svg>
      <p className="-mt-1 text-xs font-medium text-slate-700">{label}</p>
      {caption && <p className="text-[11px] text-slate-500">{caption}</p>}
    </div>
  );
}
