import { authenticated, date, entity, text, uuid } from '@microsoft/rayfin-core';

/**
 * An improvement idea captured in the app. Every signed-in user can read all
 * ideas and move them through the review states; only the author can delete.
 */
@entity()
@authenticated('read')
@authenticated('create', {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
@authenticated('update', { include: ['status', 'updatedAt'] })
@authenticated('delete', {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class Idea {
  @uuid() id!: string;
  @text({ min: 3, max: 120 }) title!: string;
  @text({ max: 1000, optional: true }) description?: string;
  @text({ max: 40 }) category!: string;
  @text({ max: 20 }) status!: string;
  @text({ max: 200 }) authorName!: string;
  @text({ max: 128 }) user_id!: string;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
}
