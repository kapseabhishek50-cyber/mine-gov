import { create, list, update } from '../config/database.js';
import { refreshComplianceStatuses } from './complianceEngine.js';
import { recalculateAll } from './riskEngine.js';

const hoursTo = (date) => (new Date(date).getTime() - Date.now()) / 3600000;

async function emitOnce({ type, severity, mineId, entityType, entityId, message }) {
  const existing = await list('alerts');
  if (existing.some((alert) => alert.type === type && String(alert.entityId) === String(entityId))) return null;
  return create('alerts', { type, severity, mineId, entityType, entityId: String(entityId), message, read: false });
}

export async function refreshDeadlines() {
  const now = Date.now();
  const [compliances, violations, actions] = await Promise.all([list('compliances'), list('violations'), list('actions')]);
  for (const item of compliances) {
    if (item.status !== 'COMPLIANT' && item.dueDate && new Date(item.dueDate).getTime() < now && item.status !== 'OVERDUE') {
      await update('compliances', item.id, { status: 'OVERDUE' });
    }
  }
  for (const item of violations) {
    if (item.status !== 'CLOSED' && item.deadline && new Date(item.deadline).getTime() < now && item.status !== 'OVERDUE') {
      await update('violations', item.id, { status: 'OVERDUE' });
    }
  }
  for (const item of actions) {
    if (!['VERIFIED', 'SUBMITTED'].includes(item.status) && item.deadline && new Date(item.deadline).getTime() < now && item.status !== 'OVERDUE') {
      await update('actions', item.id, { status: 'OVERDUE' });
    }
  }
}

export async function syncAlerts({ recalculate = true } = {}) {
  await refreshDeadlines();
  await refreshComplianceStatuses();
  if (recalculate) await recalculateAll();
  const [compliances, violations, actions, mines] = await Promise.all([list('compliances'), list('violations'), list('actions'), list('mines')]);
  for (const item of compliances) {
    const hours = item.dueDate ? hoursTo(item.dueDate) : Infinity;
    if (item.status === 'OVERDUE') await emitOnce({ type: 'COMPLIANCE_OVERDUE', severity: 'HIGH', mineId: item.mineId, entityType: 'compliance', entityId: item.id, message: `“${item.title}” is past due and needs evidence or an updated review.` });
    else if (item.status !== 'COMPLIANT' && hours >= 0 && hours <= 72) await emitOnce({ type: 'DEADLINE_APPROACHING', severity: 'MEDIUM', mineId: item.mineId, entityType: 'compliance', entityId: item.id, message: `“${item.title}” is due within 72 hours.` });
  }
  for (const item of violations) {
    if (item.severity === 'CRITICAL' && item.status !== 'CLOSED') await emitOnce({ type: 'CRITICAL_VIOLATION', severity: 'CRITICAL', mineId: item.mineId, entityType: 'violation', entityId: item.id, message: `Critical violation “${item.title}” requires immediate attention.` });
    const hours = item.deadline ? hoursTo(item.deadline) : Infinity;
    if (item.status !== 'CLOSED' && hours >= 0 && hours <= 72) await emitOnce({ type: 'VIOLATION_DEADLINE', severity: 'HIGH', mineId: item.mineId, entityType: 'violation', entityId: item.id, message: `Deadline approaching for “${item.title}”.` });
  }
  for (const item of actions) {
    if (item.status === 'OVERDUE') await emitOnce({ type: 'ACTION_OVERDUE', severity: 'CRITICAL', mineId: item.mineId, entityType: 'action', entityId: item.id, message: 'Corrective action is overdue and needs escalation.' });
  }
  for (const mine of mines) {
    if ((mine.riskScore || 0) >= 61) await emitOnce({ type: 'HIGH_RISK_MINE', severity: mine.riskScore >= 81 ? 'CRITICAL' : 'HIGH', mineId: mine.id, entityType: 'mine', entityId: mine.id, message: `${mine.name} is rated ${mine.riskLevel} with a risk score of ${mine.riskScore}.` });
  }
  const categoryMap = new Map();
  for (const item of violations.filter((entry) => entry.status !== 'CLOSED')) {
    const key = `${item.mineId}:${item.category}`;
    categoryMap.set(key, (categoryMap.get(key) || 0) + 1);
  }
  for (const [key, count] of categoryMap.entries()) {
    if (count < 2) continue;
    const [mineId, category] = key.split(':');
    await emitOnce({ type: 'REPEATED_VIOLATION', severity: 'HIGH', mineId, entityType: 'mine', entityId: `${mineId}:${category}`, message: `${count} open ${category.toLowerCase()} violations are recorded at this mine.` });
  }
  return list('alerts');
}
