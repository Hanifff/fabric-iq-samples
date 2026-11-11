import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Sankey,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts';

import { KpiCard } from '@/components/charts/KpiCard';
import { AXIS, GRID, TOOLTIP } from '@/components/charts/theme';
import { PageHeader, Panel, QueryState } from '@/components/kit/Panel';
import { DOMAIN, PALETTE, PERFORMANCE, SERIES, ramp } from '@/lib/colors';
import { n, s, useDax, type Row } from '@/lib/dax';
import { monthLabel, nok, num, pct } from '@/lib/format';
import { COUNTRIES } from '@/lib/locations';

const onTimeColor = (v: number) => ramp(PERFORMANCE, (v - 0.4) / 0.3);

interface FlowNode {
  name: string;
  color: string;
}

function buildFlows(rows: Row[]) {
  const nodes: FlowNode[] = [];
  const index = new Map<string, number>();
  const node = (key: string, name: string, color: string) => {
    if (!index.has(key)) {
      index.set(key, nodes.length);
      nodes.push({ name, color });
    }
    return index.get(key)!;
  };
  const countryTotals = new Map<string, number>();
  for (const r of rows) countryTotals.set(s(r.country), (countryTotals.get(s(r.country)) ?? 0) + (n(r.orderValue) || 0));
  const countries = [...countryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  countries.forEach((c, i) => node(`c:${c}`, COUNTRIES[c]?.name ?? c, SERIES[i % SERIES.length]));

  const a = new Map<string, number>();
  const b = new Map<string, number>();
  for (const r of rows) {
    const v = n(r.orderValue) || 0;
    if (v <= 0) continue;
    const src = node(`c:${s(r.country)}`, COUNTRIES[s(r.country)]?.name ?? s(r.country), PALETTE.slate);
    const mid = node(`m:${s(r.materialGroup)}`, s(r.materialGroup), '#94a3b8');
    const dst = node(`s:${s(r.segment)}`, s(r.segment), s(r.segment) === 'New Build' ? PALETTE.indigo : PALETTE.teal);
    a.set(`${src}>${mid}`, (a.get(`${src}>${mid}`) ?? 0) + v);
    b.set(`${mid}>${dst}`, (b.get(`${mid}>${dst}`) ?? 0) + v);
  }
  const links = [...a, ...b].map(([k, value]) => {
    const [source, target] = k.split('>').map(Number);
    return { source, target, value };
  });
  return { nodes, links };
}

function SankeyNode(props: { x: number; y: number; width: number; height: number; index: number; payload: FlowNode & { value: number; depth: number }; containerWidth: number }) {
  const { x, y, width, height, payload, containerWidth } = props;
  const right = x > containerWidth / 2;
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(1, height)} fill={payload.color} rx={2} />
      {height > 7 && (
        <text x={right ? x - 6 : x + width + 6} y={y + height / 2 + 4} textAnchor={right ? 'end' : 'start'} style={{ fontSize: 11, fill: '#334155' }}>
          {payload.name}
        </text>
      )}
    </g>
  );
}

function SankeyLink(props: { sourceX: number; targetX: number; sourceY: number; targetY: number; sourceControlX: number; targetControlX: number; linkWidth: number; payload: { source: FlowNode } }) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload } = props;
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={payload.source.color}
      strokeOpacity={0.28}
      strokeWidth={Math.max(1, linkWidth)}
    />
  );
}

function TreemapTile(props: { x?: number; y?: number; width?: number; height?: number; name?: string; value?: number; onTime?: number }) {
  const { x = 0, y = 0, width = 0, height = 0, name, value, onTime } = props;
  if (width <= 0 || height <= 0) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={6} fill={onTimeColor(onTime ?? 0)} fillOpacity={0.9} stroke="#fff" strokeWidth={3} />
      {width > 70 && height > 34 && (
        <>
          <text x={x + 8} y={y + 18} style={{ fontSize: 12, fontWeight: 600, fill: '#0f172a' }}>
            {name}
          </text>
          <text x={x + 8} y={y + 33} style={{ fontSize: 11, fill: '#1e293b' }}>
            {nok(value)} · {pct(onTime)} on time
          </text>
        </>
      )}
    </g>
  );
}

export function Procurement() {
  const kpi = useDax('procurementKpi');
  const trend = useDax('procurementTrend');
  const flows = useDax('supplyFlows');
  const groups = useDax('materialGroups');
  const suppliers = useDax('topSuppliers');
  const k = kpi.data?.[0];
  const spark = (key: string) => (trend.data ?? []).map((r) => ({ label: monthLabel(s(r.month)), value: n(r[key]) || 0 }));
  const sankey = useMemo(() => buildFlows(flows.data ?? []), [flows.data]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Procurement model" title="Supply chain" description="What Contoso buys, from where, for which business, and how reliably it arrives." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Order value" value={nok(n(k?.orderValue))} hint={`${num(n(k?.purchaseOrders))} purchase orders`} color={DOMAIN.procurement} loading={kpi.isLoading} error={!!kpi.error} trend={spark('orderValue')} trendFormat={nok} />
        <KpiCard label="Open order value" value={nok(n(k?.openValue))} hint="Lines not yet delivered" color={PALETTE.sky} loading={kpi.isLoading} error={!!kpi.error} />
        <KpiCard label="On-time delivery" value={pct(n(k?.onTime))} hint="Share of delivered lines" color={PALETTE.emerald} loading={kpi.isLoading} error={!!kpi.error} trend={spark('onTime')} trendFormat={(v) => pct(v)} />
        <KpiCard label="Rejection rate" value={pct(n(k?.rejection), 2)} hint={`${num(n(k?.delay), 1)} days average delay`} color={PALETTE.rose} loading={kpi.isLoading} error={!!kpi.error} />
      </div>

      <Panel title="Spend flow" subtitle="Supplier country → material group → business segment, by order value" footer="Link width is order value. Hover a link or node for the amount.">
        <QueryState query={flows} height="h-[460px]">
          {() => (
            <div className="h-[460px] overflow-x-auto">
              <div className="h-full min-w-[640px]">
                <ResponsiveContainer width="100%" height="100%">
                  <Sankey
                    data={sankey}
                    nodePadding={14}
                    nodeWidth={12}
                    margin={{ top: 8, right: 110, bottom: 8, left: 110 }}
                    node={(p: Parameters<typeof SankeyNode>[0]) => <SankeyNode {...p} />}
                    link={(p: Parameters<typeof SankeyLink>[0]) => <SankeyLink {...p} />}
                  >
                    <Tooltip {...TOOLTIP} formatter={(v: number) => nok(v)} />
                  </Sankey>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </QueryState>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Spend by material group" subtitle="Tile size is order value; colour is on-time delivery">
          <QueryState query={groups} height="h-80">
            {(rows) => (
              <>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <Treemap
                      data={rows.map((r) => ({ name: s(r.group), size: n(r.orderValue), value: n(r.orderValue), onTime: n(r.onTime) }))}
                      dataKey="size"
                      aspectRatio={4 / 3}
                      isAnimationActive={false}
                      content={<TreemapTile />}
                    >
                      <Tooltip {...TOOLTIP} formatter={(v: number) => nok(v)} />
                    </Treemap>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  On time 40%
                  <span className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${PERFORMANCE.join(',')})` }} />
                  70%
                </div>
              </>
            )}
          </QueryState>
        </Panel>

        <Panel title="Orders and delivery reliability" subtitle="Order value by order month (bars) and on-time share by delivery month (line)">
          <QueryState query={trend} height="h-80">
            {(rows) => (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rows.map((r) => ({ month: monthLabel(s(r.month)), value: (n(r.orderValue) || 0) / 1e6, onTime: n(r.onTime) * 100 }))} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                    <CartesianGrid {...GRID} vertical={false} />
                    <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis yAxisId="v" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => num(v)} />
                    <YAxis yAxisId="p" orientation="right" tick={AXIS} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                    <Tooltip {...TOOLTIP} formatter={(v: number, name: string) => (name === 'On time' ? `${num(v, 1)}%` : `NOK ${num(v)} m`)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="v" dataKey="value" name="Order value (NOK m)" fill={DOMAIN.procurement} radius={[4, 4, 0, 0]} fillOpacity={0.85} />
                    <Line yAxisId="p" type="monotone" dataKey="onTime" name="On time" stroke={PALETTE.emerald} strokeWidth={2.4} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </QueryState>
        </Panel>
      </div>

      <Panel title="Top suppliers" subtitle="By order value, with delivery performance and quality rating">
        <QueryState query={suppliers} height="h-64">
          {(rows) => (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 font-medium">Supplier</th>
                    <th className="py-2 font-medium">Category</th>
                    <th className="py-2 text-right font-medium">Order value</th>
                    <th className="w-48 py-2 pl-6 font-medium">On time</th>
                    <th className="py-2 text-right font-medium">Quality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={s(r.supplier)}>
                      <td className="py-2">
                        <p className="font-medium text-slate-900">{s(r.supplier)}</p>
                        <p className="text-[11px] text-slate-500">{COUNTRIES[s(r.country)]?.name ?? s(r.country)}</p>
                      </td>
                      <td className="py-2 text-slate-600">{s(r.category)}</td>
                      <td className="py-2 text-right font-medium text-slate-900">{nok(n(r.orderValue))}</td>
                      <td className="py-2 pl-6">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full" style={{ width: `${n(r.onTime) * 100}%`, background: onTimeColor(n(r.onTime)) }} />
                          </div>
                          <span className="w-10 text-right text-xs text-slate-600">{pct(n(r.onTime))}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right text-amber-500" title={`${num(n(r.rating), 1)} of 5`}>
                        {'★'.repeat(Math.round(n(r.rating)))}
                        <span className="text-slate-200">{'★'.repeat(5 - Math.round(n(r.rating)))}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </Panel>
    </div>
  );
}
