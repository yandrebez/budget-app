import { describe, expect, it } from 'vitest'
import { balancesByAccount, isSpendingAccount, totalBalance } from '@/domain/balances/balances'
import { buildForecast } from '@/domain/forecast/forecast'
import { detectRecurring, internalTransfers } from '@/domain/forecast/recurring'
import { cycleForMonth } from '@/domain/cycles/cycle'
import type { Account, Category, Group, Transaction } from '@/types'

const cfg = { payDay: 1, weekendRule: 'none' as const, holidays: [] }
const R = (rand: number) => Math.round(rand * 100)

const accounts: Account[] = [
  { id: 'chq', name: 'Cheque', kind: 'account', openingBalance: 0 },
  { id: 'sav', name: 'Savings', kind: 'savings', openingBalance: 0 },
]
const groups: Group[] = [
  { id: 'gi', name: 'Income', kind: 'income', order: 0 }, { id: 'ge', name: 'Expenses', kind: 'expense', order: 1 },
  { id: 'gd', name: 'Debt', kind: 'debt', order: 2 }, { id: 'gt', name: 'Transfers', kind: 'transfer', order: 3 },
]
const categories: Category[] = [
  { id: 'pay', name: 'Pay', groupId: 'gi', monthlyBudget: R(20000) }, { id: 'rent', name: 'Rent', groupId: 'ge', monthlyBudget: R(6000) },
  { id: 'food', name: 'Groceries', groupId: 'ge', monthlyBudget: R(2400) }, { id: 'gym', name: 'Gym', groupId: 'ge', monthlyBudget: R(300) },
  { id: 'med', name: 'Medical', groupId: 'ge', monthlyBudget: R(3000) }, { id: 'fuel', name: 'Fuel', groupId: 'ge', monthlyBudget: R(2000) }, { id: 'loan', name: 'Loan', groupId: 'gd', monthlyBudget: R(2000) },
  { id: 'move', name: 'Move', groupId: 'gt', monthlyBudget: 0 },
]

let n = 0
const tx = (date: string, categoryId: string | null, moneyIn: number, moneyOut: number, description: string, accountId = 'chq'): Transaction =>
  ({ id: `t${n++}`, date, accountId, categoryId, description, moneyIn: R(moneyIn), moneyOut: R(moneyOut) })

/** One calendar month of a tidy life: pay, rent, loan, gym, savings transfer, medical aid, and groceries every 5 days. */
function month(y: number, m: number, through = 31, opts: { med?: boolean; gym?: boolean } = { med: true, gym: true }): Transaction[] {
  const d = (day: number) => `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const out: Transaction[] = []
  const add = (day: number, ...a: [string | null, number, number, string, string?]) => { if (day <= through) out.push(tx(d(day), ...a)) }
  add(1, 'pay', 20000, 0, 'Salary ACME')
  add(2, 'move', 0, 1000, 'Move to savings')
  if (2 <= through) out.push(tx(d(2), 'move', 1000, 0, 'Move to savings', 'sav'))
  add(3, 'rent', 0, 6000, 'Landlord rent')
  add(5, 'loan', 0, 2000, 'Car loan')
  if (opts.gym) add(10, 'gym', 0, 300, 'Gym debit order')
  if (opts.med) add(20, 'med', 0, 3000, 'Medical aid')
  for (const day of [4, 9, 14, 19, 24, 28]) add(day, 'food', 0, 400, `Shop ${day}`)
  return out
}

const history = [...month(2026, 7), ...month(2026, 8), ...month(2026, 9)]
const base = (today: string, extra: Transaction[], whatIf = {}) =>
  buildForecast({ cfg, today, accounts, categories, groups, txs: [...history, ...extra], whatIf })!

describe('recurring payments', () => {
  const priors = [2026 * 12 + 8, 2026 * 12 + 7, 2026 * 12 + 6].map((i) => cycleForMonth(cfg, Math.floor(i / 12), (i % 12) + 1))
  const spending = history.filter((t) => t.accountId === 'chq')
  const items = detectRecurring(spending, priors)

  it('finds the bills and the pay, but not groceries bought every few days', () => {
    const labels = items.map((i) => i.label).sort()
    expect(labels).toEqual(['Car loan', 'Gym debit order', 'Landlord rent', 'Medical aid', 'Move to savings', 'Salary ACME'])
    expect(items.find((i) => i.label === 'Salary ACME')).toMatchObject({ direction: 'in', amount: R(20000), offset: 0 })
    expect(items.find((i) => i.label === 'Medical aid')).toMatchObject({ direction: 'out', amount: R(3000), offset: 19 })
  })
  it('recognises a bill by its category and amount even when the wording changes every month', () => {
    const typed = [
      tx('2026-07-01', 'rent', 0, 1832, 'Discovery prem'), tx('2026-08-01', 'rent', 0, 1832, 'Discovery insure'), tx('2026-09-02', 'rent', 0, 1834, 'Medical aid sep'),
      tx('2026-07-12', 'food', 0, 21.58, 'Co-payment'), // a one-off small payment in the same category is not the bill
    ]
    const found = detectRecurring(typed, priors)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ categoryId: 'rent', direction: 'out', label: 'Medical aid sep' })
    expect(found[0].amount).toBeGreaterThanOrEqual(R(1832))
  })
  it('uses the wording only for transactions with no category', () => {
    const loose = ['2026-07-04', '2026-08-04', '2026-09-04'].map((d) => tx(d, null, 0, 99, 'Netflix 1234'))
    expect(detectRecurring(loose, priors)).toMatchObject([{ categoryId: null, pattern: 'netflix', amount: R(99) }])
    const different = [tx('2026-07-04', null, 0, 99, 'Netflix'), tx('2026-08-04', null, 0, 99, 'Dstv'), tx('2026-09-04', null, 0, 99, 'Spotify')]
    expect(detectRecurring(different, priors)).toEqual([])
  })
  it('needs at least two earlier periods', () => {
    expect(detectRecurring(spending, priors.slice(0, 1))).toEqual([])
  })
  it('ignores a payment whose amount keeps changing', () => {
    const wobbly = [tx('2026-07-05', 'rent', 0, 100, 'Power'), tx('2026-08-05', 'rent', 0, 400, 'Power'), tx('2026-09-05', 'rent', 0, 250, 'Power')]
    expect(detectRecurring(wobbly, priors)).toEqual([])
  })
  it('pairs the two sides of a move between your own accounts', () => {
    const pair = [tx('2026-09-02', 'move', 0, 500, 'Move', 'chq'), tx('2026-09-02', 'move', 500, 0, 'Move', 'card')]
    expect([...internalTransfers(pair, new Set(['move']))].sort()).toEqual(pair.map((t) => t.id).sort())
    expect(internalTransfers([pair[0]], new Set(['move'])).size).toBe(0) // one-sided: money really left
  })
})

describe('forecast', () => {
  const now = '2026-10-14' // the last day anything was logged (a shop trip)
  const october = month(2026, 10, 14, { gym: true, med: false })
  const f = base(now, october)

  it('knows where the period stands', () => {
    expect([f.start, f.end, f.asOf, f.staleDays, f.elapsed, f.total, f.remaining]).toEqual(['2026-10-01', '2026-10-31', now, 0, 14, 31, 17])
    expect(f.history).toHaveLength(14)
    expect(f.history[13].balance).toBe(f.balanceNow)
    const b = balancesByAccount(accounts, [...history, ...october], now)
    expect(f.balanceNow).toBe(totalBalance(new Map([...b].filter(([id]) => accounts.filter(isSpendingAccount).some((a) => a.id === id)))))
    expect(f.projection[0]).toEqual({ date: now, balance: f.balanceNow })
    expect(f.projection).toHaveLength(18)
  })

  it('lists only what has not happened yet, on its usual day', () => {
    expect(f.events.map((e) => [e.label, e.date, e.amount, e.late])).toEqual([['Medical aid', '2026-10-20', -R(3000), false]])
    expect(f.limitedHistory).toBe(false)
  })

  it('estimates habitual spending from this period\'s pace and what groceries usually cost', () => {
    // 3 shop trips of R400 so far (14 of 31 days); usually 6 trips = R2,400 a period.
    const h = base(now, october, { basis: 'habits' })
    const pace = 3 * (17 / 14) * R(400)
    const usual = R(2400) - R(1200)
    const w = 14 / 31
    const food = h.lines.find((l) => l.categoryId === 'food')!
    expect(Math.abs(food.habit - (w * pace + (1 - w) * usual))).toBeLessThanOrEqual(1)
    expect(food.expected).toBe(food.habit)
    expect(h.spendPerDay).toBe(Math.round(food.habit / 17))
    expect(Math.abs(h.endBalance - (h.balanceNow - R(3000) - h.spendPerDay * 17))).toBeLessThanOrEqual(17)
  })

  it('is on track with room to save, and never suggests more than the lowest point allows', () => {
    expect(f.verdict).toBe('ok')
    expect(f.safeToSave).toBeGreaterThan(0)
    expect(f.safeToSave).toBeLessThanOrEqual(f.minBalance)
    expect(f.endRange.low).toBeLessThan(f.endBalance)
    expect(f.endRange.high).toBeGreaterThan(f.endBalance)
    const spendAll = f.safeDaily * f.remaining
    expect(f.balanceNow - R(3000) - spendAll).toBeGreaterThanOrEqual(0)
  })

  it('treats a bill that is a few days late as coming tomorrow', () => {
    const late = base(now, month(2026, 10, 14, { gym: false, med: false }))
    expect(late.events.find((e) => e.label === 'Gym debit order')).toMatchObject({ late: true, overdue: false, skipped: false, date: '2026-10-15' })
  })

  it('leaves out a bill that is more than a week overdue, until the person counts it', () => {
    const noRent = october.filter((t) => t.categoryId !== 'rent')
    const g = base(now, noRent)
    const rent = g.events.find((e) => e.label === 'Landlord rent')!
    expect(rent).toMatchObject({ late: true, overdue: true, skipped: true })
    const counted = base(now, noRent, { counted: { [rent.id]: true } })
    expect(counted.events.find((e) => e.id === rent.id)!.skipped).toBe(false)
    expect(g.endBalance - counted.endBalance).toBe(-R(-6000))
  })

  it('starts from the last day anything was logged, so unlogged days are forecast rather than assumed empty', () => {
    const stale = buildForecast({ cfg, today: '2026-10-22', accounts, categories, groups, txs: [...history, ...october] })!
    expect(stale.asOf).toBe(now)
    expect(stale.staleDays).toBe(8)
    expect(stale.balanceNow).toBe(f.balanceNow)
    expect(stale.remaining).toBe(17)
    expect(stale.events.map((e) => e.label)).toEqual(['Medical aid'])
  })

  it('calls a month tight when little is left, and short when the money runs out', () => {
    const tightBy = f.endBalance - R(10)
    const tight = base(now, october, { oneOff: tightBy })
    expect(tight.verdict).toBe('tight')
    expect(tight.endBalance).toBeGreaterThanOrEqual(0)

    const short = base(now, october, { oneOff: f.balanceNow + R(5000) })
    expect(short.verdict).toBe('short')
    expect(short.firstNegativeDate).toBe('2026-10-15')
    expect(short.safeToSave).toBe(0)
  })

  it('says how much less per day would avoid running short, when that is enough', () => {
    // Short only late in the month: cut a little each day
    const need = base(now, october, { oneOff: f.endBalance + R(400) })
    expect(need.verdict).toBe('short')
    expect(need.cutPerDay).not.toBeNull()
    expect(need.cutIsEnough).toBe(true)
    const after = base(now, october, { oneOff: f.endBalance + R(400), spendMultiplier: 1 - need.cutPerDay! / need.spendPerDay })
    expect(after.minBalance).toBeGreaterThanOrEqual(-R(1))
  })

  it('what-if: spending less or leaving out a bill raises the end balance', () => {
    const less = base(now, october, { spendMultiplier: 0.5 })
    expect(less.endBalance - f.endBalance).toBeCloseTo(f.spendingLeft / 2, -2)
    const skip = base(now, october, { counted: { [f.events[0].id]: false } })
    expect(skip.endBalance - f.endBalance).toBe(R(3000))
    expect(skip.events[0].skipped).toBe(true)
  })

  it('does not turn a one-off purchase into a daily spending rate', () => {
    // A single R2,000 repair in a category that has no pattern of repeating (and whose R300 budget is long gone).
    const repair = base(now, [...october, tx('2026-10-14', 'gym', 0, 2000, 'Big repair')])
    const gym = repair.lines.find((l) => l.categoryId === 'gym')!
    expect(gym).toMatchObject({ habit: 0, budgetLeft: 0, expected: 0, spent: R(2300), count: 2 })
    // It already left the account, and nothing more is added for the rest of the period.
    expect(repair.spendingLeft).toBe(f.spendingLeft)
    expect(Math.abs(repair.endBalance - (f.endBalance - R(2000)))).toBeLessThanOrEqual(2)
  })

  it('one big shop inside a habitual category does not distort the pace', () => {
    const big = base(now, [...october, tx('2026-10-14', 'food', 0, 3000, 'Big shop')])
    const food = big.lines.find((l) => l.categoryId === 'food')!
    // Still bought regularly, but the expected size of a trip stays the usual R400, not R3,400.
    expect(food.habit).toBeGreaterThan(0)
    expect(food.habit).toBeLessThan(R(2500))
  })

  it('expects the rest of what a twice-a-month category usually costs, not a multiple of one purchase', () => {
    const fuel = (d: string, a: number) => tx(d, 'fuel', 0, a, `Fuel ${d}`)
    // Two fill-ups a period of varying size, always R2,000 in total.
    const history2 = [fuel('2026-07-06', 500), fuel('2026-07-21', 1500), fuel('2026-08-06', 700), fuel('2026-08-21', 1300), fuel('2026-09-06', 1000), fuel('2026-09-21', 1000)]
    const g = buildForecast({ cfg, today: now, accounts, categories, groups, txs: [...history, ...history2, ...october, fuel('2026-10-06', 800)], whatIf: { basis: 'habits' } })!
    const e = g.lines.find((x) => x.categoryId === 'fuel')!
    expect(Math.abs(e.habit - R(1200))).toBeLessThanOrEqual(1) // R2,000 usual, R800 already spent
  })

  it('can leave a regular category out of the estimate', () => {
    const food = f.lines.find((l) => l.categoryId === 'food')!
    const off = base(now, october, { everydayOff: ['food'] })
    expect(off.lines.find((l) => l.categoryId === 'food')).toMatchObject({ off: true, expected: 0, wouldBe: food.wouldBe, habit: food.habit })
    expect(Math.abs(off.endBalance - f.endBalance - (f.spendingLeft - off.spendingLeft))).toBeLessThanOrEqual(2)
  })

  it('flags categories heading over budget', () => {
    const heavy = base(now, [...october, tx('2026-10-14', 'food', 0, 3000, 'Big shop')])
    expect(heavy.risks[0]).toMatchObject({ name: 'Groceries' })
    expect(heavy.risks[0].projected).toBeGreaterThan(heavy.risks[0].budget)
  })

  it('does not mistake a loose habit for a bill', () => {
    const habit = [tx('2026-07-06', 'food', 0, 27.95, 'Drink'), tx('2026-08-07', 'food', 0, 31.2, 'Drink'), tx('2026-09-06', 'food', 0, 29, 'Drink'), tx('2026-10-08', 'food', 0, 28, 'Drink')]
    const h = buildForecast({ cfg, today: now, accounts, categories, groups, txs: [...history, ...october, ...habit.filter((t) => t.date <= now)] })!
    expect(h.events.map((e) => e.label)).toEqual(['Medical aid'])
  })

  it('does not count a move between two spending accounts as spending or a bill', () => {
    const two: Account[] = [...accounts, { id: 'card', name: 'Card', kind: 'card', openingBalance: 0 }]
    const moves = ['2026-07-02', '2026-08-02', '2026-09-02', '2026-10-02'].flatMap((d) => [tx(d, 'move', 0, 700, 'Top up card', 'chq'), tx(d, 'move', 700, 0, 'Top up card', 'card')])
    const g = buildForecast({ cfg, today: now, accounts: two, categories, groups, txs: [...history, ...october, ...moves] })!
    expect(g.events.map((e) => e.label)).toEqual(['Medical aid'])
    expect(g.spendPerDay).toBe(f.spendPerDay)
    expect(g.balanceNow).toBe(f.balanceNow)
  })
})

describe('the budget', () => {
  const now = '2026-10-14'
  const october = month(2026, 10, 14, { gym: true, med: false })
  const run = (whatIf = {}, extra: Transaction[] = [], cats: Category[] = categories, grps: Group[] = groups) =>
    buildForecast({ cfg, today: now, accounts, categories: cats, groups: grps, txs: [...history, ...october, ...extra], whatIf })!

  it('expects a budgeted category that has not been used yet to be spent, unless you go by habits alone', () => {
    // Fuel has a R2,000 budget and no purchases at all.
    const fuel = (b: 'cautious' | 'budget' | 'habits') => run({ basis: b }).lines.find((l) => l.categoryId === 'fuel')!
    expect(fuel('habits')).toMatchObject({ spent: 0, habit: 0, budgetLeft: R(2000), expected: 0 })
    expect(fuel('budget').expected).toBe(R(2000))
    expect(fuel('cautious').expected).toBe(R(2000))
  })

  it('shows the end balance under each basis, cautious being the lowest', () => {
    const f = run()
    expect(f.ends.cautious).toBeLessThanOrEqual(f.ends.habits)
    expect(f.ends.cautious).toBeLessThanOrEqual(f.ends.budget)
    expect(f.ends.habits).toBeGreaterThan(f.ends.budget) // the plan expects the unused fuel budget to be spent
    expect(run({ basis: 'budget' }).endBalance).toBe(f.ends.budget)
    expect(run({ basis: 'habits' }).endBalance).toBe(f.ends.habits)
  })

  it('leaving a bill out removes the payment without bringing its budget back', () => {
    const med = run().events.find((e) => e.label === 'Medical aid')!
    const without = run({ counted: { [med.id]: false } })
    expect(without.lines.find((l) => l.categoryId === 'med')).toMatchObject({ budgetLeft: 0, expected: 0 })
    expect(without.endBalance - run().endBalance).toBe(R(3000))
  })

  it('does not count a bill twice when it is both in the budget and still to come', () => {
    const med = run().lines.find((l) => l.categoryId === 'med')!
    expect(run().events.map((e) => e.label)).toContain('Medical aid')
    expect(med).toMatchObject({ budget: R(3000), spent: 0, budgetLeft: 0, expected: 0 })
  })

  it('subtracts what is already spent, including bills, from the budget', () => {
    const food = run().lines.find((l) => l.categoryId === 'food')!
    expect(food.budgetLeft).toBe(R(2400) - R(1200))
  })

  it('lists spending in a category that has no budget, but does not repeat it', () => {
    const cats: Category[] = [...categories, { id: 'gift', name: 'Gifts', groupId: 'ge', monthlyBudget: 0 }]
    const g = run({}, [tx('2026-10-12', 'gift', 0, 500, 'Birthday gift')], cats)
    expect(g.lines.find((l) => l.name === 'Gifts')).toMatchObject({ budget: 0, spent: R(500), budgetLeft: 0, habit: 0, expected: 0 })
  })

  it('expects an unpaid budgeted loan or savings amount, which habits alone would miss', () => {
    const cats: Category[] = [...categories, { id: 'card', name: 'Store card', groupId: 'gd', monthlyBudget: R(1000) }, { id: 'ef', name: 'Emergency fund', groupId: 'gs', monthlyBudget: R(2000) }]
    const grps: Group[] = [...groups, { id: 'gs', name: 'Savings', kind: 'savings', order: 4 }]
    const g = run({ basis: 'budget' }, [], cats, grps)
    expect(g.lines.find((l) => l.name === 'Store card')).toMatchObject({ kind: 'debt', budgetLeft: R(1000), expected: R(1000) })
    expect(g.lines.find((l) => l.name === 'Emergency fund')).toMatchObject({ kind: 'savings', expected: R(2000) })
    expect(run({ basis: 'habits' }, [], cats, grps).lines.find((l) => l.name === 'Store card')?.expected).toBe(0)
  })

  it('does not assume money kept as a buffer will be spent', () => {
    const cats: Category[] = [...categories, { id: 'buf', name: 'Buffer / unspent', groupId: 'ge', monthlyBudget: R(500) }]
    expect(run({}, [], cats).lines.find((l) => l.name === 'Buffer / unspent')).toMatchObject({ budget: R(500), budgetLeft: 0, expected: 0, kept: true })
  })

  it('ignores income and transfer budgets as spending', () => {
    const names = run().lines.map((l) => l.name)
    expect(names).not.toContain('Pay')
    expect(names).not.toContain('Move')
  })
})

describe('with little history', () => {
  it('does not repeat a lone purchase for a new user either', () => {
    const only = [tx('2026-10-01', 'pay', 20000, 0, 'Salary ACME'), tx('2026-10-05', 'gym', 0, 2000, 'Big repair')]
    const f = buildForecast({ cfg, today: '2026-10-05', accounts, categories, groups, txs: only })!
    expect(f.lines.find((l) => l.categoryId === 'gym')).toMatchObject({ habit: 0, expected: 0 })
  })
  it('leans on the budget and says so', () => {
    const only = [tx('2026-10-01', 'pay', 20000, 0, 'Salary ACME'), tx('2026-10-02', 'food', 0, 400, 'Shop')]
    const f = buildForecast({ cfg, today: '2026-10-02', accounts, categories, groups, txs: only })!
    expect(f.limitedHistory).toBe(true)
    expect(f.events).toEqual([])
    expect(f.spendingLeft).toBeGreaterThan(0) // the budget guides when there is no history
  })
  it('works on the last day of a period and with no spending accounts', () => {
    const last = buildForecast({ cfg, today: '2026-10-31', accounts, categories, groups, txs: [...history, ...month(2026, 10), tx('2026-10-31', 'food', 0, 50, 'Last shop')] })!
    expect(last.remaining).toBe(0)
    expect(last.projection).toHaveLength(1)
    expect(buildForecast({ cfg, today: '2026-10-15', accounts: [accounts[1]], categories, groups, txs: [] })).toBeNull()
  })
})
