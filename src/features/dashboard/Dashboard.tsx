import { useMemo } from 'react'
import { useApp } from '@/app/AppContext'
import { BudgetRow, GroupBlock, isActive } from '@/components/BudgetViews'
import { CycleSwitcher, Empty, Page, Progress } from '@/components/ui'
import { summarise } from '@/domain/budget/summary'
import { ForecastCard } from '@/features/forecast/ForecastCard'
import { useLedger } from '@/hooks/useLedger'
import { daysBetween, todayISO } from '@/lib/dates'

export function Dashboard({ go }: { go: (tab: string) => void }) {
  const { cycle, fmt, isCurrentCycle } = useApp()
  const ledger = useLedger()
  const s = useMemo(() => (ledger ? summarise(ledger.categories, ledger.groups, ledger.txs, cycle.start, cycle.end) : null), [ledger, cycle])
  if (!ledger || !s) return null

  const total = daysBetween(cycle.start, cycle.end) + 1
  const elapsed = isCurrentCycle ? Math.min(total, daysBetween(cycle.start, todayISO()) + 1) : total
  const daysLeft = isCurrentCycle ? Math.max(0, total - elapsed) : 0
  const used = s.spendBudget > 0 ? s.spendActual / s.spendBudget : 0
  const remaining = s.spendBudget - s.spendActual
  const ahead = isCurrentCycle && used > elapsed / total + 0.1
  const overs = s.lines.filter((l) => l.over)

  const groups = ledger.groups
    .map((g) => ({ group: g, lines: s.lines.filter((l) => l.group.id === g.id && isActive(l)) }))
    .filter((x) => x.lines.length > 0)
  const hidden = s.lines.filter((l) => !isActive(l)).length

  return (
    <Page title="Home">
      <CycleSwitcher />
      {s.lines.length === 0 ? (
        <Empty>
          <p>Nothing here yet.</p>
          <button className="primary" onClick={() => go('budget')}>Set up your budget</button>
        </Empty>
      ) : (
        <>
          <div className="card">
            <div className="xs muted">{remaining >= 0 ? 'Left to spend' : 'Over budget by'}</div>
            <div className={`hero num ${remaining < 0 ? 'bad' : ''}`}>{fmt(Math.abs(remaining))}</div>
            <Progress fraction={used} over={used > 1} thick />
            <div className="row between xs muted" style={{ marginTop: 8 }}>
              <span>{fmt(s.spendActual)} of {fmt(s.spendBudget)} used</span>
              {isCurrentCycle && <span>{daysLeft} day{daysLeft === 1 ? '' : 's'} left{ahead ? ' · ahead of pace' : ''}</span>}
            </div>
          </div>

          {isCurrentCycle && <ForecastCard go={go} />}

          <div className="card grid2">
            <div className="stat"><span className="xs muted">Money in</span><b className="num good">{fmt(s.incomeActual)}</b><span className="xs muted">of {fmt(s.incomeBudget)} planned</span></div>
            <div className="stat"><span className="xs muted">Money out</span><b className="num">{fmt(s.spendActual)}</b><span className="xs muted">incl. debt &amp; savings</span></div>
          </div>

          {(overs.length > 0 || s.uncategorised > 0 || s.leftToAllocate !== 0) && (
            <div className="card stack small">
              <h3>Needs attention</h3>
              {overs.map((l) => <div className="row between" key={l.category.id}><span>{l.category.name}</span><b className="num bad">{fmt(-l.left)} over</b></div>)}
              {s.uncategorised > 0 && <div className="row between"><span>{s.uncategorised} uncategorised transaction{s.uncategorised > 1 ? 's' : ''}</span><button className="link" onClick={() => go('transactions')}>Fix</button></div>}
              {s.leftToAllocate !== 0 && <div className="row between"><span>{s.leftToAllocate > 0 ? `${fmt(s.leftToAllocate)} of income has no job` : `${fmt(-s.leftToAllocate)} more budgeted than income`}</span><button className="link" onClick={() => go('budget')}>Review</button></div>}
            </div>
          )}

          {groups.map(({ group, lines }) => (
            <GroupBlock key={group.id} name={group.name} kind={group.kind} lines={lines}>
              {lines.map((l) => <BudgetRow key={l.category.id} line={l} />)}
            </GroupBlock>
          ))}
          {hidden > 0 && <p className="xs muted" style={{ textAlign: 'center' }}>{hidden} categor{hidden === 1 ? 'y' : 'ies'} with no budget or activity {hidden === 1 ? 'is' : 'are'} hidden. <button className="link" onClick={() => go('budget')}>Edit budget</button></p>}
        </>
      )}
    </Page>
  )
}
