import type { Category } from '@/types'

type Budgeted = Pick<Category, 'monthlyBudget' | 'budgets'>

/** Period keys sorted oldest first. `YYYY-MM` sorts correctly as text. */
const keysOf = (c: Budgeted): string[] => Object.keys(c.budgets ?? {}).sort()

/**
 * The budget that applies to a period: the most recent change at or before it, otherwise the original amount.
 * Categories with no changes use `monthlyBudget` for every period, exactly as before budgets had a history.
 */
export function budgetFor(c: Budgeted, periodKey: string): number {
  let amount = c.monthlyBudget
  for (const k of keysOf(c)) {
    if (k > periodKey) break
    amount = (c.budgets as Record<string, number>)[k]
  }
  return amount
}

/** Where a change starts: from this period until the next change, or the whole history. */
export type BudgetScope = 'onward' | 'all'

/**
 * The fields to store to give a category a new amount. `onward` records it from `periodKey`, so earlier periods
 * keep what they had; `all` replaces the amount for every period and clears the history.
 */
export function budgetPatch(c: Budgeted, periodKey: string, amount: number, scope: BudgetScope): Pick<Category, 'monthlyBudget' | 'budgets'> {
  const cents = Math.max(0, Math.round(amount))
  if (scope === 'all') return { monthlyBudget: cents, budgets: undefined }
  return { monthlyBudget: c.monthlyBudget, budgets: { ...(c.budgets ?? {}), [periodKey]: cents } }
}

/** Every dated change, oldest first, for showing a history. */
export const budgetChanges = (c: Budgeted): { periodKey: string; amount: number }[] =>
  keysOf(c).map((k) => ({ periodKey: k, amount: (c.budgets as Record<string, number>)[k] }))

export const hasBudgetHistory = (c: Budgeted): boolean => keysOf(c).length > 0
