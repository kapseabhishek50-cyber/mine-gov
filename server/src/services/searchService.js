import { list } from '../config/database.js';

export async function searchRecords(query, mineId = null) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const [mines, compliances, inspections, violations, actions] = await Promise.all([list('mines'), list('compliances'), list('inspections'), list('violations'), list('actions')]);
  const output = [];
  const visible = (item) => !mineId || String(item.mineId || item.id) === String(mineId);
  for (const item of mines) if (visible(item) && `${item.name} ${item.code} ${item.district} ${item.state}`.toLowerCase().includes(q)) output.push({ id: item.id, title: item.name, subtitle: `${item.code} · ${item.district}, ${item.state}`, type: 'Mine', href: `/mines/${item.id}` });
  for (const item of compliances) if (visible(item) && `${item.title} ${item.category} ${item.regulation} ${item.status}`.toLowerCase().includes(q)) output.push({ id: item.id, title: item.title, subtitle: `${item.category} · ${item.status.replace('_', ' ')}`, type: 'Compliance', href: `/compliance/${item.id}` });
  for (const item of inspections) if (visible(item) && `${item.inspectionType} ${item.observation} ${item.status}`.toLowerCase().includes(q)) output.push({ id: item.id, title: item.observation, subtitle: `${item.inspectionType} inspection`, type: 'Inspection', href: `/inspections/${item.id}` });
  for (const item of violations) if (visible(item) && `${item.title} ${item.description} ${item.category} ${item.status}`.toLowerCase().includes(q)) output.push({ id: item.id, title: item.title, subtitle: `${item.category} · ${item.severity}`, type: 'Violation', href: `/violations/${item.id}` });
  for (const item of actions) if (visible(item) && `${item.description} ${item.status}`.toLowerCase().includes(q)) output.push({ id: item.id, title: item.description, subtitle: `Corrective action · ${item.status.replace('_', ' ')}`, type: 'Action', href: `/actions/${item.id}` });
  return output.slice(0, 30);
}
