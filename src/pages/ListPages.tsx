import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDownUp, ArrowRight, CalendarDays, ChevronDown, ClipboardCheck, ClipboardList, FileCheck2, Filter, HardHat, MapPin, Plus, Pencil, Search, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api, formatDate, formatRelative, humanize } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { useToast } from '../context/ToastContext';
import type { Evidence, Mine, RecordBase, User } from '../types';
import { Button, Card, DataTable, EmptyState, LoadingState, PageHeader, RiskBadge, StatusBadge } from '../components/ui';
import { Modal } from '../components/Modal';
import { FormFields, UploadField, type FieldConfig } from '../components/FormFields';

const mineQuery = (selectedMine: string) => selectedMine && selectedMine !== 'all' ? `mineId=${encodeURIComponent(selectedMine)}` : '';
const urlWithQuery = (path: string, query: URLSearchParams) => `${path}${query.size ? `?${query.toString()}` : ''}`;
const safeMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function Toolbar({ search, setSearch, status, setStatus, category, setCategory, categories, statuses, extra, categoryLabel }: {
  search: string; setSearch: (value: string) => void; status?: string; setStatus?: (value: string) => void; category?: string; setCategory?: (value: string) => void; categories?: string[]; statuses?: string[]; extra?: React.ReactNode; categoryLabel?: string;
}) {
  return <div className="table-toolbar"><label className="table-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records…" /><kbd>⌘ K</kbd></label>
    <div className="toolbar-filters">{category !== undefined && <label className="filter-select"><Filter size={14} /><select value={category} onChange={(event) => setCategory?.(event.target.value)}><option value="all">{categoryLabel || 'All categories'}</option>{categories?.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label>}
      {status !== undefined && <label className="filter-select"><select value={status} onChange={(event) => setStatus?.(event.target.value)}><option value="all">All statuses</option>{statuses?.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select><ChevronDown size={13} /></label>}{extra}</div>
  </div>;
}

const assignableUsers = (users: User[], mineId?: string) => users.filter((user) => ['ADMIN', 'MINE_OFFICER', 'INSPECTOR'].includes(user.role) && (!mineId || user.role === 'ADMIN' || String(user.mineId || '') === String(mineId)));

export function useDirectory() {
  const [mines, setMines] = useState<Mine[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { api.get<Mine[]>('/mines').then(setMines).catch(() => setMines([])); api.get<User[]>('/users').then(setUsers).catch(() => setUsers([])); }, []);
  return { mines, users, mineName: (id?: string) => mines.find((mine) => mine.id === id)?.name || '—', userName: (id?: string) => users.find((user) => user.id === id)?.name || 'Unassigned' };
}

export function MinesPage() {
  const { user } = useAuth(); const { selectedMine } = useScope(); const navigate = useNavigate(); const toast = useToast();
  const [mines, setMines] = useState<Mine[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [level, setLevel] = useState('all'); const [stateFilter, setStateFilter] = useState('all'); const [sortBy, setSortBy] = useState('riskScore'); const [sortOrder, setSortOrder] = useState('desc'); const [modal, setModal] = useState(false); const [editing, setEditing] = useState<Mine | null>(null); const [busy, setBusy] = useState(false); const [values, setValues] = useState<Record<string, any>>({});
  const load = useCallback(async () => { setLoading(true); try { const query = new URLSearchParams(); if (selectedMine !== 'all') query.set('mineId', selectedMine); if (level !== 'all') query.set('riskLevel', level); if (stateFilter !== 'all') query.set('state', stateFilter); if (search) query.set('q', search); query.set('sort', sortBy); query.set('order', sortOrder); setMines(await api.get<Mine[]>(urlWithQuery('/mines', query))); } catch (error) { toast(safeMessage(error), 'error'); } finally { setLoading(false); } }, [selectedMine, level, stateFilter, search, sortBy, sortOrder, toast]);
  useEffect(() => { void load(); }, [load]);
  const open = (mine?: Mine) => { setEditing(mine || null); setValues(mine ? { ...mine, lat: mine.coordinates?.lat, lng: mine.coordinates?.lng } : { status: 'ACTIVE', mineType: 'Open Cast', lat: '', lng: '' }); setModal(true); };
  const fields: FieldConfig[] = [
    { name: 'name', label: 'Mine name', required: true, placeholder: 'e.g. Wardha Open Cast Mine' }, { name: 'code', label: 'Mine code', required: true, placeholder: 'WOC-014' },
    { name: 'state', label: 'State', required: true }, { name: 'district', label: 'District', required: true },
    { name: 'location', label: 'Location / address', required: true, full: true },
    { name: 'lat', label: 'Latitude', type: 'number', required: true, step: 'any' }, { name: 'lng', label: 'Longitude', type: 'number', required: true, step: 'any' },
    { name: 'mineType', label: 'Mine type', type: 'select', required: true, options: ['Open Cast', 'Underground', 'Mixed'].map((value) => ({ label: value, value })) },
    { name: 'status', label: 'Status', type: 'select', required: true, options: ['ACTIVE', 'INACTIVE', 'UNDER_REVIEW'].map((value) => ({ label: humanize(value), value })) },
  ];
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); try { const { lat, lng, ...mineFields } = values; const body = { ...mineFields, coordinates: { lat: Number(lat), lng: Number(lng) } }; if (editing) await api.put(`/mines/${editing.id}`, body); else await api.post('/mines', body); toast(editing ? 'Mine details updated.' : 'Mine added to the portfolio.'); setModal(false); await load(); } catch (error) { toast(safeMessage(error), 'error'); } finally { setBusy(false); } }
  const stateOptions = [...new Set(mines.map((mine) => mine.state))].sort();
  return <div className="page-enter">
    <PageHeader eyebrow="ASSET GOVERNANCE" title="Mines" description="A single portfolio view of regulated coal operations, their locations and current risk posture." actions={user?.role === 'ADMIN' ? <Button onClick={() => open()}><Plus size={16} /> Add mine</Button> : <Link className="btn btn-secondary" to="/map"><MapPin size={16} /> View mine map</Link>} />
    <div className="overview-strip"><div><span className="overview-icon blue"><HardHat size={17} /></span><span><b>{mines.length}</b><small>monitored assets</small></span></div><div><span className="overview-icon orange"><TriangleAlert size={17} /></span><span><b>{mines.filter((mine) => mine.riskScore >= 61).length}</b><small>elevated risk</small></span></div><div><span className="overview-icon green"><ShieldCheck size={17} /></span><span><b>{mines.length ? Math.round(mines.reduce((sum, mine) => sum + mine.compliancePercentage, 0) / mines.length) : 0}%</b><small>average compliance</small></span></div></div>
    <Card className="records-card" noPadding>
      <Toolbar search={search} setSearch={setSearch} category={stateFilter} setCategory={setStateFilter} categories={stateOptions} categoryLabel="All states" statuses={undefined} extra={<><label className="filter-select"><ArrowDownUp size={13} /><select value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="riskScore">Sort: risk score</option><option value="name">Sort: mine name</option><option value="compliancePercentage">Sort: compliance</option><option value="district">Sort: district</option></select><ChevronDown size={13} /></label><button className="sort-direction" title={sortOrder === 'desc' ? 'Descending' : 'Ascending'} onClick={() => setSortOrder((value) => value === 'desc' ? 'asc' : 'desc')}>{sortOrder === 'desc' ? '↓' : '↑'}</button><label className="filter-select"><Filter size={14} /><select value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">All risk levels</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label></>} />
      <DataTable rows={mines} loading={loading} onRowClick={(mine) => navigate(`/mines/${mine.id}`)} columns={[
        { key: 'name', label: 'Mine', render: (mine) => <div className="mine-cell"><span className="mine-cell-icon"><HardHat size={16} /></span><span><b>{mine.name}</b><small>{mine.code}</small></span></div> },
        { key: 'region', label: 'Region', render: (mine) => <span className="two-line"><b>{mine.district}</b><small>{mine.state}</small></span> },
        { key: 'type', label: 'Mine type', render: (mine) => <span>{mine.mineType}</span> },
        { key: 'riskScore', label: 'Risk score', render: (mine) => <div className="risk-score-cell"><RiskBadge level={mine.riskLevel} score={mine.riskScore} /><div className="risk-meter"><i className={`risk-meter-${mine.riskLevel.toLowerCase()}`} style={{ width: `${mine.riskScore}%` }} /></div></div> },
        { key: 'compliancePercentage', label: 'Compliance', render: (mine) => <div className="percent-cell"><div className="percent-track"><i style={{ width: `${mine.compliancePercentage}%` }} /></div><b>{mine.compliancePercentage}%</b></div> },
        { key: 'status', label: 'Status', render: (mine) => <StatusBadge value={mine.status} /> },
        { key: 'actions', label: '', className: 'table-actions-cell', render: (mine) => ['ADMIN', 'MINE_OFFICER'].includes(user?.role || '') && <button className="icon-button table-action" title="Edit mine" onClick={(event) => { event.stopPropagation(); open(mine); }}><ArrowRight size={16} /></button> },
      ]} emptyTitle="No mines match" emptyDescription="Try a different search or add a mine to the portfolio." />
    </Card>
    <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Update mine profile' : 'Add a mine'} description="Mine attributes and coordinates power portfolio risk and map views." onSubmit={save} submitLabel={editing ? 'Save mine' : 'Create mine'} busy={busy} wide>
      <FormFields fields={fields} values={values} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />
    </Modal>
  </div>;
}

const complianceCategories = ['Safety', 'Environment', 'Labour', 'Production', 'Documentation'];
const complianceStatuses = ['COMPLIANT', 'PENDING', 'UNDER_REVIEW', 'OVERDUE'];
export function CompliancePage() {
  const { user } = useAuth(); const { selectedMine } = useScope(); const { mines, users, mineName, userName } = useDirectory(); const toast = useToast(); const navigate = useNavigate();
  const [rows, setRows] = useState<RecordBase[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [category, setCategory] = useState('all'); const [status, setStatus] = useState('all'); const [dueFilter, setDueFilter] = useState('all'); const [priority, setPriority] = useState('all'); const [modal, setModal] = useState(false); const [editing, setEditing] = useState<RecordBase | null>(null); const [values, setValues] = useState<Record<string, any>>({}); const [files, setFiles] = useState<FileList | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const query = new URLSearchParams(); if (selectedMine !== 'all') query.set('mineId', selectedMine); if (search) query.set('q', search); if (category !== 'all') query.set('category', category); if (status !== 'all') query.set('status', status); if (priority !== 'all') query.set('priority', priority); if (dueFilter !== 'all') query.set('due', dueFilter); setRows(await api.get<RecordBase[]>(urlWithQuery('/compliances', query))); } catch (error) { toast(safeMessage(error), 'error'); } finally { setLoading(false); } }, [selectedMine, search, category, status, priority, dueFilter, toast]);
  useEffect(() => { void load(); }, [load]);
  const fields: FieldConfig[] = useMemo(() => [
    { name: 'title', label: 'Requirement title', required: true, full: true, placeholder: 'e.g. Monthly ventilation survey' },
    { name: 'mineId', label: 'Mine', type: 'select', required: true, options: mines.map((mine) => ({ label: mine.name, value: mine.id })) },
    { name: 'category', label: 'Category', type: 'select', required: true, options: complianceCategories.map((value) => ({ label: value, value })) },
    { name: 'regulation', label: 'Regulation / standard', required: true, placeholder: 'Coal Mines Regulations, 2017 · Reg. 153' },
    { name: 'department', label: 'Responsible department', required: true, placeholder: 'Safety' },
    { name: 'assignedOfficer', label: 'Assigned officer', type: 'select', options: assignableUsers(users, values.mineId).map((user) => ({ label: user.name, value: user.id })) },
    { name: 'dueDate', label: 'Due date', type: 'date', required: true },
    { name: 'priority', label: 'Priority', type: 'select', required: true, options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => ({ label: humanize(value), value })) },
    { name: 'status', label: 'Status', type: 'select', required: true, options: complianceStatuses.map((value) => ({ label: humanize(value), value })) },
    { name: 'remarks', label: 'Remarks', type: 'textarea', full: true },
  ], [mines, users, values.mineId]);
  const open = (item?: RecordBase) => { setEditing(item || null); setFiles(null); setValues(item ? { ...item, dueDate: item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : '' } : { mineId: selectedMine !== 'all' ? selectedMine : mines[0]?.id, category: 'Safety', priority: 'MEDIUM', status: 'PENDING', dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), department: 'Safety', evidence: [] }); setModal(true); };
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); try { let evidence: Evidence[] = values.evidence || []; if (files?.length) evidence = [...evidence, ...(await api.upload(files)).files]; const body = { ...values, evidence }; if (editing) await api.put(`/compliances/${editing.id}`, body); else await api.post('/compliances', body); toast(editing ? 'Compliance record updated.' : 'Compliance requirement created.'); setModal(false); await load(); } catch (error) { toast(safeMessage(error), 'error'); } finally { setBusy(false); } }
  const overdue = rows.filter((item) => item.status === 'OVERDUE').length;
  return <div className="page-enter">
    <PageHeader eyebrow="DETECT · MONITOR" title="Compliance register" description="Track statutory requirements, accountable officers, deadlines and evidence across every mine." actions={['ADMIN', 'MINE_OFFICER'].includes(user?.role || '') && <Button onClick={() => open()}><Plus size={16} /> New requirement</Button>} />
    <div className="module-summary-row"><span><span className="summary-number">{rows.length}</span> requirements</span><span className="summary-divider" /><span className="summary-warn"><TriangleAlert size={14} /> {overdue} overdue</span><span className="summary-divider" /><span><ShieldCheck size={14} /> Evidence-backed governance</span><Link to="/reports">Compliance report <ArrowRight size={13} /></Link></div>
    <Card className="records-card" noPadding><div className="toolbar-multi"><Toolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={complianceStatuses} category={category} setCategory={setCategory} categories={complianceCategories} extra={<label className="filter-select"><CalendarDays size={13} /><select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}><option value="all">Any due date</option><option value="overdue">Past due</option><option value="7days">Next 7 days</option><option value="30days">Next 30 days</option></select><ChevronDown size={13} /></label>} /><label className="filter-select priority-select"><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="all">Any priority</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={13} /></label></div>
      <DataTable rows={rows} loading={loading} onRowClick={(item) => navigate(`/compliance/${item.id}`)} columns={[
        { key: 'title', label: 'Requirement', render: (item) => <div className="primary-cell"><b>{item.title}</b><small>{item.regulation}</small></div> },
        { key: 'mineId', label: 'Mine', render: (item) => <span className="cell-muted">{mineName(item.mineId)}</span> },
        { key: 'category', label: 'Category', render: (item) => <span className="category-chip">{item.category}</span> },
        { key: 'dueDate', label: 'Due date', render: (item) => <span className={`date-cell ${item.status === 'OVERDUE' ? 'date-overdue' : ''}`}><CalendarDays size={14} />{formatDate(item.dueDate)}</span> },
        { key: 'assignedOfficer', label: 'Owner', render: (item) => <span className="owner-cell">{userName(item.assignedOfficer)}</span> },
        { key: 'priority', label: 'Priority', render: (item) => <StatusBadge value={item.priority} size="sm" /> },
        { key: 'status', label: 'Status', render: (item) => <StatusBadge value={item.status} /> },
      ]} />
    </Card>
    <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit compliance requirement' : 'Create compliance requirement'} description="Assign accountability, due date and evidence requirements." onSubmit={save} submitLabel={editing ? 'Update requirement' : 'Create requirement'} busy={busy} wide>
      <FormFields fields={fields} values={values} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />
      <div className="form-divider"><UploadField onChange={setFiles} files={files ? Array.from(files) : values.evidence} /></div>
    </Modal>
  </div>;
}

const violationStatuses = ['OPEN', 'IN_PROGRESS', 'ACTION_SUBMITTED', 'VERIFICATION_PENDING', 'CLOSED', 'OVERDUE'];
export function ViolationsPage() {
  const { user } = useAuth(); const { selectedMine } = useScope(); const { mines, users, mineName, userName } = useDirectory(); const navigate = useNavigate(); const toast = useToast();
  const [rows, setRows] = useState<RecordBase[]>([]); const [inspections, setInspections] = useState<RecordBase[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [category, setCategory] = useState('all'); const [modal, setModal] = useState(false); const [editing, setEditing] = useState<RecordBase | null>(null); const [values, setValues] = useState<Record<string, any>>({}); const [files, setFiles] = useState<FileList | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const query = new URLSearchParams(); if (selectedMine !== 'all') query.set('mineId', selectedMine); if (search) query.set('q', search); if (status !== 'all') query.set('status', status); if (category !== 'all') query.set('category', category); setRows(await api.get<RecordBase[]>(urlWithQuery('/violations', query))); } catch (error) { toast(safeMessage(error), 'error'); } finally { setLoading(false); } }, [selectedMine, search, status, category, toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.get<RecordBase[]>(`/inspections${selectedMine !== 'all' ? `?mineId=${selectedMine}` : ''}`).then(setInspections).catch(() => setInspections([])); }, [selectedMine]);
  const fields: FieldConfig[] = [
    { name: 'mineId', label: 'Mine', type: 'select', required: true, options: mines.map((mine) => ({ label: mine.name, value: mine.id })) },
    { name: 'inspectionId', label: 'Source inspection', type: 'select', options: inspections.map((item) => ({ label: `${formatDate(item.date)} · ${item.inspectionType} — ${String(item.observation).slice(0, 42)}`, value: item.id })) },
    { name: 'title', label: 'Finding title', required: true, full: true },
    { name: 'description', label: 'Description', type: 'textarea', required: true, full: true, rows: 3 },
    { name: 'category', label: 'Category', type: 'select', required: true, options: ['Safety', 'Environment', 'Labour', 'Production', 'Documentation', 'Equipment', 'General'].map((value) => ({ label: value, value })) },
    { name: 'severity', label: 'Severity', type: 'select', required: true, options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => ({ label: humanize(value), value })) },
    { name: 'assignedOfficer', label: 'Assigned officer', type: 'select', options: assignableUsers(users, values.mineId).map((user) => ({ label: user.name, value: user.id })) },
    { name: 'deadline', label: 'Corrective deadline', type: 'date', required: true },
  ];
  const open = (item?: RecordBase) => { setEditing(item || null); setFiles(null); setValues(item ? { ...item, deadline: item.deadline ? new Date(item.deadline).toISOString().slice(0, 10) : '' } : { mineId: selectedMine !== 'all' ? selectedMine : mines[0]?.id, category: 'Safety', severity: 'HIGH', deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }); setModal(true); };
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); try { const evidence = [...(values.evidence || []), ...(files?.length ? (await api.upload(files)).files : [])]; const body: Record<string, any> = { ...values, evidence }; if (editing) { delete body.status; await api.put(`/violations/${editing.id}`, body); } else await api.post('/violations', { ...body, status: 'OPEN' }); toast(editing ? 'Violation updated.' : 'Violation recorded.'); setModal(false); await load(); } catch (error) { toast(safeMessage(error), 'error'); } finally { setBusy(false); } }
  return <div className="page-enter">
    <PageHeader eyebrow="ACT · VERIFY" title="Violations" description="Prioritize findings by severity, deadline and assigned ownership. Every closure is tied to verified action." actions={['ADMIN', 'MINE_OFFICER', 'INSPECTOR'].includes(user?.role || '') && <Button onClick={() => open()}><Plus size={16} /> Record violation</Button>} />
    <div className="module-summary-row"><span><span className="summary-number">{rows.length}</span> findings</span><span className="summary-divider" /><span className="summary-critical"><ShieldAlert size={14} /> {rows.filter((item) => item.severity === 'CRITICAL').length} critical</span><span className="summary-divider" /><span><ClipboardCheck size={14} /> Evidence-driven closure</span><Link to="/inspections/new">Start an inspection <ArrowRight size={13} /></Link></div>
    <Card className="records-card" noPadding><Toolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={violationStatuses} category={category} setCategory={setCategory} categories={['Safety', 'Environment', 'Labour', 'Production', 'Documentation', 'Equipment', 'General']} />
      <DataTable rows={rows} loading={loading} onRowClick={(item) => navigate(`/violations/${item.id}`)} columns={[
        { key: 'title', label: 'Violation', render: (item) => <div className="primary-cell"><b>{item.title}</b><small>{mineName(item.mineId)}</small></div> },
        { key: 'category', label: 'Category', render: (item) => <span className="category-chip">{item.category}</span> },
        { key: 'severity', label: 'Severity', render: (item) => <StatusBadge value={item.severity} /> },
        { key: 'assignedOfficer', label: 'Assigned officer', render: (item) => <span className="owner-cell">{userName(item.assignedOfficer)}</span> },
        { key: 'deadline', label: 'Deadline', render: (item) => <span className={`deadline-cell ${item.status === 'OVERDUE' ? 'date-overdue' : ''}`}>{formatDate(item.deadline)}<small>{formatRelative(item.deadline)}</small></span> },
        { key: 'status', label: 'Status', render: (item) => <StatusBadge value={item.status} /> },
        { key: 'actions', label: '', className: 'table-actions-cell', render: (item) => ['ADMIN', 'MINE_OFFICER'].includes(user?.role || '') && <button className="icon-button table-action" title="Edit violation" onClick={(event) => { event.stopPropagation(); open(item); }}><Pencil size={14} /></button> },
      ]} />
    </Card>
    <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Update violation' : 'Record violation'} description="Connect the finding to an inspection and assign an accountable officer." onSubmit={save} submitLabel={editing ? 'Save violation' : 'Create violation'} busy={busy} wide>
      <FormFields fields={fields} values={values} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />
      <div className="form-divider"><UploadField onChange={setFiles} files={files ? Array.from(files) : values.evidence} /></div>
    </Modal>
  </div>;
}

const actionStatuses = ['OPEN', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'OVERDUE'];
export function ActionsPage() {
  const { user } = useAuth(); const { selectedMine } = useScope(); const { mines, users, mineName, userName } = useDirectory(); const navigate = useNavigate(); const toast = useToast();
  const [rows, setRows] = useState<RecordBase[]>([]); const [violations, setViolations] = useState<RecordBase[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [modal, setModal] = useState(false); const [values, setValues] = useState<Record<string, any>>({}); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { const query = new URLSearchParams(); if (selectedMine !== 'all') query.set('mineId', selectedMine); if (search) query.set('q', search); if (status !== 'all') query.set('status', status); setRows(await api.get<RecordBase[]>(urlWithQuery('/actions', query))); } catch (error) { toast(safeMessage(error), 'error'); } finally { setLoading(false); } }, [selectedMine, search, status, toast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.get<RecordBase[]>(`/violations${selectedMine !== 'all' ? `?mineId=${selectedMine}` : ''}`).then(setViolations).catch(() => setViolations([])); }, [selectedMine]);
  const fields: FieldConfig[] = [
    { name: 'violationId', label: 'Linked violation', type: 'select', required: true, full: true, options: violations.filter((item) => item.status !== 'CLOSED').map((item) => ({ label: `${item.title} · ${mineName(item.mineId)}`, value: item.id })) },
    { name: 'description', label: 'Corrective action', type: 'textarea', required: true, full: true, rows: 3, placeholder: 'Describe the specific remediation and evidence required for closure.' },
    { name: 'assignedOfficer', label: 'Assigned officer', type: 'select', options: assignableUsers(users, violations.find((item) => item.id === values.violationId)?.mineId).map((item) => ({ label: item.name, value: item.id })) },
    { name: 'deadline', label: 'Due date', type: 'date', required: true },
  ];
  const open = () => { setValues({ violationId: violations.find((item) => item.status !== 'CLOSED')?.id || '', assignedOfficer: user?.id, deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) }); setModal(true); };
  async function save(event: FormEvent) { event.preventDefault(); setBusy(true); try { await api.post('/actions', values); toast('Corrective action assigned and linked to the violation.'); setModal(false); await load(); } catch (error) { toast(safeMessage(error), 'error'); } finally { setBusy(false); } }
  const pendingVerify = rows.filter((item) => item.status === 'SUBMITTED').length;
  return <div className="page-enter">
    <PageHeader eyebrow="ACT · VERIFY" title="Corrective actions" description="Move findings from assignment to submitted evidence, independent verification and closure." actions={['ADMIN', 'MINE_OFFICER'].includes(user?.role || '') && <Button onClick={open}><Plus size={16} /> Assign action</Button>} />
    <div className="workflow-steps"><div className="workflow-step active"><span>01</span><b>Assign</b><small>Owner + deadline</small></div><i /><div className="workflow-step"><span>02</span><b>Evidence</b><small>Submit remediation</small></div><i /><div className="workflow-step"><span>03</span><b>Verify</b><small>Officer review</small></div><i /><div className="workflow-step"><span>04</span><b>Close</b><small>Violation resolved</small></div><span className="workflow-note"><FileCheck2 size={15} /> {pendingVerify} awaiting verification</span></div>
    <Card className="records-card" noPadding><Toolbar search={search} setSearch={setSearch} status={status} setStatus={setStatus} statuses={actionStatuses} />
      <DataTable rows={rows} loading={loading} onRowClick={(item) => navigate(`/actions/${item.id}`)} columns={[
        { key: 'description', label: 'Corrective action', render: (item) => <div className="primary-cell action-title"><b>{item.description}</b><small>{item.violationTitle || 'Linked violation'} · {mineName(item.mineId)}</small></div> },
        { key: 'assignedOfficer', label: 'Owner', render: (item) => <span className="owner-cell">{userName(item.assignedOfficer)}</span> },
        { key: 'deadline', label: 'Deadline', render: (item) => <span className={`deadline-cell ${item.status === 'OVERDUE' ? 'date-overdue' : ''}`}>{formatDate(item.deadline)}<small>{formatRelative(item.deadline)}</small></span> },
        { key: 'evidence', label: 'Evidence', render: (item) => <span className={`evidence-count ${item.evidence?.length ? 'has-evidence' : ''}`}><FileCheck2 size={14} /> {item.evidence?.length || 0} file{item.evidence?.length === 1 ? '' : 's'}</span> },
        { key: 'status', label: 'Status', render: (item) => <StatusBadge value={item.status} /> },
      ]} />
    </Card>
    <Modal open={modal} onClose={() => setModal(false)} title="Assign corrective action" description="A corrective action must have a linked violation, owner and deadline." onSubmit={save} submitLabel="Assign action" busy={busy} wide>
      {violations.filter((item) => item.status !== 'CLOSED').length === 0 ? <EmptyState icon={<ClipboardCheck size={20} />} title="No open violations" description="Record a violation before assigning a corrective action." /> : <FormFields fields={fields} values={values} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />}
    </Modal>
  </div>;
}

export function InspectionsPage() {
  const { selectedMine } = useScope(); const { mineName, userName } = useDirectory(); const navigate = useNavigate(); const toast = useToast();
  const [rows, setRows] = useState<RecordBase[]>([]); const [loading, setLoading] = useState(true); const [search, setSearch] = useState(''); const [type, setType] = useState('all');
  useEffect(() => { const query = new URLSearchParams(); if (selectedMine !== 'all') query.set('mineId', selectedMine); if (search) query.set('q', search); if (type !== 'all') query.set('category', type); setLoading(true); api.get<RecordBase[]>(urlWithQuery('/inspections', query)).then(setRows).catch((error) => toast(safeMessage(error), 'error')).finally(() => setLoading(false)); }, [selectedMine, search, type, toast]);
  return <div className="page-enter">
    <PageHeader eyebrow="FIELD REPORTING" title="Inspections" description="Capture geotagged field observations, supporting evidence and severity in a mobile-ready workflow." actions={<Link className="btn btn-primary" to="/inspections/new"><Plus size={16} /> New inspection</Link>} />
    <div className="module-summary-row"><span><span className="summary-number">{rows.length}</span> inspection records</span><span className="summary-divider" /><span><MapPin size={14} /> GPS location enabled</span><span className="summary-divider" /><span><ClipboardList size={14} /> Field evidence linked</span></div>
    <Card className="records-card" noPadding><Toolbar search={search} setSearch={setSearch} category={type} setCategory={setType} categories={['Safety', 'Environment', 'Labour', 'Production', 'Equipment', 'General']} />
      <DataTable rows={rows} loading={loading} onRowClick={(item) => navigate(`/inspections/${item.id}`)} columns={[
        { key: 'observation', label: 'Field observation', render: (item) => <div className="primary-cell"><b>{item.observation}</b><small>{mineName(item.mineId)}</small></div> },
        { key: 'inspectionType', label: 'Type', render: (item) => <span className="category-chip">{item.inspectionType}</span> },
        { key: 'inspectorId', label: 'Inspector', render: (item) => <span className="owner-cell">{userName(item.inspectorId)}</span> },
        { key: 'date', label: 'Date', render: (item) => <span className="date-cell"><CalendarDays size={14} />{formatDate(item.date)}</span> },
        { key: 'severity', label: 'Severity', render: (item) => <StatusBadge value={item.severity} /> },
        { key: 'photos', label: 'Evidence', render: (item) => <span className="evidence-count"><FileCheck2 size={14} /> {(item.photos?.length || 0) + (item.documents?.length || 0)} files</span> },
        { key: 'status', label: 'Status', render: (item) => <StatusBadge value={item.status} /> },
      ]} />
    </Card>
  </div>;
}
