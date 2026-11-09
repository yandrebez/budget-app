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
/** A bill this many days past its usual day, and still not seen, is probably not coming this period. */
const LATE_GRACE = 7

export interface WhatIf {
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
  everydayPerDay: number
  everydayRemaining: number
  /** What the everyday estimate is made of, largest first (per day, cents). */
  everyday: { categoryId: string | null; name: string; perDay: number; wouldBe: number; soFar: number; count: number; off: boolean; repeats: boolean }[]
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
   * Everyday spending, category by category. Two views are blended, weighted by how much of the period has passed:
   *  - this period's pace: purchases so far, stretched over the days left, at the median purchase size (only with
   *    three or more purchases, so a lone repair or gift is never extrapolated);
   *  - what the category usually costs per period, less what is already spent (the stable guide for things bought once or twice a month).
   */
  const isEveryday = (t: Transaction) => !t.categoryId || kindOf.get(t.categoryId) === 'expense'
  const bucket = (t: Transaction) => t.categoryId ?? '__none__'
  const spend = (t: Transaction) => t.moneyOut - t.moneyIn
  interface Stat { soFar: number; n: number; amounts: number[]; priorTotals: number[] }
  const stats = new Map<string, Stat>()
  const stat = (id: string): Stat => stats.get(id) ?? stats.set(id, { soFar: 0, n: 0, amounts: [], priorTotals: priors.map(() => 0) }).get(id)!
  for (const t of current) {
    if (!isEveryday(t) || usedTx.has(t.id)) continue
    const st = stat(bucket(t))
    st.soFar += spend(t)
    if (spend(t) > 0) { st.n++; st.amounts.push(spend(t)) }
  }
  priors.forEach((c, i) => {
    for (const t of relevant) {
      if (t.date < c.start || t.date > c.end || !isEveryday(t) || items.some((it) => matches(it, t))) continue
      const st = stat(bucket(t))
      st.priorTotals[i] += spend(t)
      if (spend(t) > 0) st.amounts.push(spend(t))
    }
  })
  for (const c of categories) if (kindOf.get(c.id) === 'expense' && c.monthlyBudget > 0) stat(c.id)

  // The more of the period has passed, the more this period's own pace counts.
  const w = elapsed / total
  const wouldSpend = new Map<string, number>()
  for (const [id, st] of stats) {
    const budget = catById.get(id)?.monthlyBudget ?? 0
    let left = 0
    if (remaining > 0) {
      if (priors.length === 0 && st.n < MIN_PATTERN) {
        // No history and too few purchases to see a pattern: let the budget guide, if there is one.
        left = Math.max(0, budget - st.soFar) * (remaining / total)
      } else {
        const hist = priors.length ? Math.max(0, median(st.priorTotals) - st.soFar) : null
        const pace = st.n >= MIN_PATTERN ? st.n * (remaining / elapsed) * median(st.amounts) : null
        left = pace !== null && hist !== null ? w * pace + (1 - w) * hist : pace ?? hist ?? 0
      }
    }
    wouldSpend.set(id, left)
  }
  const off = new Set(whatIf.everydayOff ?? [])
  const countedSpend = (id: string) => (off.has(id) ? 0 : wouldSpend.get(id) ?? 0)
  const mult = whatIf.spendMultiplier ?? 1
  const baseDaily = remaining > 0 ? sum([...wouldSpend.keys()].map(countedSpend)) / remaining : 0
  const everydayPerDay = baseDaily * mult

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
  const mid = path(everydayPerDay)
  const lowPath = path(baseDaily * (mult * (1 + SCENARIO)))
  const highPath = path(baseDaily * (mult * (1 - SCENARIO)))
  const projection = mid.map((balance, i) => ({ date: addDays(asOf, i), balance }))

  const minBalance = Math.min(...mid)
  const minIdx = mid.indexOf(minBalance)
  const firstNeg = projection.find((p) => p.balance < 0)
  const buffer = Math.round(everydayPerDay * BUFFER_DAYS)

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
  for (const c of categories) {
    if (kindOf.get(c.id) !== 'expense' || c.monthlyBudget <= 0) continue
    const spentAll = sum(current.filter((t) => t.categoryId === c.id).map(spend))
    const pending = sum(active.filter((e) => e.kind === 'bill' && items.some((i) => i.key === e.id && i.categoryId === c.id)).map((e) => -e.amount))
    const projected = Math.round(spentAll + pending + countedSpend(c.id) * mult)
    if (projected > c.monthlyBudget * 1.05) risks.push({ categoryId: c.id, name: c.name, projected, budget: c.monthlyBudget, over: projected - c.monthlyBudget })
  }
  risks.sort((a, b) => b.over - a.over)

  const perDayOf = (spendLeft: number) => (remaining > 0 ? (spendLeft / remaining) * mult : 0)
  const everyday = [...stats].map(([id, st]) => ({
    categoryId: id === '__none__' ? null : id, name: id === '__none__' ? 'Uncategorised' : catById.get(id)?.name ?? 'Other',
    perDay: Math.round(perDayOf(countedSpend(id))), wouldBe: Math.round(perDayOf(wouldSpend.get(id) ?? 0)),
    soFar: Math.round(st.soFar), count: st.n, off: off.has(id), repeats: (wouldSpend.get(id) ?? 0) > 0,
  })).filter((e) => e.wouldBe > 0 || e.soFar > 0).sort((a, b) => b.wouldBe - a.wouldBe || b.soFar - a.soFar)

  return {
    start, end, asOf, today, staleDays: daysBetween(asOf, today), elapsed, total, remaining, balanceNow, history, projection, lowPath, highPath, events,
    everydayPerDay: Math.round(everydayPerDay), everydayRemaining: Math.round(everydayPerDay * remaining), everyday,
    endBalance: mid[mid.length - 1], endRange: { low: lowPath[lowPath.length - 1], high: highPath[highPath.length - 1] },
    minBalance, minDate: projection[minIdx].date, firstNegativeDate: firstNeg?.date ?? null,
    safeDaily: Math.max(0, Math.floor(safeDaily)), safeToSave: Math.max(0, minBalance - buffer),
    cutPerDay, cutIsEnough: cutPerDay !== null && cutPerDay <= everydayPerDay,
    verdict, limitedHistory: priors.length < 2, risks: risks.slice(0, 5),
  }
}

