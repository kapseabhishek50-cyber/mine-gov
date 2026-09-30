import { list, update } from '../config/database.js';

export async function refreshComplianceStatuses(now = new Date()) {
  const compliances = await list('compliances');
  const refreshed = [];
  for (const item of compliances) {
    if (item.status === 'COMPLIANT' || !item.dueDate) continue;
    const isPastDue = new Date(item.dueDate).getTime() < now.getTime();
    const desired = isPastDue ? 'OVERDUE' : (item.status === 'OVERDUE' ? 'PENDING' : item.status);
    if (desired !== item.status) refreshed.push(await update('compliances', item.id, { status: desired }));
  }
  return refreshed;
}

export function complianceRateForMine(mineId, compliances) {
  const records = compliances.filter((item) => String(item.mineId) === String(mineId));
  if (!records.length) return 100;
  return Math.round((records.filter((item) => item.status === 'COMPLIANT').length / records.length) * 100);
}
