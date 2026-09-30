function defineCollection(collectionName, config) {
  return {
    collectionName,
    defaults: config.defaults || {},
    normalizeField: config.normalizeField || ((_key, value) => value),
  };
}

export const User = defineCollection('users', {
  defaults: {
    active: true,
    mineId: null,
  },
  normalizeField(key, value) {
    if (key === 'name' && typeof value === 'string') return value.trim();
    if (key === 'email' && typeof value === 'string') return value.trim().toLowerCase();
    return value;
  },
});

export const Mine = defineCollection('mines', {
  defaults: {
    status: 'ACTIVE',
    riskScore: 0,
    compliancePercentage: 0,
    riskFactors: [],
  },
});

export const Compliance = defineCollection('compliances', {
  defaults: {
    priority: 'MEDIUM',
    status: 'PENDING',
    evidence: [],
  },
});

export const Inspection = defineCollection('inspections', {
  defaults: {
    photos: [],
    documents: [],
    status: 'SUBMITTED',
  },
});

export const Violation = defineCollection('violations', {
  defaults: {
    status: 'OPEN',
    evidence: [],
    activity: [],
  },
});

export const CorrectiveAction = defineCollection('actions', {
  defaults: {
    status: 'OPEN',
    evidence: [],
  },
});

export const Alert = defineCollection('alerts', {
  defaults: {
    read: false,
  },
});

export const AuditLog = defineCollection('auditLogs', {
  defaults: {},
});

export const models = {
  users: User,
  mines: Mine,
  compliances: Compliance,
  inspections: Inspection,
  violations: Violation,
  actions: CorrectiveAction,
  alerts: Alert,
  auditLogs: AuditLog,
};

export function prepareDocument(collection, values, { isUpdate = false } = {}) {
  const model = models[collection];
  if (!model) throw new Error(`Unknown collection: ${collection}`);
  const base = isUpdate ? {} : structuredClone(model.defaults);
  const out = { ...base };
  for (const [key, rawValue] of Object.entries(values || {})) {
    if (rawValue === undefined) continue;
    out[key] = model.normalizeField(key, rawValue);
  }
  return out;
}
