import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface ScopeValue { selectedMine: string; setSelectedMine: (value: string) => void }
const ScopeContext = createContext<ScopeValue | undefined>(undefined);
export function ScopeProvider({ children }: { children: ReactNode }) {
  const [selectedMine, setSelectedMine] = useState(() => sessionStorage.getItem('minegov_scope') || 'all');
  const value = useMemo(() => ({ selectedMine, setSelectedMine: (value: string) => { sessionStorage.setItem('minegov_scope', value); setSelectedMine(value); } }), [selectedMine]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}
export function useScope() { const value = useContext(ScopeContext); if (!value) throw new Error('useScope must be used within ScopeProvider'); return value; }
