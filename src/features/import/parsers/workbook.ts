import type { GroupKind, ISODate, WeekendRule } from '@/types'
import { toISO } from '@/lib/dates'
import { parseAmount, toCents } from '@/lib/money'
import { parseDate } from './dates'
import { guessMapping } from './csv'

export type Cell = string | number | boolean | Date | null | undefined
/** Loosely typed on purpose: accepts whatever the xlsx reader returns. Cells are narrowed inside. */
export interface Sheet { sheet: string; data: readonly (readonly unknown[])[] }
interface TypedSheet { sheet: string; data: Cell[][] }

export interface PlanGroup { name: string; kind: GroupKind }
export interface PlanCategory { name: string; group: string; monthlyBudget: number; notes?: string }
export interface PlanTx { date: ISODate; account: string; category: string | null; description: string; moneyIn: number; moneyOut: number }
export interface PlanDebt { name: string; balance: number; interestRate: number; category: string | null }
export interface PlanPot { name: string; balance: number; target: number; category: string | null }

export interface WorkbookPlan {
  settings: { payDay: number; weekendRule: WeekendRule; holidays: ISODate[] } | null
  groups: PlanGroup[]
  categories: PlanCategory[]
  accounts: string[]
  /** Opening balance found on the Setup sheet (cents), 0 if none. */
  openingBalance: number
  transactions: PlanTx[]
  debts: PlanDebt[]
  pots: PlanPot[]
  warnings: string[]
}

const text = (c: Cell): string => (c == null ? '' : c instanceof Date ? '' : String(c).trim())
const key = (s: string) => s.trim().toLowerCase()

function money(c: Cell): number {
  if (typeof c === 'number') return Number.isFinite(c) ? toCents(c) : 0
  return parseAmount(text(c)) ?? 0
}

function dateOf(c: Cell): ISODate | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : toISO(c)
  return parseDate(text(c))
}

const findSheet = (sheets: TypedSheet[], re: RegExp) => sheets.find((s) => re.test(s.sheet.trim()))

/** Finds the first row (within 30) containing every required header; returns column lookup by header. */
function findHeader(data: Cell[][], required: (string | string[])[]): { row: number; col: Map<string, number> } | null {
  for (let r = 0; r < Math.min(30, data.length); r++) {
    const col = new Map<string, number>()
    ;(data[r] ?? []).forEach((c, i) => { const k = key(text(c)); if (k && !col.has(k)) col.set(k, i) })
    const ok = required.every((req) => (Array.isArray(req) ? req : [req]).some((n) => col.has(n)))
    if (ok) return { row: r, col }
  }
  return null
}

const pick = (col: Map<string, number>, names: string[]): number | undefined => {
  for (const n of names) if (col.has(n)) return col.get(n)
}

export function kindForGroup(name: string): GroupKind {
  const n = key(name)
  if (/income|salary|revenue|earn/.test(n)) return 'income'
  if (/debt|loan|credit card/.test(n)) return 'debt'
  if (/saving|invest/.test(n)) return 'savings'
  if (/transfer/.test(n)) return 'transfer'
  return 'expense'
}

/** Rows below a table end at the first blank key cell or a "TOTAL ..." row. */
function tableRows(data: Cell[][], from: number, keyCol: number): Cell[][] {
  const out: Cell[][] = []
  for (let r = from; r < data.length; r++) {
    const k = text(data[r]?.[keyCol])
    if (!k || /^total\b/i.test(k)) break
    out.push(data[r])
  }
  return out
}

export function parseWorkbook(input: Sheet[]): WorkbookPlan {
  const sheets = input as unknown as TypedSheet[]
  const plan: WorkbookPlan = { settings: null, groups: [], categories: [], accounts: [], openingBalance: 0, transactions: [], debts: [], pots: [], warnings: [] }
  const catByName = new Map<string, PlanCategory>()
  const groupNames = new Map<string, string>()
  const addGroup = (name: string) => {
    if (!groupNames.has(key(name))) { groupNames.set(key(name), name); plan.groups.push({ name, kind: kindForGroup(name) }) }
    return groupNames.get(key(name))!
  }

  // Budget (monthly amounts) then Setup (adds any categories with no budget row, plus notes)
  const budget = findSheet(sheets, /^budget$/i)
  const bh = budget && findHeader(budget.data, ['category', 'group', ['monthly budget', 'budget', 'planned']])
  if (budget && bh) {
    const cCat = bh.col.get('category')!, cGrp = bh.col.get('group')!
    const cAmt = pick(bh.col, ['monthly budget', 'budget', 'planned'])!
    for (let r = bh.row + 1; r < budget.data.length; r++) {
      const row = budget.data[r] ?? []
      const name = text(row[cCat]), group = text(row[cGrp])
      if (!name || !group || /^total\b/i.test(name)) { if (!name) break; continue }
      if (catByName.has(key(name))) continue
      const c: PlanCategory = { name, group: addGroup(group), monthlyBudget: Math.max(0, money(row[cAmt])) }
      catByName.set(key(name), c); plan.categories.push(c)
    }
  }
  const setup = findSheet(sheets, /^setup$/i)
  const sh = setup && findHeader(setup.data, ['category', 'group'])
  if (setup && sh) {
    const cCat = sh.col.get('category')!, cGrp = sh.col.get('group')!, cNote = pick(sh.col, ['notes', 'note'])
    for (const row of tableRows(setup.data, sh.row + 1, cCat)) {
      const name = text(row[cCat]), group = text(row[cGrp])
      if (!group) continue
      const note = cNote === undefined ? '' : text(row[cNote])
      const existing = catByName.get(key(name))
      if (existing) { if (note && !existing.notes) existing.notes = note; continue }
      const c: PlanCategory = { name, group: addGroup(group), monthlyBudget: 0, ...(note ? { notes: note } : {}) }
      catByName.set(key(name), c); plan.categories.push(c)
    }
  }

  // Opening balance: a Setup row labelled "Opening balance ..." followed by a number
  for (const row of setup?.data ?? []) {
    if (/opening balance/i.test(text(row[0]))) {
      const n = row.slice(1).find((c) => typeof c === 'number')
      if (typeof n === 'number') plan.openingBalance = toCents(n)
      break
    }
  }

  // Transactions
  const txSheet = findSheet(sheets, /^transactions?$/i)
  const th = txSheet && findHeader(txSheet.data, [['date', 'transaction date'], ['category'], ['money in', 'credit', 'amount', 'in']])
  if (txSheet && th) {
    const headers = (txSheet.data[th.row] ?? []).map((c) => text(c))
    const g = guessMapping(headers)
    const idx = (h?: string) => (h ? headers.indexOf(h) : -1)
    const cDate = idx(g.date), cDesc = idx(g.description), cIn = idx(g.moneyIn), cOut = idx(g.moneyOut), cAmt = idx(g.amount)
    const cCat = th.col.get('category')!, cAcc = pick(th.col, ['account', 'bank account'])
    const accounts = new Set<string>()
    let skipped = 0
    for (let r = th.row + 1; r < txSheet.data.length; r++) {
      const row = txSheet.data[r] ?? []
      if (row.every((c) => c == null || text(c) === '')) continue
      const date = dateOf(row[cDate])
      let moneyIn = 0, moneyOut = 0
      if (cIn >= 0 || cOut >= 0) {
        // Follow the sheet's own arithmetic (in minus out): a negative "out" is a refund, a negative "in" a reversal.
        const i = cIn >= 0 ? money(row[cIn]) : 0, o = cOut >= 0 ? money(row[cOut]) : 0
        moneyIn = Math.max(0, i) + Math.max(0, -o)
        moneyOut = Math.max(0, o) + Math.max(0, -i)
      }
      else if (cAmt >= 0) { const a = money(row[cAmt]); if (a >= 0) moneyIn = a; else moneyOut = -a }
      if (!date || (moneyIn === 0 && moneyOut === 0)) { skipped++; continue }
      const account = (cAcc !== undefined && text(row[cAcc])) || 'Imported'
      accounts.add(account)
      const category = text(row[cCat]) || null
      plan.transactions.push({ date, account, category, description: cDesc >= 0 ? text(row[cDesc]) : '', moneyIn, moneyOut })
    }
    plan.accounts = [...accounts]
    if (skipped) plan.warnings.push(`${skipped} transaction row(s) had no readable date or amount and were skipped.`)
    // Categories used by transactions but missing from Budget/Setup get a group by guessing nothing: put in "Imported".
    for (const t of plan.transactions) {
      if (t.category && !catByName.has(key(t.category))) {
        const c: PlanCategory = { name: t.category, group: addGroup('Imported'), monthlyBudget: 0 }
        catByName.set(key(t.category), c); plan.categories.push(c)
        plan.warnings.push(`Category "${t.category}" was only found in transactions; it was added under "Imported".`)
      }
    }
  }

  // Debts
  const debt = findSheet(sheets, /^debts?$/i)
  const dh = debt && findHeader(debt.data, [['debt', 'name'], ['balance now', 'balance']])
  if (debt && dh) {
    const cName = pick(dh.col, ['debt', 'name'])!, cBal = pick(dh.col, ['balance now', 'balance'])!, cRate = pick(dh.col, ['interest rate', 'rate', 'interest'])
    for (const row of tableRows(debt.data, dh.row + 1, cName)) {
      const name = text(row[cName])
      let rate = cRate === undefined ? 0 : typeof row[cRate] === 'number' ? (row[cRate] as number) : (parseAmount(text(row[cRate])) ?? 0) / 100
      if (rate > 1) rate /= 100 // typed as "12" instead of 12 %
      plan.debts.push({ name, balance: Math.max(0, money(row[cBal])), interestRate: rate, category: catByName.get(key(name))?.name ?? null })
    }
  }

  // Savings pots
  const sav = findSheet(sheets, /^savings?$/i)
  const sv = sav && findHeader(sav.data, [['pot', 'name'], ['balance now', 'balance']])
  if (sav && sv) {
    const cName = pick(sv.col, ['pot', 'name'])!, cBal = pick(sv.col, ['balance now', 'balance'])!, cTar = pick(sv.col, ['target', 'goal'])
    for (const row of tableRows(sav.data, sv.row + 1, cName)) {
      const name = text(row[cName])
      plan.pots.push({ name, balance: Math.max(0, money(row[cBal])), target: cTar === undefined ? 0 : Math.max(0, money(row[cTar])), category: catByName.get(key(name))?.name ?? null })
    }
  }

  // Pay cycle: nominal pay day (col B) vs adjusted payday (col C) on a Cycles sheet; holidays from dates on Setup
  const cycles = findSheet(sheets, /^(pay )?cycles?$/i)
  if (cycles) {
    const pairs = cycles.data.map((r) => [r[1], r[2]] as const).filter(([a, b]) => a instanceof Date && b instanceof Date) as [Date, Date][]
    if (pairs.length) {
      const day = pairs[0][0].getUTCDate()
      const before = pairs.filter(([a, b]) => b < a).length, after = pairs.filter(([a, b]) => b > a).length
      const holidays = setup ? setup.data.flat().filter((c): c is Date => c instanceof Date).map(toISO) : []
      plan.settings = { payDay: day, weekendRule: before === 0 && after === 0 ? 'none' : after > before ? 'after' : 'before', holidays: [...new Set(holidays)].sort() }
    }
  }

  if (!plan.categories.length && !plan.transactions.length && !plan.debts.length && !plan.pots.length) {
    plan.warnings.unshift(`Nothing recognisable found. Sheets in this file: ${sheets.map((s) => s.sheet).join(', ') || '(none)'}. Expected sheets named Budget, Transactions, Debt, Savings, Setup or Cycles.`)
  }
  return plan
}
