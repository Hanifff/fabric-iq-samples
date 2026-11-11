import { authenticated, date, entity, text, uuid } from '@microsoft/rayfin-core';

/**
 * One vote by one user on one idea. `voteKey` is `<ideaId>:<userId>` and is
 * unique, so the database rejects a second vote from the same user.
 */
@entity()
@authenticated('read')
@authenticated(['create', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.user_id),
})
export class IdeaVote {
  @uuid() id!: string;
  @text({ max: 64 }) ideaId!: string;
  @text({ max: 200, unique: true }) voteKey!: string;
  @text({ max: 128 }) user_id!: string;
  @date() createdAt!: Date;
}
