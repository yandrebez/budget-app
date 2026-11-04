import type { Account, Category, Group, GroupKind, Transaction } from '@/types'
import { cycleForMonth, shiftCycle, type Cycle, type CycleConfig } from '@/domain/cycles/cycle'

export type Metric = 'spending' | 'income' | 'saved' | 'left'
export type Split = 'none' | 'group' | 'category' | 'account'

/** What a transaction counts as in statistics. Transfers between your own accounts are excluded. */
type Bucket = 'income' | 'spending' | 'saved'

export interface Classified {
  bucket: Bucket
  amount: number
  groupId: string
  categoryId: string
  accountId: string
}

export const UNCATEGORISED = '__uncategorised__'

const BUCKET_OF: Record<GroupKind, Bucket | null> = { income: 'income', expense: 'spending', debt: 'spending', savings: 'saved', transfer: null }

export function classify(t: Transaction, cats: Map<string, Category>, groups: Map<string, Group>): Classified | null {
  const cat = t.categoryId ? cats.get(t.categoryId) : undefined
  const group = cat ? groups.get(cat.groupId) : undefined
  if (!cat || !group) {
    // Uncategorised money counts so totals are honest; direction decides the bucket.
    return t.moneyIn > t.moneyOut
      ? { bucket: 'income', amount: t.moneyIn - t.moneyOut, groupId: UNCATEGORISED, categoryId: UNCATEGORISED, accountId: t.accountId }
      : { bucket: 'spending', amount: t.moneyOut - t.moneyIn, groupId: UNCATEGORISED, categoryId: UNCATEGORISED, accountId: t.accountId }
  }
  const bucket = BUCKET_OF[group.kind]
  if (!bucket) return null
  return { bucket, amount: bucket === 'income' ? t.moneyIn - t.moneyOut : t.moneyOut - t.moneyIn, groupId: group.id, categoryId: cat.id, accountId: t.accountId }
}

export interface StatsInput {
  txs: Transaction[]
  categories: Category[]
  groups: Group[]
  accounts: Account[]
  /** Restrict to these accounts / categories. Empty = all. */
  accountIds?: string[]
  categoryIds?: string[]
}

export interface PeriodStats {
  cycle: Cycle
  income: number
  spending: number
  saved: number
  /** income − spending − saved. */
  left: number
  /** Totals for the chosen metric, per split key. */
  rows: Classified[]
}

/** Stats for `count` consecutive periods ending at `last`, oldest first. */
export function periodStats(cfg: CycleConfig, last: Cycle, count: number, input: StatsInput): PeriodStats[] {
  const cats = new Map(input.categories.map((c) => [c.id, c]))
  const groups = new Map(input.groups.map((g) => [g.id, g]))
  const accSet = input.accountIds?.length ? new Set(input.accountIds) : null
  const catSet = input.categoryIds?.length ? new Set(input.categoryIds) : null
  const cycles = Array.from({ length: count }, (_, i) => shiftCycle(cfg, last, i - (count - 1)))
  const first = cycles[0].start, end = cycles[count - 1].end
  const result: PeriodStats[] = cycles.map((cycle) => ({ cycle, income: 0, spending: 0, saved: 0, left: 0, rows: [] }))

  for (const t of input.txs) {
    if (t.date < first || t.date > end) continue
    if (accSet && !accSet.has(t.accountId)) continue
    if (catSet && !catSet.has(t.categoryId ?? UNCATEGORISED)) continue
    const c = classify(t, cats, groups)
    if (!c) continue
    const p = result.find((r) => t.date >= r.cycle.start && t.date <= r.cycle.end)
    if (!p) continue
    p[c.bucket] += c.amount
    p.rows.push(c)
  }
  for (const p of result) p.left = p.income - p.spending - p.saved
  return result
}

export const metricOf = (p: PeriodStats, m: Metric): number => p[m]

export interface Slice { key: string; label: string; value: number }

/** Totals per split key for one metric across the given periods, largest first. Negative totals are kept (refunds). */
export function breakdown(periods: PeriodStats[], metric: Exclude<Metric, 'left'>, split: Exclude<Split, 'none'>, label: (key: string) => string): Slice[] {
  const totals = new Map<string, number>()
  for (const p of periods) {
    for (const r of p.rows) {
      if (r.bucket !== metric) continue
      const key = split === 'group' ? r.groupId : split === 'category' ? r.categoryId : r.accountId
      totals.set(key, (totals.get(key) ?? 0) + r.amount)
    }
  }
  return [...totals].map(([key, value]) => ({ key, label: label(key), value })).filter((s) => s.value !== 0).sort((a, b) => b.value - a.value)
}

/** Per-period values for each split key (for stacked columns and multi-line). */
export function seriesByPeriod(periods: PeriodStats[], metric: Exclude<Metric, 'left'>, split: Exclude<Split, 'none'>, keys: string[]): Map<string, number[]> {
  const out = new Map(keys.map((k) => [k, periods.map(() => 0)]))
  periods.forEach((p, i) => {
    for (const r of p.rows) {
      if (r.bucket !== metric) continue
      const key = split === 'group' ? r.groupId : split === 'category' ? r.categoryId : r.accountId
      const arr = out.get(key)
      if (arr) arr[i] += r.amount
    }
  })
  return out
}

/** Keep the largest `max` slices and fold the rest into one "Other". */
export function foldTail(slices: Slice[], max: number, otherLabel = 'Other'): Slice[] {
  if (slices.length <= max) return slices
  const head = slices.slice(0, max - 1)
  const rest = slices.slice(max - 1)
  return [...head, { key: '__other__', label: otherLabel, value: rest.reduce((s, x) => s + x.value, 0) }]
}

export const currentCycleOf = (cfg: CycleConfig, y: number, m: number) => cycleForMonth(cfg, y, m)

/** All-time totals per split key for one metric, largest first. Used to give each entity a stable colour. */
export function entityOrder(input: Pick<StatsInput, 'txs' | 'categories' | 'groups'>, metric: Exclude<Metric, 'left'>, split: Exclude<Split, 'none'>): string[] {
  const cats = new Map(input.categories.map((c) => [c.id, c]))
  const groups = new Map(input.groups.map((g) => [g.id, g]))
  const totals = new Map<string, number>()
  for (const t of input.txs) {
    const c = classify(t, cats, groups)
    if (!c || c.bucket !== metric) continue
    const key = split === 'group' ? c.groupId : split === 'category' ? c.categoryId : c.accountId
    totals.set(key, (totals.get(key) ?? 0) + c.amount)
  }
  return [...totals].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

/**
 * Colour slots (0-6) per displayed key. An entity keeps its slot from its all-time rank, so filters
 * never repaint the survivors; entities beyond the first seven take whichever slots are free.
 */
export function assignSlots(displayed: string[], allTimeOrder: string[], slots = 7): Map<string, number> {
  const out = new Map<string, number>()
  const used = new Set<number>()
  for (const k of displayed) {
    const rank = allTimeOrder.indexOf(k)
    if (rank >= 0 && rank < slots) { out.set(k, rank); used.add(rank) }
  }
  for (const k of displayed) {
    if (out.has(k)) continue
    let s = 0
    while (used.has(s) && s < slots) s++
    if (s < slots) { out.set(k, s); used.add(s) }
  }
  return out
}
