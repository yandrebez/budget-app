import { describe, expect, it } from 'vitest'
import { budgetChanges, budgetFor, budgetPatch, hasBudgetHistory } from '@/domain/budget/budgets'
import { summarise } from '@/domain/budget/summary'
import { buildForecast } from '@/domain/forecast/forecast'
import type { Account, Category, Group, Transaction } from '@/types'

const R = (rand: number) => Math.round(rand * 100)

describe('a budget that changes from month to month', () => {
  const groceries: Category = { id: 'food', name: 'Groceries', groupId: 'ge', monthlyBudget: R(500), budgets: { '2026-12': R(800), '2027-02': R(650) } }

  it('is the most recent change at or before the month, otherwise the original amount', () => {
    expect(budgetFor(groceries, '2026-10')).toBe(R(500)) // before any change
    expect(budgetFor(groceries, '2026-11')).toBe(R(500))
    expect(budgetFor(groceries, '2026-12')).toBe(R(800)) // the month it changed
    expect(budgetFor(groceries, '2027-01')).toBe(R(800)) // carried forward
    expect(budgetFor(groceries, '2027-02')).toBe(R(650))
    expect(budgetFor(groceries, '2030-06')).toBe(R(650)) // and onward, until changed again
  })

  it('is unchanged for a category that has never had a change: every month uses the one amount', () => {
    const plain: Category = { id: 'rent', name: 'Rent', groupId: 'ge', monthlyBudget: R(6000) }
    for (const key of ['2020-01', '2026-10', '2026-12', '2040-12']) expect(budgetFor(plain, key)).toBe(R(6000))
    expect(hasBudgetHistory(plain)).toBe(false)
    expect(budgetChanges(plain)).toEqual([])
  })

  it('changing "from this month" leaves earlier months alone', () => {
    const plain: Category = { id: 'food', name: 'Groceries', groupId: 'ge', monthlyBudget: R(500) }
    const changed = { ...plain, ...budgetPatch(plain, '2026-12', R(800), 'onward') }
    expect(budgetFor(changed, '2026-11')).toBe(R(500))
    expect(budgetFor(changed, '2026-12')).toBe(R(800))
    expect(budgetFor(changed, '2027-03')).toBe(R(800))
    expect(changed.monthlyBudget).toBe(R(500)) // the original amount is not touched
    expect(budgetChanges(changed)).toEqual([{ periodKey: '2026-12', amount: R(800) }])
  })

  it('editing the same month again just replaces that month\'s change', () => {
    let c: Category = { id: 'food', name: 'Groceries', groupId: 'ge', monthlyBudget: R(500) }
    for (const amount of [R(7), R(70), R(700)]) c = { ...c, ...budgetPatch(c, '2026-12', amount, 'onward') }
    expect(budgetChanges(c)).toEqual([{ periodKey: '2026-12', amount: R(700) }])
  })

  it('changing a past month from then on does not disturb a later change', () => {
    const c = { ...groceries, ...budgetPatch(groceries, '2026-10', R(520), 'onward') }
    expect(budgetFor(c, '2026-10')).toBe(R(520))
    expect(budgetFor(c, '2026-11')).toBe(R(520))
    expect(budgetFor(c, '2026-12')).toBe(R(800)) // the December change still stands
  })

  it('"every month" replaces the amount everywhere and clears the history', () => {
    const c = { ...groceries, ...budgetPatch(groceries, '2026-12', R(900), 'all') }
    expect(c.budgets).toBeUndefined()
    for (const key of ['2026-10', '2026-12', '2027-03']) expect(budgetFor(c, key)).toBe(R(900))
  })

  it('never stores a negative or fractional amount', () => {
    const c = { ...groceries, ...budgetPatch(groceries, '2026-12', -5, 'onward') }
    expect(budgetFor(c, '2026-12')).toBe(0)
    expect(budgetPatch(groceries, '2026-12', 123.6, 'onward').budgets?.['2026-12']).toBe(124)
  })
})

describe('each month is judged against the budget it had', () => {
  const groups: Group[] = [{ id: 'gi', name: 'Income', kind: 'income', order: 0 }, { id: 'ge', name: 'Expenses', kind: 'expense', order: 1 }]
  const cats: Category[] = [
    { id: 'pay', name: 'Pay', groupId: 'gi', monthlyBudget: R(10000) },
    { id: 'food', name: 'Groceries', groupId: 'ge', monthlyBudget: R(500), budgets: { '2026-12': R(800) } },
    { id: 'rent', name: 'Rent', groupId: 'ge', monthlyBudget: R(4000) }, // never changed
  ]
  const tx = (date: string, categoryId: string, moneyOut: number): Transaction => ({ id: date + categoryId, date, accountId: 'a', categoryId, description: '', moneyIn: 0, moneyOut: R(moneyOut) })
  const txs = [tx('2026-11-10', 'food', 600), tx('2026-12-10', 'food', 600), tx('2026-11-03', 'rent', 4000), tx('2026-12-03', 'rent', 4000)]

  it('shows November against R500 and December against R800', () => {
    const nov = summarise(cats, groups, txs, '2026-11-01', '2026-11-30', '2026-11')
    const dec = summarise(cats, groups, txs, '2026-12-01', '2026-12-31', '2026-12')
    const food = (s: typeof nov) => s.lines.find((l) => l.category.id === 'food')!
    expect(food(nov)).toMatchObject({ budget: R(500), actual: R(600), over: true })
    expect(food(dec)).toMatchObject({ budget: R(800), actual: R(600), over: false })
  })

  it('leaves an unchanged category identical in every month', () => {
    for (const [start, end, key] of [['2026-11-01', '2026-11-30', '2026-11'], ['2026-12-01', '2026-12-31', '2026-12']]) {
      expect(summarise(cats, groups, txs, start, end, key).lines.find((l) => l.category.id === 'rent')).toMatchObject({ budget: R(4000), actual: R(4000), over: false })
    }
  })

  it('"left to allocate" follows that month\'s budgets', () => {
    expect(summarise(cats, groups, txs, '2026-11-01', '2026-11-30', '2026-11').leftToAllocate).toBe(R(10000 - 500 - 4000))
    expect(summarise(cats, groups, txs, '2026-12-01', '2026-12-31', '2026-12').leftToAllocate).toBe(R(10000 - 800 - 4000))
  })
})

describe('the forecast uses this period\'s budget', () => {
  const cfg = { payDay: 1, weekendRule: 'none' as const, holidays: [] }
  const accounts: Account[] = [{ id: 'chq', name: 'Cheque', kind: 'account', openingBalance: R(10000) }]
  const groups: Group[] = [{ id: 'ge', name: 'Expenses', kind: 'expense', order: 0 }]
  const fuel = (b?: Record<string, number>): Category[] => [{ id: 'fuel', name: 'Fuel', groupId: 'ge', monthlyBudget: R(2000), budgets: b }]
  const run = (cats: Category[]) =>
    buildForecast({ cfg, today: '2026-12-10', accounts, categories: cats, groups, txs: [{ id: 't', date: '2026-12-02', accountId: 'chq', categoryId: null, description: 'x', moneyIn: 0, moneyOut: R(10) }], whatIf: { basis: 'budget' } })!

  it('expects what is left of the budget that applies to the current month', () => {
    expect(run(fuel()).lines.find((l) => l.name === 'Fuel')).toMatchObject({ budget: R(2000), budgetLeft: R(2000) })
    // Budgeted R2,000 until it dropped to R500 from December: the current period is December.
    expect(run(fuel({ '2026-12': R(500) })).lines.find((l) => l.name === 'Fuel')).toMatchObject({ budget: R(500), budgetLeft: R(500) })
    // A change that starts next month does not apply yet.
    expect(run(fuel({ '2027-01': R(500) })).lines.find((l) => l.name === 'Fuel')).toMatchObject({ budget: R(2000), budgetLeft: R(2000) })
  })
})
