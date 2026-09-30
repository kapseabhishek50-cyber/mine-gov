import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, ClipboardCheck, ClipboardList, HardHat, ShieldAlert, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, formatDate } from '../lib/api';
import { useScope } from '../context/ScopeContext';
import type { Mine } from '../types';
import { Card, DataTable, KpiCard, LoadingState, PageHeader, RiskBadge, StatusBadge } from '../components/ui';

interface DashboardSummary { totalMines: number; complianceRate: number; highRiskMines: number; openViolations: number; overdueActions: number; inspectionsThisMonth: number; highRiskList: (Mine & { openViolations: number; overdueActions: number })[] }
interface Trends { complianceTrend: { month: string; compliance: number }[]; riskDistribution: { level: string; count: number; color: string }[]; violationsByCategory: { category: string; count: number }[]; actionStatus: { status: string; count: number }[] }
const params = (id: string) => id && id !== 'all' ? `?mineId=${encodeURIComponent(id)}` : '';

export function DashboardPage() {
  const { selectedMine } = useScope();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setLoading(true); setError('');
    Promise.all([api.get<DashboardSummary>(`/dashboard/summary${params(selectedMine)}`), api.get<Trends>(`/dashboard/trends${params(selectedMine)}`)])
      .then(([nextSummary, nextTrends]) => { setSummary(nextSummary); setTrends(nextTrends); })
      .catch((err) => setError(err.message || 'Dashboard data could not be loaded.'))
      .finally(() => setLoading(false));
  }, [selectedMine]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return <div className="page-enter">
    <PageHeader eyebrow="OPERATIONS INTELLIGENCE" title="Dashboard" description={`${greeting}, ${formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}. Here's your portfolio at a glance.`} actions={<><Link className="btn btn-secondary" to="/reports"><ClipboardList size={16} /> View reports</Link><Link className="btn btn-primary" to="/ai-assistant"><Sparkles size={16} /> AI summary</Link></>} />
    {error && <div className="inline-error"><TriangleAlert size={16} />{error}<button onClick={() => window.location.reload()}>Retry</button></div>}
    {loading || !summary || !trends ? <div className="dashboard-loading"><LoadingState label="Loading portfolio intelligence…" /><div className="loading-kpis">{[1, 2, 3, 4, 5, 6].map((value) => <div className="panel kpi-skeleton" key={value} />)}</div></div> : <>
      <div className="kpi-grid">
        <KpiCard label="Total mines" value={summary.totalMines} icon={<HardHat size={18} />} color="indigo" note="Across monitored regions" index={0} />
        <KpiCard label="Compliance rate" value={`${summary.complianceRate}%`} icon={<ShieldCheck size={18} />} color="emerald" delta="Portfolio" note="Requirements marked compliant" index={1} />
        <KpiCard label="High risk mines" value={summary.highRiskMines} icon={<TriangleAlert size={18} />} color="orange" note="Require active oversight" index={2} />
        <KpiCard label="Open violations" value={summary.openViolations} icon={<ShieldAlert size={18} />} color="rose" note="Across all monitored mines" index={3} />
        <KpiCard label="Overdue actions" value={summary.overdueActions} icon={<ClipboardCheck size={18} />} color="violet" note="Past the required deadline" index={4} />
        <KpiCard label="Inspections this month" value={summary.inspectionsThisMonth} icon={<Activity size={18} />} color="cyan" note="Submitted field inspections" index={5} />
      </div>

      <div className="dashboard-charts-row charts-primary">
        <Card className="chart-card compliance-chart-card" title="Compliance trend" subtitle="Portfolio status over the last six months" action={<span className="chart-legend"><i className="legend-dot blue-dot" /> Compliance</span>}>
          <div className="chart-summary"><span>{trends.complianceTrend[trends.complianceTrend.length - 1]?.compliance ?? summary.complianceRate}%</span><small>current portfolio rate</small><span className="trend-chip"><ArrowUpRight size={13} /> Live data</span></div>
          <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trends.complianceTrend} margin={{ left: -20, right: 8, top: 12, bottom: 0 }}>
            <defs><linearGradient id="complianceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="4%" stopColor="#3868e8" stopOpacity={.2} /><stop offset="95%" stopColor="#3868e8" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--chart-grid)" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} dy={9} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(value) => `${value}%`} /><Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-main)', fontSize: 12 }} formatter={(value: number) => [`${value}%`, 'Compliance']} /><Area type="monotone" dataKey="compliance" stroke="#3868e8" strokeWidth={2.7} fill="url(#complianceFill)" activeDot={{ r: 5, strokeWidth: 3, stroke: '#fff' }} />
          </AreaChart></ResponsiveContainer></div>
        </Card>
        <Card className="chart-card risk-distribution-card" title="Risk distribution" subtitle="Mines by current risk level">
          <div className="risk-chart-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={trends.riskDistribution} dataKey="count" nameKey="level" innerRadius="66%" outerRadius="88%" paddingAngle={4} stroke="none">{trends.riskDistribution.map((entry) => <Cell key={entry.level} fill={entry.color} />)}</Pie><Tooltip contentStyle={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-main)', fontSize: 12 }} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{summary.totalMines}</strong><small>mines</small></div></div>
          <div className="risk-legend">{trends.riskDistribution.map((entry) => <div key={entry.level}><span><i style={{ background: entry.color }} />{entry.level}</span><b>{entry.count}</b></div>)}</div>
        </Card>
      </div>

      <div className="dashboard-charts-row charts-secondary">
        <Card className="chart-card" title="Violation concentration" subtitle="Recorded by governance category" action={<Link className="text-link" to="/violations">View register <ArrowRight size={14} /></Link>}>
          <div className="bar-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={trends.violationsByCategory} layout="vertical" margin={{ left: 0, right: 16, top: 2, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 4" horizontal={false} stroke="var(--chart-grid)" /><XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} /><YAxis type="category" dataKey="category" width={92} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} /><Tooltip cursor={{ fill: 'var(--chart-hover)' }} contentStyle={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-main)', fontSize: 12 }} /><Bar dataKey="count" fill="#758ef0" radius={[0, 5, 5, 0]} barSize={13} /></BarChart></ResponsiveContainer></div>
        </Card>
        <Card className="chart-card" title="Corrective action health" subtitle="Workflow status across all actions" action={<Link className="text-link" to="/actions">View actions <ArrowRight size={14} /></Link>}>
          <div className="action-status-list">{trends.actionStatus.filter((entry) => entry.count || ['OPEN', 'IN PROGRESS', 'SUBMITTED', 'VERIFIED', 'OVERDUE'].includes(entry.status)).map((entry, index) => {
            const max = Math.max(...trends.actionStatus.map((item) => item.count), 1);
            return <div className="action-status-row" key={entry.status}><span className={`status-square square-${index}`} /><span>{entry.status}</span><div className="action-bar-track"><i style={{ width: `${Math.max(entry.count ? 8 : 0, entry.count / max * 100)}%` }} /></div><b>{entry.count}</b></div>;
          })}</div>
          <div className="action-footer-note"><span className="note-icon"><ClipboardCheck size={15} /></span><span>Evidence and verification are tracked for every action.</span></div>
        </Card>
      </div>

      <Card className="risk-table-card" title="Mines requiring attention" subtitle="Highest current deterministic risk scores" action={<Link className="text-link" to="/risk-analytics">Open risk analytics <ArrowRight size={14} /></Link>} noPadding>
        <DataTable rows={summary.highRiskList} columns={[
          { key: 'mine', label: 'Mine', render: (mine) => <div className="mine-cell"><span className="mine-cell-icon"><HardHat size={16} /></span><span><b>{mine.name}</b><small>{mine.code} · {mine.district}, {mine.state}</small></span></div> },
          { key: 'risk', label: 'Risk score', render: (mine) => <div className="risk-score-cell"><strong>{mine.riskScore}</strong><div className="risk-meter"><i className={`risk-meter-${mine.riskLevel.toLowerCase()}`} style={{ width: `${mine.riskScore}%` }} /></div></div> },
          { key: 'compliance', label: 'Compliance', render: (mine) => <span className={`compliance-number ${mine.compliancePercentage < 75 ? 'compliance-low' : ''}`}>{mine.compliancePercentage}%</span> },
          { key: 'violations', label: 'Open violations', render: (mine) => <span className="count-pill">{mine.openViolations}</span> },
          { key: 'actions', label: 'Risk level', render: (mine) => <RiskBadge level={mine.riskLevel} /> },
        ]} onRowClick={(mine) => navigate(`/mines/${mine.id}`)} emptyTitle="No high-risk mines" emptyDescription="All mines are currently below the high-risk threshold." />
      </Card>
      <div className="dashboard-footnote"><span className="footnote-dot" /> Risk scores are calculated deterministically from violations, overdue days, repeat findings, compliance status and unresolved actions. <Link to="/risk-analytics">Learn more <ArrowRight size={13} /></Link></div>
    </>}
  </div>;
}
