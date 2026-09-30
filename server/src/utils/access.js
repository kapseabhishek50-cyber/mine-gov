import { HttpError } from './httpError.js';

export const isGlobalRole = (role) => ['ADMIN', 'MANAGEMENT'].includes(role);
export function assertMineAccess(user, mineId) {
  if (isGlobalRole(user.role)) return;
  if (!mineId || String(user.mineId) !== String(mineId)) throw new HttpError(403, 'This record is outside your assigned mine.');
}
export function scopeItems(user, items, mineKey = 'mineId') {
  if (isGlobalRole(user.role)) return items;
  return items.filter((item) => String(item[mineKey] || item.id) === String(user.mineId));
}
export function requestedMineId(user, queryMineId) {
  if (queryMineId) assertMineAccess(user, queryMineId);
  if (!isGlobalRole(user.role)) return user.mineId;
  return queryMineId || null;
}
