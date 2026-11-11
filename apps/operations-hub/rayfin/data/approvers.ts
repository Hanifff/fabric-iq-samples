import type { ClaimsDsl, PolicyExpression } from '@microsoft/rayfin-core';

// Approvers are named people, set per environment at deploy time (rayfin/.env locally,
// a GitHub environment variable in CI). Fabric App tokens carry no Entra groups or app
// roles, so data rules can only check who the user is (e-mail or user id).
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export const approverEmails = (env.RAYFIN_PUBLIC_APPROVERS ?? '')
  .split(/[\s,;]+/)
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

// No approvers configured means nobody can approve: the safe default.
export function isApprover(claims: ClaimsDsl): PolicyExpression {
  const list = approverEmails.length ? approverEmails : ['no-approver-configured@example.invalid'];
  return list.map((email) => claims.email.eq(email)).reduce((all, next) => all.or(next));
}
