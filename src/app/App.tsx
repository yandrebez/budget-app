import { useEffect, useState, type ReactElement } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { ensureSeed } from '@/db/repo'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { Transactions } from '@/features/transactions/Transactions'
import { Budget } from '@/features/budget/Budget'
import { Debt } from '@/features/debt/Debt'
import { Savings } from '@/features/savings/Savings'
import { History } from '@/features/history/History'
import { Import } from '@/features/import/Import'
import { Settings } from '@/features/settings/Settings'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { AppProvider } from './AppContext'

const icon = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>

const TABS: { id: string; label: string; icon: ReactElement }[] = [
  { id: 'dashboard', label: 'Home', icon: icon('M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z') },
  { id: 'transactions', label: 'Activity', icon: icon('M4 6h16M4 12h16M4 18h10') },
  { id: 'budget', label: 'Budget', icon: icon('M12 3v18M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6') },
  { id: 'debt', label: 'Debt', icon: icon('M3 7h18v10H3zM3 11h18') },
  { id: 'savings', label: 'Savings', icon: icon('M12 21s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 6.500-7 11-7 11z') },
  { id: 'history', label: 'History', icon: icon('M4 20V10M10 20V4M16 20v-7M22 20H2') },
  { id: 'import', label: 'Import', icon: icon('M12 3v12m0 0l-4-4m4 4l4-4M4 21h16') },
  { id: 'settings', label: 'Settings', icon: icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 .5a7 7 0 0 0-1.500-1L15 4h-4l-.5 2.500a7 7 0 0 0-1.500 1L7 7l-2 4 2 1a7 7 0 0 0 0 2l-2 1 2 4 2-.5a7 7 0 0 0 1.500 1L11 24h4l.5-2.500a7 7 0 0 0 1.500-1L19 21l2-4-2-1a7 7 0 0 0 0-2z') },
]

const fromHash = () => {
  const h = window.location.hash.slice(1)
  return TABS.some((t) => t.id === h) ? h : 'dashboard'
}

export function App() {
  const settings = useLiveQuery(() => db.settings.get('main'), [])
  const [tab, setTabState] = useState(fromHash)
  useEffect(() => { void ensureSeed() }, [])
  useEffect(() => {
    const on = () => setTabState(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    const t = settings?.theme
    if (t && t !== 'system') document.documentElement.dataset.theme = t
    else delete document.documentElement.dataset.theme
  }, [settings?.theme])

  const go = (id: string) => { window.location.hash = id }
  if (!settings) return null
  if (!settings.onboarded) return <Onboarding />

  const screens: Record<string, ReactElement> = {
    dashboard: <Dashboard go={go} />, transactions: <Transactions go={go} />, budget: <Budget />, debt: <Debt />,
    savings: <Savings />, history: <History />, import: <Import go={go} />, settings: <Settings />,
  }
  return (
    <AppProvider settings={settings}>
      <main>{screens[tab]}</main>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>{t.icon}{t.label}</button>
        ))}
      </nav>
    </AppProvider>
  )
}
