import { date, entity, role, text, uuid } from '@microsoft/rayfin-core';

// Planning change requests (synthetic). One row = one requested change to planning data.
// Shared team register: everyone with access to the Fabric app can read, create and
// review rows (status and decision note only); only the person who created a row can
// delete it. The update field list keeps the creator columns out of reach.
@entity()
@role('authenticated', 'create')
@role('authenticated', 'read')
@role('authenticated', 'update', { include: ['status', 'decisionNote', 'updatedAt', 'updatedBy'] })
@role('authenticated', 'delete', {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class PlanningChange {
  @uuid() id!: string;
  @text({ min: 1, max: 64 }) project!: string;
  @text({ min: 1, max: 120 }) title!: string;
  @text({ min: 1, max: 500 }) description!: string;
  @text({ min: 1, max: 32 }) category!: string;
  @text({ min: 1, max: 32 }) status!: string;
  @date() createdAt!: Date;
  @text() user_id!: string;
  // Added for the planning-admin scenario. Optional so existing rows stay valid
  // and the schema change is additive (no --force, no data loss).
  @text({ max: 64, optional: true }) milestone?: string;
  @text({ max: 32, optional: true }) discipline?: string;
  @text({ max: 16, optional: true }) priority?: string;
  @date({ optional: true }) currentDate?: Date;
  @date({ optional: true }) proposedDate?: Date;
  @text({ max: 300, optional: true }) decisionNote?: string;
  @text({ max: 120, optional: true }) createdBy?: string;
  @date({ optional: true }) updatedAt?: Date;
  @text({ max: 120, optional: true }) updatedBy?: string;
}
