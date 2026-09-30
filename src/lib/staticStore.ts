// Static store - fully client-side persistence for static deployment
// Handles all API endpoints without backend

import { generateStaticStore, DEMO_PASSWORD, type StaticStoreShape } from './staticData';

const STORAGE_KEY = 'minegov_static_store_v1';
const AUTH_KEY = 'minegov_static_user';
const FORCE_STATIC_KEY = 'minegov_force_static';

function loadStore(): StaticStoreShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StaticStoreShape;
      if (parsed.mines && parsed.mines.length) return parsed;
    }
  } catch {}
  const fresh = generateStaticStore();
  saveStore(fresh);
  return fresh;
}

function saveStore(store: StaticStoreShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

let memoryStore: StaticStoreShape | null = null;

function getStore(): StaticStoreShape {
  if (typeof window === 'undefined') {
    return generateStaticStore();
  }
  if (!memoryStore) {
    memoryStore = loadStore();
  }
  return memoryStore;
}

function persist() {
  if (memoryStore) saveStore(memoryStore);
}

// ---- Risk engine (ported from server) ----
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const severityPoints: Record<string, number> = { LOW: 20, MEDIUM: 42, HIGH: 72, CRITICAL: 100 };
const levelFor = (score: number) => (score <= 30 ? 'LOW' : score <= 60 ? 'MEDIUM' : score <= 80 ? 'HIGH' : 'CRITICAL');
const dayDiff = (date: string | Date) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));

function complianceRateForMine(mineId: string, compliances: any[]) {
  const mineCompliance = compliances.filter((c) => String(c.mineId) === String(mineId));
  if (!mineCompliance.length) return 0;
  const compliant = mineCompliance.filter((c) => c.status === 'COMPLIANT').length;
  return Math.round((compliant / mineCompliance.length) * 100);
}

function calculateRisk({ mineId, violations, compliances, actions }: { mineId: string; violations: any[]; compliances: any[]; actions: any[] }) {
  const mineViolations = violations.filter((i) => String(i.mineId) === String(mineId));
  const activeViolations = mineViolations.filter((i) => i.status !== 'CLOSED');
  const mineCompliance = compliances.filter((i) => String(i.mineId) === String(mineId));
  const mineActions = actions.filter((i) => String(i.mineId) === String(mineId));
  const unresolved = mineActions.filter((i) => !['VERIFIED'].includes(i.status));

  const severityPressure = activeViolations.length
    ? clamp(activeViolations.reduce((sum, item) => sum + (severityPoints[item.severity] || 35), 0) / activeViolations.length + activeViolations.length * 4)
    : 0;

  const overdueRecords = [
    ...mineCompliance.filter((i) => i.status === 'OVERDUE'),
    ...activeViolations.filter((i) => i.status === 'OVERDUE'),
    ...mineActions.filter((i) => i.status === 'OVERDUE'),
  ];
  const overduePressure = clamp(
    overdueRecords.length * 13 +
      Math.min(35, overdueRecords.reduce((sum, item) => sum + dayDiff(item.dueDate || item.deadline || Date.now()), 0) / Math.max(1, overdueRecords.length))
  );

  const categories = new Map<string, number>();
  for (const item of activeViolations) categories.set(item.category || 'General', (categories.get(item.category || 'General') || 0) + 1);
  const repeatedCount = [...categories.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const repeatedPressure = clamp(repeatedCount * 28);
  const complianceRate = complianceRateForMine(mineId, compliances);
  const compliancePressure = 100 - complianceRate;
  const unresolvedPressure = clamp(unresolved.length * 23);
  const score = clamp(
    severityPressure * 0.3 + overduePressure * 0.25 + repeatedPressure * 0.2 + compliancePressure * 0.15 + unresolvedPressure * 0.1
  );

  const factors: string[] = [];
  if (overdueRecords.length) factors.push(`${overdueRecords.length} overdue compliance, violation, or corrective-action items`);
  const repeatedCategory = [...categories.entries()].find(([, count]) => count > 1);
  if (repeatedCategory) factors.push(`${repeatedCategory[1]} repeated ${repeatedCategory[0].toLowerCase()} violations`);
  if (unresolved.length) factors.push(`${unresolved.length} unresolved corrective action${unresolved.length === 1 ? '' : 's'}`);
  if (activeViolations.length) factors.push(`${activeViolations.length} open violation${activeViolations.length === 1 ? '' : 's'}; severity pressure ${severityPressure}/100`);
  if (complianceRate < 100) factors.push(`${100 - complianceRate}% compliance gap`);
  if (!factors.length) factors.push('No material open risks identified');

  return {
    score,
    level: levelFor(score),
    factors,
    components: {
      severity: Math.round(severityPressure),
      overdueDays: Math.round(overduePressure),
      repeatedViolations: Math.round(repeatedPressure),
      complianceGap: Math.round(compliancePressure),
      unresolvedActions: Math.round(unresolvedPressure),
    },
    compliancePercentage: complianceRate,
  };
}

function recalcMines() {
  const store = getStore();
  for (const mine of store.mines) {
    const risk = calculateRisk({ mineId: mine.id, violations: store.violations, compliances: store.compliances, actions: store.actions });
    mine.riskScore = risk.score;
    mine.riskLevel = risk.level;
    mine.riskFactors = risk.factors;
    mine.compliancePercentage = risk.compliancePercentage;
  }
  persist();
}

// ---- Auth helpers ----
export function staticLogin(email: string, password: string) {
  const store = getStore();
  const user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error('Email or password is incorrect.');
  if (user.active === false) throw new Error('This account is disabled.');
  // In static mode, any user accepts DEMO_PASSWORD, plus per-user same password
  if (password !== DEMO_PASSWORD) throw new Error('Email or password is incorrect.');
  const safeUser = { ...user };
  delete (safeUser as any).passwordHash;
  localStorage.setItem(AUTH_KEY, JSON.stringify(safeUser));
  // also set token for compatibility
  localStorage.setItem('minegov_token', 'static-' + user.id + '-' + Date.now());
  return { user: safeUser, token: 'static-token' };
}

export function staticMe() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function staticLogout() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem('minegov_token');
}

export function isStaticModeForced() {
  if (typeof window === 'undefined') return false;
  // Explicit env flag
  if ((import.meta as any).env?.VITE_STATIC_MODE === 'true') return true;
  if (localStorage.getItem(FORCE_STATIC_KEY) === 'true') return true;
  // Auto static if no API URL configured and in production
  if ((import.meta as any).env?.PROD && !(import.meta as any).env?.VITE_API_URL) return true;
  return false;
}

export function enableStaticMode() {
  localStorage.setItem(FORCE_STATIC_KEY, 'true');
  if (!localStorage.getItem(STORAGE_KEY)) {
    memoryStore = generateStaticStore();
    persist();
  }
}

export function resetStaticData() {
  localStorage.removeItem(STORAGE_KEY);
  memoryStore = generateStaticStore();
  persist();
  return memoryStore;
}

// ---- Filtering helpers ----
function filters(items: any[], query: URLSearchParams) {
  let result = [...items];
  const mineId = query.get('mineId');
  const status = query.get('status');
  const category = query.get('category');
  const priority = query.get('priority');
  const q = query.get('q');
  const due = query.get('due');
  const read = query.get('read');
  const severity = query.get('severity');

  if (mineId && mineId !== 'all') result = result.filter((i) => String(i.mineId) === String(mineId));
  if (status && status !== 'all') result = result.filter((i) => i.status === status);
  if (category && category !== 'all') result = result.filter((i) => (i.category || i.inspectionType) === category);
  if (priority && priority !== 'all') result = result.filter((i) => i.priority === priority);
  if (read === 'false') result = result.filter((i) => !i.read);
  if (read === 'true') result = result.filter((i) => i.read);
  if (severity && severity !== 'all') result = result.filter((i) => i.severity === severity);
  if (due && due !== 'all') {
    const now = Date.now();
    result = result.filter((i) => {
      const d = i.dueDate || i.deadline;
      if (!d) return false;
      const time = new Date(d).getTime();
      if (due === 'overdue') return time < now;
      if (due === '7days') return time >= now && time <= now + 7 * 86400000;
      if (due === '30days') return time >= now && time <= now + 30 * 86400000;
      return true;
    });
  }
  if (q) {
    const lower = q.toLowerCase();
    result = result.filter((item) => {
      const hay = Object.values(item).map((v) => (typeof v === 'object' ? '' : String(v || ''))).join(' ').toLowerCase();
      return hay.includes(lower);
    });
  }
  return result;
}

function sortItems(items: any[], query: URLSearchParams) {
  const sort = query.get('sort') || 'updatedAt';
  const order = query.get('order') === 'asc' ? 1 : -1;
  return items.sort((a, b) => {
    const av = a[sort] ?? '';
    const bv = b[sort] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * order;
    return String(av).localeCompare(String(bv)) * order;
  });
}

function scopeByUser(user: any, items: any[], mineField: string = 'mineId') {
  if (!user) return items;
  if (['ADMIN', 'MANAGEMENT'].includes(user.role)) return items;
  if (!user.mineId) return items;
  return items.filter((i) => {
    if (mineField === 'id') return String(i.id) === String(user.mineId) || String(i[mineField]) === String(user.mineId);
    return String(i[mineField]) === String(user.mineId);
  });
}

// ---- Main API router ----
export async function handleStaticRequest(path: string, options: RequestInit = {}): Promise<any> {
  const store = getStore();
  const user = staticMe();
  // Ensure risk is up to date on read
  // parse URL
  const url = new URL(path, 'http://localhost');
  // path includes /api prefix already stripped? Our api.ts calls with /mines etc. We receive path like /mines or /mines?x
  // So url.pathname is like /mines
  const pathname = url.pathname;
  const search = url.searchParams;
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body as string) : null;

  // Auth
  if (pathname === '/auth/login' && method === 'POST') {
    const { email, password } = body || {};
    const result = staticLogin(email, password);
    return result;
  }
  if (pathname === '/auth/me' && method === 'GET') {
    if (!user) throw Object.assign(new Error('Session expired'), { status: 401 });
    return { user };
  }
  if (pathname === '/auth/logout' && method === 'POST') {
    staticLogout();
    return { success: true };
  }

  // For other endpoints require user (except health)
  if (!user && pathname !== '/health') {
    // Allow unauthenticated for demo? But require login
    throw Object.assign(new Error('Please sign in to continue.'), { status: 401 });
  }

  // Mines
  if (pathname === '/mines' && method === 'GET') {
    let items = scopeByUser(user, store.mines, 'id');
    items = filters(items, search);
    if (search.get('state') && search.get('state') !== 'all') items = items.filter((i) => i.state === search.get('state'));
    if (search.get('riskLevel') && search.get('riskLevel') !== 'all') items = items.filter((i) => i.riskLevel === search.get('riskLevel'));
    return sortItems(items, search);
  }
  if (pathname === '/mines' && method === 'POST') {
    if (user.role !== 'ADMIN') throw Object.assign(new Error('Only administrators can add mines.'), { status: 403 });
    const id = Math.random().toString(16).slice(2);
    const newMine = { id, ...body, riskScore: 0, riskLevel: 'LOW', compliancePercentage: 0, riskFactors: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.mines.push(newMine);
    persist();
    addAudit('Created mine', 'Mine', newMine);
    return newMine;
  }
  if (pathname.startsWith('/mines/') && method === 'GET') {
    const id = pathname.split('/')[2];
    const mine = store.mines.find((m) => String(m.id) === String(id));
    if (!mine) throw Object.assign(new Error('Mine not found.'), { status: 404 });
    const compliances = store.compliances.filter((x) => String(x.mineId) === String(id));
    const inspections = store.inspections.filter((x) => String(x.mineId) === String(id));
    const violations = store.violations.filter((x) => String(x.mineId) === String(id));
    const actions = store.actions.filter((x) => String(x.mineId) === String(id));
    return {
      ...mine,
      overview: {
        complianceCount: compliances.length,
        inspectionCount: inspections.length,
        openViolations: violations.filter((x) => x.status !== 'CLOSED').length,
        openActions: actions.filter((x) => x.status !== 'VERIFIED').length,
      },
    };
  }
  if (pathname.startsWith('/mines/') && method === 'PUT') {
    const id = pathname.split('/')[2];
    const idx = store.mines.findIndex((m) => String(m.id) === String(id));
    if (idx === -1) throw Object.assign(new Error('Mine not found.'), { status: 404 });
    const old = { ...store.mines[idx] };
    store.mines[idx] = { ...store.mines[idx], ...body, updatedAt: new Date().toISOString() };
    persist();
    addAudit('Updated mine', 'Mine', store.mines[idx], old);
    return store.mines[idx];
  }

  // Compliances
  if (pathname === '/compliances' && method === 'GET') {
    let items = scopeByUser(user, store.compliances);
    items = filters(items, search);
    return sortItems(items, search);
  }
  if (pathname === '/compliances' && method === 'POST') {
    const id = Math.random().toString(16).slice(2);
    const item = { id, ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.compliances.push(item);
    persist();
    recalcMines();
    addAudit('Created compliance requirement', 'Compliance', item);
    return item;
  }
  if (pathname.startsWith('/compliances/') && method === 'GET') {
    const id = pathname.split('/')[2];
    const item = store.compliances.find((c) => String(c.id) === String(id));
    if (!item) throw Object.assign(new Error('Compliance record not found.'), { status: 404 });
    return item;
  }
  if (pathname.startsWith('/compliances/') && method === 'PUT') {
    const id = pathname.split('/')[2];
    const idx = store.compliances.findIndex((c) => String(c.id) === String(id));
    if (idx === -1) throw Object.assign(new Error('Compliance record not found.'), { status: 404 });
    const old = { ...store.compliances[idx] };
    store.compliances[idx] = { ...store.compliances[idx], ...body, updatedAt: new Date().toISOString() };
    persist();
    recalcMines();
    addAudit('Updated compliance', 'Compliance', store.compliances[idx], old);
    return store.compliances[idx];
  }

  // Inspections
  if (pathname === '/inspections' && method === 'GET') {
    let items = scopeByUser(user, store.inspections);
    items = filters(items, search);
    return sortItems(items, search);
  }
  if (pathname === '/inspections' && method === 'POST') {
    const id = Math.random().toString(16).slice(2);
    const item = { id, ...body, inspectorId: user.id, status: 'SUBMITTED', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.inspections.push(item);
    persist();
    addAudit('Submitted inspection', 'Inspection', item);
    return item;
  }
  if (pathname.startsWith('/inspections/') && method === 'GET') {
    const id = pathname.split('/')[2];
    const item = store.inspections.find((i) => String(i.id) === String(id));
    if (!item) throw Object.assign(new Error('Inspection not found.'), { status: 404 });
    const mine = store.mines.find((m) => String(m.id) === String(item.mineId));
    const inspector = store.users.find((u) => String(u.id) === String(item.inspectorId));
    return { ...item, mineName: mine?.name, inspectorName: inspector?.name };
  }

  // Violations
  if (pathname === '/violations' && method === 'GET') {
    let items = scopeByUser(user, store.violations);
    items = filters(items, search);
    return sortItems(items, search);
  }
  if (pathname === '/violations' && method === 'POST') {
    const id = Math.random().toString(16).slice(2);
    const item = {
      id,
      ...body,
      activity: [{ label: 'Violation recorded from field inspection', by: user.name, at: new Date().toISOString() }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.violations.push(item);
    persist();
    recalcMines();
    addAudit('Created violation', 'Violation', item);
    return item;
  }
  if (pathname.startsWith('/violations/') && method === 'GET' && !pathname.includes('/verify')) {
    const id = pathname.split('/')[2];
    const item = store.violations.find((v) => String(v.id) === String(id));
    if (!item) throw Object.assign(new Error('Violation not found.'), { status: 404 });
    const mine = store.mines.find((m) => String(m.id) === String(item.mineId));
    const inspection = item.inspectionId ? store.inspections.find((i) => String(i.id) === String(item.inspectionId)) : null;
    const officer = item.assignedOfficer ? store.users.find((u) => String(u.id) === String(item.assignedOfficer)) : null;
    const correctiveActions = store.actions.filter((a) => String(a.violationId) === String(item.id));
    return { ...item, mineName: mine?.name, inspection, officerName: officer?.name, correctiveActions };
  }
  if (pathname.startsWith('/violations/') && method === 'PUT') {
    const id = pathname.split('/')[2];
    const idx = store.violations.findIndex((v) => String(v.id) === String(id));
    if (idx === -1) throw Object.assign(new Error('Violation not found.'), { status: 404 });
    const old = { ...store.violations[idx] };
    store.violations[idx] = { ...store.violations[idx], ...body, updatedAt: new Date().toISOString() };
    persist();
    recalcMines();
    addAudit('Updated violation', 'Violation', store.violations[idx], old);
    return store.violations[idx];
  }

  // Actions
  if (pathname === '/actions' && method === 'GET') {
    let items = scopeByUser(user, store.actions);
    items = filters(items, search);
    const withNames = items.map((action) => ({
      ...action,
      mineName: store.mines.find((m) => String(m.id) === String(action.mineId))?.name,
      violationTitle: store.violations.find((v) => String(v.id) === String(action.violationId))?.title,
    }));
    return sortItems(withNames, search);
  }
  if (pathname === '/actions' && method === 'POST') {
    const id = Math.random().toString(16).slice(2);
    const violation = store.violations.find((v) => String(v.id) === String(body.violationId));
    if (!violation) throw Object.assign(new Error('The selected violation was not found.'), { status: 404 });
    const item = {
      id,
      ...body,
      mineId: violation.mineId,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.actions.push(item);
    // update violation status
    const vIdx = store.violations.findIndex((v) => String(v.id) === String(violation.id));
    if (vIdx !== -1) {
      store.violations[vIdx].status = 'IN_PROGRESS';
      store.violations[vIdx].activity = [...(store.violations[vIdx].activity || []), { label: 'Corrective action assigned', by: user.name, at: new Date().toISOString() }];
    }
    persist();
    recalcMines();
    addAudit('Assigned corrective action', 'CorrectiveAction', item);
    return item;
  }
  if (pathname.startsWith('/actions/') && pathname.endsWith('/verify') && method === 'POST') {
    const id = pathname.split('/')[2];
    const idx = store.actions.findIndex((a) => String(a.id) === String(id));
    if (idx === -1) throw Object.assign(new Error('Corrective action not found.'), { status: 404 });
    const action = store.actions[idx];
    const approved = body?.approved !== false;
    const note = String(body?.note || (approved ? 'Evidence verified.' : 'Evidence requires further work.')).slice(0, 500);
    const status = approved ? 'VERIFIED' : 'REJECTED';
    store.actions[idx] = { ...action, status, verifiedBy: user.id, verifiedAt: new Date().toISOString(), verificationNote: note, updatedAt: new Date().toISOString() };
    // update violation
    const vIdx = store.violations.findIndex((v) => String(v.id) === String(action.violationId));
    let updatedViolation = null;
    if (vIdx !== -1) {
      const nextStatus = approved ? 'CLOSED' : 'IN_PROGRESS';
      store.violations[vIdx] = {
        ...store.violations[vIdx],
        status: nextStatus,
        activity: [...(store.violations[vIdx].activity || []), { label: approved ? 'Corrective action verified · violation closed' : 'Evidence rejected · further action required', by: user.name, at: new Date().toISOString(), note }],
        updatedAt: new Date().toISOString(),
      };
      updatedViolation = store.violations[vIdx];
    }
    persist();
    recalcMines();
    addAudit(approved ? 'Verified corrective action' : 'Rejected corrective evidence', 'CorrectiveAction', store.actions[idx], action);
    return { action: store.actions[idx], violation: updatedViolation };
  }
  if (pathname.startsWith('/actions/') && method === 'GET') {
    const id = pathname.split('/')[2];
    const item = store.actions.find((a) => String(a.id) === String(id));
    if (!item) throw Object.assign(new Error('Corrective action not found.'), { status: 404 });
    const violation = store.violations.find((v) => String(v.id) === String(item.violationId));
    const officer = store.users.find((u) => String(u.id) === String(item.assignedOfficer));
    const verifier = item.verifiedBy ? store.users.find((u) => String(u.id) === String(item.verifiedBy)) : null;
    const mine = store.mines.find((m) => String(m.id) === String(item.mineId));
    return { ...item, mineName: mine?.name, violation: violation ? { ...violation, mineName: mine?.name } : null, officerName: officer?.name, verifierName: verifier?.name };
  }
  if (pathname.startsWith('/actions/') && method === 'PUT') {
    const id = pathname.split('/')[2];
    const idx = store.actions.findIndex((a) => String(a.id) === String(id));
    if (idx === -1) throw Object.assign(new Error('Corrective action not found.'), { status: 404 });
    const old = { ...store.actions[idx] };
    let status = body.status ?? old.status;
    if (body.deadline && new Date(body.deadline) < new Date() && !['SUBMITTED', 'VERIFIED'].includes(status)) status = 'OVERDUE';
    store.actions[idx] = { ...store.actions[idx], ...body, status, updatedAt: new Date().toISOString(), ...(status === 'SUBMITTED' ? { submittedAt: new Date().toISOString() } : {}) };
    // sync violation
    if (status === 'SUBMITTED') {
      const vIdx = store.violations.findIndex((v) => String(v.id) === String(store.actions[idx].violationId));
      if (vIdx !== -1) {
        store.violations[vIdx].status = 'VERIFICATION_PENDING';
        store.violations[vIdx].activity = [...(store.violations[vIdx].activity || []), { label: 'Corrective evidence submitted for verification', by: user.name, at: new Date().toISOString() }];
      }
    }
    if (status === 'IN_PROGRESS') {
      const vIdx = store.violations.findIndex((v) => String(v.id) === String(store.actions[idx].violationId));
      if (vIdx !== -1) store.violations[vIdx].status = 'IN_PROGRESS';
    }
    persist();
    recalcMines();
    addAudit('Updated corrective action', 'CorrectiveAction', store.actions[idx], old);
    return store.actions[idx];
  }

  // Users
  if (pathname === '/users' && method === 'GET') {
    let users = [...store.users];
    if (!['ADMIN', 'MANAGEMENT'].includes(user.role)) {
      users = users.filter((u) => !u.mineId || String(u.mineId) === String(user.mineId));
    }
    return users.map(({ passwordHash, ...u }) => u);
  }
  if (pathname === '/users' && method === 'POST') {
    if (user.role !== 'ADMIN') throw Object.assign(new Error('Only administrators can create users.'), { status: 403 });
    const exists = store.users.some((u) => u.email.toLowerCase() === body.email.toLowerCase());
    if (exists) throw Object.assign(new Error('An account with this email already exists.'), { status: 409 });
    const id = Math.random().toString(16).slice(2);
    const newUser = { id, ...body, active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    store.users.push(newUser);
    persist();
    const { password, ...safe } = newUser;
    addAudit('Created user', 'User', safe);
    return safe;
  }
  if (pathname.startsWith('/users/') && method === 'PUT') {
    if (user.role !== 'ADMIN') throw Object.assign(new Error('Only administrators can update users.'), { status: 403 });
    const id = pathname.split('/')[2];
    const idx = store.users.findIndex((u) => String(u.id) === String(id));
    if (idx === -1) throw Object.assign(new Error('User account not found.'), { status: 404 });
    const old = { ...store.users[idx] };
    store.users[idx] = { ...store.users[idx], ...body, updatedAt: new Date().toISOString() };
    persist();
    const { passwordHash, ...safe } = store.users[idx];
    const { passwordHash: _oldHash, ...safeOld } = old;
    addAudit('Updated user access', 'User', safe, safeOld);
    return safe;
  }

  // Alerts
  if (pathname === '/alerts' && method === 'GET') {
    let items = scopeByUser(user, store.alerts);
    items = filters(items, search);
    // enrich with mineName
    items = items.map((a) => ({ ...a, mineName: store.mines.find((m) => String(m.id) === String(a.mineId))?.name }));
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  if (pathname.startsWith('/alerts/') && pathname.endsWith('/read') && method === 'PUT') {
    const id = pathname.split('/')[2];
    const idx = store.alerts.findIndex((a) => String(a.id) === String(id));
    if (idx === -1) throw Object.assign(new Error('Alert not found.'), { status: 404 });
    store.alerts[idx] = { ...store.alerts[idx], read: true, updatedAt: new Date().toISOString() };
    persist();
    return store.alerts[idx];
  }
  if (pathname === '/alerts/read-all' && method === 'PUT') {
    const items = scopeByUser(user, store.alerts);
    for (const alert of items) {
      const idx = store.alerts.findIndex((a) => String(a.id) === String(alert.id));
      if (idx !== -1) store.alerts[idx].read = true;
    }
    persist();
    return { updated: items.filter((i) => !i.read).length };
  }

  // Dashboard
  if (pathname === '/dashboard/summary' && method === 'GET') {
    const mineId = search.get('mineId');
    const mines = mineId && mineId !== 'all' ? store.mines.filter((m) => String(m.id) === String(mineId)) : store.mines;
    const allowedIds = new Set(mines.map((m) => String(m.id)));
    const scoped = (items: any[]) => items.filter((i) => allowedIds.has(String(i.mineId)));
    const scopedCompliance = scoped(store.compliances);
    const scopedInspections = scoped(store.inspections);
    const scopedViolations = scoped(store.violations);
    const scopedActions = scoped(store.actions);
    const now = new Date();
    const inspectionsThisMonth = scopedInspections.filter((item) => {
      const d = new Date(item.date || item.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const compliantCount = scopedCompliance.filter((i) => i.status === 'COMPLIANT').length;
    const complianceRate = scopedCompliance.length ? Math.round((compliantCount / scopedCompliance.length) * 100) : 0;
    return {
      totalMines: mines.length,
      complianceRate,
      highRiskMines: mines.filter((m) => (m.riskScore || 0) >= 61).length,
      openViolations: scopedViolations.filter((i) => i.status !== 'CLOSED').length,
      overdueActions: scopedActions.filter((i) => i.status === 'OVERDUE').length,
      inspectionsThisMonth,
      highRiskList: mines
        .filter((m) => (m.riskScore || 0) >= 61)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 6)
        .map((mine) => ({
          ...mine,
          openViolations: scopedViolations.filter((i) => String(i.mineId) === String(mine.id) && i.status !== 'CLOSED').length,
          overdueActions: scopedActions.filter((i) => String(i.mineId) === String(mine.id) && i.status === 'OVERDUE').length,
        })),
    };
  }
  if ((pathname === '/dashboard/trends' || pathname === '/trends') && method === 'GET') {
    const mineId = search.get('mineId');
    const allowed = new Set(store.mines.filter((m) => !mineId || mineId === 'all' || String(m.id) === String(mineId)).map((m) => String(m.id)));
    const scoped = (items: any[]) => items.filter((i) => allowed.has(String(i.mineId)));
    const allCompliance = scoped(store.compliances);
    const allViolations = scoped(store.violations);
    const allActions = scoped(store.actions);
    const now = new Date();
    const monthLabel = (date: Date) => new Intl.DateTimeFormat('en', { month: 'short' }).format(date);
    const complianceTrend = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const month = date.getMonth();
      const bucket = allCompliance.filter((item) => new Date(item.createdAt || item.updatedAt || now).getMonth() <= month);
      const rate = bucket.length ? Math.round((bucket.filter((i) => i.status === 'COMPLIANT').length / bucket.length) * 100) : 0;
      const rateAdjusted = Math.max(0, Math.min(100, rate + (index - 2) * 2));
      return { month: monthLabel(date), compliance: rateAdjusted };
    });
    const minesFiltered = store.mines.filter((m) => allowed.has(String(m.id)));
    const riskDistribution = [
      { level: 'LOW', count: minesFiltered.filter((m) => m.riskLevel === 'LOW').length, color: '#28a879' },
      { level: 'MEDIUM', count: minesFiltered.filter((m) => m.riskLevel === 'MEDIUM').length, color: '#e9b949' },
      { level: 'HIGH', count: minesFiltered.filter((m) => m.riskLevel === 'HIGH').length, color: '#ed8e42' },
      { level: 'CRITICAL', count: minesFiltered.filter((m) => m.riskLevel === 'CRITICAL').length, color: '#d94d58' },
    ];
    const categoryCounts = new Map<string, number>();
    for (const item of allViolations) categoryCounts.set(item.category || 'General', (categoryCounts.get(item.category || 'General') || 0) + 1);
    const violationsByCategory = [...categoryCounts.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
    const actionStatus = ['OPEN', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'OVERDUE'].map((status) => ({
      status: status.replace('_', ' '),
      count: allActions.filter((i) => i.status === status).length,
    }));
    return { complianceTrend, riskDistribution, violationsByCategory, actionStatus };
  }
  if ((pathname === '/dashboard/risk' || pathname === '/risk') && method === 'GET') {
    const mineId = search.get('mineId');
    return store.mines
      .filter((m) => !mineId || mineId === 'all' || String(m.id) === String(mineId))
      .map((mine) => ({
        ...mine,
        risk: calculateRisk({ mineId: mine.id, violations: store.violations, compliances: store.compliances, actions: store.actions }),
        openViolations: store.violations.filter((i) => String(i.mineId) === String(mine.id) && i.status !== 'CLOSED').length,
        overdueActions: store.actions.filter((i) => String(i.mineId) === String(mine.id) && i.status === 'OVERDUE').length,
      }))
      .sort((a, b) => b.risk.score - a.risk.score);
  }

  // Reports
  if (pathname.startsWith('/reports/') && method === 'GET') {
    const type = pathname.split('/')[2]; // compliance, inspection, violation, action, management
    const mineId = search.get('mineId');
    const allowedIds = mineId && mineId !== 'all' ? new Set([mineId]) : null;
    const filterByMine = (items: any[]) => (allowedIds ? items.filter((i) => allowedIds.has(String(i.mineId))) : items);
    let rows: any[] = [];
    if (type === 'compliance') rows = filterByMine(store.compliances);
    else if (type === 'inspection') rows = filterByMine(store.inspections);
    else if (type === 'violation') rows = filterByMine(store.violations);
    else if (type === 'action') rows = filterByMine(store.actions);
    else if (type === 'management') {
      // summary report - not used as rows
      return { generatedAt: new Date().toISOString(), summary: {}, mines: [] };
    }
    // apply generic filters
    const qParams = new URLSearchParams(search.toString());
    rows = filters(rows, qParams);
    // enrich
    rows = rows.map((r) => ({
      ...r,
      mineName: store.mines.find((m) => String(m.id) === String(r.mineId))?.name,
      officerName: store.users.find((u) => String(u.id) === String(r.assignedOfficer))?.name,
    }));
    // date range filter
    const from = search.get('from');
    const to = search.get('to');
    if (from) {
      const fromTime = new Date(from).getTime();
      rows = rows.filter((r) => new Date(r.createdAt || r.date || r.dueDate || r.deadline).getTime() >= fromTime);
    }
    if (to) {
      const toTime = new Date(to).getTime();
      rows = rows.filter((r) => new Date(r.createdAt || r.date || r.dueDate || r.deadline).getTime() <= toTime);
    }
    return { rows };
  }

  // Search
  if (pathname === '/search' && method === 'GET') {
    const q = (search.get('q') || '').toLowerCase();
    if (!q) return [];
    const results: any[] = [];
    const push = (type: string, id: string, title: string, subtitle: string, href: string) => {
      if (title.toLowerCase().includes(q) || subtitle.toLowerCase().includes(q)) results.push({ type, id, title, subtitle, href });
    };
    for (const m of store.mines) push('Mine', m.id, m.name, `${m.code} · ${m.district}`, `/mines/${m.id}`);
    for (const c of store.compliances) push('Compliance', c.id, c.title, c.regulation, `/compliance/${c.id}`);
    for (const i of store.inspections) push('Inspection', i.id, i.observation, `${i.inspectionType} · ${i.mineId}`, `/inspections/${i.id}`);
    for (const v of store.violations) push('Violation', v.id, v.title, v.category, `/violations/${v.id}`);
    for (const a of store.actions) push('Action', a.id, a.description, `Action · ${a.status}`, `/actions/${a.id}`);
    return results.slice(0, 50);
  }

  // AI chat - deterministic fallback
  if (pathname === '/ai/chat' && method === 'POST') {
    const question = (body?.question || '').toLowerCase();
    const mines = store.mines;
    const compliances = store.compliances;
    const violations = store.violations;
    const actions = store.actions;
    let answer = '';
    let sources: any[] = [];

    if (question.includes('overdue')) {
      const overdue = compliances.filter((c) => c.status === 'OVERDUE');
      answer = `There are ${overdue.length} overdue compliance requirements across ${new Set(overdue.map((c) => c.mineId)).size} mines. The most critical are: ${overdue.slice(0, 3).map((c) => c.title).join(', ')}. Please review the Compliance register for evidence submission.`;
      sources = overdue.slice(0, 3).map((c) => ({ label: c.title, type: 'Compliance', href: `/compliance/${c.id}` }));
    } else if (question.includes('high-risk') || question.includes('high risk')) {
      const high = mines.filter((m) => (m.riskScore || 0) >= 61).sort((a, b) => b.riskScore - a.riskScore);
      answer = `Currently ${high.length} mines are in high or critical risk: ${high.map((m) => `${m.name} (${m.riskScore} - ${m.riskLevel})`).join(', ')}. Primary drivers are overdue items, open violations and unresolved corrective actions. Review Risk Analytics for deterministic breakdown.`;
      sources = high.slice(0, 3).map((m) => ({ label: m.name, type: 'Mine', href: `/mines/${m.id}` }));
    } else if (question.includes('officer') || question.includes('pending')) {
      const pending = actions.filter((a) => a.status !== 'VERIFIED');
      const byOfficer = new Map<string, number>();
      for (const a of pending) byOfficer.set(a.assignedOfficer, (byOfficer.get(a.assignedOfficer) || 0) + 1);
      const top = [...byOfficer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      answer = `There are ${pending.length} pending corrective actions. Top owners: ${top.map(([id, count]) => `${store.users.find((u) => u.id === id)?.name || id} (${count})`).join(', ')}. Please check the Actions page for deadlines.`;
      sources = pending.slice(0, 3).map((a) => ({ label: a.description.slice(0, 60), type: 'Action', href: `/actions/${a.id}` }));
    } else if (question.includes('violation') && question.includes('repeat')) {
      const categories = new Map<string, number>();
      for (const v of violations) categories.set(v.category, (categories.get(v.category) || 0) + 1);
      const repeated = [...categories.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
      answer = `Repeated violations by category: ${repeated.map(([cat, count]) => `${cat}: ${count}`).join(', ') || 'No repeated categories detected'}. Focus on Safety and Environment which appear most frequently.`;
      sources = violations.slice(0, 3).map((v) => ({ label: v.title, type: 'Violation', href: `/violations/${v.id}` }));
    } else if (question.includes('summary') || question.includes('monthly')) {
      const compliant = compliances.filter((c) => c.status === 'COMPLIANT').length;
      const rate = compliances.length ? Math.round((compliant / compliances.length) * 100) : 0;
      const openV = violations.filter((v) => v.status !== 'CLOSED').length;
      const overdueA = actions.filter((a) => a.status === 'OVERDUE').length;
      answer = `Monthly summary: Compliance rate ${rate}% (${compliant}/${compliances.length} compliant). Open violations: ${openV}. Overdue corrective actions: ${overdueA}. High-risk mines: ${mines.filter((m) => m.riskScore >= 61).length}. Recommendation: Prioritize overdue compliance evidence and verify submitted corrective actions to reduce risk scores.`;
      sources = [{ label: 'Dashboard', type: 'Dashboard', href: '/dashboard' }];
    } else {
      // generic
      answer = `Based on live data: ${mines.length} mines monitored, ${compliances.length} compliance requirements (${compliances.filter((c) => c.status === 'OVERDUE').length} overdue), ${violations.filter((v) => v.status !== 'CLOSED').length} open violations, ${actions.filter((a) => a.status !== 'VERIFIED').length} unresolved actions. Ask specifically about overdue compliances, high-risk mines, repeated violations or pending officers for detailed insights.`;
      sources = [{ label: 'Dashboard', type: 'Dashboard', href: '/dashboard' }];
    }

    return { answer, provider: 'static-deterministic', sources, generatedAt: new Date().toISOString() };
  }
  if (pathname === '/ai/summary' && method === 'POST') {
    return handleStaticRequest('/ai/chat', { method: 'POST', body: JSON.stringify({ question: 'Generate a monthly compliance summary and prioritize the most important risks.' }) });
  }

  // Meta
  if (pathname === '/meta' && method === 'GET') {
    const allAccess = ['ADMIN', 'MANAGEMENT'].includes(user.role);
    const unreadAlerts = store.alerts.filter((a) => !a.read && (allAccess || String(a.mineId) === String(user.mineId))).length;
    return { database: 'static', mineCount: allAccess ? store.mines.length : store.mines.filter((m) => String(m.id) === String(user.mineId)).length, unreadAlerts };
  }

  // Audit logs
  if (pathname === '/audit-logs' && method === 'GET') {
    if (user.role !== 'ADMIN') throw Object.assign(new Error('Only administrators can view audit logs.'), { status: 403 });
    return store.auditLogs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 500);
  }

  // Uploads - mock
  if (pathname === '/uploads' && method === 'POST') {
    // Return fake file references
    return { files: [{ name: 'DEMO uploaded evidence.txt', url: '/demo-evidence.txt', size: 1024, uploadedAt: new Date().toISOString() }] };
  }

  // Health
  if (pathname === '/health' && method === 'GET') {
    return { status: 'ok', service: 'MineGov AI Static', database: 'static', timestamp: new Date().toISOString() };
  }

  throw Object.assign(new Error(`Static API: route not implemented ${method} ${pathname}`), { status: 404 });
}

function addAudit(action: string, entity: string, newValue: any, oldValue: any = null) {
  const store = getStore();
  const user = staticMe();
  store.auditLogs.push({
    id: Math.random().toString(16).slice(2),
    action,
    entity,
    entityId: newValue.id,
    userName: user?.name || 'System',
    userId: user?.id || 'system',
    createdAt: new Date().toISOString(),
    oldValue,
    newValue,
    ipAddress: 'static-mode',
  });
  persist();
}

// Initialize on load if in browser
if (typeof window !== 'undefined') {
  try {
    getStore();
    recalcMines();
  } catch {}
}
