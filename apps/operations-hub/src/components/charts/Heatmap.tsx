import { Fragment, useMemo, useState } from 'react';

import { HEAT, ramp } from '@/lib/colors';

interface HeatmapProps {
  rows: string[];
  columns: string[];
  value: (row: string, column: string) => number | null;
  columnLabel?: (c: string) => string;
  format?: (v: number) => string;
  detail?: (row: string, column: string) => string;
}

/** A row-by-column heatmap on a CSS grid, with a hover read-out. */
export function Heatmap({ rows, columns, value, columnLabel, format, detail }: HeatmapProps) {
  const [hover, setHover] = useState<{ row: string; column: string } | null>(null);
  const max = useMemo(() => {
    let m = 0;
    for (const r of rows) for (const c of columns) m = Math.max(m, value(r, c) ?? 0);
    return m || 1;
  }, [rows, columns, value]);

  const hovered = hover ? value(hover.row, hover.column) : null;
  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[560px] gap-[3px] text-[10px]"
          style={{ gridTemplateColumns: `minmax(110px, 140px) repeat(${columns.length}, minmax(22px, 1fr))` }}
          onMouseLeave={() => setHover(null)}
        >
          <div />
          {columns.map((c) => (
            <div key={c} className="truncate pb-1 text-center text-slate-500">
              {columnLabel ? columnLabel(c) : c}
            </div>
          ))}
          {rows.map((r) => (
            <Fragment key={r}>
              <div className="truncate pr-2 text-right leading-6 text-slate-700" title={r}>
                {r}
              </div>
              {columns.map((c) => {
                const v = value(r, c);
                const active = hover?.row === r && hover?.column === c;
                return (
                  <div
                    key={c}
                    onMouseEnter={() => setHover({ row: r, column: c })}
                    className="h-6 rounded-[4px] transition-transform"
                    style={{
                      background: v == null ? '#f8fafc' : ramp(HEAT, Math.sqrt(v / max)),
                      outline: active ? '2px solid #0f172a' : undefined,
                      transform: active ? 'scale(1.12)' : undefined,
                    }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="min-h-4">
          {hover ? (
            <>
              <span className="font-medium text-slate-800">{hover.row}</span> · {columnLabel ? columnLabel(hover.column) : hover.column}:{' '}
              <span className="font-medium text-slate-800">{hovered == null ? 'none' : format ? format(hovered) : hovered}</span>
              {detail && ` · ${detail(hover.row, hover.column)}`}
            </>
          ) : (
            'Hover a cell for details'
          )}
        </span>
        <span className="flex items-center gap-1.5">
          Low
          <span className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${HEAT.join(',')})` }} />
          High
        </span>
      </div>
    </div>
  );
}
