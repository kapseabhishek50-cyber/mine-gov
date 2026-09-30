import { list, update } from '../config/database.js';
import { complianceRateForMine } from './complianceEngine.js';

const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));
const severityPoints = { LOW: 20, MEDIUM: 42, HIGH: 72, CRITICAL: 100 };
const levelFor = (score) => score <= 30 ? 'LOW' : score <= 60 ? 'MEDIUM' : score <= 80 ? 'HIGH' : 'CRITICAL';
const openViolation = (item) => item.status !== 'CLOSED';
const openAction = (item) => !['VERIFIED'].includes(item.status);
const dayDiff = (date) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));

export function calculateRisk({ mineId, violations, compliances, actions }) {
  const mineViolations = violations.filter((item) => String(item.mineId) === String(mineId));
  const activeViolations = mineViolations.filter(openViolation);
  const mineCompliance = compliances.filter((item) => String(item.mineId) === String(mineId));
  const mineActions = actions.filter((item) => String(item.mineId) === String(mineId));
  const unresolved = mineActions.filter(openAction);
  const severityPressure = activeViolations.length
    ? clamp(activeViolations.reduce((sum, item) => sum + (severityPoints[item.severity] || 35), 0) / activeViolations.length + activeViolations.length * 4)
    : 0;

  const overdueRecords = [
    ...mineCompliance.filter((item) => item.status === 'OVERDUE'),
    ...activeViolations.filter((item) => item.status === 'OVERDUE'),
    ...mineActions.filter((item) => item.status === 'OVERDUE'),
  ];
  const overduePressure = clamp(overdueRecords.length * 13 + Math.min(35, overdueRecords.reduce((sum, item) => sum + dayDiff(item.dueDate || item.deadline || Date.now()), 0) / Math.max(1, overdueRecords.length)));

  const categories = new Map();
  for (const item of activeViolations) categories.set(item.category || 'General', (categories.get(item.category || 'General') || 0) + 1);
  const repeatedCount = [...categories.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  const repeatedPressure = clamp(repeatedCount * 28);
  const complianceRate = complianceRateForMine(mineId, compliances);
  const compliancePressure = 100 - complianceRate;
  const unresolvedPressure = clamp(unresolved.length * 23);
  const score = clamp(
    severityPressure * 0.30 +
    overduePressure * 0.25 +
    repeatedPressure * 0.20 +
    compliancePressure * 0.15 +
    unresolvedPressure * 0.10,
  );

  const factors = [];
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

export async function recalculateMine(mineId) {
  const [mines, violations, compliances, actions] = await Promise.all([
    list('mines'), list('violations'), list('compliances'), list('actions'),
  ]);
  const mine = mines.find((item) => String(item.id) === String(mineId));
  if (!mine) return null;
  const risk = calculateRisk({ mineId, violations, compliances, actions });
  await update('mines', mineId, { riskScore: risk.score, riskLevel: risk.level, riskFactors: risk.factors, compliancePercentage: risk.compliancePercentage });
  return { ...risk, mineId };
}

export async function recalculateAll() {
  const mines = await list('mines');
  const results = [];
  for (const mine of mines) results.push(await recalculateMine(mine.id));
  return results;
}
