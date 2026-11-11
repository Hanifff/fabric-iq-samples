import { boolean, date, entity, role, text, uuid } from '@microsoft/rayfin-core';
import { isApprover } from './approvers.js';

// Project processing control (synthetic). One row per project: is the project included
// in the planning-data push, how often, and when is the next push. These are the approved
// settings a push job would read. Everyone signed in can read them; only named approvers
// can add, change or remove rows. Planners file a ControlRequest instead.
// Enforced by the app's data API, not only in the screen.
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', { policy: (claims) => isApprover(claims) })
@role('authenticated', 'update', { policy: (claims) => isApprover(claims) })
@role('authenticated', 'delete', { policy: (claims) => isApprover(claims) })
export class ProjectControl {
  @uuid() id!: string;
  @text({ min: 1, max: 64 }) project!: string;
  @text({ min: 1, max: 120 }) name!: string;
  @text({ min: 1, max: 32 }) phase!: string;
  @boolean() includeInPush!: boolean;
  @text({ min: 1, max: 16 }) frequency!: string;
  @date({ optional: true }) nextPushDate?: Date;
  @date({ optional: true }) lastPushDate?: Date;
  @text({ max: 16, optional: true }) lastPushStatus?: string;
  @text({ min: 1, max: 16 }) approvalStatus!: string;
  @text({ max: 120, optional: true }) requestedBy?: string;
  @date({ optional: true }) requestedAt?: Date;
  @text({ max: 120, optional: true }) approvedBy?: string;
  @date({ optional: true }) approvedAt?: Date;
  @text({ max: 300, optional: true }) note?: string;
  @date() createdAt!: Date;
  @text({ max: 120 }) createdBy!: string;
  @text() user_id!: string;
}
