import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import { KpiCard } from '@/components/charts/KpiCard';
import { AXIS, GRID, TOOLTIP } from '@/components/charts/theme';
import { Badge, PageHeader, Panel, QueryState } from '@/components/kit/Panel';
import { DOMAIN, PALETTE, SERIES } from '@/lib/colors';
import { n, s, useDax } from '@/lib/dax';
import { compact, monthLabel, nok, num, pct } from '@/lib/format';

const SEGMENT_COLOR: Record<string, string> = { 'New Build': PALETTE.indigo, 'Life Cycle': PALETTE.teal };

export function Planning() {
  const kpi = useDax('planningKpi');
  const trend = useDax('planningTrend');
  const projects = useDax('projects');
  const disciplines = useDax('disciplines');
  const [segment, setSegment] = useState<'All' | 'New Build' | 'Life Cycle'>('All');
  const k = kpi.data?.[0];

  const points = useMemo(
    () =>
      (projects.data ?? [])
        .filter((r) => segment === 'All' || s(r.segment) === segment)
        .filter((r) => Number.isFinite(n(r.weighted)) && Number.isFinite(n(r.overrun)))
        .map((r) => ({
          name: s(r.name),
          code: s(r.code),
          segment: s(r.segment),
          status: s(r.status),
          x: n(r.weighted) * 100,
          y: n(r.overrun) * 100,
          z: n(r.baseline) || 0,
          value: n(r.contractValue),
        })),
    [projects.data, segment]
  );

  const watchList = useMemo(
    () =>
      (projects.data ?? [])
        .filter((r) => s(r.status) === 'Execution' && Number.isFinite(n(r.overrun)))
        .sort((a, b) => n(b.overrun) - n(a.overrun))
        .slice(0, 8),
    [projects.data]
  );

  const groups = useMemo(() => [...new Set((disciplines.data ?? []).map((r) => s(r.group)))], [disciplines.data]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Planning model" title="Project portfolio" description="Earned-value view of every project: how far along it is, how much it is forecast to overrun, and where the hours go." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Weighted progress" value={pct(n(k?.weighted))} hint="Earned hours / baseline hours" color={DOMAIN.planning} loading={kpi.isLoading} error={!!kpi.error} trend={(trend.data ?? []).map((r) => ({ label: monthLabel(s(r.month)), value: n(r.actual) / 100 }))} trendFormat={(v) => pct(v)} />
        <KpiCard label="Forecast overrun" value={pct(n(k?.overrun), 1)} hint={`${compact(n(k?.forecast))} vs ${compact(n(k?.baseline))} hours`} color={PALETTE.rose} loading={kpi.isLoading} error={!!kpi.error} />
        <KpiCard label="Behind plan" value={pct(n(k?.behind))} hint="Activities > 15 points behind, latest week" color={PALETTE.amber} loading={kpi.isLoading} error={!!kpi.error} trend={(trend.data ?? []).map((r) => ({ label: monthLabel(s(r.month)), value: n(r.behind) }))} trendFormat={(v) => pct(v)} />
        <KpiCard label="Active projects" value={num(n(k?.activeProjects))} hint="Status Execution" color={PALETTE.sky} loading={kpi.isLoading} error={!!kpi.error} />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel
          title="Progress versus forecast overrun"
          subtitle="Each bubble is a project, sized by baseline hours"
          className="xl:col-span-3"
          actions={
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
              {(['All', 'New Build', 'Life Cycle'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setSegment(v)} className={`rounded-md px-2.5 py-1 font-medium ${segment === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                  {v}
                </button>
              ))}
            </div>
          }
        >
          <QueryState query={projects} height="h-80">
            {() => (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 16, bottom: 8, left: -4 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis type="number" dataKey="x" name="Progress" unit="%" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} />
                    <YAxis type="number" dataKey="y" name="Overrun" unit="%" tick={AXIS} tickLine={false} axisLine={false} />
                    <ZAxis type="number" dataKey="z" range={[40, 900]} />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <ReferenceLine y={10} stroke={PALETTE.rose} strokeDasharray="4 4" label={{ value: '10% overrun', position: 'insideTopRight', fontSize: 10, fill: PALETTE.rose }} />
                    <Tooltip
                      {...TOOLTIP}
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ payload }) => {
                        const d = payload?.[0]?.payload as (typeof points)[number] | undefined;
                        if (!d) return null;
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg">
                            <p className="font-semibold text-slate-900">{d.name}</p>
                            <p className="text-slate-500">
                              {d.code} · {d.segment} · {d.status}
                            </p>
                            <p className="mt-1 text-slate-700">
                              Progress {num(d.x, 0)}% · overrun {num(d.y, 1)}%
                            </p>
                            <p className="text-slate-700">
                              Baseline {compact(d.z)} h · contract {nok(d.value)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={points}>
                      {points.map((p) => (
                        <Cell key={p.code} fill={SEGMENT_COLOR[p.segment] ?? PALETTE.slate} fillOpacity={0.65} stroke="#fff" />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </QueryState>
          <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
            {Object.entries(SEGMENT_COLOR).map(([k2, c]) => (
              <span key={k2} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: c }} /> {k2}
              </span>
            ))}
          </div>
        </Panel>

        <Panel title="Watch list" subtitle="Executing projects with the highest forecast overrun" className="xl:col-span-2">
          <QueryState query={projects} height="h-80">
            {() => (
              <ul className="divide-y divide-slate-100">
                {watchList.map((r) => {
                  const over = n(r.overrun);
                  return (
                    <li key={s(r.code)} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{s(r.name)}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, n(r.weighted) * 100)}%` }} />
                          </div>
                          <span className="w-9 text-right text-[11px] text-slate-500">{pct(n(r.weighted))}</span>
                        </div>
                      </div>
                      <Badge tone={over > 0.1 ? 'rose' : over > 0.03 ? 'amber' : 'emerald'}>{pct(over, 1)}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </QueryState>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Planned versus actual progress" subtitle="Average percent complete across tracked activities, by month">
          <QueryState query={trend} height="h-72">
            {(rows) => (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={rows.map((r) => ({ month: monthLabel(s(r.month)), planned: n(r.planned), actual: n(r.actual) }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gap" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PALETTE.indigo} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={PALETTE.indigo} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} vertical={false} />
                    <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} unit="%" domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={(v) => num(v)} />
                    <Tooltip {...TOOLTIP} formatter={(v: number) => `${num(v, 1)}%`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="planned" name="Planned" stroke={PALETTE.slate} strokeDasharray="5 4" fill="none" strokeWidth={2} />
                    <Area type="monotone" dataKey="actual" name="Actual" stroke={PALETTE.indigo} fill="url(#gap)" strokeWidth={2.4} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </QueryState>
        </Panel>

        <Panel title="Where the hours go" subtitle="Hours booked by discipline, coloured by discipline group">
          <QueryState query={disciplines} height="h-72">
            {(rows) => (
              <>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows.map((r) => ({ name: s(r.discipline), group: s(r.group), hours: n(r.hours) }))} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid {...GRID} horizontal={false} />
                      <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => compact(v, 0)} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ ...AXIS, fontSize: 10 }} tickLine={false} axisLine={false} interval={0} />
                      <Tooltip {...TOOLTIP} formatter={(v: number) => [`${compact(v)} h`, 'Hours']} />
                      <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                        {rows.map((r) => (
                          <Cell key={s(r.discipline)} fill={SERIES[groups.indexOf(s(r.group)) % SERIES.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  {groups.map((g, i) => (
                    <span key={g} className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} /> {g}
                    </span>
                  ))}
                </div>
              </>
            )}
          </QueryState>
        </Panel>
      </div>
    </div>
  );
}
