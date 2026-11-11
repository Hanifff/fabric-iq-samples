import { date, entity, int, role, text, uuid } from '@microsoft/rayfin-core';
import { isApprover } from './approvers.js';

// Equipment register per site (synthetic tags), linked to a part of the site's 3D model.
// Everyone signed in can read it and record condition and progress (writeback from the
// 3D view), but cannot change which tag, site or part a row is; only named approvers add
// or remove equipment. Enforced by the app's data API.
@entity()
@role('authenticated', 'read')
@role('authenticated', 'create', { policy: (claims) => isApprover(claims) })
@role('authenticated', 'update', {
  include: ['status', 'health', 'progress', 'lastInspection', 'note', 'updatedAt', 'updatedBy'],
})
@role('authenticated', 'delete', { policy: (claims) => isApprover(claims) })
export class EquipmentItem {
  @uuid() id!: string;
  @text({ min: 1, max: 32 }) tag!: string;
  @text({ min: 1, max: 120 }) name!: string;
  @text({ min: 1, max: 48 }) equipmentClass!: string;
  @text({ min: 1, max: 16 }) siteCode!: string;
  @text({ max: 64, optional: true }) project?: string;
  // The part of the 3D model this tag is drawn as (for example XT2 or M23).
  @text({ min: 1, max: 24 }) slot!: string;
  @text({ max: 48, optional: true }) system?: string;
  @text({ min: 1, max: 24 }) status!: string;
  @text({ max: 16, optional: true }) health?: string;
  @int({ min: 0, max: 100 }) progress!: number;
  // Planned completion or installation date; drives the 4D view.
  @date({ optional: true }) plannedDate?: Date;
  @date({ optional: true }) lastInspection?: Date;
  @text({ max: 4, optional: true }) criticality?: string;
  @text({ max: 300, optional: true }) note?: string;
  @date() createdAt!: Date;
  @text({ max: 120 }) createdBy!: string;
  @date({ optional: true }) updatedAt?: Date;
  @text({ max: 120, optional: true }) updatedBy?: string;
  @text() user_id!: string;
}
