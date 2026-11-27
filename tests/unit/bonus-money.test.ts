import { describe, expect, it } from 'vitest'
import { balancesByAccount, periodFlow, totalBalance } from '@/domain/balances/balances'
import { bonusIdSet, bonusMoney, bonusSpending, isBonusTx, partSpent, salaryOnly, unplannedSpent } from '@/domain/budget/bonus'
import { summarise } from '@/domain/budget/summary'
import { buildForecast } from '@/domain/forecast/forecast'
import { periodStats } from '@/domain/stats/stats'
import { cycleForMonth } from '@/domain/cycles/cycle'
import type { Account, BonusPlan, Category, Group, Transaction } from '@/types'

const R = (rand: number) => Math.round(rand * 100)
const cfg = { payDay: 1, weekendRule: 'none' as const, holidays: [] }
const accounts: Account[] = [{ id: 'chq', name: 'Cheque', kind: 'account', openingBalance: R(1000) }]
const groups: Group[] = [{ id: 'gi', name: 'Income', kind: 'income', order: 0 }, { id: 'ge', name: 'Expenses', kind: 'expense', order: 1 }]
const categories: Category[] = [
  { id: 'pay', name: 'Salary', groupId: 'gi', monthlyBudget: R(15000) }, { id: 'bon', name: 'Bonus income', groupId: 'gi', monthlyBudget: 0 },
  { id: 'fuel', name: 'Fuel', groupId: 'ge', monthlyBudget: R(1600) }, { id: 'veh', name: 'Vehicle maintenance', groupId: 'ge', monthlyBudget: R(300) },
  { id: 'misc', name: 'Miscellaneous', groupId: 'ge', monthlyBudget: R(500) },
]
const plan: BonusPlan = { id: 'b1', name: 'December bonus', amount: R(20000), period: '2026-12', parts: [
  { id: 'p1', label: 'Vehicle', amount: R(5000), categoryId: 'veh', done: false }, { id: 'p2', label: 'Fuel', amount: R(2000), categoryId: 'fuel', done: false }, { id: 'p3', label: 'Savings', amount: R(13000), categoryId: null, done: false },
] }
const ids = bonusIdSet([plan])
let n = 0
const tx = (date: string, categoryId: string, moneyIn: number, moneyOut: number, bonusId?: string): Transaction =>
  ({ id: `t${n++}`, date, accountId: 'chq', categoryId, description: categoryId, moneyIn: R(moneyIn), moneyOut: R(moneyOut), ...(bonusId ? { bonusId } : {}) })
const isIncome = (c: string | null) => c === 'pay' || c === 'bon'

describe('bonus money stays out of the salary side but still moves the balance', () => {
  // Salary arrives, R500 of fuel from salary, then the bonus arrives and R1,000 of fuel is paid from it.
  const txs = [
    tx('2026-12-01', 'pay', 15000, 0), tx('2026-12-05', 'fuel', 0, 500),
    tx('2026-12-10', 'bon', 20000, 0, 'b1'), tx('2026-12-12', 'fuel', 0, 1000, 'b1'), tx('2026-12-14', 'veh', 0, 3200, 'b1'),
  ]
  const salary = salaryOnly(txs, ids)

  it('splits the transactions into the two sides', () => {
    expect(txs.filter((t) => isBonusTx(t, ids))).toHaveLength(3)
    expect(salary).toHaveLength(2)
    expect(salaryOnly(txs, new Set())).toBe(txs) // no plans: nothing is hidden
    expect(isBonusTx({ bonusId: 'gone' }, ids)).toBe(false) // a tag for a plan that no longer exists is ignored
  })

  it('leaves the fuel budget at R1,600 minus the R500 paid from salary, not the R1,000 from the bonus', () => {
    const s = summarise(categories, groups, salary, '2026-12-01', '2026-12-31', '2026-12')
    expect(s.lines.find((l) => l.category.id === 'fuel')).toMatchObject({ budget: R(1600), actual: R(500), left: R(1100) })
    expect(s.lines.find((l) => l.category.id === 'veh')).toMatchObject({ actual: 0, over: false }) // the R3,200 tyres are not on the salary budget
    expect(s.incomeActual).toBe(R(15000)) // the bonus is not extra "money in" against the salary plan
    // For contrast, counting everything would have charged the salary budget:
    const wrong = summarise(categories, groups, txs, '2026-12-01', '2026-12-31', '2026-12')
    expect(wrong.lines.find((l) => l.category.id === 'fuel')?.actual).toBe(R(1500))
  })

  it('still takes the money off the balance', () => {
    const all = totalBalance(balancesByAccount(accounts, txs, '2026-12-31'))
    expect(all).toBe(R(1000 + 15000 - 500 + 20000 - 1000 - 3200))
    expect(totalBalance(balancesByAccount(accounts, salary, '2026-12-31'))).toBe(R(1000 + 15000 - 500))
  })

  it('keeps bonus money out of the month\'s money in and out, but not out of the closing balance', () => {
    const c = cycleForMonth(cfg, 2026, 12)
    const f = periodFlow(accounts, txs, c.start, c.end, new Set(), (t) => isBonusTx(t, ids))
    expect(f).toMatchObject({ moneyIn: R(15000), moneyOut: R(500), net: R(14500) })
    expect(f.closing).toBe(R(1000 + 15000 - 500 + 20000 - 1000 - 3200))
  })

  it('reports how much bonus money is left in the accounts', () => {
    expect(bonusMoney(txs, ids)).toBe(R(20000 - 1000 - 3200))
  })

  it('does not change the forecast: it works from the salary side only', () => {
    const run = (list: Transaction[]) => buildForecast({ cfg, today: '2026-12-14', accounts, categories, groups, txs: list, whatIf: { basis: 'budget' } })!
    const a = run(salary), b = run(salaryOnly(txs, ids))
    expect(b.balanceNow).toBe(a.balanceNow)
    expect(b.balanceNow).toBe(R(1000 + 15000 - 500)) // not inflated by the bonus
    expect(b.lines.find((l) => l.categoryId === 'fuel')).toMatchObject({ spent: R(500), budgetLeft: R(1100) })
  })

  it('Stats can show salary only, or everything', () => {
    const c = cycleForMonth(cfg, 2026, 12)
    const input = { txs: salary, categories, groups, accounts }
    expect(periodStats(cfg, c, 1, input)[0]).toMatchObject({ income: R(15000), spending: R(500) })
    expect(periodStats(cfg, c, 1, { ...input, txs })[0]).toMatchObject({ income: R(35000), spending: R(4700) })
  })
})

describe('how a bonus plan has gone', () => {
  const txs = [
    tx('2026-12-10', 'bon', 20000, 0, 'b1'), tx('2026-12-12', 'fuel', 0, 1000, 'b1'), tx('2026-12-14', 'veh', 0, 3200, 'b1'),
    tx('2026-12-15', 'veh', 200, 0, 'b1'), // a refund
    tx('2026-12-16', 'misc', 0, 150, 'b1'), // spent from the bonus on something no part covers
    tx('2026-12-17', 'fuel', 0, 700), // salary fuel: not part of the bonus
  ]
  const s = bonusSpending(plan, txs, isIncome)

  it('counts what arrived, what was spent (net of refunds) and what is left', () => {
    expect(s).toMatchObject({ received: R(20000), spent: R(1000 + 3200 - 200 + 150), count: 5 })
    expect(s.left).toBe(R(20000 - 4150))
  })

  it('until the money arrives, what is left is measured against the planned amount', () => {
    const early = bonusSpending(plan, [tx('2026-12-12', 'fuel', 0, 1000, 'b1')], isIncome)
    expect(early).toMatchObject({ received: 0, spent: R(1000), left: R(19000) })
  })

  it('shows spending against each part, and spending no part covers', () => {
    expect(partSpent(plan.parts[0], s)).toBe(R(3000)) // vehicle: 3,200 less the 200 refund
    expect(partSpent(plan.parts[1], s)).toBe(R(1000)) // fuel
    expect(partSpent(plan.parts[2], s)).toBeNull() // not linked to a category
    expect(unplannedSpent(plan, s)).toBe(R(150))
  })
})
