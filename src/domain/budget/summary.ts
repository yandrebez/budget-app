import type { Category, Group, GroupKind, ISODate, Transaction } from '@/types'

export interface CategoryLine {
  category: Category
  group: Group
  budget: number
  actual: number
  left: number
  over: boolean
}

export interface BudgetSummary {
  lines: CategoryLine[]
  incomeBudget: number
  incomeActual: number
  spendBudget: number
  spendActual: number
  /** Income budget minus everything given a job. Should be 0 for a zero-based budget. */
  leftToAllocate: number
  /** Money in minus money out this cycle, across all non-transfer categories + uncategorised. */
  net: number
  uncategorised: number
}

const isInRange = (d: ISODate, start: ISODate, end: ISODate) => d >= start && d <= end

/** Income rows count money in; everything else counts money out net of refunds. */
export const actualFor = (kind: GroupKind, tx: Transaction[]): number =>
  tx.reduce((s, t) => s + (kind === 'income' ? t.moneyIn - t.moneyOut : t.moneyOut - t.moneyIn), 0)

export function summarise(
  categories: Category[],
  groups: Group[],
  transactions: Transaction[],
  start: ISODate,
  end: ISODate,
): BudgetSummary {
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const inCycle = transactions.filter((t) => isInRange(t.date, start, end))
  const byCat = new Map<string, Transaction[]>()
  for (const t of inCycle) {
    if (!t.categoryId) continue
    const arr = byCat.get(t.categoryId) ?? []
    arr.push(t)
    byCat.set(t.categoryId, arr)
  }

  const lines: CategoryLine[] = []
  for (const category of categories) {
    const group = groupById.get(category.groupId)
    if (!group || group.kind === 'transfer') continue
    const actual = actualFor(group.kind, byCat.get(category.id) ?? [])
    const budget = category.monthlyBudget
    lines.push({
      category, group, budget, actual,
      left: budget - actual,
      over: group.kind !== 'income' && actual > budget,
    })
  }
  lines.sort((a, b) => a.group.order - b.group.order || a.category.name.localeCompare(b.category.name))

  const sum = (f: (l: CategoryLine) => number, pred: (l: CategoryLine) => boolean) =>
    lines.filter(pred).reduce((s, l) => s + f(l), 0)
  const income = (l: CategoryLine) => l.group.kind === 'income'
  const spend = (l: CategoryLine) => !income(l)
  const transferIds = new Set(categories.filter((c) => groupById.get(c.groupId)?.kind === 'transfer').map((c) => c.id))
  const counted = inCycle.filter((t) => !t.categoryId || !transferIds.has(t.categoryId))

  return {
    lines,
    incomeBudget: sum((l) => l.budget, income),
    incomeActual: sum((l) => l.actual, income),
    spendBudget: sum((l) => l.budget, spend),
    spendActual: sum((l) => l.actual, spend),
    leftToAllocate: sum((l) => l.budget, income) - sum((l) => l.budget, spend),
    net: counted.reduce((s, t) => s + t.moneyIn - t.moneyOut, 0),
    uncategorised: inCycle.filter((t) => !t.categoryId).length,
  }
}
