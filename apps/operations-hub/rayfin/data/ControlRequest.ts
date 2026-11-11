import { boolean, date, entity, role, text, uuid } from '@microsoft/rayfin-core';
import { isApprover } from './approvers.js';

// A request to add a project to the processing control, or to change whether and when
// it is pushed (synthetic). Planners create requests; approvers decide them.
// All rules below are enforced by the app's data API, not only in the screen.
@entity()
@role('authenticated', 'read')
// You can only file a request in your own name, and only as Pending.
@role('authenticated', 'create', {
  policy: (claims, item) => claims.email.eq(item.requestedBy).and(item.status.eq('Pending')),
})
// Only named approvers decide, and never on their own request (four-eyes). They can set
// the decision only, not change what was requested or by whom.
@role('authenticated', 'update', {
  policy: (claims, item) => isApprover(claims).and(claims.email.neq(item.requestedBy)),
  include: ['status', 'decidedBy', 'decidedAt', 'decisionNote'],
})
// The requester can withdraw their own request.
@role('authenticated', 'delete', {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class ControlRequest {
  @uuid() id!: string;
  @text({ max: 64, optional: true }) controlId?: string;
  @text({ min: 1, max: 64 }) project!: string;
  @text({ min: 1, max: 120 }) name!: string;
  @text({ min: 1, max: 32 }) phase!: string;
  @boolean() includeInPush!: boolean;
  @text({ min: 1, max: 16 }) frequency!: string;
  @date({ optional: true }) nextPushDate?: Date;
  @text({ max: 300, optional: true }) note?: string;
  @text({ min: 1, max: 16 }) status!: string;
  @text({ min: 1, max: 120 }) requestedBy!: string;
  @date() requestedAt!: Date;
  @text({ max: 120, optional: true }) decidedBy?: string;
  @date({ optional: true }) decidedAt?: Date;
  @text({ max: 300, optional: true }) decisionNote?: string;
  @text() user_id!: string;
}
