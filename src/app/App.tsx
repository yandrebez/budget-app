import { useEffect, useState, type ReactElement } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BalanceBar } from '@/components/BalanceBar'
import { db } from '@/db/db'
import { ensureSeed } from '@/db/repo'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { Transactions } from '@/features/transactions/Transactions'
import { Budget } from '@/features/budget/Budget'
import { Stats } from '@/features/stats/Stats'
import { More } from '@/features/more/More'
import { Debt } from '@/features/debt/Debt'
import { Savings } from '@/features/savings/Savings'
import { Import } from '@/features/import/Import'
import { Settings } from '@/features/settings/Settings'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { AppProvider } from './AppContext'

const icon = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>

/** The five places on the bottom bar. Everything else lives under "More". */
const TABS: { id: string; label: string; icon: ReactElement }[] = [
  { id: 'dashboard', label: 'Home', icon: icon('M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z') },
  { id: 'transactions', label: 'Activity', icon: icon('M4 6h16M4 12h16M4 18h10') },
  { id: 'budget', label: 'Budget', icon: icon('M12 3v18M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H6') },
  { id: 'stats', label: 'Stats', icon: icon('M4 20V10M10 20V4M16 20v-7M22 20H2') },
  { id: 'more', label: 'More', icon: icon('M5 12h.01M12 12h.01M19 12h.01') },
]
const SUB = ['debt', 'savings', 'import', 'settings']
const ROUTES = [...TABS.map((t) => t.id), ...SUB]

const fromHash = () => {
  const h = window.location.hash.slice(1)
  return ROUTES.includes(h) ? h : 'dashboard'
}

export function App() {
  const settings = useLiveQuery(() => db.settings.get('main'), [])
  const [route, setRoute] = useState(fromHash)
  useEffect(() => { void ensureSeed() }, [])
  useEffect(() => {
    const on = () => setRoute(fromHash())
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

  const back = { label: 'More', onClick: () => go('more') }
  const screens: Record<string, ReactElement> = {
    dashboard: <Dashboard go={go} />, transactions: <Transactions go={go} />, budget: <Budget />, stats: <Stats />, more: <More go={go} />,
    debt: <Debt back={back} />, savings: <Savings back={back} />, import: <Import go={go} back={back} />, settings: <Settings back={back} />,
  }
  const activeTab = SUB.includes(route) ? 'more' : route
  return (
    <AppProvider settings={settings}>
      <div className="shell">
        <BalanceBar />
        <main>{screens[route]}</main>
      </div>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} aria-current={activeTab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>{t.icon}{t.label}</button>
        ))}
      </nav>
    </AppProvider>
  )
}
