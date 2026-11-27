import type { BonusPlan, Transaction } from '@/types'

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

/* ------------------------------------------------------------------ bonus money in the ledger */

/** Ids of the plans that exist. A tag pointing at a plan that no longer exists is ignored, so nothing is ever hidden. */
export const bonusIdSet = (plans: BonusPlan[] | undefined): Set<string> => new Set((plans ?? []).map((p) => p.id))

export const isBonusTx = (t: Pick<Transaction, 'bonusId'>, ids: Set<string>): boolean => !!t.bonusId && ids.has(t.bonusId)

/** The transactions that belong to the salary side: everything except bonus money and payments made from it. */
export const salaryOnly = (txs: Transaction[], ids: Set<string>): Transaction[] => (ids.size ? txs.filter((t) => !isBonusTx(t, ids)) : txs)

/** What is left of the bonus money across all plans: bonus received minus bonus spent, as it sits in the accounts. */
export const bonusMoney = (txs: Transaction[], ids: Set<string>): number =>
  txs.filter((t) => isBonusTx(t, ids)).reduce((s, t) => s + t.moneyIn - t.moneyOut, 0)

export interface BonusSpending {
  /** Bonus money that has arrived (income logged with this plan). */
  received: number
  /** Spent from it, net of refunds. */
  spent: number
  /** What is left: what has arrived (or, until it does, the planned amount) minus what has been spent. */
  left: number
  /** Spent per category (null = no category). */
  byCategory: Map<string | null, number>
  count: number
}

/**
 * How a plan has actually gone. Income-category money in is the bonus arriving; everything else tagged to the plan
 * is spending (a refund in a spending category reduces it).
 */
export function bonusSpending(plan: BonusPlan, txs: Transaction[], isIncome: (categoryId: string | null) => boolean): BonusSpending {
  const out: BonusSpending = { received: 0, spent: 0, left: 0, byCategory: new Map(), count: 0 }
  for (const t of txs) {
    if (t.bonusId !== plan.id) continue
    out.count++
    const net = t.moneyIn - t.moneyOut
    if (net > 0 && isIncome(t.categoryId)) { out.received += net; continue }
    out.spent -= net
    out.byCategory.set(t.categoryId, (out.byCategory.get(t.categoryId) ?? 0) - net)
  }
  out.left = (out.received > 0 ? out.received : plan.amount) - out.spent
  return out
}

/** Spent so far on a part: what was paid from the bonus in the category it is linked to. null if it is not linked. */
export const partSpent = (part: { categoryId: string | null }, s: BonusSpending): number | null =>
  part.categoryId === null ? null : Math.max(0, s.byCategory.get(part.categoryId) ?? 0)

/** Spent from the bonus in categories that no part covers. */
export function unplannedSpent(plan: BonusPlan, s: BonusSpending): number {
  const covered = new Set(plan.parts.map((p) => p.categoryId).filter((c): c is string => c !== null))
  let sum = 0
  for (const [cat, v] of s.byCategory) if (cat === null || !covered.has(cat)) sum += v
  return Math.max(0, sum)
}
