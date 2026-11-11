import { isModelKey, MODELS, type Vec3 } from '@/three/slots';

import type { Backend, Row } from './backend';
import seed from './seed.json';
import {
  categories, changeStatuses, decisionStatuses, disciplines, equipmentStatuses, findingStatuses, frequencies,
  healthLevels, phases, priorities, severities, siteByCode,
  type Change, type Control, type Equipment, type FindingRow, type OpsData, type Request,
} from './types';

const DAY = 86_400_000;
/** Midnight UTC today, plus `days`. */
export const inDays = (days: number) => new Date(Math.floor(Date.now() / DAY) * DAY + days * DAY);
const toDate = (value: unknown) => (value === null || value === undefined || value === '' ? undefined : new Date(value as string));
const str = (value: unknown) => (value === null || value === undefined || value === '' ? undefined : String(value));
const SAMPLE = 'Sample data (planner)';

export const sameId = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
export const pendingRequest = (item: Control, requests: Request[]) =>
  requests.find((request) => sameId(request.controlId, item.id) && request.status === 'Pending');
export const hasPending = (item: Control, requests: Request[]) => item.approvalStatus === 'Pending' || Boolean(pendingRequest(item, requests));
export const healthRank = (health?: string) => (health === 'Action' ? 3 : health === 'Watch' ? 2 : health === 'OK' ? 1 : 0);
/** Planned date has passed and the work is not finished. */
export const isLate = (item: Pick<Equipment, 'plannedDate' | 'progress'>) =>
  item.progress < 100 && Boolean(item.plannedDate) && (item.plannedDate as Date) < inDays(0);
export const worstHealth = (items: Pick<Equipment, 'health'>[]) =>
  items.reduce<string | undefined>((worst, item) => (healthRank(item.health) > healthRank(worst) ? item.health : worst), undefined);
export const scheduleShift = (change: Pick<Change, 'currentDate' | 'proposedDate'>) =>
  change.currentDate && change.proposedDate ? Math.round((change.proposedDate.getTime() - change.currentDate.getTime()) / DAY) : undefined;
/** Approved planning changes made after the project's last push. */
export const waitingChanges = (item: Control, changes: Change[]) => changes.filter((change) => change.project === item.project &&
  change.status === 'Approved' && (!item.lastPushDate || (change.updatedAt ?? change.createdAt) > item.lastPushDate)).length;

export function anchorFor(siteCode: string, slot: string): Vec3 | undefined {
  const site = siteByCode(siteCode);
  return site && isModelKey(site.model) ? MODELS[site.model].slots[slot]?.anchor : undefined;
}

// Runs at most `limit` writes at a time; the data API has no bulk insert.
async function inBatches<T>(items: T[], write: (item: T) => Promise<unknown>, limit = 6) {
  for (let start = 0; start < items.length; start += limit) await Promise.all(items.slice(start, start + limit).map(write));
}

const EQUIPMENT = ['id', 'tag', 'name', 'equipmentClass', 'siteCode', 'project', 'slot', 'system', 'status', 'health', 'progress',
  'plannedDate', 'lastInspection', 'criticality', 'note', 'updatedAt', 'updatedBy', 'user_id'] as const;
const FINDING = ['id', 'siteCode', 'tag', 'x', 'y', 'z', 'title', 'severity', 'status', 'createdBy', 'createdAt', 'closedBy',
  'closedAt', 'user_id'] as const;
const CONTROL = ['id', 'project', 'name', 'phase', 'includeInPush', 'frequency', 'nextPushDate', 'lastPushDate', 'lastPushStatus',
  'approvalStatus', 'requestedBy', 'approvedBy', 'note', 'user_id'] as const;
const REQUEST = ['id', 'controlId', 'project', 'name', 'phase', 'includeInPush', 'frequency', 'nextPushDate', 'note', 'status',
  'requestedBy', 'requestedAt', 'decidedBy', 'decidedAt', 'decisionNote', 'user_id'] as const;
const CHANGE = ['id', 'project', 'title', 'description', 'category', 'status', 'milestone', 'discipline', 'priority', 'currentDate',
  'proposedDate', 'decisionNote', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'user_id'] as const;

export type ControlInput = Pick<Control, 'project' | 'name' | 'phase' | 'frequency' | 'includeInPush'> & Partial<Pick<Control, 'nextPushDate' | 'note'>>;
export type ControlChange = Partial<Pick<Control, 'includeInPush' | 'frequency' | 'nextPushDate'>>;
export type EquipmentChange = Partial<Pick<Equipment, 'status' | 'health' | 'progress' | 'lastInspection' | 'note'>>;
export type FindingInput = Pick<FindingRow, 'siteCode' | 'tag' | 'x' | 'y' | 'z' | 'title' | 'severity'>;
export type ChangeInput = Pick<Change, 'project' | 'title' | 'description' | 'category'> &
  Partial<Pick<Change, 'milestone' | 'discipline' | 'priority' | 'currentDate' | 'proposedDate'>>;

/** The operations screens' data and rules. The Fabric data API enforces the same rules again (rayfin/data). */
export function createOps(backend: Backend, approverEmails: string[]) {
  const approvers = approverEmails.map((email) => email.trim().toLowerCase()).filter(Boolean);
  const me = () => backend.user();
  const myName = () => me().email.slice(0, 120);
  const isApprover = () => backend.kind === 'memory' || approvers.includes(me().email.toLowerCase());
  const mine = (row: Row) => row.user_id === me().id;

  async function load(): Promise<OpsData> {
    const [equipment, findings, controls, requests, changes] = await Promise.all([
      backend.list('EquipmentItem', EQUIPMENT, { tag: 'asc' }),
      backend.list('Finding', FINDING, { createdAt: 'asc' }),
      backend.list('ProjectControl', CONTROL, { project: 'asc' }),
      backend.list('ControlRequest', REQUEST, { requestedAt: 'desc' }),
      backend.list('PlanningChange', CHANGE, { createdAt: 'desc' }),
    ]);
    return {
      equipment: equipment.map((r) => ({
        id: r.id, tag: String(r.tag), name: String(r.name), equipmentClass: String(r.equipmentClass), siteCode: String(r.siteCode),
        project: str(r.project), slot: String(r.slot), system: str(r.system), status: String(r.status), health: str(r.health),
        progress: Number(r.progress), plannedDate: toDate(r.plannedDate), lastInspection: toDate(r.lastInspection),
        criticality: str(r.criticality), note: str(r.note), updatedAt: toDate(r.updatedAt), updatedBy: str(r.updatedBy), mine: mine(r),
      })),
      findings: findings.map((r) => ({
        id: r.id, siteCode: String(r.siteCode), tag: str(r.tag), x: Number(r.x), y: Number(r.y), z: Number(r.z), title: String(r.title),
        severity: String(r.severity), status: String(r.status), createdBy: String(r.createdBy), createdAt: toDate(r.createdAt) as Date,
        closedBy: str(r.closedBy), closedAt: toDate(r.closedAt), mine: mine(r),
      })),
      controls: controls.map((r) => ({
        id: r.id, project: String(r.project), name: String(r.name), phase: String(r.phase), includeInPush: Boolean(r.includeInPush),
        frequency: String(r.frequency), nextPushDate: toDate(r.nextPushDate), lastPushDate: toDate(r.lastPushDate),
        lastPushStatus: str(r.lastPushStatus), approvalStatus: String(r.approvalStatus), requestedBy: str(r.requestedBy),
        approvedBy: str(r.approvedBy), note: str(r.note), mine: mine(r),
      })),
      requests: requests.map((r) => ({
        id: r.id, controlId: str(r.controlId), project: String(r.project), name: String(r.name), phase: String(r.phase),
        includeInPush: Boolean(r.includeInPush), frequency: String(r.frequency), nextPushDate: toDate(r.nextPushDate), note: str(r.note),
        status: String(r.status), requestedBy: String(r.requestedBy), requestedAt: toDate(r.requestedAt) as Date, decidedBy: str(r.decidedBy),
        decidedAt: toDate(r.decidedAt), decisionNote: str(r.decisionNote), mine: mine(r),
      })),
      changes: changes.map((r) => ({
        id: r.id, project: String(r.project), title: String(r.title), description: String(r.description), category: String(r.category),
        status: String(r.status), milestone: str(r.milestone), discipline: str(r.discipline), priority: str(r.priority),
        currentDate: toDate(r.currentDate), proposedDate: toDate(r.proposedDate), decisionNote: str(r.decisionNote),
        createdAt: toDate(r.createdAt) as Date, createdBy: str(r.createdBy), updatedAt: toDate(r.updatedAt), updatedBy: str(r.updatedBy),
        mine: mine(r),
      })),
    };
  }

  // Equipment and findings ------------------------------------------------------------------

  async function updateEquipment(item: Equipment, change: EquipmentChange) {
    if (change.status !== undefined && !equipmentStatuses.includes(change.status)) throw new Error('Unknown status.');
    if (change.health !== undefined && !healthLevels.includes(change.health)) throw new Error('Unknown condition.');
    if (change.progress !== undefined && (!Number.isInteger(change.progress) || change.progress < 0 || change.progress > 100)) {
      throw new Error('Progress must be a whole number from 0 to 100.');
    }
    if ((change.note?.length ?? 0) > 300) throw new Error('Keep the note within 300 characters.');
    await backend.update('EquipmentItem', item.id, { ...change, updatedAt: new Date(), updatedBy: myName() });
  }

  async function createFinding(input: FindingInput) {
    const title = input.title.trim();
    if (!title || title.length > 120) throw new Error('Describe the finding in 1 to 120 characters.');
    if (!severities.includes(input.severity)) throw new Error('Unknown severity.');
    if (![input.x, input.y, input.z].every(Number.isFinite)) throw new Error('Pick a point on the model first.');
    const round = (value: number) => Math.round(value * 1000) / 1000;
    // The data API only accepts findings in your own name and as Open.
    await backend.create('Finding', {
      siteCode: input.siteCode, tag: input.tag || undefined, x: round(input.x), y: round(input.y), z: round(input.z), title,
      severity: input.severity, status: 'Open', createdBy: myName(), createdAt: new Date(), user_id: me().id,
    });
  }

  async function setFindingStatus(finding: FindingRow, status: string) {
    if (!findingStatuses.includes(status)) throw new Error('Unknown status.');
    await backend.update('Finding', finding.id, status === 'Closed' ? { status, closedBy: myName(), closedAt: new Date() } : { status });
  }

  // Only the person who recorded a finding can delete it (data API rule).
  const deleteFinding = (id: string) => backend.remove('Finding', id);

  // Processing control ----------------------------------------------------------------------

  function validate(input: ControlInput) {
    const project = input.project.trim();
    const name = input.name.trim();
    if (!project || !name || project.length > 64 || name.length > 120 || (input.note?.length ?? 0) > 300 ||
        !phases.includes(input.phase) || !frequencies.includes(input.frequency)) {
      throw new Error('Enter a project code, name, phase and frequency within the limits.');
    }
    if (input.nextPushDate && Number.isNaN(input.nextPushDate.getTime())) throw new Error('Enter a valid push date.');
    return { ...input, project, name, note: input.note?.trim() || undefined };
  }

  async function fileRequest(data: Omit<Request, 'id' | 'mine' | 'status' | 'requestedBy' | 'requestedAt'>) {
    // The data API only accepts requests filed in your own name and as Pending.
    await backend.create('ControlRequest', { ...data, status: 'Pending', requestedBy: myName(), requestedAt: new Date(), user_id: me().id });
  }

  async function requestNewProject(input: ControlInput, controls: Control[], requests: Request[]) {
    const data = validate(input);
    const code = data.project.toLowerCase();
    if (controls.some((item) => item.project.toLowerCase() === code) ||
        requests.some((request) => request.status === 'Pending' && request.project.toLowerCase() === code)) {
      throw new Error(`Project ${data.project} is already in the list or requested.`);
    }
    await fileRequest({ ...data, controlId: undefined });
  }

  async function requestChange(item: Control, change: ControlChange, requests: Request[]) {
    if (hasPending(item, requests)) throw new Error(`${item.project} already has a pending request. Wait for the decision.`);
    await fileRequest({
      controlId: item.id, project: item.project, name: item.name, phase: item.phase, note: item.note,
      includeInPush: change.includeInPush ?? item.includeInPush,
      frequency: change.frequency ?? item.frequency,
      nextPushDate: 'nextPushDate' in change ? change.nextPushDate : item.nextPushDate,
    });
  }

  function assertCanDecide(requestedBy?: string) {
    if (!isApprover()) throw new Error('Only named approvers can decide requests.');
    if (requestedBy?.toLowerCase() === myName().toLowerCase()) throw new Error('Someone else has to approve your request.');
  }

  // Approving applies the requested settings to the approved table; the data API checks both steps again.
  async function decide(request: Request, status: 'Approved' | 'Rejected', decisionNote = '') {
    assertCanDecide(request.requestedBy);
    const decision = { status, decidedBy: myName(), decidedAt: new Date(), decisionNote: decisionNote.trim().slice(0, 300) || undefined };
    await backend.update('ControlRequest', request.id, decision);
    if (status !== 'Approved') return;
    const settings = {
      includeInPush: request.includeInPush, frequency: request.frequency, nextPushDate: request.nextPushDate, approvalStatus: 'Approved',
      requestedBy: request.requestedBy, requestedAt: request.requestedAt, approvedBy: decision.decidedBy, approvedAt: decision.decidedAt,
    };
    if (request.controlId) await backend.update('ProjectControl', request.controlId, settings);
    else await backend.create('ProjectControl', {
      ...settings, project: request.project, name: request.name, phase: request.phase, note: request.note,
      createdAt: new Date(), createdBy: request.requestedBy, user_id: me().id,
    });
  }

  // Sample rows marked Pending have no request record; only approvers can update the approved table.
  async function approveSample(item: Control) {
    if (item.approvalStatus !== 'Pending') throw new Error('Nothing to approve.');
    assertCanDecide(item.requestedBy);
    await backend.update('ProjectControl', item.id, { approvalStatus: 'Approved', approvedBy: myName(), approvedAt: new Date() });
  }

  const withdrawRequest = (id: string) => backend.remove('ControlRequest', id);
  const deleteControl = (id: string) => backend.remove('ProjectControl', id);

  // Planning change requests ----------------------------------------------------------------

  async function createChange(input: ChangeInput, seedValues: { status?: string; decisionNote?: string; createdAt?: Date } = {}) {
    const now = new Date();
    const createdAt = seedValues.createdAt ?? now;
    const status = seedValues.status ?? 'Open';
    const data = {
      project: input.project.trim(), title: input.title.trim(), description: input.description.trim(), category: input.category,
      milestone: input.milestone?.trim() || undefined, discipline: input.discipline || undefined, priority: input.priority || 'Medium',
      currentDate: input.currentDate, proposedDate: input.proposedDate, status, decisionNote: seedValues.decisionNote,
      createdAt, createdBy: myName(), updatedAt: seedValues.createdAt ? new Date(createdAt.getTime() + (status === 'Open' ? 0 : DAY)) : now,
      updatedBy: myName(),
    };
    if (!changeStatuses.includes(status) || !data.project || !data.title || !data.description || data.project.length > 64 ||
        data.title.length > 120 || data.description.length > 500 || (data.milestone?.length ?? 0) > 64 ||
        !categories.includes(data.category) || !priorities.includes(data.priority) ||
        (data.discipline && !disciplines.includes(data.discipline))) {
      throw new Error('Enter a project, title, reason and type within the limits.');
    }
    if (Boolean(data.currentDate) !== Boolean(data.proposedDate)) throw new Error('Enter both the current and the proposed date, or neither.');
    if ([data.currentDate, data.proposedDate].some((value) => value && Number.isNaN(value.getTime()))) throw new Error('Enter valid dates.');
    await backend.create('PlanningChange', { ...data, user_id: me().id });
  }

  async function changeStatus(id: string, status: string, decisionNote?: string) {
    if (!changeStatuses.includes(status)) throw new Error('Unknown status.');
    const note = decisionNote?.trim().slice(0, 300) || undefined;
    await backend.update('PlanningChange', id, {
      status, updatedAt: new Date(), updatedBy: myName(), ...(decisionStatuses.includes(status) ? { decisionNote: note } : {}),
    });
  }

  // Only the creator can delete a change (data API rule).
  const deleteChange = (id: string) => backend.remove('PlanningChange', id);

  // Sample data -----------------------------------------------------------------------------

  // Equipment and processing control are master data, so only approvers load them. Skips rows already there.
  async function seedAll() {
    if (!isApprover()) throw new Error('Only named approvers can load the sample data.');
    const current = await load();
    const user_id = me().id;
    const now = new Date();
    const equipment = seed.equipment.filter((e) => !current.equipment.some((row) => row.siteCode === e.siteCode && row.tag === e.tag));
    await inBatches(equipment, (e) => backend.create('EquipmentItem', {
      siteCode: e.siteCode, tag: e.tag, name: e.name, equipmentClass: e.equipmentClass, slot: e.slot, system: e.system,
      status: e.status, health: e.health ?? undefined, progress: e.progress, project: siteByCode(e.siteCode)?.project ?? undefined,
      plannedDate: inDays(e.plannedInDays), lastInspection: e.inspectedDaysAgo === null ? undefined : inDays(-e.inspectedDaysAgo),
      criticality: e.criticality, createdAt: now, createdBy: myName(), updatedAt: now, updatedBy: myName(), user_id,
    }));
    const findings = seed.findings.filter((f) => !current.findings.some((row) => row.siteCode === f.siteCode && row.tag === f.tag && row.title === f.title));
    await inBatches(findings, async (f) => {
      const at = anchorFor(f.siteCode, f.slot);
      if (!at) return;
      await backend.create('Finding', {
        siteCode: f.siteCode, tag: f.tag, x: at[0], y: at[1], z: at[2], title: f.title, severity: f.severity, status: 'Open',
        createdBy: myName(), createdAt: now, user_id,
      });
    });
    const controls = seed.controls.filter((c) => !current.controls.some((row) => row.project === c.project));
    await inBatches(controls, (c) => {
      const pending = c.approvalStatus === 'Pending';
      const row = validate({
        project: c.project, name: c.name, phase: c.phase, frequency: c.frequency, includeInPush: c.includeInPush,
        nextPushDate: c.nextPushInDays === null ? undefined : inDays(c.nextPushInDays), note: c.note ?? undefined,
      });
      return backend.create('ProjectControl', {
        ...row, lastPushDate: c.lastPushDaysAgo === null ? undefined : inDays(-c.lastPushDaysAgo), lastPushStatus: c.lastPushStatus ?? undefined,
        approvalStatus: pending ? 'Pending' : 'Approved', requestedBy: SAMPLE, requestedAt: now,
        approvedBy: pending ? undefined : SAMPLE, approvedAt: pending ? undefined : now, createdAt: now, createdBy: myName(), user_id,
      });
    });
    const changes = seed.changes.filter((c) => !current.changes.some((row) => row.project === c.project && row.title === c.title));
    for (const c of changes) {
      const extra = c as { currentInDays?: number; proposedInDays?: number; milestone?: string; status?: string; decisionNote?: string; ageDays?: number };
      await createChange({
        project: c.project, title: c.title, description: c.description, category: c.category, discipline: c.discipline,
        priority: c.priority, milestone: extra.milestone,
        currentDate: extra.currentInDays === undefined ? undefined : inDays(extra.currentInDays),
        proposedDate: extra.proposedInDays === undefined ? undefined : inDays(extra.proposedInDays),
      }, { status: extra.status, decisionNote: extra.decisionNote, createdAt: extra.ageDays ? inDays(-extra.ageDays) : undefined });
    }
  }

  return {
    approvers, me, isApprover, load,
    updateEquipment, createFinding, setFindingStatus, deleteFinding,
    requestNewProject, requestChange, decide, approveSample, withdrawRequest, deleteControl,
    createChange, changeStatus, deleteChange, seedAll,
  };
}

export type Ops = ReturnType<typeof createOps>;
