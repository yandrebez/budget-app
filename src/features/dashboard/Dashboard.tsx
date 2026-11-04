import { useMemo } from 'react'
import { useApp } from '@/app/AppContext'
import { CycleSwitcher, Empty, Page, Progress } from '@/components/ui'
import { summarise } from '@/domain/budget/summary'
import { useCategories, useGroups, useTransactions } from '@/hooks/useBudgetData'
import { daysBetween, todayISO } from '@/lib/dates'

export function Dashboard({ go }: { go: (tab: string) => void }) {
  const { cycle, fmt, isCurrentCycle } = useApp()
  const groups = useGroups(), categories = useCategories(), txs = useTransactions()
  const s = useMemo(
    () => (groups && categories && txs ? summarise(categories, groups, txs, cycle.start, cycle.end) : null),
    [groups, categories, txs, cycle],
  )
  if (!s) return null

  const total = daysBetween(cycle.start, cycle.end) + 1
  const elapsed = isCurrentCycle ? Math.min(total, daysBetween(cycle.start, todayISO()) + 1) : total
  const daysLeft = isCurrentCycle ? Math.max(0, total - elapsed) : 0
  const spentFraction = s.spendBudget > 0 ? s.spendActual / s.spendBudget : 0
  const overs = s.lines.filter((l) => l.over)

  return (
    <Page title="Dashboard">
      <CycleSwitcher />
      {s.lines.length === 0 ? (
        <Empty>
          <p>Nothing here yet.</p>
          <button className="primary" onClick={() => go('budget')}>Set up your budget</button>
        </Empty>
      ) : (
        <>
          <div className="card grid2">
            <div className="stat"><span className="muted small">Money in</span><b className="num good">{fmt(s.incomeActual)}</b><span className="small muted">of {fmt(s.incomeBudget)} planned</span></div>
            <div className="stat"><span className="muted small">Spent</span><b className="num">{fmt(s.spendActual)}</b><span className="small muted">of {fmt(s.spendBudget)} budgeted</span></div>
          </div>
          <div className="card">
            <div className="row between"><span>Budget used</span><b className="num">{Math.round(spentFraction * 100)}%</b></div>
            <Progress fraction={spentFraction} over={spentFraction > 1} />
            {isCurrentCycle && (
              <p className="small muted" style={{ marginBottom: 0 }}>
                {daysLeft} day{daysLeft === 1 ? '' : 's'} left · {Math.round((elapsed / total) * 100)}% of the period gone
                {spentFraction > elapsed / total + 0.1 && <span className="warn"> · spending ahead of pace</span>}
              </p>
            )}
          </div>
          {s.leftToAllocate !== 0 && (
            <div className="banner">
              {s.leftToAllocate > 0
                ? <>{fmt(s.leftToAllocate)} of planned income has no job yet. <button className="ghost" onClick={() => go('budget')}>Allocate</button></>
                : <>You've budgeted {fmt(-s.leftToAllocate)} more than your planned income. <button className="ghost" onClick={() => go('budget')}>Review</button></>}
            </div>
          )}
          {s.uncategorised > 0 && (
            <div className="banner">{s.uncategorised} transaction{s.uncategorised > 1 ? 's' : ''} need a category. <button className="ghost" onClick={() => go('transactions')}>Fix</button></div>
          )}
          {overs.length > 0 && (
            <div className="card">
              <h3>Over budget</h3>
              {overs.map((l) => (
                <div className="line row between" key={l.category.id}><span>{l.category.name}</span><b className="num bad">{fmt(-l.left)} over</b></div>
              ))}
            </div>
          )}
          <h2>Categories</h2>
          <div className="card">
            {s.lines.map((l) => (
              <div className="line" key={l.category.id}>
                <div className="row between"><span>{l.category.name} <span className="pill">{l.group.name}</span></span><span className="num">{fmt(l.actual)} <span className="muted small">/ {fmt(l.budget)}</span></span></div>
                <Progress fraction={l.budget > 0 ? l.actual / l.budget : l.actual > 0 ? 1 : 0} over={l.over} calm={l.group.kind === 'income'} />
              </div>
            ))}
          </div>
        </>
      )}
    </Page>
  )
}
