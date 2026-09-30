import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { create, databaseMode, list, newId, remove, update } from '../config/database.js';

const day = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * day).toISOString();
const fromNow = (days) => new Date(Date.now() + days * day).toISOString();
const demoPassword = 'MineGov2026!';
const uploadDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
const demoEvidenceUrl = '/api/uploads/files/demo-evidence.txt';
async function ensureDemoEvidence() {
  await fs.mkdir(uploadDirectory, { recursive: true });
  try { await fs.access(path.join(uploadDirectory, 'demo-evidence.txt')); }
  catch { await fs.writeFile(path.join(uploadDirectory, 'demo-evidence.txt'), 'MINEGOV AI · DEMO EVIDENCE\n\nThis sample evidence file is for product demonstration only. It does not represent a real statutory record or mine inspection.\n'); }
}

const mineBlueprints = [
  { name: 'Wardha Open Cast Mine', code: 'WOC-014', state: 'Maharashtra', district: 'Wardha', location: 'Wani, Wardha district', coordinates: { lat: 20.0553, lng: 78.9531 }, mineType: 'Open Cast', status: 'ACTIVE' },
  { name: 'Chandrapur Coal Mine', code: 'CCM-022', state: 'Maharashtra', district: 'Chandrapur', location: 'Ballarpur, Chandrapur district', coordinates: { lat: 19.8398, lng: 79.3544 }, mineType: 'Underground', status: 'ACTIVE' },
  { name: 'Nagpur Central Mine', code: 'NCM-008', state: 'Maharashtra', district: 'Nagpur', location: 'Kamptee, Nagpur district', coordinates: { lat: 21.2197, lng: 79.2072 }, mineType: 'Underground', status: 'ACTIVE' },
  { name: 'Korba Mining Site', code: 'KMS-031', state: 'Chhattisgarh', district: 'Korba', location: 'Gevra, Korba district', coordinates: { lat: 22.3595, lng: 82.6501 }, mineType: 'Open Cast', status: 'ACTIVE' },
  { name: 'Dhanbad Mining Site', code: 'DMS-019', state: 'Jharkhand', district: 'Dhanbad', location: 'Jharia, Dhanbad district', coordinates: { lat: 23.7565, lng: 86.4139 }, mineType: 'Underground', status: 'ACTIVE' },
];

const complianceBlueprints = [
  ['Ventilation survey and statutory readings', 'Safety', 'Coal Mines Regulations, 2017 · Reg. 153'],
  ['Dust suppression system inspection', 'Environment', 'Environment Protection Rules · Schedule I'],
  ['Worker PPE issue and fitment register', 'Labour', 'Mines Act, 1952 · Section 18'],
  ['Explosives magazine inventory reconciliation', 'Safety', 'Explosives Rules, 2008 · Rule 10'],
  ['Monthly production return submission', 'Production', 'Coal Mines (Conservation) Rules, 2017'],
  ['Shift attendance and competency records', 'Documentation', 'Coal Mines Regulations, 2017 · Reg. 41'],
];

const inspectionNotes = [
  ['Haul road berm below safe height at north ramp', 'Safety'],
  ['Dust extraction hood requires filter replacement', 'Environment'],
  ['Two workers missing current fit-test records', 'Labour'],
  ['Conveyor C-4 emergency stop response delayed', 'Equipment'],
  ['Explosive magazine temperature log incomplete', 'Safety'],
  ['Water discharge sample collection overdue', 'Environment'],
  ['Face support inspection completed; minor timber gaps noted', 'Safety'],
  ['Training records verified for day shift crew', 'Labour'],
  ['Production weighbridge calibration certificate expiring', 'Production'],
  ['Ventilation readings within range at active heading', 'Safety'],
];

const roleUsers = [
  { name: 'Ananya Deshmukh', email: 'admin@example.com', role: 'ADMIN', department: 'Central Governance', phone: '+91 98710 44001' },
  { name: 'Raghav Kulkarni', email: 'officer@example.com', role: 'MINE_OFFICER', department: 'Mine Operations', phone: '+91 98220 61103' },
  { name: 'Meera Sahu', email: 'inspector@example.com', role: 'INSPECTOR', department: 'Safety & Inspections', phone: '+91 98101 67214' },
  { name: 'Vikram Rao', email: 'manager@example.com', role: 'MANAGEMENT', department: 'Executive Office', phone: '+91 98921 31780' },
  { name: 'Pooja Nair', email: 'pooja.nair@minegov.demo', role: 'MINE_OFFICER', department: 'Environment', phone: '+91 97640 55311' },
  { name: 'Arjun Singh', email: 'arjun.singh@minegov.demo', role: 'INSPECTOR', department: 'Field Safety', phone: '+91 93011 48823' },
  { name: 'Kavita Reddy', email: 'kavita.reddy@minegov.demo', role: 'MINE_OFFICER', department: 'Compliance', phone: '+91 99811 20642' },
  { name: 'Sanjay Toppo', email: 'sanjay.toppo@minegov.demo', role: 'INSPECTOR', department: 'Field Inspections', phone: '+91 94311 97204' },
  { name: 'Nisha Thomas', email: 'nisha.thomas@minegov.demo', role: 'MANAGEMENT', department: 'Risk & Assurance', phone: '+91 98231 20995' },
  { name: 'Devendra Patil', email: 'devendra.patil@minegov.demo', role: 'MINE_OFFICER', department: 'Operations Assurance', phone: '+91 94221 52861' },
];

export async function seedDemoData({ force = false } = {}) {
  await ensureDemoEvidence();
  const existingUsers = await list('users');
  if (existingUsers.length && !force) return { seeded: false, message: 'Data already exists.' };
  if (force) {
    const collections = ['auditLogs', 'alerts', 'actions', 'violations', 'inspections', 'compliances', 'users', 'mines'];
    // Force seeding is intentionally only supported in a local JSON environment or Firestore Emulator.
    if (databaseMode() === 'firebase' && !process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error('Use a clean Firebase Firestore project or the Firestore Emulator to force-reseed.');
    }
    for (const collection of collections) {
      const items = await list(collection);
      for (const item of items) {
        await remove(collection, item.id);
      }
    }
  }

  const mineIds = mineBlueprints.map(() => newId());
  const userIds = roleUsers.map(() => newId());
  const officerByMine = [userIds[1], userIds[4], userIds[6], userIds[9], userIds[0]];
  const inspectorByMine = [userIds[2], userIds[5], userIds[7], userIds[0], userIds[0]];
  const userMineIndex = { 1: 0, 2: 0, 4: 1, 5: 1, 6: 2, 7: 2, 9: 3 };
  const mines = await Promise.all(mineBlueprints.map((mine, index) => create('mines', {
    id: mineIds[index], ...mine, riskScore: [82, 69, 48, 24, 76][index], riskLevel: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'HIGH'][index],
    compliancePercentage: [72, 78, 86, 96, 75][index], riskFactors: [],
  })));
  const passwordHash = await bcrypt.hash(demoPassword, 10);
  await Promise.all(roleUsers.map((user, index) => create('users', {
    id: userIds[index], ...user, passwordHash, active: true,
    mineId: userMineIndex[index] === undefined ? null : mineIds[userMineIndex[index]],
  })));

  const compliances = [];
  for (let i = 0; i < 30; i += 1) {
    const mineIndex = i % 5;
    const requirement = complianceBlueprints[i % complianceBlueprints.length];
    const statusByMine = [
      ['OVERDUE', 'OVERDUE', 'PENDING', 'UNDER_REVIEW', 'COMPLIANT', 'PENDING'],
      ['OVERDUE', 'PENDING', 'UNDER_REVIEW', 'COMPLIANT', 'COMPLIANT', 'PENDING'],
      ['OVERDUE', 'PENDING', 'UNDER_REVIEW', 'COMPLIANT', 'COMPLIANT', 'COMPLIANT'],
      ['PENDING', 'COMPLIANT', 'COMPLIANT', 'COMPLIANT', 'COMPLIANT', 'COMPLIANT'],
      ['OVERDUE', 'OVERDUE', 'PENDING', 'UNDER_REVIEW', 'COMPLIANT', 'COMPLIANT'],
    ];
    const status = statusByMine[mineIndex][Math.floor(i / 5)];
    const dueDate = status === 'OVERDUE' ? ago(3 + (i % 21)) : status === 'COMPLIANT' ? fromNow(18 + (i % 50)) : fromNow(1 + (i % 5));
    compliances.push(await create('compliances', {
      id: newId(), mineId: mineIds[mineIndex], title: requirement[0], category: requirement[1], regulation: requirement[2],
      department: ['Safety', 'Environment', 'Operations', 'Human Resources'][i % 4], assignedOfficer: officerByMine[mineIndex], dueDate,
      priority: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'][i % 4], status,
      remarks: status === 'OVERDUE' ? 'Evidence is outstanding. Escalated to the mine officer for action.' : 'Review against the latest statutory register before sign-off.',
      evidence: i % 7 === 0 ? [{ name: 'DEMO compliance register evidence.txt', url: demoEvidenceUrl, uploadedAt: ago(i % 10) }] : [],
      createdAt: ago(180 - (i * 5)), updatedAt: ago(i % 12),
    }));
  }

  const inspections = [];
  for (let i = 0; i < 20; i += 1) {
    const mineIndex = i % 5;
    const note = inspectionNotes[i % inspectionNotes.length];
    inspections.push(await create('inspections', {
      id: newId(), mineId: mineIds[mineIndex], inspectionType: ['Safety', 'Environment', 'Equipment', 'General', 'Labour'][i % 5],
      inspectorId: inspectorByMine[mineIndex], date: ago(2 + (i * 3) % 60), time: `${String(8 + (i % 9)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
      coordinates: { lat: mineBlueprints[mineIndex].coordinates.lat + (i % 3 - 1) * 0.009, lng: mineBlueprints[mineIndex].coordinates.lng + (i % 4 - 1.5) * 0.008 },
      observation: note[0], severity: ['HIGH', 'MEDIUM', 'CRITICAL', 'LOW', 'MEDIUM'][i % 5],
      remarks: i % 2 ? 'Follow-up required during next scheduled inspection.' : 'Observed and logged with the shift supervisor.',
      photos: i % 3 === 0 ? [{ name: 'DEMO field observation evidence.txt', url: demoEvidenceUrl, uploadedAt: ago(i % 8) }] : [], documents: [], status: 'SUBMITTED',
      createdAt: ago(2 + (i * 3) % 60),
    }));
  }

  const violations = [];
  for (let i = 0; i < 25; i += 1) {
    const mineIndex = i % 5;
    const inspection = inspections[i % inspections.length];
    const note = inspectionNotes[i % inspectionNotes.length];
    const violationStatusByMine = [
      ['OPEN', 'OVERDUE', 'IN_PROGRESS', 'OPEN', 'VERIFICATION_PENDING'],
      ['OPEN', 'IN_PROGRESS', 'OVERDUE', 'VERIFICATION_PENDING', 'CLOSED'],
      ['IN_PROGRESS', 'CLOSED', 'OPEN', 'ACTION_SUBMITTED', 'OVERDUE'],
      ['CLOSED', 'CLOSED', 'CLOSED', 'CLOSED', 'OPEN'],
      ['OPEN', 'OVERDUE', 'OPEN', 'IN_PROGRESS', 'OPEN'],
    ];
    const severityByMine = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'CRITICAL'];
    const status = violationStatusByMine[mineIndex][Math.floor(i / 5)];
    violations.push(await create('violations', {
      id: newId(), mineId: mineIds[mineIndex], inspectionId: inspection.id,
      title: `${note[1]} finding: ${note[0].split(' ').slice(0, 5).join(' ')}`,
      description: `${note[0]}. The responsible shift supervisor has been notified and corrective steps must be recorded with verifiable evidence.`,
      category: note[1], severity: severityByMine[mineIndex],
      assignedOfficer: officerByMine[mineIndex], deadline: status === 'OVERDUE' ? ago(2 + i % 10) : fromNow(i % 5 + 1), status,
      evidence: i % 5 === 0 ? [{ name: 'DEMO violation evidence.txt', url: demoEvidenceUrl, uploadedAt: ago(i % 10) }] : [],
      activity: [{ label: 'Violation recorded from field inspection', by: roleUsers[2].name, at: ago(2 + i % 14) }],
      createdAt: ago(2 + (i * 2) % 48),
    }));
  }

  for (let i = 0; i < 20; i += 1) {
    const violation = violations[i];
    const actionStatusByMine = [
      ['OPEN', 'IN_PROGRESS', 'SUBMITTED', 'IN_PROGRESS'],
      ['OPEN', 'IN_PROGRESS', 'OVERDUE', 'SUBMITTED'],
      ['OPEN', 'VERIFIED', 'OPEN', 'REJECTED'],
      ['VERIFIED', 'VERIFIED', 'VERIFIED', 'VERIFIED'],
      ['OVERDUE', 'IN_PROGRESS', 'OPEN', 'REJECTED'],
    ];
    const status = actionStatusByMine[i % 5][Math.floor(i / 5)];
    const action = await create('actions', {
      id: newId(), violationId: violation.id, mineId: violation.mineId,
      description: ['Reinstate compliant berm height along the north haul road and submit geotagged closure photos.', 'Replace the dust extraction filter and attach the maintenance work order.', 'Complete fit-test records for affected crew and upload signed register.', 'Repair and function-test the conveyor emergency stop circuit.', 'Reconcile the magazine temperature log with the shift book.'][i % 5],
      assignedOfficer: violation.assignedOfficer,
      deadline: status === 'OVERDUE' ? ago(1 + i % 8) : fromNow(2 + i % 12),
      status, evidence: status === 'SUBMITTED' || status === 'VERIFIED' ? [{ name: 'DEMO corrective action evidence.txt', url: demoEvidenceUrl, uploadedAt: ago(i % 6) }] : [],
      submittedAt: ['SUBMITTED', 'VERIFIED'].includes(status) ? ago(i % 8) : null,
      verifiedBy: status === 'VERIFIED' ? userIds[1] : null,
      verifiedAt: status === 'VERIFIED' ? ago(i % 5) : null,
      verificationNote: status === 'VERIFIED' ? 'Evidence reviewed and corrective action confirmed in the field.' : '',
      createdAt: ago(1 + i * 2),
    });
    if (status === 'VERIFIED') {
      await update('violations', violation.id, { status: 'CLOSED' });
    } else if (status === 'SUBMITTED') {
      await update('violations', violation.id, { status: 'VERIFICATION_PENDING' });
    }
  }

  const alertSamples = [
    ['COMPLIANCE_OVERDUE', 'HIGH', 'Statutory compliance deadline has passed.'],
    ['DEADLINE_APPROACHING', 'MEDIUM', 'Compliance evidence is due within 72 hours.'],
    ['VIOLATION_DEADLINE', 'HIGH', 'Corrective action deadline is approaching.'],
    ['ACTION_OVERDUE', 'CRITICAL', 'Corrective action is overdue and needs escalation.'],
    ['HIGH_RISK_MINE', 'HIGH', 'Mine risk score requires management review.'],
    ['CRITICAL_VIOLATION', 'CRITICAL', 'A critical severity violation has been recorded.'],
    ['REPEATED_VIOLATION', 'HIGH', 'Repeated category finding detected at this mine.'],
  ];
  for (let i = 0; i < 20; i += 1) {
    const [type, severity, message] = alertSamples[i % alertSamples.length];
    await create('alerts', {
      id: newId(), type, severity, mineId: mineIds[i % mineIds.length], entityType: i % 2 ? 'compliance' : 'violation',
      entityId: i % 2 ? compliances[i % compliances.length].id : violations[i % violations.length].id,
      message, read: i % 4 === 0, createdAt: ago((i * 2) % 18),
    });
  }

  return { seeded: true, mines: mines.length, users: roleUsers.length, compliances: compliances.length, inspections: inspections.length, violations: violations.length, actions: 20, alerts: 20, demoPassword };
}
