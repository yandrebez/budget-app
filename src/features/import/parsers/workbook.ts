import type { AccountKind, GroupKind, ISODate, WeekendRule } from '@/types'
import { daysBetween } from '@/lib/dates'
import { asCents, asDate, text, type Cell, type Sheet } from './sheet'
import { isTotalText } from './scan'
import { allRows, detectTables, isDateCol, norm, profiles, ROLE_FIELDS, ROLE_LABEL, type Detection, type TableGroup } from './classify'

export type { Cell, Sheet }

export interface PlanGroup { name: string; kind: GroupKind }
export interface PlanCategory { name: string; group: string; monthlyBudget: number; notes?: string }
export interface PlanTx { date: ISODate; account: string; category: string | null; description: string; moneyIn: number; moneyOut: number }
export interface PlanDebt { name: string; balance: number; interestRate: number; category: string | null }
export interface PlanPot { name: string; balance: number; target: number; category: string | null }
/** `openingBalance` null = the file says nothing about it, so the app's value is left alone. */
export interface PlanAccount { name: string; kind: AccountKind; openingBalance: number | null; openingSource?: 'balance column' | 'accounts table' }

export interface WorkbookPlan {
  settings: { payDay: number; weekendRule: WeekendRule; holidays: ISODate[] } | null
  groups: PlanGroup[]
  categories: PlanCategory[]
  accounts: PlanAccount[]
  /** A single running balance across all accounts (or an "Opening balance" cell): the person picks its account. 0 if none. */
  openingBalance: number
  transactions: PlanTx[]
  debts: PlanDebt[]
  pots: PlanPot[]
  warnings: string[]
}

const key = (s: string) => s.trim().toLowerCase()
const money = (c: Cell): number => asCents(c) ?? 0
const titleOf = (g: TableGroup) => (g.sheets.length > 1 ? `${g.sheets[0]} and ${g.sheets.length - 1} more sheet${g.sheets.length > 2 ? 's' : ''}` : g.sheets[0])

export function kindForGroup(name: string): GroupKind {
  const n = key(name)
  if (/income|salary|revenue|earn/.test(n)) return 'income'
  if (/debt|loan|credit card/.test(n)) return 'debt'
  if (/saving|invest/.test(n)) return 'savings'
  if (/transfer/.test(n)) return 'transfer'
  return 'expense'
}

export function kindForAccount(type: string, name: string): AccountKind {
  const t = `${type} ${type ? '' : name}`.toLowerCase()
  if (/saving|goal|fixed.?term|call|notice|deposit|invest|tfsa|money market|emergency|fund/.test(t)) return 'savings'
  if (/credit|card|overdraft/.test(t)) return 'card'
  if (/cash|wallet/.test(t)) return 'cash'
  return 'account'
}

/** "Dream Life (Inv Account)" and "Dream Life (Inv)" are the same account. */
const accountKey = (name: string) => norm(name).replace(/\b(account|acc)\b/g, '').replace(/\s+/g, ' ').trim()

/* ------------------------------------------------------------ transactions */

interface RawTx extends PlanTx { balance: number | null; order: number }

function missingRequired(g: TableGroup): string[] {
  if (g.role === 'ignore') return []
  const m = g.mapping
  const need = ROLE_FIELDS[g.role].filter((f) => f.required && m[f.key] === undefined).map((f) => f.label.toLowerCase())
  if (g.role === 'transactions' && m.moneyIn === undefined && m.moneyOut === undefined && m.amount === undefined) need.push('an amount (money in / money out, or amount)')
  return need
}

export function extractTransactions(g: TableGroup): { rows: RawTx[]; skipped: number } {
  const m = g.mapping
  const rows: RawTx[] = []
  let skipped = 0
  let order = 0
  for (const t of g.tables) {
    for (const r of t.rows) {
      order++
      if (r.every((c) => c == null || text(c) === '')) continue
      const date = m.date === undefined ? null : asDate(r[m.date])
      let moneyIn = 0, moneyOut = 0
      if (m.moneyIn !== undefined || m.moneyOut !== undefined) {
        // Follow the sheet's own arithmetic (in minus out): a negative "out" is a refund, a negative "in" a reversal.
        const i = m.moneyIn !== undefined ? money(r[m.moneyIn]) : 0, o = m.moneyOut !== undefined ? money(r[m.moneyOut]) : 0
        moneyIn = Math.max(0, i) + Math.max(0, -o)
        moneyOut = Math.max(0, o) + Math.max(0, -i)
      } else if (m.amount !== undefined) {
        const a = money(r[m.amount])
        if (a >= 0) moneyIn = a; else moneyOut = -a
      }
      // Banks list fees separately from the payment; they leave the account too.
      if (m.fee !== undefined) moneyOut += Math.max(0, money(r[m.fee]))
      if (!date || (moneyIn === 0 && moneyOut === 0)) { skipped++; continue }
      rows.push({
        date, order,
        account: (m.account !== undefined && text(r[m.account])) || 'Imported',
        category: (m.category !== undefined && text(r[m.category])) || null,
        description: m.description !== undefined ? text(r[m.description]) : '',
        moneyIn, moneyOut,
        balance: m.balance !== undefined ? asCents(r[m.balance]) : null,
      })
    }
  }
  return { rows, skipped }
}

/**
 * A running-balance column pins down the balance before the first row. It is trusted only if it adds up
 * with the money in/out: per account, or as one running total across all accounts.
 */
function deriveOpenings(rows: RawTx[]): { perAccount: Map<string, number>; global: number | null; checked: boolean } {
  const withBal = rows.filter((r) => r.balance !== null)
  const result = { perAccount: new Map<string, number>(), global: null as number | null, checked: withBal.length > 0 }
  if (!withBal.length) return result
  const net = (r: RawTx) => r.moneyIn - r.moneyOut
  const consistency = (seq: RawTx[]) => {
    if (seq.length < 2) return 1
    let ok = 0
    for (let i = 1; i < seq.length; i++) if (Math.abs((seq[i].balance as number) - (seq[i - 1].balance as number) - net(seq[i])) <= 1) ok++
    return ok / (seq.length - 1)
  }
  const byAcc = new Map<string, RawTx[]>()
  for (const r of withBal) (byAcc.get(accountKey(r.account)) ?? byAcc.set(accountKey(r.account), []).get(accountKey(r.account))!).push(r)
  // Each account's own balance column is trusted only if it adds up with its money in/out.
  for (const [k, seq] of byAcc) if (seq.length >= 2 && consistency(seq) >= 0.9) result.perAccount.set(k, (seq[0].balance as number) - net(seq[0]))
  if (result.perAccount.size > 0) {
    // Once balances are shown to be per account, an account with a single row can be read the same way.
    for (const [k, seq] of byAcc) if (seq.length === 1) result.perAccount.set(k, (seq[0].balance as number) - net(seq[0]))
    return result
  }
  // Otherwise the column may be one running total across every account (a ledger kept in a single list).
  if (withBal.length >= 2 && consistency(withBal) >= 0.9) result.global = (withBal[0].balance as number) - net(withBal[0])
  return result
}

/* ---------------------------------------------------------------- pay cycle */

export function inferCycle(g: TableGroup): { payDay: number; weekendRule: WeekendRule } | null {
  const rows = allRows(g)
  const p = profiles(g.headers, rows)
  const cols = p.map((x, i) => (isDateCol(x) ? i : -1)).filter((i) => i >= 0)
  if (!cols.length) return null
  const dates = cols.map((c) => rows.map((r) => asDate(r[c])))
  const modal = dates.map((col) => {
    const counts = new Map<number, number>()
    let n = 0
    for (const d of col) if (d) { const day = Number(d.slice(8)); counts.set(day, (counts.get(day) ?? 0) + 1); n++ }
    const [day, cnt] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [0, 0]
    return { day, share: n ? cnt / n : 0 }
  })
  let nominal = 0
  modal.forEach((m, i) => { if (m.share > modal[nominal].share + 1e-9) nominal = i })
  if (modal[nominal].share < 0.6 || !modal[nominal].day) return null
  let weekendRule: WeekendRule = 'none'
  dates.forEach((col, i) => {
    if (i === nominal || weekendRule !== 'none') return
    let equal = 0, early = 0, late = 0
    col.forEach((d, r) => {
      const nom = dates[nominal][r]
      if (!d || !nom) return
      const diff = daysBetween(nom, d)
      if (diff === 0) equal++; else if (diff < 0 && diff >= -4) early++; else if (diff > 0 && diff <= 4) late++
    })
    // A real "move to a working day" column matches the nominal day most rows and differs only now and then.
    if (equal >= 1 && early + late >= 1 && (early === 0 || late === 0)) weekendRule = early ? 'before' : 'after'
  })
  return { payDay: modal[nominal].day, weekendRule }
}

/* --------------------------------------------------------------- the plan */

export function buildPlan(d: Detection): WorkbookPlan {
  const plan: WorkbookPlan = { settings: null, groups: [], categories: [], accounts: [], openingBalance: 0, transactions: [], debts: [], pots: [], warnings: [] }
  const live: TableGroup[] = []
  for (const g of d.groups) {
    if (!g.enabled || g.role === 'ignore') continue
    const missing = missingRequired(g)
    if (missing.length) { plan.warnings.push(`"${titleOf(g)}" (${ROLE_LABEL[g.role].toLowerCase()}) was left out: it needs ${missing.join(' and ')}.`); continue }
    live.push(g)
  }
  const of = (role: TableGroup['role']) => live.filter((g) => g.role === role)

  /* categories: budget amounts first, then the category list, then anything only seen in transactions */
  const cats = new Map<string, PlanCategory & { declared: boolean }>()
  const groupNames = new Map<string, string>()
  const addGroup = (name: string) => {
    if (!groupNames.has(key(name))) { groupNames.set(key(name), name); plan.groups.push({ name, kind: kindForGroup(name) }) }
    return groupNames.get(key(name))!
  }
  const pending: { name: string; budget: number; group: string | null; notes: string }[] = []
  for (const g of of('budget')) {
    const m = g.mapping
    for (const r of allRows(g)) {
      const name = text(r[m.category as number])
      if (!name || isTotalText(name)) continue
      const hasAmount = asCents(r[m.budget as number]) !== null
      const group = m.group !== undefined ? text(r[m.group]) : ''
      if (!hasAmount && !group) continue
      pending.push({ name, budget: Math.max(0, money(r[m.budget as number])), group: group || null, notes: '' })
    }
  }
  const listed: { name: string; group: string; notes: string }[] = []
  for (const g of of('categories')) {
    const m = g.mapping
    for (const r of allRows(g)) {
      const name = text(r[m.category as number]), group = text(r[m.group as number])
      if (name && group) listed.push({ name, group, notes: m.notes !== undefined ? text(r[m.notes]) : '' })
    }
  }
  const listedGroup = new Map(listed.map((l) => [key(l.name), l]))
  for (const b of pending) {
    if (cats.has(key(b.name))) continue
    const l = listedGroup.get(key(b.name))
    const group = b.group ?? l?.group
    if (!group) continue
    cats.set(key(b.name), { name: b.name, group: addGroup(group), monthlyBudget: b.budget, declared: true, ...(l?.notes ? { notes: l.notes } : {}) })
  }
  for (const l of listed) {
    const existing = cats.get(key(l.name))
    if (existing) { if (l.notes && !existing.notes) existing.notes = l.notes; continue }
    cats.set(key(l.name), { name: l.name, group: addGroup(l.group), monthlyBudget: 0, declared: true, ...(l.notes ? { notes: l.notes } : {}) })
  }
  // Budget rows that came with no group anywhere are placed after we see how the money moves.
  const ungrouped = pending.filter((b) => !cats.has(key(b.name)))

  /* transactions */
  const raw: RawTx[] = []
  for (const g of of('transactions')) {
    const { rows, skipped } = extractTransactions(g)
    raw.push(...rows)
    if (skipped) plan.warnings.push(`${skipped} transaction row(s) had no readable date or amount and were skipped.`)
  }
  plan.transactions = raw.map(({ date, account, category, description, moneyIn, moneyOut }) => ({ date, account, category, description, moneyIn, moneyOut }))

  const flow = new Map<string, { inn: number; out: number }>()
  for (const t of raw) if (t.category) { const f = flow.get(key(t.category)) ?? { inn: 0, out: 0 }; if (t.moneyIn > t.moneyOut) f.inn++; else f.out++; flow.set(key(t.category), f) }
  const inferGroup = (name: string, declared: boolean): { group: string; guessed: boolean } => {
    if (/transfer/i.test(name)) return { group: 'Transfers', guessed: true }
    const f = flow.get(key(name))
    if (f && f.inn > 0 && f.out === 0) return { group: 'Income', guessed: true }
    return declared ? { group: 'Expenses', guessed: true } : { group: 'Imported', guessed: false }
  }
  for (const b of ungrouped) {
    if (cats.has(key(b.name))) continue
    cats.set(key(b.name), { name: b.name, group: addGroup(inferGroup(b.name, true).group), monthlyBudget: b.budget, declared: true })
  }
  for (const t of plan.transactions) {
    if (t.category && !cats.has(key(t.category))) {
      const { group, guessed } = inferGroup(t.category, false)
      cats.set(key(t.category), { name: t.category, group: addGroup(group), monthlyBudget: 0, declared: false })
      if (!guessed) plan.warnings.push(`Category "${t.category}" was only found in transactions; it was added under "Imported".`)
    }
  }
  plan.categories = [...cats.values()].map(({ declared: _d, ...c }) => c)

  /* accounts: the account list, then any name only seen in transactions */
  const net = new Map<string, number>()
  for (const t of plan.transactions) net.set(accountKey(t.account), (net.get(accountKey(t.account)) ?? 0) + t.moneyIn - t.moneyOut)
  const { perAccount, global, checked } = deriveOpenings(raw)
  const accounts = new Map<string, PlanAccount & { now: number | null }>()
  for (const g of of('accounts')) {
    const m = g.mapping
    for (const r of allRows(g)) {
      const name = text(r[m.name as number])
      if (!name || isTotalText(name)) continue
      const type = m.type !== undefined ? text(r[m.type]) : ''
      const now = m.balance !== undefined ? asCents(r[m.balance]) : null
      const opening = m.opening !== undefined ? asCents(r[m.opening]) : null
      const k = accountKey(name)
      if (!accounts.has(k)) accounts.set(k, { name, kind: kindForAccount(type, name), openingBalance: null, now: now ?? opening })
    }
  }
  for (const t of plan.transactions) {
    const k = accountKey(t.account)
    if (!accounts.has(k)) accounts.set(k, { name: t.account, kind: kindForAccount('', t.account), openingBalance: null, now: null })
  }
  for (const [k, a] of accounts) {
    const spent = net.get(k) ?? 0
    const derived = perAccount.get(k)
    if (derived !== undefined) {
      a.openingBalance = derived
      a.openingSource = 'balance column'
      if (a.now !== null && Math.abs(derived + spent - a.now) > 100) {
        plan.warnings.push(`"${a.name}": the accounts table says ${(a.now / 100).toFixed(2)} but the transactions add up to ${((derived + spent) / 100).toFixed(2)}.`)
      }
    } else if (a.now !== null) { a.openingBalance = a.now - spent; a.openingSource = 'accounts table' }
  }
  plan.accounts = [...accounts.values()].map(({ now: _n, ...a }) => a)
  // Point every transaction at its account's one canonical name.
  for (const t of plan.transactions) t.account = accounts.get(accountKey(t.account))?.name ?? t.account
  if (global !== null) plan.openingBalance = global
  else if (checked && perAccount.size === 0) plan.warnings.push('The balance column does not add up with the money in and out, so opening balances were not taken from it.')

  /* debts and savings goals */
  for (const g of of('debts')) {
    const m = g.mapping
    for (const r of allRows(g)) {
      const name = text(r[m.name as number])
      if (!name || isTotalText(name)) continue
      let rate = 0
      if (m.rate !== undefined) { const v = r[m.rate]; rate = typeof v === 'number' ? v : (asCents(v) ?? 0) / 100 }
      if (rate > 1) rate /= 100
      plan.debts.push({ name, balance: Math.max(0, money(r[m.balance as number])), interestRate: rate, category: cats.get(key(name))?.name ?? null })
    }
  }
  for (const g of of('goals')) {
    const m = g.mapping
    for (const r of allRows(g)) {
      const name = text(r[m.name as number])
      if (!name || isTotalText(name)) continue
      plan.pots.push({ name, balance: m.balance !== undefined ? Math.max(0, money(r[m.balance])) : 0, target: Math.max(0, money(r[m.target as number])), category: cats.get(key(name))?.name ?? null })
    }
  }

  /* an "Opening balance" cell, for workbooks that state it outside any table */
  if (!plan.openingBalance && !plan.accounts.some((a) => a.openingBalance !== null) && d.openingCell) plan.openingBalance = d.openingCell

  /* pay cycle */
  const periods = of('periods')[0]
  const cycle = periods ? inferCycle(periods) : null
  if (cycle) {
    const hol = of('holidays')[0]
    const holidays = hol ? allRows(hol).map((r) => asDate(r[hol.mapping.date as number])).filter((x): x is ISODate => !!x) : []
    plan.settings = { ...cycle, holidays: [...new Set(holidays)].sort() }
  }

  if (!plan.categories.length && !plan.transactions.length && !plan.debts.length && !plan.pots.length && !plan.accounts.length) {
    plan.warnings.unshift(`Nothing recognisable was found${d.sheetNames?.length ? ` in: ${d.sheetNames.join(', ')}` : ''}. Open "Other tables" and say which table holds your transactions or budget amounts.`)
  }
  return plan
}

/* ------------------------------------------------------ whole-workbook entry */

/** Switch off a transaction table that mostly repeats another (e.g. a "master" sheet plus monthly sheets). */
function markOverlaps(d: Detection): void {
  const tx = d.groups.filter((g) => g.role === 'transactions' && g.enabled)
  const keys = tx.map((g) => new Set(extractTransactions(g).rows.map((r) => `${r.date}|${Math.abs(r.moneyIn - r.moneyOut)}|${norm(r.description)}`)))
  for (let i = 0; i < tx.length; i++) {
    for (let j = i + 1; j < tx.length; j++) {
      if (!tx[i].enabled || !tx[j].enabled || !keys[i].size || !keys[j].size) continue
      let shared = 0
      for (const k of keys[i]) if (keys[j].has(k)) shared++
      if (shared / Math.min(keys[i].size, keys[j].size) >= 0.7) {
        const [small, big] = keys[i].size <= keys[j].size ? [tx[i], tx[j]] : [tx[j], tx[i]]
        small.enabled = false
        small.note = `Mostly the same transactions as "${titleOf(big)}"; left out so nothing is counted twice.`
      }
    }
  }
}

/** Scan a workbook and propose what everything is. */
export function autoDetect(sheets: readonly Sheet[]): Detection {
  const d = detectTables(sheets)
  markOverlaps(d)
  d.openingCell = findOpeningCell(sheets)
  d.sheetNames = sheets.map((s) => s.sheet)
  return d
}

/** Scan, detect and build in one go (used where no person is checking the result). */
export function parseWorkbook(sheets: readonly Sheet[]): WorkbookPlan {
  return buildPlan(autoDetect(sheets))
}

/** A row like "Opening balance | 79.34" on any sheet. */
export function findOpeningCell(sheets: readonly Sheet[]): number {
  for (const s of sheets) {
    for (const row of s.data) {
      if (/opening balance/i.test(text(row?.[0] as Cell))) {
        const n = (row as unknown[]).slice(1).find((c) => typeof c === 'number')
        if (typeof n === 'number') return Math.round(n * 100)
      }
    }
  }
  return 0
}
