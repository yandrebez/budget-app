import type { Account, Category, Group, ISODate, Transaction } from '@/types'
import { addDays, daysBetween } from '@/lib/dates'
import { isSpendingAccount } from '@/domain/balances/balances'
import { cycleContaining, shiftCycle, type Cycle, type CycleConfig } from '@/domain/cycles/cycle'
import { detectRecurring, internalTransfers, matches, median } from './recurring'

/** How many earlier periods are used to learn what is "normal". */
const HISTORY_PERIODS = 4
/** An earlier period that started more than this many days before the data began is too incomplete to learn from. */
const PARTIAL_DAYS = 7
/** Fewer purchases than this in a category say nothing about a pattern, so a lone purchase is never extrapolated. */
const MIN_PATTERN = 3
/** Likely range: everyday spending this much higher or lower than expected. */
const SCENARIO = 0.25
/** Keep a cushion of this many days of everyday spending before calling money "free to save". */
const BUFFER_DAYS = 3
/** Money meant to stay in the account (a "buffer"), so it is not assumed to be spent. */
const KEPT = /buffer|unspent|reserve/i
const SPEND_KINDS = new Set(['expense', 'debt', 'savings'])
/** A bill this many days past its usual day, and still not seen, is probably not coming this period. */
const LATE_GRACE = 7

/** What to assume you will spend for the rest of the period. */
export type Basis = 'cautious' | 'budget' | 'habits'

export interface WhatIf {
  /** Default 'cautious': per category, whichever is higher of the unspent budget and your usual habit. */
  basis?: Basis
  /** 1 = as expected, 0.8 = spend 20 % less. */
  spendMultiplier?: number
  /** A one-off expense in cents, assumed tomorrow. */
  oneOff?: number
  /** Counted or not, by event id. Overrides the default (overdue bills start out left out). */
  counted?: Record<string, boolean>
  /** Categories to leave out of the everyday estimate (e.g. a one-off car repair). */
  everydayOff?: string[]
}

export interface ForecastInput {
  cfg: CycleConfig
  today: ISODate
  accounts: Account[]
  txs: Transaction[]
  categories: Category[]
  groups: Group[]
  whatIf?: WhatIf
}

export interface ForecastEvent {
  id: string
  date: ISODate
  label: string
  /** Signed cents: negative = money out. */
  amount: number
  kind: 'bill' | 'income' | 'oneoff'
  /** Usually paid earlier in the period but not seen yet; assumed to come tomorrow. */
  late: boolean
  /** So overdue that it starts out left out. */
  overdue: boolean
  skipped: boolean
}

export interface DayPoint { date: ISODate; balance: number }
export type Verdict = 'ok' | 'tight' | 'short'

/** One spending category: what the budget says, what has happened, and what is still expected. */
export interface SpendLine {
  categoryId: string | null
  name: string
  kind: 'expense' | 'debt' | 'savings'
  /** Monthly budget in cents (0 = none). */
  budget: number
  /** Spent so far this period, including bills already paid. */
  spent: number
  count: number
  /** Still expected from habits alone (what it usually costs, or this period's pace). */
  habit: number
  /** Budget not yet spent or already due as a bill. */
  budgetLeft: number
  /** Money meant to stay in the account (a "buffer"), never assumed to be spent. */
  kept: boolean
  /** Still expected under the chosen basis, if counted. */
  wouldBe: number
  /** Still expected under the chosen basis (0 if left out). */
  expected: number
  off: boolean
}

export interface CategoryRisk { categoryId: string | null; name: string; projected: number; budget: number; over: number }

export interface Forecast {
  start: ISODate
  end: ISODate
  /** The day this forecast starts from: your last logged transaction (today, if you are up to date). */
  asOf: ISODate
  today: ISODate
  /** Days between the last logged transaction and today. */
  staleDays: number
  elapsed: number
  total: number
  remaining: number
  balanceNow: number
  /** Actual balance from the start of the period to today. */
  history: DayPoint[]
  /** Expected balance from today to the end. The first point is today's real balance. */
  projection: DayPoint[]
  lowPath: number[]
  highPath: number[]
  events: ForecastEvent[]
  basis: Basis
  /** Everything expected to be spent from here to the end, apart from the bills listed in `events` (cents). */
  spendingLeft: number
  /** The same spread evenly over the days left. Used for the path and the safe daily amount. */
  spendPerDay: number
  /** Per category, largest expected first. */
  lines: SpendLine[]
  /** End balance under each basis, same bills and what-ifs. */
  ends: Record<Basis, number>
  endBalance: number
  endRange: { low: number; high: number }
  minBalance: number
  minDate: ISODate
  firstNegativeDate: ISODate | null
  /** The most you can spend per day on everyday things and never go below zero. */
  safeDaily: number
  /** Money you could move to savings now and still cover everything expected, with a small cushion. */
  safeToSave: number
  /** If short: how much less per day on everyday spending would avoid it, and whether that is enough on its own. */
  cutPerDay: number | null
  cutIsEnough: boolean
  verdict: Verdict
  /** Fewer than two earlier periods to learn from: the estimate leans on this period and the budget only. */
  limitedHistory: boolean
  risks: CategoryRisk[]
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

export function buildForecast(input: ForecastInput): Forecast | null {
  const { cfg, today, categories, groups } = input
  const whatIf = input.whatIf ?? {}
  const accounts = input.accounts.filter(isSpendingAccount)
  if (!accounts.length) return null
  const ids = new Set(accounts.map((a) => a.id))
  const mine = input.txs.filter((t) => ids.has(t.accountId))

  const cycle = cycleContaining(cfg, today)
  const { start, end } = cycle
  const total = daysBetween(start, end) + 1
  // Start from the last day anything was logged: days after that are unknown, so they are forecast, not assumed empty.
  const asOf = mine.reduce((m, t) => (t.date >= start && t.date <= today && t.date > m ? t.date : m), start)
  const elapsed = Math.min(total, daysBetween(start, asOf) + 1)
  const remaining = total - elapsed

  const kindOf = new Map<string, string>()
  const groupKind = new Map(groups.map((g) => [g.id, g.kind]))
  for (const c of categories) kindOf.set(c.id, groupKind.get(c.groupId) ?? 'expense')
  const transferIds = new Set(categories.filter((c) => kindOf.get(c.id) === 'transfer').map((c) => c.id))
  const catById = new Map(categories.map((c) => [c.id, c]))

  /* what is normal: earlier periods with enough data */
  const first = mine.reduce((m, t) => (t.date < m ? t.date : m), today)
  const priors: Cycle[] = []
  for (let k = 1; k <= HISTORY_PERIODS; k++) {
    const c = shiftCycle(cfg, cycle, -k)
    if (addDays(c.start, PARTIAL_DAYS) < first) break
    priors.push(c)
  }
  const internal = internalTransfers(mine, transferIds)
  const relevant = mine.filter((t) => !internal.has(t.id))
  const items = detectRecurring(relevant, priors)
  const current = relevant.filter((t) => t.date >= start && t.date <= asOf)

  /* which expected payments have already happened this period */
  const paid = new Set<string>()
  const usedTx = new Set<string>()
  for (const item of items) {
    const hit = current.find((t) => !usedTx.has(t.id) && matches(item, t))
    if (hit) { paid.add(item.key); usedTx.add(hit.id) }
  }

  const counted = whatIf.counted ?? {}
  const events: ForecastEvent[] = []
  for (const item of items) {
    if (paid.has(item.key)) continue
    const due = addDays(start, item.offset)
    const late = due <= asOf
    const overdue = late && daysBetween(due, asOf) > LATE_GRACE
    const date = late ? addDays(asOf, 1) : due
    if (date > end) continue
    events.push({
      id: item.key, date, label: item.label, kind: item.direction === 'in' ? 'income' : 'bill', late, overdue,
      amount: item.direction === 'in' ? item.amount : -item.amount, skipped: counted[item.key] === undefined ? overdue : !counted[item.key],
    })
  }
  if (whatIf.oneOff && whatIf.oneOff > 0 && remaining > 0) {
    events.push({ id: 'oneoff', date: addDays(asOf, 1), label: 'One-off expense', amount: -whatIf.oneOff, kind: 'oneoff', late: false, overdue: false, skipped: false })
  }
  events.sort((a, b) => a.date.localeCompare(b.date))
  const active = events.filter((e) => !e.skipped)

  /*
   * Spending still expected, category by category, from three guides:
   *  - habits: this period's pace (purchases so far stretched over the days left, at the median purchase size, only with
   *    three or more purchases so a lone repair or gift is never repeated) blended with what the category usually costs
   *    per period less what is spent; weighted by how much of the period has passed;
   *  - budget: what is left of the budget after what is spent and what is still to be billed;
   *  - cautious: whichever of the two is higher for that category.
   */
  const spend = (t: Transaction) => t.moneyOut - t.moneyIn
  const isHabitual = (t: Transaction) => !t.categoryId || kindOf.get(t.categoryId) === 'expense'
  const bucket = (t: Transaction) => t.categoryId ?? '__none__'
  interface Stat { soFar: number; n: number; amounts: number[]; priorTotals: number[] }
  const stats = new Map<string, Stat>()
  const stat = (id: string): Stat => stats.get(id) ?? stats.set(id, { soFar: 0, n: 0, amounts: [], priorTotals: priors.map(() => 0) }).get(id)!
  for (const t of current) {
    if (!isHabitual(t) || usedTx.has(t.id)) continue
    const st = stat(bucket(t))
    st.soFar += spend(t)
    if (spend(t) > 0) { st.n++; st.amounts.push(spend(t)) }
  }
  priors.forEach((c, i) => {
    for (const t of relevant) {
      if (t.date < c.start || t.date > c.end || !isHabitual(t) || items.some((it) => matches(it, t))) continue
      const st = stat(bucket(t))
      st.priorTotals[i] += spend(t)
      if (spend(t) > 0) st.amounts.push(spend(t))
    }
  })

  const w = elapsed / total
  const habitLeft = new Map<string, number>()
  for (const [id, st] of stats) {
    let left = 0
    if (remaining > 0) {
      const hist = priors.length ? Math.max(0, median(st.priorTotals) - st.soFar) : null
      const pace = st.n >= MIN_PATTERN ? st.n * (remaining / elapsed) * median(st.amounts) : null
      left = pace !== null && hist !== null ? w * pace + (1 - w) * hist : pace ?? hist ?? 0
    }
    habitLeft.set(id, left)
  }

  // Everything spent in a category so far (bills included), and bills still due in it.
  const spentAll = new Map<string, { sum: number; n: number }>()
  for (const t of current) {
    if (t.categoryId && !SPEND_KINDS.has(kindOf.get(t.categoryId) ?? '')) continue
    const e = spentAll.get(bucket(t)) ?? spentAll.set(bucket(t), { sum: 0, n: 0 }).get(bucket(t))!
    e.sum += spend(t)
    if (spend(t) > 0) e.n++
  }
  const itemByKey = new Map(items.map((i) => [i.key, i]))
  // A bill still to come uses up its category's budget whether or not it is counted: leaving it out means it is not happening.
  const billsDue = new Map<string, number>()
  for (const e of events) {
    const item = e.kind === 'bill' ? itemByKey.get(e.id) : undefined
    if (item?.categoryId) billsDue.set(item.categoryId, (billsDue.get(item.categoryId) ?? 0) - e.amount)
  }
  const groupName = new Map(groups.map((g) => [g.id, g.name]))
  const budgetLeft = (id: string): number => {
    const c = catById.get(id)
    if (!c || c.monthlyBudget <= 0 || remaining === 0 || !SPEND_KINDS.has(kindOf.get(id) ?? '')) return 0
    if (KEPT.test(c.name) || KEPT.test(groupName.get(c.groupId) ?? '')) return 0
    return Math.max(0, c.monthlyBudget - (spentAll.get(id)?.sum ?? 0) - (billsDue.get(id) ?? 0))
  }

  const off = new Set(whatIf.everydayOff ?? [])
  const basis: Basis = whatIf.basis ?? 'cautious'
  const pick = (b: Basis, habit: number, plan: number) => (b === 'habits' ? habit : b === 'budget' ? plan : Math.max(habit, plan))
  const lineIds = new Set<string>([...spentAll.keys(), ...habitLeft.keys()])
  for (const c of categories) if (SPEND_KINDS.has(kindOf.get(c.id) ?? '') && c.monthlyBudget > 0) lineIds.add(c.id)
  const lines: SpendLine[] = [...lineIds].map((id) => {
    const c = catById.get(id)
    const habit = habitLeft.get(id) ?? 0
    const plan = budgetLeft(id)
    return {
      categoryId: id === '__none__' ? null : id, name: id === '__none__' ? 'Uncategorised' : c?.name ?? 'Other',
      kind: (id === '__none__' ? 'expense' : kindOf.get(id)) as SpendLine['kind'],
      budget: c?.monthlyBudget ?? 0, spent: Math.round(spentAll.get(id)?.sum ?? 0), count: spentAll.get(id)?.n ?? 0,
      habit: Math.round(habit), budgetLeft: Math.round(plan), kept: !!c && (KEPT.test(c.name) || KEPT.test(groupName.get(c.groupId) ?? '')), wouldBe: Math.round(pick(basis, habit, plan)), expected: Math.round(off.has(id) ? 0 : pick(basis, habit, plan)), off: off.has(id),
    }
  }).filter((l) => l.habit > 0 || l.budgetLeft > 0 || l.spent !== 0 || l.budget > 0)
    .sort((a, b) => b.wouldBe - a.wouldBe || b.spent - a.spent)
  const totalFor = (b: Basis) => sum(lines.filter((l) => !l.off).map((l) => pick(b, l.habit, l.budgetLeft)))
  const mult = whatIf.spendMultiplier ?? 1
  const perDay = (total: number) => (remaining > 0 ? total / remaining : 0)
  const baseDaily = perDay(totalFor(basis))
  const spendPerDay = baseDaily * mult

  /* balance so far */
  const netOn = new Map<string, number>()
  let opening = sum(accounts.map((a) => a.openingBalance))
  for (const t of mine) {
    if (t.date < start) opening += t.moneyIn - t.moneyOut
    else if (t.date <= asOf) netOn.set(t.date, (netOn.get(t.date) ?? 0) + t.moneyIn - t.moneyOut)
  }
  const history: DayPoint[] = []
  let bal = opening
  for (let i = 0; i < elapsed; i++) {
    const d = addDays(start, i)
    bal += netOn.get(d) ?? 0
    history.push({ date: d, balance: bal })
  }
  const balanceNow = bal

  /* balance from here to the end, plus a likely range */
  const path = (dailySpend: number): number[] => {
    const out = [balanceNow]
    let b = balanceNow
    for (let i = 1; i <= remaining; i++) {
      const d = addDays(asOf, i)
      b += -dailySpend + sum(active.filter((e) => e.date === d).map((e) => e.amount))
      out.push(Math.round(b))
    }
    return out
  }
  const mid = path(spendPerDay)
  const lowPath = path(baseDaily * (mult * (1 + SCENARIO)))
  const highPath = path(baseDaily * (mult * (1 - SCENARIO)))
  const projection = mid.map((balance, i) => ({ date: addDays(asOf, i), balance }))

  const minBalance = Math.min(...mid)
  const minIdx = mid.indexOf(minBalance)
  const firstNeg = projection.find((p) => p.balance < 0)
  const buffer = Math.round(spendPerDay * BUFFER_DAYS)

  let cum = 0
  let safeDaily = Infinity
  for (let i = 1; i <= remaining; i++) {
    cum += sum(active.filter((e) => e.date === addDays(asOf, i)).map((e) => e.amount))
    safeDaily = Math.min(safeDaily, (balanceNow + cum) / i)
  }
  if (!Number.isFinite(safeDaily)) safeDaily = 0

  const verdict: Verdict = minBalance < 0 ? 'short' : minBalance < buffer || Math.min(...lowPath) < 0 ? 'tight' : 'ok'
  const shortfall = Math.max(0, -minBalance)
  const cutPerDay = verdict === 'short' && minIdx > 0 ? Math.ceil(shortfall / minIdx) : null

  /* categories on course to overspend their budget */
  const risks: CategoryRisk[] = []
  for (const l of lines) {
    if (l.kind !== 'expense' || l.budget <= 0 || l.categoryId === null) continue
    const projected = Math.round(l.spent + (billsDue.get(l.categoryId) ?? 0) + l.expected * mult)
    if (projected > l.budget * 1.05) risks.push({ categoryId: l.categoryId, name: l.name, projected, budget: l.budget, over: projected - l.budget })
  }
  risks.sort((x, y) => y.over - x.over)

  const endFor = (b: Basis) => (remaining > 0 ? path(perDay(totalFor(b)) * mult)[remaining] : balanceNow)

  return {
    start, end, asOf, today, staleDays: daysBetween(asOf, today), elapsed, total, remaining, balanceNow, history, projection, lowPath, highPath, events,
    basis, spendingLeft: Math.round(spendPerDay * remaining), spendPerDay: Math.round(spendPerDay), lines,
    ends: { cautious: endFor('cautious'), budget: endFor('budget'), habits: endFor('habits') },
    endBalance: mid[mid.length - 1], endRange: { low: lowPath[lowPath.length - 1], high: highPath[highPath.length - 1] },
    minBalance, minDate: projection[minIdx].date, firstNegativeDate: firstNeg?.date ?? null,
    safeDaily: Math.max(0, Math.floor(safeDaily)), safeToSave: Math.max(0, minBalance - buffer),
    cutPerDay, cutIsEnough: cutPerDay !== null && cutPerDay <= spendPerDay,
    verdict, limitedHistory: priors.length < 2, risks: risks.slice(0, 5),
  }
}
