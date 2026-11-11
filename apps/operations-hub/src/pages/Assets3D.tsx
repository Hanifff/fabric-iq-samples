import { Box, MapPin, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Badge, ErrorNote, PageHeader, Panel, Skeleton } from '@/components/kit/Panel';
import { inDays, isLate } from '@/ops/logic';
import { useOpsData } from '@/ops/OpsContext';
import {
  equipmentStatuses, healthColors, healthLevels, noDataColor, severities, severityColors, SITES, type Equipment,
} from '@/ops/types';
import { Btn, field, fieldClass, fmtDate, labelClass, Segmented } from '@/ops/ui';
import { isModelKey, MODELS, type Vec3 } from '@/three/slots';
import { Viewer, type Look, type PinSpec, type ViewerEvents } from '@/three/viewer';

type Mode = 'model' | 'condition' | 'plan';
const DAY = 86_400_000;
const daysFromToday = (value: Date) => Math.round((value.getTime() - inDays(0).getTime()) / DAY);
const statusTone = (status: string) =>
  status === 'Out of service' ? 'rose' : status === 'Fabrication' ? 'sky' : status === 'Planned' ? 'amber' : 'emerald';

export function Assets3D() {
  const { data, query, ops, busy, run } = useOpsData();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | undefined>(undefined);
  const [failed, setFailed] = useState('');
  const [mode, setMode] = useState<Mode>('model');
  const [slot, setSlot] = useState<string>();
  const [hover, setHover] = useState<{ slot: string; x: number; y: number }>();
  const [adding, setAdding] = useState(false);
  const [point, setPoint] = useState<{ at: Vec3; slot?: string }>();
  const [findingId, setFindingId] = useState<string>();
  const [deleteId, setDeleteId] = useState<string>();
  const [planDay, setPlanDay] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [editing, setEditing] = useState(false);

  const equipment = data?.equipment ?? [];
  const findings = data?.findings ?? [];
  const activity = (code: string) =>
    findings.filter((f) => f.siteCode === code && f.status === 'Open').length * 100 + equipment.filter((e) => e.siteCode === code).length;
  const busiest = SITES.filter((s) => s.project).sort((a, b) => activity(b.code) - activity(a.code))[0];
  const site = SITES.find((s) => s.code === params.get('site')) ?? busiest ?? SITES[0];
  const key = isModelKey(site.model) ? site.model : 'platform';
  const info = MODELS[key];
  const slotOrder = Object.keys(info.slots);
  const items = useMemo(() => equipment.filter((e) => e.siteCode === site.code)
    .sort((a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot)), [equipment, site.code]);
  const bySlot = useMemo(() => new Map(items.map((item) => [item.slot, item])), [items]);
  const siteFindings = useMemo(() => findings.filter((f) => f.siteCode === site.code), [findings, site.code]);
  const numbered = useMemo(() => new Map(siteFindings.map((f, index) => [f.id, index + 1])), [siteFindings]);
  const listed = useMemo(() => siteFindings.filter((f) => showClosed || f.status === 'Open'), [siteFindings, showClosed]);
  const selected = slot ? bySlot.get(slot) : undefined;
  const planned = items.filter((e) => e.plannedDate).map((e) => daysFromToday(e.plannedDate as Date));
  const planRange = planned.length ? [Math.min(0, ...planned) - 14, Math.max(0, ...planned) + 14] : [0, 0];
  const lateCount = items.filter(isLate).length;

  // Play runs the slider through the plan; from today or the end it starts at the beginning.
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (planDay === 0 || planDay >= planRange[1]) setPlanDay(planRange[0]);
    setPlaying(true);
  };
  useEffect(() => {
    if (!playing) return;
    const step = Math.max(1, Math.round((planRange[1] - planRange[0]) / 60));
    const timer = setInterval(() => setPlanDay((day) => Math.min(planRange[1], day + step)), 150);
    return () => clearInterval(timer);
  }, [playing, planRange[0], planRange[1]]);
  useEffect(() => {
    if (playing && (mode !== 'plan' || planDay >= planRange[1])) setPlaying(false);
  }, [playing, mode, planDay, planRange[1]]);

  const chooseSite = (code: string) => setParams({ site: code }, { replace: true });
  // Default to the busiest site once the data is there, and keep it in the URL so it does not jump later.
  useEffect(() => {
    if (!params.get('site') && data && busiest) chooseSite(busiest.code);
  }, [params, data, busiest?.code]);

  // Keep the viewer's callbacks pointing at the latest state.
  const events = useRef<ViewerEvents>({ select: () => {}, hover: () => {}, pick: () => {}, pin: () => {} });
  events.current = {
    select: (picked) => { setSlot(picked); setFindingId(undefined); },
    hover: setHover,
    pick: (at, picked) => { setPoint({ at, slot: picked }); setAdding(false); if (picked) setSlot(picked); },
    pin: (id) => {
      const finding = siteFindings.find((f) => f.id === id);
      setFindingId(id);
      if (finding) viewer.current?.focus([finding.x, finding.y, finding.z]);
    },
  };

  useEffect(() => {
    if (!host.current) return;
    try {
      viewer.current = new Viewer(host.current, {
        select: (value) => events.current.select(value),
        hover: (value) => events.current.hover(value),
        pick: (at, value) => events.current.pick(at, value),
        pin: (id) => events.current.pin(id),
      });
    } catch {
      setFailed('This browser could not start the 3D view (WebGL). The register below still works.');
    }
    return () => {
      viewer.current?.dispose();
      viewer.current = undefined;
    };
  }, []);

  useEffect(() => {
    viewer.current?.show(key);
    setSlot(undefined);
    setPoint(undefined);
    setFindingId(undefined);
    setAdding(false);
    setPlanDay(0);
    setPlaying(false);
  }, [key, site.code]);

  const looks = useMemo(() => {
    const result: Record<string, Look> = {};
    for (const name of slotOrder) {
      const item = bySlot.get(name);
      if (mode === 'condition') result[name] = { color: item?.health ? healthColors[item.health] : item ? noDataColor : '#cbd5e1' };
      if (mode === 'plan' && item?.plannedDate) {
        const ghost = daysFromToday(item.plannedDate) > planDay;
        result[name] = { ghost, color: !ghost && isLate(item) ? healthColors.Action : undefined };
      }
    }
    return result;
  }, [bySlot, mode, planDay, key]);
  useEffect(() => viewer.current?.paint(looks), [looks]);
  useEffect(() => viewer.current?.select(slot), [slot]);
  useEffect(() => setEditing(false), [slot, site.code]);
  useEffect(() => viewer.current?.setPicking(adding), [adding]);

  const pins = useMemo(() => {
    const result: PinSpec[] = listed.map((f) => ({
      id: f.id, at: [f.x, f.y, f.z], color: severityColors[f.severity] ?? noDataColor, label: String(numbered.get(f.id)), selected: f.id === findingId,
    }));
    if (point) result.push({ id: 'new', at: point.at, color: '#4f46e5', label: 'New', selected: true });
    return result;
  }, [listed, numbered, findingId, point]);
  useEffect(() => viewer.current?.setPins(pins), [pins]);

  function choose(name: string) {
    setSlot(name);
    setFindingId(undefined);
    const at = info.slots[name]?.anchor;
    if (at) viewer.current?.focus(at);
  }

  function saveEquipment(event: FormEvent<HTMLFormElement>, item: Equipment) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const text = (name: string) => String(values.get(name) ?? '');
    void run(async () => {
      await ops.updateEquipment(item, {
        status: text('status'),
        ...(text('health') ? { health: text('health') } : {}),
        progress: Number(text('progress')),
        ...(values.get('inspected') === 'on' ? { lastInspection: new Date() } : {}),
        note: text('note').trim(),
      });
      setEditing(false);
    }, 'Saved');
  }

  function saveFinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!point) return;
    const values = new FormData(event.currentTarget);
    const text = (name: string) => String(values.get(name) ?? '');
    void run(async () => {
      await ops.createFinding({ siteCode: site.code, tag: text('tag') || undefined, x: point.at[0], y: point.at[1], z: point.at[2],
        title: text('title'), severity: text('severity') });
      setPoint(undefined);
    }, 'Finding saved');
  }

  function requestChange(item: Equipment) {
    if (!site.project) return;
    const search = new URLSearchParams({
      tab: 'changes', project: site.project, category: 'Milestone change',
      discipline: item.status === 'Fabrication' || item.status === 'Planned' ? 'Fabrication' : 'Installation',
      milestone: `${item.tag} ${item.name}`.slice(0, 64), title: `Re-plan ${item.name.toLowerCase()} (${item.tag})`.slice(0, 120),
      priority: item.health === 'Action' ? 'High' : 'Medium',
    });
    navigate(`/approvals?${search}`);
  }

  const hoverItem = hover ? bySlot.get(hover.slot) : undefined;
  const groups: [string, typeof SITES][] = [
    ['In processing control', SITES.filter((s) => s.project)],
    ['Other installations', SITES.filter((s) => !s.project && s.kind !== 'Fabrication yard')],
  ];
  const openCount = siteFindings.filter((f) => f.status === 'Open').length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Assets"
        title="3D assets"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Site" value={site.code} onChange={(e) => chooseSite(e.target.value)} className={field('mt-0 w-72')}>
              {groups.map(([label, list]) => (
                <optgroup key={label} label={label}>
                  {list.map((s) => <option key={s.code} value={s.code}>{s.name}{s.project ? ` · ${s.project}` : ''}</option>)}
                </optgroup>
              ))}
            </select>
            <Link to="/map" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"><MapPin className="size-3.5" /> Map</Link>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <Badge tone="indigo"><Box className="size-3" /> {site.kind}</Badge>
        {site.waterDepth ? <span>{site.waterDepth} m water depth</span> : site.town ? <span>{site.town}</span> : null}
        {site.operator && <span className="text-slate-400">· {site.operator}</span>}
        {site.project && <Link to="/approvals" className="font-medium text-indigo-600 hover:text-indigo-800">· {site.project} {site.projectName}</Link>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title={info.label}
          actions={
            <>
              <Segmented<Mode> label="Colour by" value={mode} onChange={setMode}
                options={[['model', 'Model'], ['condition', 'Condition'], ...(planned.length ? [['plan', '4D plan'] as [Mode, string]] : [])]} />
              <Btn tone={adding ? 'primary' : 'plain'} disabled={busy} onClick={() => { setAdding(!adding); setPoint(undefined); }}>
                {adding ? 'Click the model…' : 'Add finding'}
              </Btn>
              <Btn aria-label="Reset view" onClick={() => viewer.current?.resetView()}><RotateCcw className="size-3.5" /></Btn>
            </>
          }
        >
          <div ref={host} className={`relative h-[520px] overflow-hidden rounded-xl viewer-bg-${info.setting}`}>
            {failed && <p className="absolute inset-x-8 top-1/3 rounded-xl bg-white p-4 text-center text-sm">{failed}</p>}
            {hover && (
              <div className="pointer-events-none absolute z-10 rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-xs text-white" style={{ left: hover.x + 14, top: hover.y + 14 }}>
                <p className="font-semibold">{info.slots[hover.slot]?.label ?? hover.slot}</p>
                <p className="text-slate-300">{hoverItem ? `${hoverItem.tag} · ${hoverItem.status}${hoverItem.health ? ` · ${hoverItem.health}` : ''}` : 'No register entry'}</p>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-2.5 left-2.5 flex flex-wrap gap-3 rounded-lg bg-white/85 px-2.5 py-1.5 text-[11px] text-slate-700">
              {mode === 'model' && <span>Drag to turn · scroll to zoom · click a part</span>}
              {mode === 'condition' && [...healthLevels.map((l) => [l, healthColors[l]]), ['No condition', noDataColor]].map(([l, c]) => (
                <span key={l} className="inline-flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: c }} />{l}</span>
              ))}
              {mode === 'plan' && (
                <span className="inline-flex items-center gap-1">
                  Solid: done by {fmtDate(inDays(planDay))} · faint: later
                  {lateCount > 0 && <> · <i className="inline-block size-2.5 rounded-sm" style={{ background: healthColors.Action }} />late ({lateCount})</>}
                </span>
              )}
            </div>
          </div>
          {mode === 'plan' && (
            <div className="mt-3 flex items-end gap-3">
              <label className={`${labelClass} flex-1`}>
                Plan date: <strong className="text-slate-900">{fmtDate(inDays(planDay))}</strong>{planDay === 0 ? ' (today)' : ''}
                <input type="range" min={planRange[0]} max={planRange[1]} value={planDay}
                  onChange={(e) => { setPlaying(false); setPlanDay(Number(e.target.value)); }} className="mt-1 w-full accent-indigo-600" />
              </label>
              <Btn tone={playing ? 'primary' : 'plain'} onClick={togglePlay}>
                {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />} {playing ? 'Pause' : 'Play'}
              </Btn>
              <Btn onClick={() => { setPlaying(false); setPlanDay(0); }}>Today</Btn>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          {point && (
            <Panel title="New finding">
              <form onSubmit={saveFinding} className="space-y-3">
                <fieldset disabled={busy} className="space-y-3">
                  <label className={labelClass}>What did you find?<input name="title" maxLength={120} required className={fieldClass} /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={labelClass}>Severity<select name="severity" defaultValue="Watch" className={fieldClass}>{severities.map((v) => <option key={v}>{v}</option>)}</select></label>
                    <label className={labelClass}>Tag<select name="tag" defaultValue={point.slot ? bySlot.get(point.slot)?.tag ?? '' : ''} className={fieldClass}>
                      <option value="">-</option>{items.map((i) => <option key={i.id} value={i.tag}>{i.tag}</option>)}</select></label>
                  </div>
                  <div className="flex gap-2"><Btn tone="primary" type="submit">Save finding</Btn><Btn onClick={() => setPoint(undefined)}>Cancel</Btn></div>
                </fieldset>
              </form>
            </Panel>
          )}

          {slot && (
            <Panel title={info.slots[slot]?.label ?? slot}>
              {selected ? (
                <div className="space-y-3 text-sm">
                  <p><strong>{selected.tag}</strong> · {selected.name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                    {selected.health && <Badge tone={selected.health === 'OK' ? 'emerald' : selected.health === 'Watch' ? 'amber' : 'rose'}>{selected.health}</Badge>}
                  </div>
                  <div className="relative h-4 overflow-hidden rounded-full bg-slate-100" aria-label={`Progress ${selected.progress} %`}>
                    <div className="h-full bg-indigo-200" style={{ width: `${selected.progress}%` }} />
                    <span className="absolute inset-y-0 left-2 text-[10px] font-semibold leading-4 text-slate-700">{selected.progress} %</span>
                  </div>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-slate-500">Planned</dt>
                    <dd className={isLate(selected) ? 'font-semibold text-rose-700' : ''}>{fmtDate(selected.plannedDate)}{isLate(selected) ? ' · late' : ''}</dd>
                    <dt className="text-slate-500">Inspected</dt><dd>{fmtDate(selected.lastInspection)}</dd>
                    <dt className="text-slate-500">Updated</dt><dd className="truncate">{selected.updatedBy ? `${selected.updatedBy}, ${fmtDate(selected.updatedAt)}` : '-'}</dd>
                  </dl>
                  {selected.note && <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{selected.note}</p>}
                  {editing ? (
                    <form onSubmit={(e) => saveEquipment(e, selected)} key={`${selected.id}-${String(selected.updatedAt)}`}>
                      <fieldset disabled={busy} className="space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <label className={labelClass}>Status<select name="status" defaultValue={selected.status} className={fieldClass}>{equipmentStatuses.map((v) => <option key={v}>{v}</option>)}</select></label>
                          <label className={labelClass}>Condition<select name="health" defaultValue={selected.health ?? ''} className={fieldClass}>
                            {!selected.health && <option value="">-</option>}{healthLevels.map((v) => <option key={v}>{v}</option>)}</select></label>
                        </div>
                        <label className={labelClass}>Progress (%)<input type="number" name="progress" min={0} max={100} step={1} defaultValue={selected.progress} required className={fieldClass} /></label>
                        <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" name="inspected" className="accent-indigo-600" /> Inspected today</label>
                        <label className={labelClass}>Note<input name="note" maxLength={300} defaultValue={selected.note ?? ''} className={fieldClass} /></label>
                        <div className="flex gap-2"><Btn tone="primary" type="submit">Save</Btn><Btn onClick={() => setEditing(false)}>Cancel</Btn></div>
                      </fieldset>
                    </form>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Btn tone="primary" onClick={() => setEditing(true)}>Record condition</Btn>
                      {site.project && <Btn onClick={() => requestChange(selected)}>Request change</Btn>}
                      <Btn onClick={() => { setAdding(true); setPoint(undefined); }}>Pin finding</Btn>
                    </div>
                  )}
                </div>
              ) : <p className="text-sm text-slate-500">No register entry for this part.</p>}
            </Panel>
          )}

          <Panel
            title={`Findings · ${openCount} open`}
            actions={<label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-indigo-600" /> Closed</label>}
          >
            {listed.length === 0 ? <p className="text-sm text-slate-500">None open.</p> : (
              <ul className="space-y-2">
                {listed.map((f) => (
                  <li key={f.id} className={`flex gap-2.5 rounded-xl border p-2.5 text-xs ${f.id === findingId ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}>
                    <button type="button" onClick={() => events.current.pin(f.id)} aria-label={`Show finding ${numbered.get(f.id)}`}
                      className="grid size-7 shrink-0 place-items-center rounded-full border-[3px] bg-white text-[11px] font-bold" style={{ borderColor: severityColors[f.severity] }}>
                      {numbered.get(f.id)}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{f.title}</p>
                      <p className="truncate text-slate-500">{f.severity}{f.tag ? ` · ${f.tag}` : ''} · {f.createdBy}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Btn disabled={busy} onClick={() => void run(() => ops.setFindingStatus(f, f.status === 'Open' ? 'Closed' : 'Open'))}>
                          {f.status === 'Open' ? 'Close' : 'Reopen'}
                        </Btn>
                        {f.mine && (deleteId === f.id ? <>
                          <Btn tone="danger" disabled={busy} onClick={() => void run(async () => { await ops.deleteFinding(f.id); setDeleteId(undefined); })}>Confirm delete</Btn>
                          <Btn onClick={() => setDeleteId(undefined)}>Cancel</Btn>
                        </> : <Btn disabled={busy} onClick={() => setDeleteId(f.id)}>Delete</Btn>)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel title={`Equipment register · ${items.length} tags`} actions={ops.isApprover() && !query.isLoading && equipment.length === 0
        ? <Btn tone="primary" disabled={busy} onClick={() => void run(() => ops.seedAll(), 'Sample data loaded')}>Load sample data</Btn> : undefined}>
        {query.isLoading ? <Skeleton className="h-40" /> : query.error ? <ErrorNote error={query.error} /> : items.length === 0 ? (
          <p className="text-sm text-slate-500">No register for this site yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                <tr><th className="py-2 pr-3">Tag</th><th className="pr-3">Part</th><th className="pr-3">Status</th><th className="pr-3">Condition</th><th className="pr-3">Progress</th><th className="pr-3">Planned</th><th>Inspected</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className={item.slot === slot ? 'bg-indigo-50/60' : ''}>
                    <td className="py-2 pr-3"><button type="button" onClick={() => choose(item.slot)} className="font-semibold text-indigo-700 hover:underline">{item.tag}</button>
                      <span className="block text-slate-500">{item.name}</span></td>
                    <td className="pr-3">{info.slots[item.slot]?.label ?? item.slot}</td>
                    <td className="pr-3"><Badge tone={statusTone(item.status)}>{item.status}</Badge></td>
                    <td className="pr-3">{item.health ? <span className="inline-flex items-center gap-1.5"><i className="inline-block size-2.5 rounded-sm" style={{ background: healthColors[item.health] }} />{item.health}</span> : <span className="text-slate-400">-</span>}</td>
                    <td className="pr-3">{item.progress} %</td>
                    <td className={`pr-3 ${isLate(item) ? 'font-semibold text-rose-700' : ''}`}>{fmtDate(item.plannedDate)}{isLate(item) ? ' · late' : ''}</td>
                    <td>{fmtDate(item.lastInspection)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
