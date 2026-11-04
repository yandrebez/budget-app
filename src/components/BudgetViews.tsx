import type { CategoryLine } from '@/domain/budget/summary'
import { useApp } from '@/app/AppContext'
import { Progress } from './ui'

/** One category: what is left, how much of the budget is used, and a thin bar. */
export function BudgetRow({ line, children }: { line: CategoryLine; children?: React.ReactNode }) {
  const { fmt } = useApp()
  const income = line.group.kind === 'income'
  const { budget, actual, left, over } = line
  const fraction = budget > 0 ? actual / budget : actual > 0 ? 1 : 0
  const headline = income
    ? <span className="amount good">{fmt(actual)}</span>
    : over ? <span className="amount bad">{fmt(-left)} over</span>
    : budget > 0 && left === 0 ? <span className="amount">Fully used</span>
    : budget > 0 ? <span className="amount">{fmt(left)} left</span>
    : actual > 0 ? <span className="amount">{fmt(actual)}</span>
    : <span className="amount faint">–</span>
  const detail = income
    ? (budget > 0 ? `of ${fmt(budget)} planned` : 'unplanned income')
    : budget > 0 ? `${fmt(actual)} of ${fmt(budget)} used` : actual > 0 ? 'no budget set' : 'no budget set'
  return (
    <div className="item" style={{ cursor: 'default' }}>
      <div className="row between"><span className="title">{line.category.name}</span>{headline}</div>
      <div className="row between xs muted" style={{ marginTop: 2 }}><span>{detail}</span>{budget > 0 && !income && <span className="num">{Math.round(fraction * 100)}%</span>}</div>
      {(budget > 0 || actual > 0) && <Progress fraction={fraction} over={over} calm={income || fraction >= 1} />}
      {children}
    </div>
  )
}

/** A group header with its own total, followed by its rows. */
/** Categories with no budget and no activity this period are noise on a read-only view. */
export const isActive = (l: CategoryLine) => l.budget > 0 || l.actual !== 0

export function GroupBlock({ name, kind, lines, children }: { name: string; kind: string; lines: CategoryLine[]; children: React.ReactNode }) {
  const { fmt } = useApp()
  const budget = lines.reduce((s, l) => s + l.budget, 0)
  const actual = lines.reduce((s, l) => s + l.actual, 0)
  return (
    <section>
      <div className="section-head">
        <h2>{name}</h2>
        {lines.length > 0 && (
          <span className="num">{kind === 'income' ? `${fmt(actual)} in` : budget > 0 ? `${fmt(actual)} of ${fmt(budget)}` : fmt(actual)}</span>
        )}
      </div>
      <div className="card flush">{children}</div>
    </section>
  )
}
