import { useMemo } from 'react'
import { useApp } from '@/app/AppContext'
import { Empty, Page } from '@/components/ui'
import { shiftCycle } from '@/domain/cycles/cycle'
import { summarise } from '@/domain/budget/summary'
import { useCategories, useGroups, useTransactions } from '@/hooks/useBudgetData'

const MONTHS = 12

export function History() {
  const { cycle, settings, fmt } = useApp()
  const groups = useGroups(), categories = useCategories(), txs = useTransactions()
  const rows = useMemo(() => {
    if (!groups || !categories || !txs) return null
    return Array.from({ length: MONTHS }, (_, i) => {
      const c = shiftCycle(settings, cycle, i - (MONTHS - 1))
      return { c, s: summarise(categories, groups, txs, c.start, c.end) }
    })
  }, [groups, categories, txs, cycle, settings])
  if (!rows) return null
  const max = Math.max(1, ...rows.map((r) => Math.max(r.s.incomeActual, r.s.spendActual)))
  const label = (y: number, m: number) => new Intl.DateTimeFormat(settings.locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)))
  const any = rows.some((r) => r.s.incomeActual || r.s.spendActual)

  return (
    <Page title="History">
      {!any ? <Empty>History appears once you have transactions.</Empty> : (
        <div className="card">
          <div className="row small muted" style={{ gap: 16 }}><span>■ <span className="good">Money in</span></span><span>■ Spent</span></div>
          {rows.map(({ c, s }) => (
            <div className="line" key={c.key}>
              <div className="row between small"><b>{label(c.year, c.month)}</b><span className="num">{fmt(s.incomeActual - s.spendActual)} saved</span></div>
              <div className="bar"><i style={{ width: `${(s.incomeActual / max) * 100}%`, background: 'var(--good)' }} /></div>
              <div className="bar"><i style={{ width: `${(s.spendActual / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </Page>
  )
}
