import { create } from '../config/database.js';

export async function audit({ user, action, entity, entityId, oldValue = null, newValue = null, req }) {
  return create('auditLogs', {
    userId: user?.id || null,
    userName: user?.name || 'System',
    action,
    entity,
    entityId: String(entityId || ''),
    oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
    newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
    ipAddress: req?.ip || '',
  });
}
