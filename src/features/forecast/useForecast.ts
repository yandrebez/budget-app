import { useMemo } from 'react'
import { useApp } from '@/app/AppContext'
import { buildForecast, type Forecast, type WhatIf } from '@/domain/forecast/forecast'
import { useLedger } from '@/hooks/useLedger'
import { todayISO } from '@/lib/dates'

/** The month-end forecast for the period we are in now, or null until there is something to forecast from. */
export function useForecast(whatIf?: WhatIf): Forecast | null {
  const { settings } = useApp()
  const ledger = useLedger()
  return useMemo(
    () => (ledger && ledger.txs.length > 0 ? buildForecast({ cfg: settings, today: todayISO(), accounts: ledger.accounts, txs: ledger.txs, categories: ledger.categories, groups: ledger.groups, whatIf }) : null),
    [ledger, settings, whatIf],
  )
}
