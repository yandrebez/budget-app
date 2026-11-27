import type { BonusPlan } from '@/types'

/** Everything given a job so far. */
export const plannedTotal = (b: BonusPlan): number => b.parts.reduce((s, p) => s + p.amount, 0)

/** What is still unplanned. Negative means more is planned than the bonus. */
export const leftToPlan = (b: BonusPlan): number => b.amount - plannedTotal(b)

/** The parts that have been moved or paid. */
export const doneTotal = (b: BonusPlan): number => b.parts.filter((p) => p.done).reduce((s, p) => s + p.amount, 0)

export type PlanState = 'empty' | 'open' | 'complete' | 'over'

export function planState(b: BonusPlan): PlanState {
  if (b.amount <= 0 && b.parts.length === 0) return 'empty'
  const left = leftToPlan(b)
  return left < 0 ? 'over' : left === 0 && b.parts.length > 0 ? 'complete' : 'open'
}

/** Soonest first, then by name, so the next bonus is at the top. */
export const sortBonuses = (list: BonusPlan[]): BonusPlan[] =>
  [...list].sort((a, b) => a.period.localeCompare(b.period) || a.name.localeCompare(b.name))

/** Share of the bonus that has been planned (0..1), for a progress bar. */
export const plannedShare = (b: BonusPlan): number => (b.amount > 0 ? Math.min(1, plannedTotal(b) / b.amount) : 0)
