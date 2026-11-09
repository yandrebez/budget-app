import type { Transaction } from '@/types'
import { daysBetween } from '@/lib/dates'
import { normalise, patternFor } from '@/domain/transactions/categorise'
import type { Cycle } from '@/domain/cycles/cycle'

/** A payment (or pay) that repeats about once a period at a similar amount. */
export interface RecurringItem {
  key: string
  direction: 'in' | 'out'
  /** Bills are recognised by their category; only uncategorised ones fall back on the wording. */
  categoryId: string | null
  pattern: string | null
  /** A real description from the most recent period it appeared in, for display. */
  label: string
  /** Typical amount in cents (the median). */
  amount: number
  /** Typical day, counted from the start of the period. */
  offset: number
  /** How many earlier periods it showed up in. */
  periods: number
}

/** Amounts within this share of the typical amount count as "the same payment". */
const TOLERANCE = 0.1
/** Amounts in one cluster differ by at most this much from the smallest. */
const CLUSTER_SPREAD = 1.12
/** Payments smaller than this (cents) are noise, not bills. */
const MIN_AMOUNT = 500

export interface Flow { direction: 'in' | 'out'; amount: number }

/** What a transaction did to the balance: net of money in and out. Zero-net rows have no flow. */
export function flowOf(t: Transaction): Flow | null {
  const net = t.moneyIn - t.moneyOut
  if (net === 0) return null
  return { direction: net < 0 ? 'out' : 'in', amount: Math.abs(net) }
}

const patternOf = (t: Transaction) => patternFor(t.description) || normalise(t.description) || 'unnamed'

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

export const closeEnough = (amount: number, typical: number): boolean => Math.abs(amount - typical) <= typical * TOLERANCE

/** Does this transaction look like that recurring payment? Same category (or wording, if uncategorised) and a similar amount. */
export function matches(item: RecurringItem, t: Transaction): boolean {
  const f = flowOf(t)
  if (!f || f.direction !== item.direction || !closeEnough(f.amount, item.amount)) return false
  return item.categoryId ? t.categoryId === item.categoryId : !t.categoryId && patternOf(t) === item.pattern
}

/**
 * Money that moves between two of your own (spending) accounts on the same day nets to nothing, so it is neither
 * a bill nor spending. Finds both legs of such transfers.
 */
export function internalTransfers(txs: Transaction[], transferCategoryIds: Set<string>): Set<string> {
  const outs = new Map<string, Transaction[]>()
  for (const t of txs) {
    if (!t.categoryId || !transferCategoryIds.has(t.categoryId) || t.moneyOut <= t.moneyIn) continue
    const k = `${t.date}|${t.moneyOut - t.moneyIn}`
    ;(outs.get(k) ?? outs.set(k, []).get(k)!).push(t)
  }
  const ids = new Set<string>()
  for (const t of txs) {
    if (!t.categoryId || !transferCategoryIds.has(t.categoryId) || t.moneyIn <= t.moneyOut) continue
    const pool = outs.get(`${t.date}|${t.moneyIn - t.moneyOut}`)
    const leg = pool?.find((o) => o.accountId !== t.accountId && !ids.has(o.id))
    if (leg) { ids.add(leg.id); ids.add(t.id) }
  }
  return ids
}

interface Row { period: number; amount: number; offset: number; label: string }

/** Splits amounts into groups of similar size (a R1 832 bill and a R22 co-payment in one category are different things). */
function clusters(rows: Row[]): Row[][] {
  const out: Row[][] = []
  for (const r of [...rows].sort((a, b) => a.amount - b.amount)) {
    const cur = out[out.length - 1]
    if (cur && r.amount <= cur[0].amount * CLUSTER_SPREAD) cur.push(r)
    else out.push([r])
  }
  return out
}

/**
 * Finds payments that repeat: seen in at least two earlier periods (and about half of them), exactly once per
 * period, at a similar amount, in the same category. Habits (several a period) and bills that vary a lot are left out.
 */
export function detectRecurring(txs: Transaction[], priors: Cycle[]): RecurringItem[] {
  if (priors.length < 2) return []
  const groups = new Map<string, { direction: 'in' | 'out'; categoryId: string | null; pattern: string | null; rows: Row[] }>()
  priors.forEach((c, period) => {
    for (const t of txs) {
      if (t.date < c.start || t.date > c.end) continue
      const f = flowOf(t)
      if (!f) continue
      const pattern = t.categoryId ? null : patternOf(t)
      const key = `${f.direction}|${t.categoryId ? `c:${t.categoryId}` : `p:${pattern}`}`
      const g = groups.get(key) ?? groups.set(key, { direction: f.direction, categoryId: t.categoryId, pattern, rows: [] }).get(key)!
      g.rows.push({ period, amount: f.amount, offset: daysBetween(c.start, t.date), label: t.description || 'Payment' })
    }
  })
  const out: RecurringItem[] = []
  for (const [groupKey, g] of groups) {
    for (const rows of clusters(g.rows)) {
      const periods = new Set(rows.map((r) => r.period))
      if (periods.size < 2 || periods.size < Math.ceil(priors.length / 2)) continue
      if (periods.size !== rows.length) continue // more than one in a period: a habit, not a bill
      const typical = median(rows.map((r) => r.amount))
      if (typical < MIN_AMOUNT) continue
      if (!rows.every((r) => closeEnough(r.amount, typical))) continue
      const latest = rows.reduce((a, b) => (b.period < a.period ? b : a))
      out.push({
        key: `${groupKey}|${typical}`, direction: g.direction, categoryId: g.categoryId, pattern: g.pattern, label: latest.label,
        amount: typical, offset: median(rows.map((r) => r.offset)), periods: periods.size,
      })
    }
  }
  return out.sort((a, b) => a.offset - b.offset)
}
