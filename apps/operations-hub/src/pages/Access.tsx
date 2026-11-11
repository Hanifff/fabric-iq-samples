import type { ReactNode } from 'react';

import { Badge, PageHeader, Panel } from '@/components/kit/Panel';
import { useOps } from '@/ops/OpsContext';

const yes = <Badge tone="emerald">Yes</Badge>;
const no = <Badge tone="rose">No</Badge>;
const own = <Badge>Own rows</Badge>;

/** Who can do what, and the three places that decide it. */
export function Access() {
  const ops = useOps();
  const approver = ops.isApprover();
  const rows: [string, ReactNode, string][] = [
    ['See dashboards, assets and approvals', yes, 'Everyone with app access'],
    ['Read semantic model data', yes, 'Your own access to the model'],
    ['Request a push change or a project', yes, 'Everyone, in own name'],
    ['Approve or reject', approver ? yes : no, 'Named approvers, not own requests'],
    ['Record condition and progress', yes, 'Everyone'],
    ['Pin, close or reopen findings', yes, 'Everyone, in own name'],
    ['Delete a change or finding', own, 'Only its creator'],
    ['Load sample data, remove projects', approver ? yes : no, 'Named approvers'],
  ];
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Security" title="Who can do what" description={`${ops.me().email}: ${approver ? 'approver' : 'planner'}`} />
      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr_1fr]">
        <Panel title="1 · Open the app">
          <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
            <li>Fabric item permission</li>
            <li>Share with people or an Entra group</li>
            <li>No access to the rest of the workspace</li>
          </ul>
        </Panel>
        <Panel title="2 · Inside the app" subtitle="Rules in code, checked by the data API">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="py-1.5 pr-2">Action</th><th className="pr-2">You</th><th>Rule</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(([action, you, rule]) => <tr key={action}><td className="py-1.5 pr-2">{action}</td><td className="pr-2">{you}</td><td className="text-slate-600">{rule}</td></tr>)}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-500">Approvers: {ops.approvers.length ? ops.approvers.join(', ') : 'none configured'}. Entra groups do not reach these rules today.</p>
        </Panel>
        <Panel title="3 · Outside the app">
          <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
            <li>Workspace roles can read every table</li>
            <li>SQL roles narrow direct queries, not the app</li>
            <li>Semantic models keep their own permissions</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
