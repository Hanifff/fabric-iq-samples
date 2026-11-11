import { date, decimal, entity, role, text, uuid } from '@microsoft/rayfin-core';

// A finding pinned to a point on a site's 3D model (synthetic). Enforced by the app's
// data API, not only in the screen.
@entity()
@role('authenticated', 'read')
// You can only record a finding in your own name, and only as Open.
@role('authenticated', 'create', {
  policy: (claims, item) => claims.email.eq(item.createdBy).and(claims.sub.eq(item.user_id)).and(item.status.eq('Open')),
})
// Anyone signed in can close or reopen a finding; nothing else can be changed, so the
// author and owner cannot be rewritten to get around the delete rule.
@role('authenticated', 'update', { include: ['status', 'closedBy', 'closedAt'] })
// Only the person who recorded a finding can delete it.
@role('authenticated', 'delete', {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class Finding {
  @uuid() id!: string;
  @text({ min: 1, max: 16 }) siteCode!: string;
  @text({ max: 32, optional: true }) tag?: string;
  // Position on the 3D model, in model coordinates (metres).
  @decimal({ precision: 9, scale: 3 }) x!: number;
  @decimal({ precision: 9, scale: 3 }) y!: number;
  @decimal({ precision: 9, scale: 3 }) z!: number;
  @text({ min: 1, max: 120 }) title!: string;
  @text({ min: 1, max: 16 }) severity!: string;
  @text({ min: 1, max: 16 }) status!: string;
  @text({ min: 1, max: 120 }) createdBy!: string;
  @date() createdAt!: Date;
  @text({ max: 120, optional: true }) closedBy?: string;
  @date({ optional: true }) closedAt?: Date;
  @text() user_id!: string;
}
