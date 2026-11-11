import seed from './seed.json';

// Sites shown in 3D: the installations from the semantic models' source data plus three yards.
export type SiteInfo = {
  code: string;
  name: string;
  kind: string;
  model: string;
  type: string;
  country: string;
  waterDepth?: number;
  operator?: string;
  project?: string | null;
  projectName?: string | null;
  town?: string;
};
export const SITES: SiteInfo[] = seed.sites;
export const siteByCode = (code?: string | null) => SITES.find((site) => site.code === code);
export const siteOfProject = (project?: string) => SITES.find((site) => site.project === project);

export const equipmentStatuses = ['Planned', 'Fabrication', 'Installed', 'Operating', 'Out of service'];
export const healthLevels = ['OK', 'Watch', 'Action'];
export const severities = ['Info', 'Watch', 'Action'];
export const findingStatuses = ['Open', 'Closed'];
export const phases = ['Study', 'Execution', 'Completion'];
export const frequencies = ['Weekly', 'Bi-weekly', 'Monthly'];
export const pushStatuses = ['Succeeded', 'Failed', 'Skipped'];
export const categories = ['Milestone change', 'Cut-off correction', 'Data quality', 'Mapping update'];
export const changeStatuses = ['Open', 'In review', 'Approved', 'Rejected'];
export const decisionStatuses = ['Approved', 'Rejected'];
export const priorities = ['Low', 'Medium', 'High'];
export const disciplines = ['Engineering', 'Procurement', 'Fabrication', 'Installation', 'Commissioning'];

export const healthColors: Record<string, string> = { OK: '#10b981', Watch: '#f59e0b', Action: '#e11d48' };
export const severityColors: Record<string, string> = { Info: '#0ea5e9', Watch: '#f59e0b', Action: '#e11d48' };
export const noDataColor = '#94a3b8';

// `mine` is derived from the creator's user id; the id itself never reaches the screens.
export type Equipment = {
  id: string;
  tag: string;
  name: string;
  equipmentClass: string;
  siteCode: string;
  project?: string;
  slot: string;
  system?: string;
  status: string;
  health?: string;
  progress: number;
  plannedDate?: Date;
  lastInspection?: Date;
  criticality?: string;
  note?: string;
  updatedAt?: Date;
  updatedBy?: string;
  mine: boolean;
};

export type FindingRow = {
  id: string;
  siteCode: string;
  tag?: string;
  x: number;
  y: number;
  z: number;
  title: string;
  severity: string;
  status: string;
  createdBy: string;
  createdAt: Date;
  closedBy?: string;
  closedAt?: Date;
  mine: boolean;
};

export type Control = {
  id: string;
  project: string;
  name: string;
  phase: string;
  includeInPush: boolean;
  frequency: string;
  nextPushDate?: Date;
  lastPushDate?: Date;
  lastPushStatus?: string;
  approvalStatus: string;
  requestedBy?: string;
  approvedBy?: string;
  note?: string;
  mine: boolean;
};

export type Request = {
  id: string;
  controlId?: string;
  project: string;
  name: string;
  phase: string;
  includeInPush: boolean;
  frequency: string;
  nextPushDate?: Date;
  note?: string;
  status: string;
  requestedBy: string;
  requestedAt: Date;
  decidedBy?: string;
  decidedAt?: Date;
  decisionNote?: string;
  mine: boolean;
};

export type Change = {
  id: string;
  project: string;
  title: string;
  description: string;
  category: string;
  status: string;
  milestone?: string;
  discipline?: string;
  priority?: string;
  currentDate?: Date;
  proposedDate?: Date;
  decisionNote?: string;
  createdAt: Date;
  createdBy?: string;
  updatedAt?: Date;
  updatedBy?: string;
  mine: boolean;
};

export type OpsData = {
  equipment: Equipment[];
  findings: FindingRow[];
  controls: Control[];
  requests: Request[];
  changes: Change[];
};
