import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRisk } from './riskEngine.js';

const mineId = 'mine-a';

test('an empty, compliant mine receives a low risk score', () => {
  const risk = calculateRisk({ mineId, violations: [], compliances: [{ mineId, status: 'COMPLIANT' }], actions: [] });
  assert.equal(risk.score, 0);
  assert.equal(risk.level, 'LOW');
  assert.equal(risk.compliancePercentage, 100);
  assert.deepEqual(risk.factors, ['No material open risks identified']);
});

test('critical severity, overdue records and repeat findings are explainable and bounded', () => {
  const overdue = new Date(Date.now() - 45 * 86400000).toISOString();
  const violations = Array.from({ length: 4 }, (_, index) => ({ id: `v-${index}`, mineId, category: 'Safety', severity: 'CRITICAL', status: 'OVERDUE', deadline: overdue }));
  const compliances = Array.from({ length: 4 }, (_, index) => ({ id: `c-${index}`, mineId, status: 'OVERDUE', dueDate: overdue }));
  const actions = Array.from({ length: 4 }, (_, index) => ({ id: `a-${index}`, mineId, status: 'OVERDUE', deadline: overdue }));
  const risk = calculateRisk({ mineId, violations, compliances, actions });
  assert.ok(risk.score >= 81 && risk.score <= 100);
  assert.equal(risk.level, 'CRITICAL');
  assert.equal(risk.components.severity, 100);
  assert.equal(risk.components.overdueDays, 100);
  assert.ok(risk.factors.some((factor) => factor.includes('repeated safety violations')));
  assert.ok(risk.factors.some((factor) => factor.includes('unresolved corrective actions')));
});

test('closed violations and verified actions do not contribute to open risk', () => {
  const risk = calculateRisk({
    mineId,
    violations: [{ mineId, severity: 'CRITICAL', category: 'Safety', status: 'CLOSED' }],
    compliances: [{ mineId, status: 'COMPLIANT' }],
    actions: [{ mineId, status: 'VERIFIED' }],
  });
  assert.equal(risk.score, 0);
  assert.equal(risk.level, 'LOW');
});
