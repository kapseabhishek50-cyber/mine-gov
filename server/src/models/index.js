import mongoose from 'mongoose';

const { Schema } = mongoose;
const idRef = (ref) => ({ type: Schema.Types.ObjectId, ref, index: true });
const common = { timestamps: true, strict: false, versionKey: false, minimize: false };

export const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'MINE_OFFICER', 'INSPECTOR', 'MANAGEMENT'], required: true, index: true },
  mineId: idRef('Mine'),
  department: String,
  phone: String,
  active: { type: Boolean, default: true },
}, common));

export const Mine = mongoose.model('Mine', new Schema({
  name: { type: String, required: true, index: true },
  code: { type: String, required: true, unique: true },
  state: String, district: String, location: String,
  coordinates: { lat: Number, lng: Number },
  mineType: String, status: { type: String, default: 'ACTIVE', index: true },
  riskScore: { type: Number, default: 0 }, riskLevel: String,
  compliancePercentage: { type: Number, default: 0 },
  riskFactors: [String],
}, common));

export const Compliance = mongoose.model('Compliance', new Schema({
  title: { type: String, required: true, index: true }, category: { type: String, index: true }, regulation: String,
  mineId: idRef('Mine'), department: String, assignedOfficer: idRef('User'), dueDate: { type: Date, index: true },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM', index: true },
  status: { type: String, enum: ['COMPLIANT', 'PENDING', 'UNDER_REVIEW', 'OVERDUE'], default: 'PENDING', index: true },
  evidence: [Schema.Types.Mixed], remarks: String,
}, common));

export const Inspection = mongoose.model('Inspection', new Schema({
  mineId: idRef('Mine'), inspectionType: String, inspectorId: idRef('User'), date: { type: Date, index: true }, time: String,
  coordinates: { lat: Number, lng: Number }, observation: String,
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], index: true },
  photos: [Schema.Types.Mixed], documents: [Schema.Types.Mixed], remarks: String,
  status: { type: String, default: 'SUBMITTED', index: true },
}, common));

export const Violation = mongoose.model('Violation', new Schema({
  mineId: idRef('Mine'), inspectionId: idRef('Inspection'), title: { type: String, required: true, index: true },
  description: String, category: { type: String, index: true },
  severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], index: true },
  assignedOfficer: idRef('User'), deadline: { type: Date, index: true },
  status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'ACTION_SUBMITTED', 'VERIFICATION_PENDING', 'CLOSED', 'OVERDUE'], default: 'OPEN', index: true },
  evidence: [Schema.Types.Mixed], activity: [Schema.Types.Mixed],
}, common));

export const CorrectiveAction = mongoose.model('CorrectiveAction', new Schema({
  violationId: idRef('Violation'), mineId: idRef('Mine'), description: { type: String, required: true },
  assignedOfficer: idRef('User'), deadline: { type: Date, index: true }, evidence: [Schema.Types.Mixed],
  submittedAt: Date, verifiedBy: idRef('User'), verifiedAt: Date, verificationNote: String,
  status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'OVERDUE'], default: 'OPEN', index: true },
}, common));

export const Alert = mongoose.model('Alert', new Schema({
  type: { type: String, index: true }, severity: { type: String, index: true }, mineId: idRef('Mine'),
  entityType: String, entityId: String, message: String, read: { type: Boolean, default: false, index: true },
}, common));

export const AuditLog = mongoose.model('AuditLog', new Schema({
  userId: idRef('User'), userName: String, action: { type: String, index: true },
  entity: { type: String, index: true }, entityId: String,
  oldValue: Schema.Types.Mixed, newValue: Schema.Types.Mixed,
  ipAddress: String,
}, common));

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
