import { useCallback, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Heatmap } from '@/components/charts/Heatmap';
import { KpiCard } from '@/components/charts/KpiCard';
import { AXIS, GRID, TOOLTIP } from '@/components/charts/theme';
import { PageHeader, Panel, QueryState } from '@/components/kit/Panel';
import { DOMAIN, PALETTE, PERFORMANCE, SERIES, ramp } from '@/lib/colors';
import { n, s, useDax } from '@/lib/dax';
import { compact, monthLabel, nok, num, pct } from '@/lib/format';

export function Maintenance() {
  const kpi = useDax('maintenanceKpi');
  const trend = useDax('maintenanceTrend');
  const heat = useDax('workOrderHeatmap');
  const types = useDax('workOrderTypes');
  const groups = useDax('equipmentGroups');
  const installations = useDax('installations');
  const [metric, setMetric] = useState<'workOrders' | 'cost'>('workOrders');
  const k = kpi.data?.[0];
  const spark = (key: string) => (trend.data ?? []).map((r) => ({ label: monthLabel(s(r.month)), value: n(r[key]) || 0 }));

  const grid = useMemo(() => {
    const rows = heat.data ?? [];
    const months = [...new Set(rows.map((r) => s(r.month)))].sort();
    const totals = new Map<string, number>();
    const cells = new Map<string, { workOrders: number; cost: number }>();
    for (const r of rows) {
      const inst = s(r.installation);
      totals.set(inst, (totals.get(inst) ?? 0) + (n(r.workOrders) || 0));
      cells.set(`${inst}|${s(r.month)}`, { workOrders: n(r.workOrders) || 0, cost: n(r.cost) || 0 });
    }
    const installationsSorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    return { months, installations: installationsSorted, cells };
  }, [heat.data]);

  const cellValue = useCallback((row: string, column: string) => grid.cells.get(`${row}|${column}`)?.[metric] ?? null, [grid, metric]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Maintenance model" title="Asset maintenance" description="Work orders, cost and downtime across Contoso's maintained installations." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Work orders" value={num(n(k?.workOrders))} hint={`${num(n(k?.completed))} completed`} color={DOMAIN.maintenance} loading={kpi.isLoading} error={!!kpi.error} trend={spark('workOrders')} />
        <KpiCard label="Corrective share" value={pct(n(k?.correctiveShare))} hint="Breakdowns versus planned work" color={PALETTE.rose} loading={kpi.isLoading} error={!!kpi.error} trend={spark('corrective')} />
        <KpiCard label="Total cost" value={nok(n(k?.cost))} hint="Labour and material" color={PALETTE.sky} loading={kpi.isLoading} error={!!kpi.error} trend={spark('cost')} trendFormat={nok} />
        <KpiCard label="Downtime" value={`${compact(n(k?.downtime))} h`} hint={`${num(n(k?.daysToComplete), 1)} days to complete on average`} color={PALETTE.amber} loading={kpi.isLoading} error={!!kpi.error} trend={spark('downtime')} trendFormat={(v) => `${num(v)} h`} />
      </div>

      <Panel
        title="Work order heatmap"
        subtitle="Installations by month, last 12 months with data"
        actions={
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
            {(
              [
                ['workOrders', 'Work orders'],
                ['cost', 'Cost'],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setMetric(v)} className={`rounded-md px-2.5 py-1 font-medium ${metric === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                {label}
              </button>
            ))}
          </div>
        }
      >
        <QueryState query={heat} height="h-96">
          {() => (
            <Heatmap
              rows={grid.installations}
              columns={grid.months}
              value={cellValue}
              columnLabel={monthLabel}
              format={(v) => (metric === 'cost' ? nok(v) : `${num(v)} work orders`)}
              detail={(r, c) => {
                const cell = grid.cells.get(`${r}|${c}`);
                return cell ? (metric === 'cost' ? `${num(cell.workOrders)} work orders` : nok(cell.cost)) : '';
              }}
            />
          )}
        </QueryState>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Work order mix" subtitle="Count by type; centre shows total">
          <QueryState query={types} height="h-64">
            {(rows) => {
              const total = rows.reduce((a, r) => a + (n(r.workOrders) || 0), 0);
              return (
                <div className="flex flex-col items-center gap-3 sm:flex-row">
                  <div className="relative h-56 w-56 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Tooltip {...TOOLTIP} formatter={(v: number, name: string) => [`${num(v)} (${pct(v / total)})`, name]} />
                        <Pie data={rows.map((r) => ({ name: s(r.type), value: n(r.workOrders) }))} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2} stroke="none">
                          {rows.map((r, i) => (
                            <Cell key={s(r.type)} fill={SERIES[i % SERIES.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                      <div>
                        <p className="text-xl font-semibold text-slate-900">{compact(total)}</p>
                        <p className="text-[11px] text-slate-500">work orders</p>
                      </div>
                    </div>
                  </div>
                  <ul className="w-full space-y-1.5 text-xs">
                    {rows.map((r, i) => (
                      <li key={s(r.type)} className="flex items-center gap-2">
                        <span className="size-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
                        <span className="flex-1 text-slate-700">{s(r.type)}</span>
                        <span className="text-slate-500">{nok(n(r.cost))}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }}
          </QueryState>
        </Panel>

        <Panel title="Failure hot spots" subtitle="Corrective work orders by equipment class group">
          <QueryState query={groups} height="h-64">
            {(rows) => (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows.map((r) => ({ name: s(r.group), corrective: n(r.corrective), share: n(r.corrective) / n(r.workOrders) }))} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} horizontal={false} />
                    <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
                    <Tooltip {...TOOLTIP} formatter={(v: number) => [num(v), 'Corrective work orders']} />
                    <Bar dataKey="corrective" radius={[0, 4, 4, 0]}>
                      {rows.map((r) => (
                        <Cell key={s(r.group)} fill={ramp(PERFORMANCE, 1 - (n(r.corrective) / n(r.workOrders) - 0.15) / 0.3)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </QueryState>
        </Panel>

        <Panel title="Cost by installation" subtitle="Top 10, bar colour shows corrective share" className="lg:col-span-2 xl:col-span-1">
          <QueryState query={installations} height="h-64">
            {(rows) => {
              const top = [...rows].sort((a, b) => n(b.cost) - n(a.cost)).slice(0, 10);
              return (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top.map((r) => ({ name: s(r.name), cost: n(r.cost), share: n(r.correctiveShare) }))} margin={{ top: 4, right: 4, left: -12, bottom: 40 }}>
                      <CartesianGrid {...GRID} vertical={false} />
                      <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={false} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => compact(v, 0)} />
                      <Tooltip {...TOOLTIP} formatter={(v: number) => [nok(v), 'Cost']} />
                      <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                        {top.map((r) => (
                          <Cell key={s(r.name)} fill={ramp(PERFORMANCE, 1 - n(r.correctiveShare) / 0.5)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              );
            }}
          </QueryState>
        </Panel>
      </div>
    </div>
  );
}
