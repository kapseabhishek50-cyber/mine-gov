import { list } from '../config/database.js';
import { HttpError } from '../utils/httpError.js';

export const reportTypes = ['compliance', 'inspection', 'violation', 'action'];

const matches = (item, filters) => {
  if (filters.mineId && String(item.mineId) !== String(filters.mineId)) return false;
  const date = new Date(item.date || item.createdAt || item.updatedAt || 0);
  if (filters.from && date < new Date(filters.from)) return false;
  if (filters.to && date > new Date(`${filters.to}T23:59:59.999Z`)) return false;
  if (filters.category && filters.category !== 'all' && String(item.category || item.inspectionType || '').toLowerCase() !== filters.category.toLowerCase()) return false;
  if (filters.status && filters.status !== 'all' && String(item.status || '').toLowerCase() !== filters.status.toLowerCase()) return false;
  return true;
};

export async function getReport(type, filters = {}) {
  const names = { compliance: 'compliances', inspection: 'inspections', violation: 'violations', action: 'actions' };
  const collection = names[type];
  if (!collection) throw new HttpError(400, `Unsupported report type "${type}". Supported types: ${reportTypes.join(', ')}.`);
  const [records, mines, users, violations] = await Promise.all([list(collection), list('mines'), list('users'), list('violations')]);
  const mineMap = new Map(mines.map((mine) => [String(mine.id), mine.name]));
  const userMap = new Map(users.map((user) => [String(user.id), user.name]));
  return records.filter((item) => matches(item, filters)).map((item) => ({
    ...item,
    mineName: mineMap.get(String(item.mineId)) || '—',
    officerName: userMap.get(String(item.assignedOfficer || item.inspectorId)) || '—',
    violationTitle: violations.find((violation) => String(violation.id) === String(item.violationId))?.title || undefined,
  }));
}
