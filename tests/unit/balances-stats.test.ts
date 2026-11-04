import { describe, expect, it } from 'vitest'
import { balancesByAccount, isSpendingAccount, openingToMatch, periodFlow, totalBalance } from '@/domain/balances/balances'
import { breakdown, foldTail, periodStats, seriesByPeriod } from '@/domain/stats/stats'
import { cycleForMonth } from '@/domain/cycles/cycle'
import { buildTransfer } from '@/domain/transactions/transfer'
import type { Account, Category, Group, Transaction } from '@/types'

const accounts: Account[] = [
  { id: 'a', name: 'Cheque', openingBalance: 10000 },
  { id: 'b', name: 'Card', openingBalance: 0 },
]
const groups: Group[] = [
  { id: 'gi', name: 'Income', kind: 'income', order: 0 }, { id: 'ge', name: 'Fixed', kind: 'expense', order: 1 },
  { id: 'gs', name: 'Savings', kind: 'savings', order: 2 }, { id: 'gt', name: 'Transfer', kind: 'transfer', order: 3 },
]
const cats: Category[] = [
  { id: 'pay', name: 'Pay', groupId: 'gi', monthlyBudget: 0 }, { id: 'rent', name: 'Rent', groupId: 'ge', monthlyBudget: 0 },
  { id: 'food', name: 'Food', groupId: 'ge', monthlyBudget: 0 }, { id: 'sav', name: 'Rainy', groupId: 'gs', monthlyBudget: 0 },
  { id: 'move', name: 'Move', groupId: 'gt', monthlyBudget: 0 },
]
let n = 0
const tx = (date: string, accountId: string, categoryId: string | null, moneyIn: number, moneyOut: number): Transaction =>
  ({ id: String(n++), date, accountId, categoryId, description: '', moneyIn, moneyOut })

const txs = [
  tx('2026-09-15', 'a', 'pay', 5000, 0),
  tx('2026-10-01', 'a', 'pay', 20000, 0), tx('2026-10-02', 'a', 'rent', 0, 8000), tx('2026-10-03', 'b', 'food', 0, 1500),
  tx('2026-10-04', 'b', 'food', 500, 0), // refund
  tx('2026-10-05', 'a', 'move', 0, 3000), tx('2026-10-05', 'b', 'move', 3000, 0), // transfer pair
  tx('2026-10-06', 'a', 'sav', 0, 2000), tx('2026-10-07', 'a', null, 0, 100),
  tx('2026-11-20', 'a', 'food', 0, 999), // future
]

describe('balances', () => {
  it('per account, as of a date, with opening balances', () => {
    const b = balancesByAccount(accounts, txs, '2026-10-31')
    expect(b.get('a')).toBe(10000 + 5000 + 20000 - 8000 - 3000 - 2000 - 100)
    expect(b.get('b')).toBe(-1500 + 500 + 3000)
    expect(totalBalance(b)).toBe(10000 + 5000 + 20000 - 8000 - 1500 + 500 - 2000 - 100) // transfer nets to zero
  })
  it('period flow excludes transfers from in/out but not from the closing balance', () => {
    const cfg = { payDay: 1, weekendRule: 'none' as const, holidays: [] }
    const c = cycleForMonth(cfg, 2026, 10)
    const f = periodFlow(accounts, txs, c.start, c.end, new Set(['move']))
    expect(f.opening).toBe(15000)
    expect(f.moneyIn).toBe(20500)
    expect(f.moneyOut).toBe(8000 + 1500 + 2000 + 100)
    expect(f.closing).toBe(f.opening + 20500 - 11600)
  })
})

describe('reconciling to the bank', () => {
  it('moves only the opening balance so the account matches the bank', () => {
    const a = accounts[0]
    const current = balancesByAccount([a], txs, '2026-10-31').get('a')!
    const opening = openingToMatch(a, txs, current + 5000, '2026-10-31')
    expect(opening).toBe(a.openingBalance + 5000)
    expect(balancesByAccount([{ ...a, openingBalance: opening }], txs, '2026-10-31').get('a')).toBe(current + 5000)
  })
  it('can correct downwards and ignores future-dated rows', () => {
    const a = accounts[0]
    expect(balancesByAccount([{ ...a, openingBalance: openingToMatch(a, txs, 1234, '2026-10-31') }], txs, '2026-10-31').get('a')).toBe(1234)
  })
})

describe('moving money to savings', () => {
  const sav: Account = { id: 's', name: 'Savings', kind: 'savings', openingBalance: 0 }
  it('builds two linked legs and rejects bad input', () => {
    const [out, inn] = buildTransfer({ fromId: 'a', toId: 's', amount: 27797, date: '2026-10-30', note: ' Leftover ', categoryId: 'move', ids: { out: 'o', in: 'i', transfer: 't' } })
    expect(out).toMatchObject({ accountId: 'a', moneyOut: 27797, moneyIn: 0, transferId: 't', description: 'Leftover' })
    expect(inn).toMatchObject({ accountId: 's', moneyIn: 27797, moneyOut: 0, transferId: 't' })
    expect(() => buildTransfer({ fromId: 'a', toId: 'a', amount: 1, date: 'x', note: '', categoryId: 'm', ids: { out: 'o', in: 'i', transfer: 't' } })).toThrow()
    expect(() => buildTransfer({ fromId: 'a', toId: 's', amount: 0, date: 'x', note: '', categoryId: 'm', ids: { out: 'o', in: 'i', transfer: 't' } })).toThrow()
  })
  it('lowers the spending balance, raises savings, and leaves the grand total unchanged', () => {
    const all = [...accounts, sav]
    const [out, inn] = buildTransfer({ fromId: 'a', toId: 's', amount: 5000, date: '2026-10-30', note: '', categoryId: 'move', ids: { out: 'o', in: 'i', transfer: 't' } })
    const before = totalBalance(balancesByAccount(all, txs, '2026-10-31'))
    const b = balancesByAccount(all, [...txs, out, inn], '2026-10-31')
    expect(totalBalance(b)).toBe(before)
    expect(b.get('s')).toBe(5000)
    expect(all.filter(isSpendingAccount).map((a) => a.id)).toEqual(['a', 'b'])
  })
})

describe('stats', () => {
  const cfg = { payDay: 1, weekendRule: 'none' as const, holidays: [] }
  const oct = cycleForMonth(cfg, 2026, 10)
  const input = { txs, categories: cats, groups, accounts }
  it('buckets income, spending and saving; skips transfers; keeps uncategorised', () => {
    const [sep, o] = periodStats(cfg, oct, 2, input)
    expect(sep.income).toBe(5000)
    expect(o).toMatchObject({ income: 20000, spending: 8000 + 1000 + 100, saved: 2000 })
    expect(o.left).toBe(20000 - 9100 - 2000)
  })
  it('filters by account', () => {
    const [o] = periodStats(cfg, oct, 1, { ...input, accountIds: ['b'] })
    expect(o.spending).toBe(1000)
    expect(o.income).toBe(0)
  })
  it('breaks down and folds a tail', () => {
    const periods = periodStats(cfg, oct, 1, input)
    const slices = breakdown(periods, 'spending', 'category', (k) => k)
    expect(slices.map((s) => [s.key, s.value])).toEqual([['rent', 8000], ['food', 1000], ['__uncategorised__', 100]])
    expect(foldTail(slices, 2).map((s) => [s.label, s.value])).toEqual([['rent', 8000], ['Other', 1100]])
    expect(seriesByPeriod(periods, 'spending', 'group', ['ge']).get('ge')).toEqual([9000])
  })
})
