import { ArrowRight, Box, ClipboardCheck, Clock3, Gauge as GaugeIcon, PackageCheck, Ship, Sparkles, Truck, Wrench, Lightbulb } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';

import { Gauge } from '@/components/charts/Gauge';
import { KpiCard } from '@/components/charts/KpiCard';
import { AXIS, GRID, TOOLTIP } from '@/components/charts/theme';
import { Badge, PageHeader, Panel, QueryState } from '@/components/kit/Panel';
import { OperationsMap } from '@/components/maps/OperationsMap';
import { DOMAIN } from '@/lib/colors';
import { n, s, useDax, type Row } from '@/lib/dax';
import { compact, dateLabel, monthLabel, nok, num, pct } from '@/lib/format';

// Who builds what in this app, in the order a request travels.
const BUILT: ['team' | 'fabric', string, string][] = [
  ['team', 'Screens', 'React page'],
  ['team', 'Data model and rules', 'TypeScript'],
  ['fabric', 'Hosting and sign-in', 'Entra account'],
  ['fabric', 'SQL database', 'App-owned data'],
  ['fabric', 'Connectors', 'Semantic models'],
  ['fabric', 'Functions', 'Data agents, Foundry'],
];

const series = (rows: Row[] | undefined, key: string) =>
  (rows ?? []).map((r) => ({ label: monthLabel(s(r.month)), value: n(r[key]) || 0 }));

export function Overview() {
  const pk = useDax('planningKpi');
  const pt = useDax('planningTrend');
  const mk = useDax('maintenanceKpi');
  const mt = useDax('maintenanceTrend');
  const rk = useDax('procurementKpi');
  const rt = useDax('procurementTrend');
  const yards = useDax('yards');
  const installations = useDax('installations');

  const p = pk.data?.[0];
  const m = mk.data?.[0];
  const r = rk.data?.[0];

  const combined = (pt.data ?? []).map((row) => {
    const month = s(row.month);
    const wo = mt.data?.find((x) => s(x.month) === month);
    const po = rt.data?.find((x) => s(x.month) === month);
    return {
      month: monthLabel(month),
      hours: n(row.hours) || 0,
      workOrders: wo ? n(wo.workOrders) : null,
      orderValue: po ? (n(po.orderValue) || 0) / 1e6 : null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Live from Fabric semantic models"
        title="Operations at a glance"
        description="Planning, maintenance and procurement in one view. Every number is a DAX query against the workshop's governed semantic models, run as you."
        actions={
          <Badge tone="emerald">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Data as of {dateLabel(s(m?.asOf) || s(r?.asOf))}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Hours booked" value={compact(n(p?.hours))} hint="All projects, all time" color={DOMAIN.planning} icon={<Clock3 className="size-4" />} trend={series(pt.data, 'hours')} trendFormat={(v) => compact(v)} loading={pk.isLoading} error={!!pk.error} />
        <KpiCard label="Behind plan" value={pct(n(p?.behind))} hint="Activities, latest week" color={DOMAIN.planning} icon={<GaugeIcon className="size-4" />} trend={series(pt.data, 'behind')} trendFormat={(v) => pct(v)} loading={pk.isLoading} error={!!pk.error} />
        <KpiCard label="Work orders" value={num(n(m?.workOrders))} hint={`${pct(n(m?.correctiveShare))} corrective`} color={DOMAIN.maintenance} icon={<Wrench className="size-4" />} trend={series(mt.data, 'workOrders')} loading={mk.isLoading} error={!!mk.error} />
        <KpiCard label="Maintenance cost" value={nok(n(m?.cost))} hint={`${compact(n(m?.downtime))} h downtime`} color={DOMAIN.maintenance} icon={<Ship className="size-4" />} trend={series(mt.data, 'cost')} trendFormat={nok} loading={mk.isLoading} error={!!mk.error} />
        <KpiCard label="Order value" value={nok(n(r?.orderValue))} hint={`${nok(n(r?.openValue))} still open`} color={DOMAIN.procurement} icon={<Truck className="size-4" />} trend={series(rt.data, 'orderValue')} trendFormat={nok} loading={rk.isLoading} error={!!rk.error} />
        <KpiCard label="On-time delivery" value={pct(n(r?.onTime))} hint={`${num(n(r?.delay), 1)} days average delay`} color={DOMAIN.procurement} icon={<PackageCheck className="size-4" />} trend={series(rt.data, 'onTime')} trendFormat={(v) => pct(v)} loading={rk.isLoading} error={!!rk.error} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Health gauges" subtitle="Three governed measures, one per subject area" className="xl:col-span-1">
          <div className="grid grid-cols-3 gap-2 xl:grid-cols-1 2xl:grid-cols-3">
            <Gauge value={n(p?.weighted)} label="Weighted progress" caption="Earned / baseline hours" format={(v) => pct(v)} />
            <Gauge value={n(r?.onTime)} label="On-time delivery" caption="Delivered lines" format={(v) => pct(v)} />
            <Gauge value={n(m?.correctiveShare)} label="Corrective share" caption="Lower is better" lowerIsBetter format={(v) => pct(v)} />
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            Forecast at completion is <span className="font-semibold text-slate-900">{compact(n(p?.forecast))} hours</span> against a baseline of{' '}
            <span className="font-semibold text-slate-900">{compact(n(p?.baseline))}</span>, an overrun of{' '}
            <span className="font-semibold text-rose-600">{pct(n(p?.overrun), 1)}</span> across {num(n(p?.activeProjects))} active projects.
          </p>
        </Panel>

        <Panel title="Activity across the business" subtitle="Last 24 months: hours booked, work orders and order value (NOK m)" className="xl:col-span-2">
          <QueryState query={pt} height="h-72">
            {() => (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={combined} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid {...GRID} vertical={false} />
                    <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis yAxisId="hours" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => compact(v, 0)} />
                    <YAxis yAxisId="count" orientation="right" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => compact(v, 0)} />
                    <Tooltip {...TOOLTIP} formatter={(v: number, name: string) => [name === 'Order value (NOK m)' ? num(v) : compact(v), name]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="hours" dataKey="hours" name="Hours booked" fill={DOMAIN.planning} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                    <Line yAxisId="count" type="monotone" dataKey="workOrders" name="Work orders" stroke={DOMAIN.maintenance} strokeWidth={2.2} dot={false} />
                    <Line yAxisId="count" type="monotone" dataKey="orderValue" name="Order value (NOK m)" stroke={DOMAIN.procurement} strokeWidth={2.2} dot={false} strokeDasharray="5 3" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </QueryState>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel
          title="North Sea footprint"
          subtitle="Yards sized by contract value; installations sized by maintenance cost"
          actions={
            <Link to="/map" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
              Open map <ArrowRight className="size-3.5" />
            </Link>
          }
          className="xl:col-span-3"
          footer="Yards: real towns named in the data. Installations: fictional assets at synthetic positions. Base map: Natural Earth, bundled; no tile service."
        >
          {yards.error || installations.error ? (
            <QueryState query={yards.error ? yards : installations}>{() => null}</QueryState>
          ) : (
            <OperationsMap yards={yards.data} installations={installations.data} compact />
          )}
        </Panel>
        <div className="grid gap-4 xl:col-span-2">
          <CallToAction
            to="/ask"
            icon={<Sparkles className="size-5" />}
            title="Ask the data agents"
            text="Ask the planning, maintenance or procurement data agent directly, or an optional Foundry agent that picks one for you."
            tone="from-indigo-500 to-sky-500"
          />
          <CallToAction
            to="/ideas"
            icon={<Lightbulb className="size-5" />}
            title="Share an improvement idea"
            text="Capture ideas, vote on the best ones and move them through review. Stored in the app's own Fabric SQL database."
            tone="from-amber-500 to-rose-500"
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Panel title="How this app is built" subtitle="One Fabric item: your code, Fabric's services" className="xl:col-span-3">
          <ol className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
            {BUILT.map(([who, title, text]) => (
              <li key={title} className={`rounded-xl border p-2.5 ${who === 'team' ? 'border-amber-200 bg-amber-50/60' : 'border-teal-200 bg-teal-50/60'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{who === 'team' ? 'Your team' : 'Fabric'}</p>
                <p className="text-sm font-semibold text-slate-900">{title}</p>
                <p className="text-[11px] text-slate-600">{text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-600">
            <strong>Connected:</strong> dashboards, map and agents read the semantic models. <strong>App-owned:</strong> approvals, condition,
            findings and ideas are written to the app's own SQL database.
          </p>
        </Panel>
        <div className="grid gap-4 xl:col-span-2">
          <CallToAction to="/assets" icon={<Box className="size-5" />} title="3D assets" text="Click a part, record its condition, pin a finding." tone="from-teal-500 to-emerald-500" />
          <CallToAction to="/approvals" icon={<ClipboardCheck className="size-5" />} title="Approvals" text="Request a change; a second person approves." tone="from-violet-500 to-indigo-500" />
        </div>
      </div>
    </div>
  );
}

function CallToAction({ to, icon, title, text, tone }: { to: string; icon: React.ReactNode; title: string; text: string; tone: string }) {
  return (
    <Link to={to} className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute -right-10 -top-10 size-36 rounded-full bg-gradient-to-br ${tone} opacity-15 blur-2xl transition group-hover:opacity-25`} />
      <div className={`grid size-10 place-items-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md`}>{icon}</div>
      <p className="mt-3 font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
      <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
        Open <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
      </p>
    </Link>
  );
}
