import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Settings } from '@/types'
import { cycleContaining, shiftCycle, type Cycle } from '@/domain/cycles/cycle'
import { todayISO } from '@/lib/dates'
import { formatMoney } from '@/lib/money'

interface AppCtx {
  settings: Settings
  /** Formats cents using the user's currency and locale. */
  fmt: (cents: number) => string
  /** Same, without cents. For tables where width is tight. */
  fmtWhole: (cents: number) => string
  /** The cycle currently being viewed. */
  cycle: Cycle
  isCurrentCycle: boolean
  moveCycle: (by: number) => void
  goCurrent: () => void
}

const Ctx = createContext<AppCtx | null>(null)

export function AppProvider({ settings, children }: { settings: Settings; children: ReactNode }) {
  const [offset, setOffset] = useState(0)
  const value = useMemo<AppCtx>(() => {
    const current = cycleContaining(settings, todayISO())
    return {
      settings,
      fmt: (c) => formatMoney(c, settings.currency, settings.locale),
      fmtWhole: (c) => new Intl.NumberFormat(settings.locale, { style: 'currency', currency: settings.currency, maximumFractionDigits: 0 }).format(c / 100),
      cycle: shiftCycle(settings, current, offset),
      isCurrentCycle: offset === 0,
      moveCycle: (by) => setOffset((o) => o + by),
      goCurrent: () => setOffset(0),
    }
  }, [settings, offset])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside AppProvider')
  return v
}
