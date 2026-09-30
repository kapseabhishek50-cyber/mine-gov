import { useEffect, useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Bell, ChevronDown, CircleHelp, ClipboardCheck, ClipboardList, FileBarChart2, Gauge, HardHat, LayoutDashboard, LogOut, MapPinned, Menu, Moon, Search, Settings, ShieldAlert, ShieldCheck, Sparkles, Sun, Users, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useScope } from '../context/ScopeContext';
import { Avatar, Button } from './ui';
import type { Mine } from '../types';

const navigation = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'WORKSPACE' },
  { label: 'Mines', href: '/mines', icon: HardHat, group: 'GOVERNANCE' },
  { label: 'Compliance', href: '/compliance', icon: ShieldCheck, group: 'GOVERNANCE' },
  { label: 'Inspections', href: '/inspections', icon: ClipboardList, group: 'GOVERNANCE' },
  { label: 'Violations', href: '/violations', icon: ShieldAlert, group: 'GOVERNANCE' },
  { label: 'Corrective actions', href: '/actions', icon: ClipboardCheck, group: 'GOVERNANCE' },
  { label: 'Risk analytics', href: '/risk-analytics', icon: Activity, group: 'INTELLIGENCE' },
  { label: 'Mine map', href: '/map', icon: MapPinned, group: 'INTELLIGENCE' },
  { label: 'Reports', href: '/reports', icon: FileBarChart2, group: 'INTELLIGENCE' },
  { label: 'AI assistant', href: '/ai-assistant', icon: Sparkles, group: 'INTELLIGENCE', special: true },
  { label: 'Notifications', href: '/notifications', icon: Bell, group: 'SYSTEM' },
];

const roleName: Record<string, string> = { ADMIN: 'Administrator', MINE_OFFICER: 'Mine officer', INSPECTOR: 'Inspector', MANAGEMENT: 'Management' };

export function AppShell() {
  const { user, logout } = useAuth();
  const { selectedMine, setSelectedMine } = useScope();
  const location = useLocation();
  const navigate = useNavigate();
  const [mines, setMines] = useState<Mine[]>([]);
  const [unread, setUnread] = useState(0);
  const [query, setQuery] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('minegov_theme') === 'dark');

  useEffect(() => {
    api.get<Mine[]>('/mines').then((items) => { setMines(items); if (selectedMine !== 'all' && !items.some((mine) => mine.id === selectedMine)) setSelectedMine('all'); }).catch(() => setMines([]));
    const refreshMeta = () => api.get<{ unreadAlerts: number }>('/meta').then((data) => setUnread(data.unreadAlerts)).catch(() => setUnread(0));
    const refreshEvent = () => void refreshMeta();
    void refreshMeta(); window.addEventListener('minegov:meta-changed', refreshEvent);
    return () => window.removeEventListener('minegov:meta-changed', refreshEvent);
  }, [user?.id, location.pathname]);
  useEffect(() => { setMobileOpen(false); setProfileOpen(false); }, [location.pathname]);
  useEffect(() => { document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'; localStorage.setItem('minegov_theme', darkMode ? 'dark' : 'light'); }, [darkMode]);
  useEffect(() => { const handler = (event: Event) => setDarkMode((event as CustomEvent<string>).detail === 'dark'); window.addEventListener('minegov:theme-change', handler); return () => window.removeEventListener('minegov:theme-change', handler); }, []);
  const visibleNav = navigation.filter((item) => item.href !== '/audit-logs' || user?.role === 'ADMIN');
  const groups = [...new Set(visibleNav.map((item) => item.group))];

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return <div className="app-shell">
    {mobileOpen && <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <Link to="/dashboard" className="brand-lockup"><span className="brand-mark"><span /><span /><span /></span><span className="brand-name">MineGov <b>AI</b><small>SMART MINE GOVERNANCE</small></span></Link>
      <div className="workspace-chip"><span className="workspace-dot" /> {api.isStaticMode() ? 'STATIC DEMO MODE' : 'DEMO ENVIRONMENT'} <span className="workspace-chevron">⌄</span></div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {groups.map((group) => <div className="nav-group" key={group}><div className="nav-group-label">{group}</div>{visibleNav.filter((item) => item.group === group).map((item) => {
          const Icon = item.icon; const active = location.pathname === item.href || (item.href !== '/dashboard' && location.pathname.startsWith(item.href));
          return <Link key={item.href} to={item.href} className={`nav-link ${active ? 'nav-active' : ''} ${item.special ? 'nav-special' : ''}`}><Icon size={17} strokeWidth={active ? 2.2 : 1.8} /><span>{item.label}</span>{item.href === '/notifications' && unread > 0 && <i className="nav-count">{unread > 9 ? '9+' : unread}</i>}{item.special && <span className="nav-ai-tag">AI</span>}</Link>;
        })}</div>)}
        {user?.role === 'ADMIN' && <div className="nav-group"><div className="nav-group-label">ADMINISTRATION</div><Link to="/audit-logs" className={`nav-link ${location.pathname.startsWith('/audit-logs') ? 'nav-active' : ''}`}><Gauge size={17} /><span>Audit logs</span></Link></div>}
        <div className="nav-group"><Link to="/settings" className={`nav-link ${location.pathname.startsWith('/settings') ? 'nav-active' : ''}`}><Settings size={17} /><span>Settings</span></Link></div>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-help"><div className="help-icon"><CircleHelp size={16} /></div><div><b>Need a hand?</b><small>Explore the demo guide</small></div><ChevronDown size={14} /></div>
        <button className="sidebar-profile" onClick={() => setProfileOpen((value) => !value)}><Avatar name={user?.name} color="cyan" /><span className="profile-identity"><b>{user?.name}</b><small>{roleName[user?.role || ''] || 'User'}</small></span><ChevronDown size={15} /></button>
      </div>
    </aside>
    <div className="main-frame">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Open menu">{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button><div className="breadcrumb"><span>MineGov AI</span><i>/</i><b>{navigation.find((item) => item.href === location.pathname)?.label || (location.pathname.split('/')[1] || 'Dashboard').replaceAll('-', ' ')}</b></div></div>
        <div className="topbar-right">
          <form className="global-search" onSubmit={submitSearch}><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything…" aria-label="Search MineGov" /><kbd>↵</kbd></form>
          <div className="mine-select-wrap"><span className="mine-selector-label">SCOPE</span><select aria-label="Select mine scope" value={selectedMine} onChange={(event) => setSelectedMine(event.target.value)}><option value="all">All mines</option>{mines.map((mine) => <option key={mine.id} value={mine.id}>{mine.name}</option>)}</select><ChevronDown size={13} /></div>
          <button className="icon-button theme-toggle" aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
          <Link className="icon-button notifications-button" to="/notifications" aria-label={`${unread} unread notifications`}><Bell size={18} />{unread > 0 && <i />}</Link>
          <div className="topbar-user"><button className="topbar-avatar-button" onClick={() => setProfileOpen((value) => !value)}><Avatar name={user?.name} size="sm" color="blue" /><ChevronDown size={14} /></button>
            {profileOpen && <div className="profile-popover"><div className="popover-user"><Avatar name={user?.name} color="blue" /><div><b>{user?.name}</b><small>{user?.email}</small></div></div><div className="popover-role">{roleName[user?.role || ''] || 'User'} access</div><button onClick={async () => { await logout(); navigate('/login'); }}><LogOut size={15} /> Sign out</button></div>}
          </div>
        </div>
      </header>
      {profileOpen && <button className="popover-dismiss" aria-label="Close profile menu" onClick={() => setProfileOpen(false)} />}
      <main className="page-content"><Outlet /></main>
      <footer className="app-footer"><span>MineGov AI <i>·</i> {api.isStaticMode() ? 'Static Demo Mode · Works offline' : 'Smart Governance & Compliance'}</span><span>{api.isStaticMode() ? 'LOCAL STORAGE · Persistent in browser' : 'DEMO DATA'} <i>·</i> For demonstration purposes only</span></footer>
    </div>
  </div>;
}
