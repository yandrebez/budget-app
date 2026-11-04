import { describe, expect, it } from 'vitest'
import { summarise } from '@/domain/budget/summary'
import { payoff } from '@/domain/debt/payoff'
import { potProgress } from '@/domain/savings/progress'
import { categorise, patternFor } from '@/domain/transactions/categorise'
import type { Category, Group, Transaction } from '@/types'

const groups: Group[] = [
  { id: 'gi', name: 'Income', kind: 'income', order: 0 },
  { id: 'ge', name: 'Expenses', kind: 'expense', order: 1 },
  { id: 'gt', name: 'Transfers', kind: 'transfer', order: 2 },
]
const cats: Category[] = [
  { id: 'pay', name: 'Pay', groupId: 'gi', monthlyBudget: 100000 },
  { id: 'food', name: 'Food', groupId: 'ge', monthlyBudget: 30000 },
  { id: 'rent', name: 'Rent', groupId: 'ge', monthlyBudget: 60000 },
  { id: 'xfer', name: 'Move', groupId: 'gt', monthlyBudget: 0 },
]
const tx = (id: string, date: string, categoryId: string | null, moneyIn: number, moneyOut: number): Transaction =>
  ({ id, date, accountId: 'a', categoryId, description: '', moneyIn, moneyOut })

describe('summarise', () => {
  const txs = [
    tx('1', '2026-10-01', 'pay', 100000, 0),
    tx('2', '2026-10-02', 'food', 0, 35000),
    tx('3', '2026-10-03', 'food', 5000, 0), // refund
    tx('4', '2026-10-04', 'xfer', 0, 20000), // excluded
    tx('5', '2026-10-05', null, 0, 1000),
    tx('6', '2026-11-01', 'rent', 0, 60000), // other cycle
  ]
  const s = summarise(cats, groups, txs, '2026-10-01', '2026-10-31')
  it('nets refunds and flags overruns', () => {
    const food = s.lines.find((l) => l.category.id === 'food')!
    expect(food.actual).toBe(30000)
    expect(food.over).toBe(false)
    expect(summarise(cats, groups, [tx('x', '2026-10-02', 'food', 0, 40000)], '2026-10-01', '2026-10-31').lines.find((l) => l.category.id === 'food')!.over).toBe(true)
  })
  it('computes left to allocate, ignores transfers and other cycles', () => {
    expect(s.leftToAllocate).toBe(100000 - 90000)
    expect(s.lines.some((l) => l.category.id === 'xfer')).toBe(false)
    expect(s.net).toBe(100000 - 30000 - 1000)
    expect(s.uncategorised).toBe(1)
  })
})

describe('payoff', () => {
  it('zero interest', () => expect(payoff(100000, 0, 25000)).toEqual({ months: 4, totalInterest: 0 }))
  it('amortises with interest', () => {
    const p = payoff(1_000_000, 0.12, 100_000)
    expect(p.months).toBe(11)
    expect(p.totalInterest).toBeGreaterThan(0)
  })
  it('never clears when payment <= interest', () => expect(payoff(1_000_000, 0.12, 10_000).months).toBeNull())
  it('cleared debt', () => expect(payoff(0, 0.2, 0).months).toBe(0))
})

describe('savings + rules', () => {
  it('progress', () => {
    expect(potProgress(2500, 10000, 500)).toEqual({ fraction: 0.25, remaining: 7500, monthsToTarget: 15 })
    expect(potProgress(0, 100, 0).monthsToTarget).toBeNull()
  })
  it('learns and applies rules, preferring the longest match', () => {
    expect(patternFor('WOOLWORTHS 1234 CPT')).toBe('woolworths cpt')
    const rules = [{ id: '1', pattern: 'woolworths', categoryId: 'food' }, { id: '2', pattern: 'woolworths cpt', categoryId: 'treats' }]
    expect(categorise('Woolworths 99 CPT', rules)).toBe('treats')
    expect(categorise('Unknown shop', rules)).toBeNull()
  })
})
