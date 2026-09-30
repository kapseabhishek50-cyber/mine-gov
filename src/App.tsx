import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AppShell } from './components/AppShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ScopeProvider } from './context/ScopeContext';
import { ToastProvider } from './context/ToastContext';
import { LoadingState } from './components/ui';

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const MinesPage = lazy(() => import('./pages/ListPages').then((module) => ({ default: module.MinesPage })));
const CompliancePage = lazy(() => import('./pages/ListPages').then((module) => ({ default: module.CompliancePage })));
const InspectionsPage = lazy(() => import('./pages/ListPages').then((module) => ({ default: module.InspectionsPage })));
const ViolationsPage = lazy(() => import('./pages/ListPages').then((module) => ({ default: module.ViolationsPage })));
const ActionsPage = lazy(() => import('./pages/ListPages').then((module) => ({ default: module.ActionsPage })));
const MineDetailsPage = lazy(() => import('./pages/DetailPages').then((module) => ({ default: module.MineDetailsPage })));
const ComplianceDetailsPage = lazy(() => import('./pages/DetailPages').then((module) => ({ default: module.ComplianceDetailsPage })));
const InspectionDetailsPage = lazy(() => import('./pages/DetailPages').then((module) => ({ default: module.InspectionDetailsPage })));
const ViolationDetailsPage = lazy(() => import('./pages/DetailPages').then((module) => ({ default: module.ViolationDetailsPage })));
const ActionDetailsPage = lazy(() => import('./pages/DetailPages').then((module) => ({ default: module.ActionDetailsPage })));
const InspectionFormPage = lazy(() => import('./pages/InspectionFormPage').then((module) => ({ default: module.InspectionFormPage })));
const RiskAnalyticsPage = lazy(() => import('./pages/IntelligencePages').then((module) => ({ default: module.RiskAnalyticsPage })));
const ReportsPage = lazy(() => import('./pages/IntelligencePages').then((module) => ({ default: module.ReportsPage })));
const AIAssistantPage = lazy(() => import('./pages/IntelligencePages').then((module) => ({ default: module.AIAssistantPage })));
const NotificationsPage = lazy(() => import('./pages/IntelligencePages').then((module) => ({ default: module.NotificationsPage })));
const AuditLogsPage = lazy(() => import('./pages/IntelligencePages').then((module) => ({ default: module.AuditLogsPage })));
const SettingsPage = lazy(() => import('./pages/IntelligencePages').then((module) => ({ default: module.SettingsPage })));
const SearchPage = lazy(() => import('./pages/IntelligencePages').then((module) => ({ default: module.SearchPage })));
const MineMapPage = lazy(() => import('./pages/MapPage').then((module) => ({ default: module.MineMapPage })));
const NotFoundPage = lazy(() => import('./pages/IntelligencePages').then((module) => ({ default: module.NotFoundPage })));

function SuspensePage({ children }: { children: ReactNode }) { return <Suspense fallback={<div className="auth-loading"><LoadingState label="Loading MineGov workspace…" /></div>}>{children}</Suspense>; }
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-loading"><LoadingState label="Restoring secure session…" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
function PublicOnly() { const { user, loading } = useAuth(); if (loading) return <div className="auth-loading"><LoadingState label="Loading MineGov…" /></div>; return user ? <Navigate to="/dashboard" replace /> : <SuspensePage><LoginPage /></SuspensePage>; }
function RequireRole({ role, children }: { role: string; children: ReactNode }) { const { user } = useAuth(); return user?.role === role ? <>{children}</> : <Navigate to="/dashboard" replace />; }
function PageMotion({ children }: { children: ReactNode }) { const location = useLocation(); return <SuspensePage><AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: .16 }}>{children}</motion.div></AnimatePresence></SuspensePage>; }
function AuthenticatedLayout() { return <RequireAuth><ScopeProvider><AppShell /></ScopeProvider></RequireAuth>; }

function AppRoutes() {
  const location = useLocation();
  return <Routes location={location} key={location.pathname}>
    <Route path="/login" element={<PublicOnly />} />
    <Route element={<AuthenticatedLayout />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="dashboard" element={<PageMotion><DashboardPage /></PageMotion>} />
      <Route path="mines" element={<PageMotion><MinesPage /></PageMotion>} />
      <Route path="mines/:id" element={<PageMotion><MineDetailsPage /></PageMotion>} />
      <Route path="compliance" element={<PageMotion><CompliancePage /></PageMotion>} />
      <Route path="compliance/:id" element={<PageMotion><ComplianceDetailsPage /></PageMotion>} />
      <Route path="inspections" element={<PageMotion><InspectionsPage /></PageMotion>} />
      <Route path="inspections/new" element={<PageMotion><InspectionFormPage /></PageMotion>} />
      <Route path="inspections/:id" element={<PageMotion><InspectionDetailsPage /></PageMotion>} />
      <Route path="violations" element={<PageMotion><ViolationsPage /></PageMotion>} />
      <Route path="violations/:id" element={<PageMotion><ViolationDetailsPage /></PageMotion>} />
      <Route path="actions" element={<PageMotion><ActionsPage /></PageMotion>} />
      <Route path="actions/:id" element={<PageMotion><ActionDetailsPage /></PageMotion>} />
      <Route path="risk-analytics" element={<PageMotion><RiskAnalyticsPage /></PageMotion>} />
      <Route path="map" element={<PageMotion><MineMapPage /></PageMotion>} />
      <Route path="reports" element={<PageMotion><ReportsPage /></PageMotion>} />
      <Route path="ai-assistant" element={<PageMotion><AIAssistantPage /></PageMotion>} />
      <Route path="notifications" element={<PageMotion><NotificationsPage /></PageMotion>} />
      <Route path="audit-logs" element={<RequireRole role="ADMIN"><PageMotion><AuditLogsPage /></PageMotion></RequireRole>} />
      <Route path="settings" element={<PageMotion><SettingsPage /></PageMotion>} />
      <Route path="search" element={<PageMotion><SearchPage /></PageMotion>} />
    </Route>
    <Route path="*" element={<SuspensePage><NotFoundPage /></SuspensePage>} />
  </Routes>;
}

export default function App() { return <AuthProvider><ToastProvider><AppRoutes /></ToastProvider></AuthProvider>; }
