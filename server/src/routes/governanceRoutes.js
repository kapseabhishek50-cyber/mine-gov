import { Router } from 'express';
import { z } from 'zod';
import { create, get, list, update } from '../config/database.js';
import { allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { audit } from '../services/auditService.js';
import { syncAlerts } from '../services/alertEngine.js';
import { refreshComplianceStatuses } from '../services/complianceEngine.js';
import { assertMineAccess, scopeItems } from '../utils/access.js';
import { HttpError } from '../utils/httpError.js';
import { parseBody } from '../utils/validate.js';

const router = Router();
const idField = z.string().min(1);
const dateField = z.string().min(4).refine((value) => Number.isFinite(Date.parse(value)), 'Enter a valid date.');
const coordinatesField = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) });
const evidence = z.array(z.object({ name: z.string().min(1).max(180), url: z.string().regex(/^\/api\/uploads\/files\/[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?$/, 'Evidence must reference an uploaded MineGov file.').optional(), uploadedAt: z.string().optional() })).default([]);
const mineSchema = z.object({
  name: z.string().min(2), code: z.string().min(2), state: z.string().min(2), district: z.string().min(2), location: z.string().min(2),
  coordinates: coordinatesField, mineType: z.string(), status: z.enum(['ACTIVE', 'INACTIVE', 'UNDER_REVIEW']).default('ACTIVE'),
});
const complianceSchema = z.object({
  title: z.string().min(4), category: z.enum(['Safety', 'Environment', 'Labour', 'Production', 'Documentation']), regulation: z.string().min(2),
  mineId: idField, department: z.string().min(2), assignedOfficer: idField.optional().or(z.literal('')),
  dueDate: dateField, priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum(['COMPLIANT', 'PENDING', 'UNDER_REVIEW', 'OVERDUE']), evidence, remarks: z.string().optional().default(''),
});
const inspectionSchema = z.object({
  mineId: idField, inspectionType: z.enum(['Safety', 'Environment', 'Labour', 'Production', 'Equipment', 'General']), inspectorId: idField.optional(),
  date: dateField, time: z.string().optional().default(''), coordinates: coordinatesField,
  observation: z.string().min(8), severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']), photos: evidence, documents: evidence,
  remarks: z.string().optional().default(''), status: z.string().optional().default('SUBMITTED'),
});
const violationSchema = z.object({
  mineId: idField, inspectionId: z.string().optional().or(z.literal('')), title: z.string().min(4), description: z.string().min(8),
  category: z.enum(['Safety', 'Environment', 'Labour', 'Production', 'Documentation', 'Equipment', 'General']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']), assignedOfficer: idField.optional().or(z.literal('')),
  deadline: dateField, status: z.enum(['OPEN', 'IN_PROGRESS', 'ACTION_SUBMITTED', 'VERIFICATION_PENDING', 'CLOSED', 'OVERDUE']).default('OPEN'), evidence,
});
const actionSchema = z.object({
  violationId: idField, description: z.string().min(8), assignedOfficer: idField.optional().or(z.literal('')),
  deadline: dateField, evidence, status: z.enum(['OPEN', 'IN_PROGRESS', 'SUBMITTED', 'REJECTED', 'OVERDUE']).default('OPEN'),
});

function filters(items, query) {
  const { mineId, status, category, priority, q } = query;
  return items.filter((item) => {
    if (mineId && String(item.mineId) !== String(mineId)) return false;
    if (status && status !== 'all' && item.status !== status) return false;
    if (category && category !== 'all' && (item.category || item.inspectionType) !== category) return false;
    if (priority && priority !== 'all' && item.priority !== priority) return false;
    if (query.due && item.dueDate) { const due = new Date(item.dueDate).getTime(); const now = Date.now(); if (query.due === 'overdue' && due >= now) return false; if (query.due === '7days' && (due < now || due > now + 7 * 86400000)) return false; if (query.due === '30days' && (due < now || due > now + 30 * 86400000)) return false; }
    if (q) {
      const haystack = Object.values(item).map((value) => typeof value === 'object' ? '' : String(value || '')).join(' ').toLowerCase();
      if (!haystack.includes(String(q).toLowerCase())) return false;
    }
    return true;
  });
}
function canReadMine(user, mineId) { assertMineAccess(user, mineId); }
async function requireMine(mineId) {
  const mine = await get('mines', mineId);
  if (!mine) throw new HttpError(404, 'Mine not found.');
  return mine;
}
async function validateAssignee(userId, mineId) {
  if (!userId) return;
  const assignee = await get('users', userId);
  if (!assignee || assignee.active === false) throw new HttpError(400, 'Select an active user for this assignment.');
  if (!['ADMIN', 'MINE_OFFICER', 'INSPECTOR'].includes(assignee.role)) throw new HttpError(400, 'Only an administrator, mine officer or inspector can own this record.');
  if (assignee.role !== 'ADMIN' && String(assignee.mineId || '') !== String(mineId)) throw new HttpError(400, 'The assigned user must belong to the same mine.');
}
async function auditChange(req, action, entity, record, oldValue = null) {
  await audit({ user: req.user, action, entity, entityId: record.id, oldValue, newValue: record, req });
}
async function refresh() { await syncAlerts(); }
function sortItems(items, query) {
  const sort = query.sort || 'updatedAt';
  const direction = query.order === 'asc' ? 1 : -1;
  return items.sort((a, b) => {
    const av = a[sort] ?? ''; const bv = b[sort] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
    return String(av).localeCompare(String(bv)) * direction;
  });
}

// Mines
router.get('/mines', asyncHandler(async (req, res) => {
  let items = scopeItems(req.user, await list('mines'), 'id');
  items = filters(items, req.query);
  if (req.query.state && req.query.state !== 'all') items = items.filter((item) => item.state === req.query.state);
  if (req.query.riskLevel && req.query.riskLevel !== 'all') items = items.filter((item) => item.riskLevel === req.query.riskLevel);
  res.json(sortItems(items, req.query));
}));
router.post('/mines', allowRoles('ADMIN'), asyncHandler(async (req, res) => {
  const input = parseBody(mineSchema, req.body);
  const duplicate = (await list('mines')).some((mine) => mine.code.toLowerCase() === input.code.toLowerCase());
  if (duplicate) throw new HttpError(409, 'A mine with this code already exists.');
  const item = await create('mines', { ...input, riskScore: 0, riskLevel: 'LOW', compliancePercentage: 0, riskFactors: [] });
  await auditChange(req, 'Created mine', 'Mine', item);
  await refresh();
  res.status(201).json(item);
}));
router.get('/mines/:id', asyncHandler(async (req, res) => {
  const item = await get('mines', req.params.id);
  if (!item) throw new HttpError(404, 'Mine not found.');
  canReadMine(req.user, item.id);
  const [compliances, inspections, violations, actions] = await Promise.all([list('compliances'), list('inspections'), list('violations'), list('actions')]);
  res.json({ ...item, overview: {
    complianceCount: compliances.filter((x) => String(x.mineId) === String(item.id)).length,
    inspectionCount: inspections.filter((x) => String(x.mineId) === String(item.id)).length,
    openViolations: violations.filter((x) => String(x.mineId) === String(item.id) && x.status !== 'CLOSED').length,
    openActions: actions.filter((x) => String(x.mineId) === String(item.id) && x.status !== 'VERIFIED').length,
  } });
}));
router.put('/mines/:id', allowRoles('ADMIN', 'MINE_OFFICER'), asyncHandler(async (req, res) => {
  const oldValue = await get('mines', req.params.id);
  if (!oldValue) throw new HttpError(404, 'Mine not found.');
  canReadMine(req.user, oldValue.id);
  const input = parseBody(mineSchema.partial(), req.body);
  const item = await update('mines', req.params.id, input);
  await auditChange(req, 'Updated mine', 'Mine', item, oldValue);
  await refresh();
  res.json(item);
}));

// Compliance
router.get('/compliances', asyncHandler(async (req, res) => {
  const changed = await refreshComplianceStatuses();
  if (changed.length) await syncAlerts();
  const items = filters(scopeItems(req.user, await list('compliances')), req.query);
  res.json(sortItems(items, req.query));
}));
router.post('/compliances', allowRoles('ADMIN', 'MINE_OFFICER'), asyncHandler(async (req, res) => {
  const input = parseBody(complianceSchema, req.body);
  canReadMine(req.user, input.mineId);
  await requireMine(input.mineId);
  await validateAssignee(input.assignedOfficer, input.mineId);
  const item = await create('compliances', { ...input, status: input.status === 'COMPLIANT' ? input.status : (new Date(input.dueDate) < new Date() ? 'OVERDUE' : input.status) });
  await auditChange(req, 'Created compliance requirement', 'Compliance', item);
  await refresh();
  res.status(201).json(item);
}));
router.get('/compliances/:id', asyncHandler(async (req, res) => {
  const item = await get('compliances', req.params.id);
  if (!item) throw new HttpError(404, 'Compliance record not found.');
  canReadMine(req.user, item.mineId);
  res.json(item);
}));
router.put('/compliances/:id', allowRoles('ADMIN', 'MINE_OFFICER'), asyncHandler(async (req, res) => {
  const oldValue = await get('compliances', req.params.id);
  if (!oldValue) throw new HttpError(404, 'Compliance record not found.');
  canReadMine(req.user, oldValue.mineId);
  const input = parseBody(complianceSchema.partial(), req.body);
  const nextMineId = input.mineId || oldValue.mineId;
  if (input.mineId) { canReadMine(req.user, input.mineId); await requireMine(input.mineId); }
  await validateAssignee(input.assignedOfficer !== undefined ? input.assignedOfficer : oldValue.assignedOfficer, nextMineId);
  let status = input.status ?? oldValue.status;
  const date = input.dueDate ?? oldValue.dueDate;
  if (status !== 'COMPLIANT' && date && new Date(date) < new Date()) status = 'OVERDUE';
  const item = await update('compliances', req.params.id, { ...input, status });
  await auditChange(req, 'Updated compliance', 'Compliance', item, oldValue);
  await refresh();
  res.json(item);
}));

// Inspections
router.get('/inspections', asyncHandler(async (req, res) => res.json(sortItems(filters(scopeItems(req.user, await list('inspections')), req.query), req.query))));
router.post('/inspections', allowRoles('ADMIN', 'MINE_OFFICER', 'INSPECTOR'), asyncHandler(async (req, res) => {
  const input = parseBody(inspectionSchema, req.body);
  canReadMine(req.user, input.mineId);
  await requireMine(input.mineId);
  const item = await create('inspections', { ...input, inspectorId: req.user.id, status: 'SUBMITTED' });
  await auditChange(req, 'Submitted inspection', 'Inspection', item);
  await refresh();
  res.status(201).json(item);
}));
router.get('/inspections/:id', asyncHandler(async (req, res) => {
  const item = await get('inspections', req.params.id);
  if (!item) throw new HttpError(404, 'Inspection not found.');
  canReadMine(req.user, item.mineId);
  const [mine, inspector] = await Promise.all([get('mines', item.mineId), get('users', item.inspectorId)]);
  res.json({ ...item, mineName: mine?.name, inspectorName: inspector?.name });
}));

// Violations
router.get('/violations', asyncHandler(async (req, res) => res.json(sortItems(filters(scopeItems(req.user, await list('violations')), req.query), req.query))));
router.post('/violations', allowRoles('ADMIN', 'MINE_OFFICER', 'INSPECTOR'), asyncHandler(async (req, res) => {
  const input = parseBody(violationSchema, req.body);
  if (input.status !== 'OPEN') throw new HttpError(400, 'A violation starts OPEN and can only be closed by verifying its corrective action.');
  canReadMine(req.user, input.mineId);
  await requireMine(input.mineId);
  if (input.inspectionId) {
    const inspection = await get('inspections', input.inspectionId);
    if (!inspection || String(inspection.mineId) !== String(input.mineId)) throw new HttpError(400, 'Select a valid inspection from the same mine.');
  }
  const assignedOfficer = input.assignedOfficer || req.user.id;
  await validateAssignee(assignedOfficer, input.mineId);
  const item = await create('violations', {
    ...input, assignedOfficer,
    activity: [{ label: 'Violation recorded from field inspection', by: req.user.name, at: new Date().toISOString() }],
  });
  await auditChange(req, 'Created violation', 'Violation', item);
  await refresh();
  res.status(201).json(item);
}));
router.get('/violations/:id', asyncHandler(async (req, res) => {
  const item = await get('violations', req.params.id);
  if (!item) throw new HttpError(404, 'Violation not found.');
  canReadMine(req.user, item.mineId);
  const [mine, inspection, officer, actions] = await Promise.all([get('mines', item.mineId), item.inspectionId ? get('inspections', item.inspectionId) : null, item.assignedOfficer ? get('users', item.assignedOfficer) : null, list('actions')]);
  res.json({ ...item, mineName: mine?.name, inspection, officerName: officer?.name, correctiveActions: actions.filter((action) => String(action.violationId) === String(item.id)) });
}));
router.put('/violations/:id', allowRoles('ADMIN', 'MINE_OFFICER'), asyncHandler(async (req, res) => {
  const oldValue = await get('violations', req.params.id);
  if (!oldValue) throw new HttpError(404, 'Violation not found.');
  canReadMine(req.user, oldValue.mineId);
  const input = parseBody(violationSchema.partial(), req.body);
  const nextMineId = input.mineId || oldValue.mineId;
  if (input.mineId) { canReadMine(req.user, input.mineId); await requireMine(input.mineId); }
  await validateAssignee(input.assignedOfficer !== undefined ? input.assignedOfficer : oldValue.assignedOfficer, nextMineId);
  const inspectionId = input.inspectionId !== undefined ? input.inspectionId : oldValue.inspectionId;
  if (inspectionId) {
    const inspection = await get('inspections', inspectionId);
    if (!inspection || String(inspection.mineId) !== String(nextMineId)) throw new HttpError(400, 'Select a valid inspection from the same mine.');
  }
  if (String(nextMineId) !== String(oldValue.mineId) && (await list('actions')).some((action) => String(action.violationId) === String(oldValue.id))) throw new HttpError(409, 'A violation with linked corrective actions cannot be moved to another mine.');
  if (input.status !== undefined) throw new HttpError(400, 'Violation status is managed by the corrective-action workflow.');
  const item = await update('violations', req.params.id, { ...input, activity: [...(oldValue.activity || []), { label: 'Violation details updated', by: req.user.name, at: new Date().toISOString() }] });
  await auditChange(req, 'Updated violation', 'Violation', item, oldValue);
  await refresh();
  res.json(item);
}));

// Corrective actions
router.get('/actions', asyncHandler(async (req, res) => {
  const [actions, violations, mines] = await Promise.all([list('actions'), list('violations'), list('mines')]);
  const rows = filters(scopeItems(req.user, actions), req.query).map((action) => ({ ...action, mineName: mines.find((mine) => String(mine.id) === String(action.mineId))?.name, violationTitle: violations.find((violation) => String(violation.id) === String(action.violationId))?.title }));
  res.json(sortItems(rows, req.query));
}));
router.post('/actions', allowRoles('ADMIN', 'MINE_OFFICER'), asyncHandler(async (req, res) => {
  const input = parseBody(actionSchema, req.body);
  const violation = await get('violations', input.violationId);
  if (!violation) throw new HttpError(404, 'The selected violation was not found.');
  if (violation.status === 'CLOSED') throw new HttpError(409, 'A corrective action cannot be assigned to a closed violation.');
  canReadMine(req.user, violation.mineId);
  const assignedOfficer = input.assignedOfficer || violation.assignedOfficer || req.user.id;
  await validateAssignee(assignedOfficer, violation.mineId);
  const item = await create('actions', { ...input, mineId: violation.mineId, assignedOfficer, status: 'OPEN' });
  await update('violations', violation.id, { status: 'IN_PROGRESS', activity: [...(violation.activity || []), { label: 'Corrective action assigned', by: req.user.name, at: new Date().toISOString() }] });
  await auditChange(req, 'Assigned corrective action', 'CorrectiveAction', item);
  await refresh();
  res.status(201).json(item);
}));
router.get('/actions/:id', asyncHandler(async (req, res) => {
  const item = await get('actions', req.params.id);
  if (!item) throw new HttpError(404, 'Corrective action not found.');
  canReadMine(req.user, item.mineId);
  const [violation, officer, verifier, mine] = await Promise.all([get('violations', item.violationId), get('users', item.assignedOfficer), item.verifiedBy ? get('users', item.verifiedBy) : null, get('mines', item.mineId)]);
  res.json({ ...item, mineName: mine?.name, violation: violation ? { ...violation, mineName: mine?.name } : null, officerName: officer?.name, verifierName: verifier?.name });
}));
router.put('/actions/:id', allowRoles('ADMIN', 'MINE_OFFICER', 'INSPECTOR'), asyncHandler(async (req, res) => {
  const oldValue = await get('actions', req.params.id);
  if (!oldValue) throw new HttpError(404, 'Corrective action not found.');
  canReadMine(req.user, oldValue.mineId);
  const input = parseBody(actionSchema.partial(), req.body);
  await validateAssignee(input.assignedOfficer !== undefined ? input.assignedOfficer : oldValue.assignedOfficer, oldValue.mineId);
  if (input.violationId && String(input.violationId) !== String(oldValue.violationId)) throw new HttpError(400, 'A corrective action stays linked to its source violation.');
  if (['SUBMITTED', 'VERIFIED'].includes(oldValue.status)) throw new HttpError(409, 'This submitted action is awaiting an authorized verification decision.');
  if (input.status && !['IN_PROGRESS', 'SUBMITTED'].includes(input.status)) throw new HttpError(400, 'Action status is managed by assignment, verification and deadline workflows.');
  let status = input.status ?? oldValue.status;
  if (input.deadline && new Date(input.deadline) < new Date() && !['SUBMITTED', 'VERIFIED'].includes(status)) status = 'OVERDUE';
  if (status === 'SUBMITTED' && !(input.evidence || oldValue.evidence || []).length) throw new HttpError(400, 'Upload at least one evidence file before submitting for verification.');
  const item = await update('actions', req.params.id, { ...input, status, ...(status === 'SUBMITTED' ? { submittedAt: new Date().toISOString() } : {}) });
  const violation = await get('violations', item.violationId);
  if (violation && status === 'SUBMITTED') await update('violations', violation.id, { status: 'VERIFICATION_PENDING', activity: [...(violation.activity || []), { label: 'Corrective evidence submitted for verification', by: req.user.name, at: new Date().toISOString() }] });
  if (violation && status === 'IN_PROGRESS') await update('violations', violation.id, { status: 'IN_PROGRESS' });
  await auditChange(req, 'Updated corrective action', 'CorrectiveAction', item, oldValue);
  await refresh();
  res.json(item);
}));
router.post('/actions/:id/verify', allowRoles('ADMIN', 'MINE_OFFICER'), asyncHandler(async (req, res) => {
  const action = await get('actions', req.params.id);
  if (!action) throw new HttpError(404, 'Corrective action not found.');
  canReadMine(req.user, action.mineId);
  if (action.status !== 'SUBMITTED') throw new HttpError(409, 'Only actions submitted with evidence can be verified.');
  if (!(action.evidence || []).length) throw new HttpError(400, 'Evidence is required before verification.');
  const approved = req.body?.approved !== false;
  const note = String(req.body?.note || (approved ? 'Evidence verified.' : 'Evidence requires further work.')).slice(0, 500);
  const status = approved ? 'VERIFIED' : 'REJECTED';
  const updatedAction = await update('actions', action.id, { status, verifiedBy: req.user.id, verifiedAt: new Date().toISOString(), verificationNote: note });
  const violation = await get('violations', action.violationId);
  let updatedViolation = violation;
  if (violation) {
    const nextStatus = approved ? 'CLOSED' : 'IN_PROGRESS';
    updatedViolation = await update('violations', violation.id, { status: nextStatus, activity: [...(violation.activity || []), { label: approved ? 'Corrective action verified · violation closed' : 'Evidence rejected · further action required', by: req.user.name, at: new Date().toISOString(), note }] });
  }
  await auditChange(req, approved ? 'Verified corrective action' : 'Rejected corrective evidence', 'CorrectiveAction', updatedAction, action);
  await refresh();
  res.json({ action: updatedAction, violation: updatedViolation });
}));

// User directory for assignments. Password hashes are never returned.
router.get('/users', asyncHandler(async (req, res) => {
  let users = await list('users');
  if (!['ADMIN', 'MANAGEMENT'].includes(req.user.role)) users = users.filter((user) => !user.mineId || String(user.mineId) === String(req.user.mineId));
  res.json(users.map(({ passwordHash, password: _password, ...user }) => user));
}));
router.post('/users', allowRoles('ADMIN'), asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().min(2).max(100), email: z.string().email().max(254), password: z.string().min(10).max(72), role: z.enum(['ADMIN', 'MINE_OFFICER', 'INSPECTOR', 'MANAGEMENT']), mineId: z.string().optional(), department: z.string().optional() });
  const input = parseBody(schema, req.body);
  const bcrypt = await import('bcryptjs');
  const exists = (await list('users')).some((user) => user.email.toLowerCase() === input.email.toLowerCase());
  if (exists) throw new HttpError(409, 'An account with this email already exists.');
  const { password, ...userValues } = input;
  if (!userValues.mineId) delete userValues.mineId;
  if (userValues.mineId) await requireMine(userValues.mineId);
  if (['MINE_OFFICER', 'INSPECTOR'].includes(userValues.role) && !userValues.mineId) throw new HttpError(400, 'Assign a mine to every mine officer and inspector account.');
  const item = await create('users', { ...userValues, passwordHash: await bcrypt.default.hash(password, 10), active: true });
  const { passwordHash: _hash, password: _plain, ...safe } = item;
  await auditChange(req, 'Created user', 'User', safe);
  res.status(201).json(safe);
}));
router.put('/users/:id', allowRoles('ADMIN'), asyncHandler(async (req, res) => {
  const oldUser = await get('users', req.params.id);
  if (!oldUser) throw new HttpError(404, 'User account not found.');
  const schema = z.object({ name: z.string().min(2).max(100).optional(), role: z.enum(['ADMIN', 'MINE_OFFICER', 'INSPECTOR', 'MANAGEMENT']).optional(), mineId: z.string().nullable().optional(), department: z.string().optional(), active: z.boolean().optional(), newPassword: z.string().min(10).max(72).optional() });
  const input = parseBody(schema, req.body);
  const { newPassword, ...values } = input;
  if (values.mineId === '') values.mineId = null;
  const nextRole = values.role || oldUser.role;
  const nextMineId = values.mineId !== undefined ? values.mineId : oldUser.mineId;
  if (nextMineId) await requireMine(nextMineId);
  if (['MINE_OFFICER', 'INSPECTOR'].includes(nextRole) && !nextMineId) throw new HttpError(400, 'Assign a mine to every mine officer and inspector account.');
  if (newPassword) { const bcrypt = await import('bcryptjs'); values.passwordHash = await bcrypt.default.hash(newPassword, 10); }
  const updated = await update('users', oldUser.id, values);
  const { passwordHash: _hash, password: _plain, ...safeUpdated } = updated;
  const { passwordHash: _oldHash, password: _oldPlain, ...safeOld } = oldUser;
  await auditChange(req, 'Updated user access', 'User', safeUpdated, safeOld);
  res.json(safeUpdated);
}));

// Alerts and audit trail
router.get('/alerts', asyncHandler(async (req, res) => {
  const [allAlerts, mines] = await Promise.all([list('alerts'), list('mines')]);
  let items = scopeItems(req.user, allAlerts).map((alert) => ({ ...alert, mineName: mines.find((mine) => String(mine.id) === String(alert.mineId))?.name }));
  if (req.query.mineId) items = items.filter((item) => String(item.mineId) === String(req.query.mineId));
  if (req.query.read === 'false') items = items.filter((item) => !item.read);
  if (req.query.read === 'true') items = items.filter((item) => item.read);
  if (req.query.severity && req.query.severity !== 'all') items = items.filter((item) => item.severity === req.query.severity);
  res.json(items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
}));
router.put('/alerts/:id/read', asyncHandler(async (req, res) => {
  const alert = await get('alerts', req.params.id);
  if (!alert) throw new HttpError(404, 'Alert not found.');
  canReadMine(req.user, alert.mineId);
  const item = await update('alerts', alert.id, { read: true });
  await auditChange(req, 'Marked alert as read', 'Alert', item, alert);
  res.json(item);
}));
router.put('/alerts/read-all', asyncHandler(async (req, res) => {
  const items = scopeItems(req.user, await list('alerts'));
  for (const alert of items.filter((item) => !item.read)) await update('alerts', alert.id, { read: true });
  res.json({ updated: items.filter((item) => !item.read).length });
}));
router.get('/audit-logs', allowRoles('ADMIN'), asyncHandler(async (req, res) => {
  const items = await list('auditLogs');
  res.json(items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 500));
}));

export default router;
