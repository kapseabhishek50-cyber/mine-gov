import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, RefreshCw } from 'lucide-react';

export function Button({ children, variant = 'primary', size = 'md', className = '', type = 'button', disabled, onClick, ...props }: {
  children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'; size?: 'sm' | 'md' | 'lg'; className?: string; type?: 'button' | 'submit'; disabled?: boolean; onClick?: () => void; [key: string]: any;
}) {
  return <button type={type} className={`btn btn-${variant} btn-${size} ${className}`} disabled={disabled} onClick={onClick} {...props}>{children}</button>;
}

export function PageHeader({ eyebrow, title, description, actions, children }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode; children?: ReactNode }) {
  return <div className="page-header">
    <div className="page-heading">{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}{children}
  </div>;
}

export function Card({ children, className = '', title, subtitle, action, noPadding = false }: { children: ReactNode; className?: string; title?: string; subtitle?: string; action?: ReactNode; noPadding?: boolean }) {
  return <section className={`panel ${noPadding ? 'panel-no-padding' : ''} ${className}`}>
    {(title || subtitle || action) && <div className="panel-header"><div>{title && <h2 className="panel-title">{title}</h2>}{subtitle && <p className="panel-subtitle">{subtitle}</p>}</div>{action}</div>}
    {children}
  </section>;
}

export function StatusBadge({ value, size = 'md' }: { value?: string; size?: 'sm' | 'md' }) {
  const normalized = (value || 'unknown').toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
  const tone = normalized.includes('critical') || normalized.includes('overdue') || normalized.includes('rejected') || normalized === 'open' ? 'red'
    : normalized.includes('high') || normalized.includes('pending') || normalized.includes('review') || normalized.includes('submitted') || normalized === 'in-progress' ? 'amber'
      : normalized.includes('medium') || normalized.includes('active') ? 'blue'
        : normalized.includes('low') || normalized.includes('compliant') || normalized.includes('verified') || normalized.includes('closed') ? 'green' : 'slate';
  return <span className={`status-badge tone-${tone} badge-${size}`}><i />{(value || 'UNKNOWN').replaceAll('_', ' ')}</span>;
}

export function RiskBadge({ level, score, compact = false }: { level?: string; score?: number; compact?: boolean }) {
  const normalized = (level || (score !== undefined ? score <= 30 ? 'LOW' : score <= 60 ? 'MEDIUM' : score <= 80 ? 'HIGH' : 'CRITICAL' : 'LOW')).toLowerCase();
  return <span className={`risk-badge risk-${normalized}`}>{!compact && <i />} {compact ? '' : `${(level || '').toLowerCase() || (score !== undefined ? score <= 30 ? 'low' : score <= 60 ? 'medium' : score <= 80 ? 'high' : 'critical' : 'low')}${score !== undefined ? ` · ${score}` : ''}`}{compact && (score ?? '')}</span>;
}

export function Avatar({ name, size = 'md', color = 'blue' }: { name?: string; size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const text = (name || 'MG').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <span className={`avatar avatar-${size} avatar-${color}`}>{text || 'MG'}</span>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

export function LoadingState({ label = 'Loading records…' }: { label?: string }) {
  return <div className="loading-state"><RefreshCw size={17} className="spin" /><span>{label}</span></div>;
}

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`skeleton ${className}`} />; }

export function KpiCard({ label, value, delta, icon, color, note, index = 0 }: { label: string; value: number | string; delta?: string; icon: ReactNode; color: string; note?: string; index?: number }) {
  return <motion.div className="kpi-card panel" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .36, delay: index * .055 }}>
    <div className="kpi-top"><span className={`kpi-icon ${color}`}>{icon}</span>{delta && <span className="kpi-delta"><ArrowUpRight size={13} />{delta}</span>}</div>
    <div className="kpi-value">{value}</div><div className="kpi-label">{label}</div>{note && <div className="kpi-note">{note}</div>}
  </motion.div>;
}

export interface TableColumn<T> { key: string; label: string; className?: string; render?: (item: T) => ReactNode }
export function DataTable<T extends { id: string }>({ columns, rows, loading, onRowClick, emptyTitle = 'No records found', emptyDescription = 'Adjust your filters or create a new record to get started.' }: {
  columns: TableColumn<T>[]; rows: T[]; loading?: boolean; onRowClick?: (row: T) => void; emptyTitle?: string; emptyDescription?: string;
}) {
  if (loading) return <div className="table-loading">{[0, 1, 2, 3, 4].map((i) => <div className="table-skeleton-row" key={i}><Skeleton className="skeleton-cell" /><Skeleton className="skeleton-cell wide" /><Skeleton className="skeleton-cell" /><Skeleton className="skeleton-cell" /></div>)}</div>;
  if (!rows.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <div className="table-scroll"><table className="data-table"><thead><tr>{columns.map((column) => <th className={column.className || ''} key={column.key}>{column.label}</th>)}</tr></thead><tbody>
    {rows.map((row) => <tr key={row.id} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'row-clickable' : ''}>{columns.map((column) => <td className={column.className || ''} key={column.key}>{column.render ? column.render(row) : String((row as any)[column.key] ?? '—')}</td>)}</tr>)}
  </tbody></table></div>;
}
