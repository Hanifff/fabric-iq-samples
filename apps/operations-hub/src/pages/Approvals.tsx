import { Box } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Badge, ErrorNote, PageHeader, Panel, Skeleton } from '@/components/kit/Panel';
import { hasPending, pendingRequest, sameId, scheduleShift, waitingChanges } from '@/ops/logic';
import { useOpsData } from '@/ops/OpsContext';
import {
  categories, changeStatuses, decisionStatuses, disciplines, frequencies, phases, priorities, siteOfProject,
  type Control, type Request,
} from '@/ops/types';
import { Btn, field, fieldClass, fmtDate, fromIso, isoDate, labelClass, Segmented } from '@/ops/ui';

type Tab = 'push' | 'changes';
const ALL = 'All';
const shiftText = (days: number) => (days === 0 ? 'no change' : `${days > 0 ? '+' : ''}${days} days`);
const approvalTone = (status: string) => (status === 'Approved' ? 'emerald' : status === 'Rejected' ? 'rose' : 'amber');
const changeTone = (status: string) => (status === 'Approved' ? 'emerald' : status === 'Rejected' ? 'rose' : status === 'In review' ? 'amber' : 'slate');

// What a request would change, in words.
function describe(request: Request, control?: Control) {
  if (request.controlId && (request.status !== 'Pending' || !control)) {
    return `${request.includeInPush ? 'Include' : 'Pause'}, ${request.frequency.toLowerCase()}${request.nextPushDate ? `, next ${fmtDate(request.nextPushDate, false)}` : ''}`;
  }
  if (!control) return `New project: ${request.phase}, ${request.frequency.toLowerCase()}`;
  const parts: string[] = [];
  if (request.includeInPush !== control.includeInPush) parts.push(request.includeInPush ? 'Include in push' : 'Pause');
  if (request.frequency !== control.frequency) parts.push(`${control.frequency} → ${request.frequency}`);
  if (isoDate(request.nextPushDate) !== isoDate(control.nextPushDate)) parts.push(`Next push ${fmtDate(control.nextPushDate, false)} → ${fmtDate(request.nextPushDate, false)}`);
  return parts.join(' · ') || 'No change';
}

export function Approvals() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'changes' ? 'changes' : 'push';
  const { data, query, ops } = useOpsData();
  const empty = !query.isLoading && !query.error && data && data.controls.length === 0 && data.changes.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Planning"
        title="Approvals"
        actions={<Segmented<Tab> label="View" value={tab} onChange={(value) => setParams({ tab: value })}
          options={[['push', 'Push control'], ['changes', 'Change requests']]} />}
      />
      {query.isLoading ? <Skeleton className="h-72" /> : query.error ? <ErrorNote error={query.error} /> : empty ? (
        <Panel title="No projects yet">
          {ops.isApprover() ? <SeedButton /> : <p className="text-sm text-slate-500">Ask a named approver to load the sample data.</p>}
        </Panel>
      ) : tab === 'push' ? <PushControl /> : <ChangeRequests />}
    </div>
  );
}

function SeedButton() {
  const { ops, busy, run } = useOpsData();
  return <Btn tone="primary" disabled={busy} onClick={() => void run(() => ops.seedAll(), 'Sample data loaded')}>Load sample data</Btn>;
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? 'text-slate-900'}`}>{value}</p>
    </div>
  );
}

function PushControl() {
  const { data, ops, busy, run } = useOpsData();
  const [deleteId, setDeleteId] = useState<string>();
  const controls = data?.controls ?? [];
  const requests = data?.requests ?? [];
  const changes = data?.changes ?? [];
  const approver = ops.isApprover();
  const me = ops.me().email.toLowerCase();
  const included = controls.filter((c) => c.includeInPush);
  const pendingCount = requests.filter((r) => r.status === 'Pending').length + controls.filter((c) => c.approvalStatus === 'Pending').length;
  const upcoming = included.filter((c) => c.approvalStatus === 'Approved' && c.nextPushDate).map((c) => (c.nextPushDate as Date).getTime());
  const nextPush = upcoming.length ? new Date(Math.min(...upcoming)) : undefined;

  const change = (item: Control, patch: Parameters<typeof ops.requestChange>[1]) =>
    void run(() => ops.requestChange(item, patch, requests), 'Request filed for approval');
  const decideButtons = (requestedBy: string | undefined, approve: () => Promise<void>, reject?: () => Promise<void>) => {
    if (requestedBy?.toLowerCase() === me) return <span className="text-[11px] text-slate-500">Your request: another approver decides</span>;
    if (!approver) return <span className="text-[11px] text-slate-500">Waiting for an approver</span>;
    return (
      <span className="flex gap-1.5">
        <Btn tone="primary" disabled={busy} onClick={() => void run(approve, 'Approved')}>Approve</Btn>
        {reject && <Btn disabled={busy} onClick={() => void run(reject, 'Rejected')}>Reject</Btn>}
      </span>
    );
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const text = (name: string) => String(values.get(name) ?? '');
    void run(async () => {
      await ops.requestNewProject({
        project: text('project'), name: text('name'), phase: text('phase'), frequency: text('frequency'),
        includeInPush: values.get('includeInPush') === 'on', nextPushDate: fromIso(text('nextPushDate')), note: text('note'),
      }, controls, requests);
      form.reset();
    }, 'Request filed for approval');
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Projects" value={controls.length} />
        <Tile label="In push" value={included.length} />
        <Tile label="Pending approval" value={pendingCount} tone={pendingCount ? 'text-amber-600' : undefined} />
        <Tile label="Failed last push" value={controls.filter((c) => c.lastPushStatus === 'Failed').length}
          tone={controls.some((c) => c.lastPushStatus === 'Failed') ? 'text-rose-600' : undefined} />
        <Tile label="Next push" value={nextPush ? fmtDate(nextPush, false) : '-'} />
      </div>

      <Panel title="Projects in the planning-data push" subtitle="Changes become requests; an approver applies them.">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th className="py-2 pr-3">Project</th><th className="pr-3">Include</th><th className="pr-3">Frequency</th><th className="pr-3">Next push</th>
                <th className="pr-3">Last push</th><th className="pr-3">Approval</th><th className="pr-3">Waiting</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {controls.map((item) => {
                const request = pendingRequest(item, requests);
                const locked = busy || hasPending(item, requests);
                const site = siteOfProject(item.project);
                const waiting = waitingChanges(item, changes);
                return (
                  <tr key={item.id} className={item.includeInPush ? '' : 'bg-slate-50/70 text-slate-500'}>
                    <td className="py-2.5 pr-3 align-top">
                      <p className="font-semibold text-slate-900">{item.project}</p>
                      <p className="text-slate-500">{item.name} · {item.phase}</p>
                      {site && <Link to={`/assets?site=${site.code}`} className="mt-0.5 inline-flex items-center gap-1 text-indigo-600 hover:underline"><Box className="size-3" />{site.name}</Link>}
                    </td>
                    <td className="pr-3 align-top">
                      <label className="mt-1 inline-flex items-center gap-1.5 whitespace-nowrap">
                        <input type="checkbox" checked={item.includeInPush} disabled={locked} aria-label={`Include ${item.project} in push`}
                          onChange={(e) => change(item, { includeInPush: e.target.checked })} className="accent-indigo-600" />
                        {item.includeInPush ? 'In push' : 'Paused'}
                      </label>
                    </td>
                    <td className="pr-3 align-top">
                      <select value={item.frequency} disabled={locked} aria-label={`Frequency for ${item.project}`} className={field('mt-0 w-28 py-1 text-xs')}
                        onChange={(e) => change(item, { frequency: e.target.value })}>{frequencies.map((v) => <option key={v}>{v}</option>)}</select>
                    </td>
                    <td className="pr-3 align-top">
                      <input type="date" value={isoDate(item.nextPushDate)} disabled={locked} aria-label={`Next push for ${item.project}`} className={field('mt-0 w-36 py-1 text-xs')}
                        onChange={(e) => e.target.value && change(item, { nextPushDate: fromIso(e.target.value) })} />
                    </td>
                    <td className="pr-3 align-top">
                      <p>{fmtDate(item.lastPushDate, false)}</p>
                      {item.lastPushStatus && <Badge tone={item.lastPushStatus === 'Failed' ? 'rose' : item.lastPushStatus === 'Skipped' ? 'amber' : 'emerald'}>{item.lastPushStatus}</Badge>}
                    </td>
                    <td className="space-y-1 pr-3 align-top">
                      {request ? <>
                        <Badge tone="amber">Request</Badge>
                        <p className="text-[11px] text-slate-500">{describe(request, item)} · {request.requestedBy}</p>
                        {decideButtons(request.requestedBy, () => ops.decide(request, 'Approved'), () => ops.decide(request, 'Rejected'))}
                      </> : <>
                        <Badge tone={approvalTone(item.approvalStatus)}>{item.approvalStatus}</Badge>
                        {item.approvalStatus === 'Pending'
                          ? <>{<p className="text-[11px] text-slate-500">Requested by {item.requestedBy ?? 'unknown'}</p>}{decideButtons(item.requestedBy, () => ops.approveSample(item))}</>
                          : item.approvedBy && <p className="text-[11px] text-slate-500">By {item.approvedBy}</p>}
                      </>}
                    </td>
                    <td className="pr-3 align-top">{waiting ? <Badge tone="sky">{waiting} approved</Badge> : <span className="text-slate-400">-</span>}</td>
                    <td className="align-top">{approver && (deleteId === item.id ? <span className="flex gap-1">
                      <Btn tone="danger" disabled={busy} onClick={() => void run(async () => { await ops.deleteControl(item.id); setDeleteId(undefined); })}>Confirm</Btn>
                      <Btn onClick={() => setDeleteId(undefined)}>Cancel</Btn>
                    </span> : <Btn disabled={busy} aria-label={`Remove ${item.project}`} onClick={() => setDeleteId(item.id)}>Remove</Btn>)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Requests and decisions">
          {requests.length === 0 ? <p className="text-sm text-slate-500">No requests yet.</p> : (
            <ul className="divide-y divide-slate-100 text-xs">
              {requests.slice(0, 10).map((request) => {
                const control = controls.find((c) => sameId(c.id, request.controlId));
                return (
                  <li key={request.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{request.project} <span className="font-normal text-slate-500">{describe(request, control)}</span></p>
                      <p className="text-slate-500">{request.requestedBy} · {fmtDate(request.requestedAt, false)}{request.decidedBy ? ` · decided by ${request.decidedBy}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge tone={approvalTone(request.status)}>{request.status}</Badge>
                      {request.status === 'Pending' && <>
                        {decideButtons(request.requestedBy, () => ops.decide(request, 'Approved'), () => ops.decide(request, 'Rejected'))}
                        {request.mine && <Btn disabled={busy} onClick={() => void run(() => ops.withdrawRequest(request.id))}>Withdraw</Btn>}
                      </>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        <Panel title="Request a new project">
          <form onSubmit={submit}>
            <fieldset disabled={busy} className="grid grid-cols-2 gap-2.5">
              <label className={labelClass}>Project<input name="project" placeholder="CON-2700" maxLength={64} required className={fieldClass} /></label>
              <label className={labelClass}>Name<input name="name" maxLength={120} required className={fieldClass} /></label>
              <label className={labelClass}>Phase<select name="phase" className={fieldClass}>{phases.map((v) => <option key={v}>{v}</option>)}</select></label>
              <label className={labelClass}>Frequency<select name="frequency" className={fieldClass}>{frequencies.map((v) => <option key={v}>{v}</option>)}</select></label>
              <label className={labelClass}>Next push<input type="date" name="nextPushDate" className={fieldClass} /></label>
              <label className="flex items-end gap-2 pb-2 text-xs text-slate-700"><input type="checkbox" name="includeInPush" defaultChecked className="accent-indigo-600" /> Include in push</label>
              <label className={`${labelClass} col-span-2`}>Note<input name="note" maxLength={300} className={fieldClass} /></label>
              <div className="col-span-2"><Btn tone="primary" type="submit">Request to add project</Btn></div>
            </fieldset>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function ChangeRequests() {
  const [params] = useSearchParams();
  const { data, ops, busy, run } = useOpsData();
  const [status, setStatus] = useState(ALL);
  const [project, setProject] = useState(ALL);
  const [decision, setDecision] = useState<{ id: string; status: string; note: string }>();
  const [deleteId, setDeleteId] = useState<string>();
  const [formKey, setFormKey] = useState(0);
  const changes = data?.changes ?? [];
  const draft = (name: string) => params.get(name) ?? undefined;
  const projects = useMemo(() => [...new Set(changes.map((c) => c.project))].sort(), [changes]);
  const scoped = changes.filter((c) => project === ALL || c.project === project);
  const visible = scoped.filter((c) => status === ALL || c.status === status);
  const netShift = scoped.filter((c) => c.status === 'Approved').reduce((sum, c) => sum + (scheduleShift(c) ?? 0), 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const text = (name: string) => String(values.get(name) ?? '');
    void run(async () => {
      await ops.createChange({
        project: text('project'), title: text('title'), description: text('description'), category: text('category'),
        milestone: text('milestone'), discipline: text('discipline'), priority: text('priority'),
        currentDate: fromIso(text('currentDate')), proposedDate: fromIso(text('proposedDate')),
      });
      setFormKey(formKey + 1);
    }, 'Change requested');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[ALL, ...changeStatuses].map((value) => (
          <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
            {value} <span className="opacity-70">{scoped.filter((c) => value === ALL || c.status === value).length}</span>
          </button>
        ))}
        <select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)} className={field('mt-0 w-40 py-1 text-xs')}>
          {[ALL, ...projects].map((v) => <option key={v}>{v}</option>)}
        </select>
        <span className="ml-auto text-xs text-slate-600">Net shift (approved): <strong className={netShift > 0 ? 'text-rose-600' : netShift < 0 ? 'text-emerald-600' : ''}>{shiftText(netShift)}</strong></span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Panel title="Request a planning change">
          {draft('project') && <p className="mb-2 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-800">Prefilled. Add dates and a reason.</p>}
          <form onSubmit={submit} key={`${formKey}-${params.toString()}`}>
            <fieldset disabled={busy} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <label className={labelClass}>Project<input name="project" required maxLength={64} defaultValue={draft('project')} placeholder="CON-2610" className={fieldClass} /></label>
                <label className={labelClass}>Type<select name="category" defaultValue={draft('category') ?? categories[0]} className={fieldClass}>{categories.map((v) => <option key={v}>{v}</option>)}</select></label>
              </div>
              <label className={labelClass}>Milestone or area<input name="milestone" maxLength={64} defaultValue={draft('milestone')} className={fieldClass} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className={labelClass}>Discipline<select name="discipline" defaultValue={draft('discipline') ?? ''} className={fieldClass}><option value="">-</option>{disciplines.map((v) => <option key={v}>{v}</option>)}</select></label>
                <label className={labelClass}>Priority<select name="priority" defaultValue={draft('priority') ?? 'Medium'} className={fieldClass}>{priorities.map((v) => <option key={v}>{v}</option>)}</select></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className={labelClass}>Current date<input type="date" name="currentDate" className={fieldClass} /></label>
                <label className={labelClass}>Proposed date<input type="date" name="proposedDate" className={fieldClass} /></label>
              </div>
              <label className={labelClass}>Title<input name="title" required maxLength={120} defaultValue={draft('title')} className={fieldClass} /></label>
              <label className={labelClass}>Reason<textarea name="description" required rows={3} maxLength={500} className={fieldClass} /></label>
              <Btn tone="primary" type="submit">Submit request</Btn>
            </fieldset>
          </form>
        </Panel>

        <Panel title={`Change requests · ${visible.length}`}>
          {visible.length === 0 ? <p className="text-sm text-slate-500">No changes in this view.</p> : (
            <ul className="space-y-2.5">
              {visible.map((item) => {
                const shift = scheduleShift(item);
                const options = changeStatuses.includes(item.status) ? changeStatuses : [item.status, ...changeStatuses];
                return (
                  <li key={item.id} className="rounded-xl border border-slate-200 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-slate-500">
                      <span>{item.project}{item.milestone ? ` · ${item.milestone}` : ''}</span>
                      <span className="flex flex-wrap gap-1">
                        <Badge>{item.category}</Badge>
                        {item.priority === 'High' && <Badge tone="rose">High</Badge>}
                        <Badge tone={changeTone(item.status)}>{item.status}</Badge>
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-slate-600">{item.description}</p>
                    {shift !== undefined && <p className="mt-1 font-medium text-slate-800">{fmtDate(item.currentDate)} → {fmtDate(item.proposedDate)}{' '}
                      <span className={shift > 0 ? 'text-rose-600' : shift < 0 ? 'text-emerald-600' : ''}>({shiftText(shift)})</span></p>}
                    {item.decisionNote && <p className="mt-1 rounded-lg bg-slate-50 p-1.5 text-slate-600">Decision: {item.decisionNote}</p>}
                    <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                      {decision?.id === item.id ? (
                        <div className="flex flex-1 flex-wrap items-end gap-2">
                          <label className={`${labelClass} min-w-48 flex-1`}>Note for {decision.status.toLowerCase()} (optional)
                            <input value={decision.note} maxLength={300} onChange={(e) => setDecision({ ...decision, note: e.target.value })} className={fieldClass} />
                          </label>
                          <Btn tone="primary" disabled={busy} onClick={() => void run(async () => { await ops.changeStatus(item.id, decision.status, decision.note); setDecision(undefined); })}>Confirm</Btn>
                          <Btn onClick={() => setDecision(undefined)}>Cancel</Btn>
                        </div>
                      ) : (
                        <select aria-label={`Status for ${item.title}`} value={item.status} disabled={busy} className={field('mt-0 w-32 py-1 text-xs')}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (decisionStatuses.includes(value)) setDecision({ id: item.id, status: value, note: '' });
                            else void run(() => ops.changeStatus(item.id, value));
                          }}>{options.map((v) => <option key={v}>{v}</option>)}</select>
                      )}
                      <span className="text-[11px] text-slate-400">{item.createdBy ?? 'unknown'}, {fmtDate(item.createdAt, false)}</span>
                      {item.mine && decision?.id !== item.id && (deleteId === item.id ? <span className="flex gap-1">
                        <Btn tone="danger" disabled={busy} onClick={() => void run(async () => { await ops.deleteChange(item.id); setDeleteId(undefined); })}>Confirm delete</Btn>
                        <Btn onClick={() => setDeleteId(undefined)}>Cancel</Btn>
                      </span> : <Btn disabled={busy} onClick={() => setDeleteId(item.id)}>Delete</Btn>)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
