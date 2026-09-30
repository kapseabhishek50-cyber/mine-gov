export type Role = 'ADMIN' | 'MINE_OFFICER' | 'INSPECTOR' | 'MANAGEMENT';
export interface User { id: string; name: string; email: string; role: Role; mineId?: string; department?: string; phone?: string; active?: boolean }
export interface Mine { id: string; name: string; code: string; state: string; district: string; location: string; coordinates: { lat: number; lng: number }; mineType: string; status: string; riskScore: number; riskLevel: string; compliancePercentage: number; riskFactors?: string[]; overview?: Record<string, number> }
export interface Evidence { name: string; url?: string; size?: number; uploadedAt?: string }
export interface RecordBase { id: string; mineId: string; status: string; createdAt?: string; updatedAt?: string; [key: string]: any }
export interface Column<T> { key: string; label: string; render?: (row: T) => React.ReactNode; className?: string }
