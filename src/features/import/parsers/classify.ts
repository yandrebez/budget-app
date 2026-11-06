import { cellType, text, type Cell, type Sheet } from './sheet'
import { scanSheets, type ScannedTable } from './scan'

export type Role = 'transactions' | 'budget' | 'categories' | 'accounts' | 'goals' | 'debts' | 'periods' | 'holidays' | 'ignore'
/** field key → index into the group's headers. */
export type Mapping = Record<string, number | undefined>

export interface FieldDef { key: string; label: string; required?: boolean }

export const ROLE_LABEL: Record<Role, string> = {
  transactions: 'Transactions', budget: 'Budget (amount per category)', categories: 'Categories and groups', accounts: 'Accounts',
  goals: 'Savings goals', debts: 'Debts', periods: 'Pay periods', holidays: 'Public holidays', ignore: 'Ignore this table',
}

/** What can be mapped for each role. Drives the "fix it yourself" screen. */
export const ROLE_FIELDS: Record<Exclude<Role, 'ignore'>, FieldDef[]> = {
  transactions: [
    { key: 'date', label: 'Date', required: true }, { key: 'description', label: 'Description' }, { key: 'category', label: 'Category' },
    { key: 'account', label: 'Account' }, { key: 'moneyIn', label: 'Money in' }, { key: 'moneyOut', label: 'Money out' },
    { key: 'amount', label: 'Amount (one column; negative = money out)' }, { key: 'fee', label: 'Fee (added to money out)' },
    { key: 'balance', label: 'Running balance' },
  ],
  budget: [{ key: 'category', label: 'Category', required: true }, { key: 'budget', label: 'Monthly budget', required: true }, { key: 'group', label: 'Group / type' }],
  categories: [{ key: 'category', label: 'Category', required: true }, { key: 'group', label: 'Group / type', required: true }, { key: 'notes', label: 'Notes' }],
  accounts: [
    { key: 'name', label: 'Account name', required: true }, { key: 'type', label: 'Account type' },
    { key: 'balance', label: 'Balance now' }, { key: 'opening', label: 'Opening balance' },
  ],
  goals: [{ key: 'name', label: 'Goal name', required: true }, { key: 'balance', label: 'Saved so far' }, { key: 'target', label: 'Target', required: true }],
  debts: [{ key: 'name', label: 'Debt name', required: true }, { key: 'balance', label: 'Balance', required: true }, { key: 'rate', label: 'Interest rate' }],
  periods: [],
  holidays: [{ key: 'date', label: 'Date', required: true }],
}

export interface TableGroup {
  /** Same headings on several sheets (e.g. one tab per month) = one group. */
  key: string
  tables: ScannedTable[]
  headers: string[]
  role: Role
  mapping: Mapping
  enabled: boolean
  rowCount: number
  sheets: string[]
  /** Why it was switched off or set to this role, shown to the person. */
  note?: string
}

export interface Detection {
  groups: TableGroup[]
  /** An "Opening balance" figure stated outside any table (cents), 0 if none. */
  openingCell?: number
  /** Sheets that were scanned, for messages. */
  sheetNames?: string[]
}

/* ------------------------------------------------------------------ headings */

export const norm = (s: string): string =>
  s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9%]+/g, ' ').trim().replace(/\s+/g, ' ')

const RX = {
  date: /^(transaction |posting |value |trans |post |effective |booking )?date$/,
  desc: /^(transaction )?(description|details?|narrative|narration|memo|reference|particulars|merchant|payee|item|transaction details)$/,
  moneyIn: /^(money in|amount in|in|credit|credits|credit amount|deposit|deposits|received|paid in|money received|income|cr)$/,
  moneyOut: /^(money out|amount out|out|debit|debits|debit amount|withdrawal|withdrawals|spent|paid out|payment|payments|money spent|expense|expenses|dr)$/,
  amount: /^(amount|transaction amount|value|sum|total amount|amt)$/,
  fee: /^(fee|fees|bank fee|bank fees|charges?|service fee|fee amount)$/,
  balance: /^(running balance|balance|closing balance|current balance|balance now|available balance|bal)$/,
  account: /^(account|account name|bank account|card|wallet|from account|paid from)$/,
  category: /^(category|categories|cat|budget category|expense category|spend category|spending category)$/,
  group: /^(group|type|kind|class|budget type|category type|classification|group type)$/,
  budget: /^(monthly budget|budget|budgeted|budget amount|planned|plan|allocated|allocation|limit|monthly amount|monthly limit|monthly plan)$/,
  notes: /^(notes?|comments?|remarks?)$/,
  accountName: /^(account name|account|accounts|bank account|name)$/,
  accountType: /^(account type|type|kind)$/,
  opening: /^(opening|opening balance|start balance|starting balance)$/,
  target: /^(target|goal|goal target|goal amount|target amount|goal balance)$/,
  goalName: /^(goal|goals|goal account|pot|pots|fund|funds|savings goal|savings pot|saving|savings|name)$/,
  debtName: /^(debt|debts|loan|loans|liability|liabilities|creditor|lender)$/,
  rate: /^(interest rate|interest|rate|apr|annual rate|interest rate pa)$/,
  saved: /^(balance now|current balance|closing balance|balance|saved|saved so far|current|current amount|amount saved)$/,
}

const findCol = (headers: string[], ...rxs: RegExp[]): number | undefined => {
  const n = headers.map(norm)
  for (const rx of rxs) { const i = n.findIndex((h) => rx.test(h)); if (i >= 0) return i }
  return undefined
}

/* ------------------------------------------------------------------ profiles */

export interface Prof { filled: number; date: number; num: number; text: number; distinct: number }

export function profiles(headers: string[], rows: Cell[][]): Prof[] {
  return headers.map((_, c) => {
    let filled = 0, date = 0, num = 0, txt = 0
    const seen = new Set<string>()
    for (const r of rows) {
      const t = cellType(r[c])
      if (t === 'empty') continue
      filled++
      if (t === 'date') date++; else if (t === 'number') num++; else txt++
      if (seen.size < 500) seen.add(String(r[c]))
    }
    const d = filled || 1
    return { filled, date: date / d, num: num / d, text: txt / d, distinct: seen.size }
  })
}

export const isDateCol = (p: Prof) => p.filled > 0 && p.date >= 0.8
const isNumCol = (p: Prof) => p.filled > 0 && p.num >= 0.8
const PERIOD_HEAD = /start|end|from|to|period|usual|due|next|last/

/* ------------------------------------------------------------------ mapping */

export function autoMapping(role: Role, headers: string[], rows: Cell[][]): Mapping {
  const p = profiles(headers, rows)
  const norms = headers.map(norm)
  const firstText = () => p.findIndex((x) => x.filled > 0 && x.text >= 0.6)
  switch (role) {
    case 'transactions': {
      const byShape = p.findIndex((x, i) => isDateCol(x) && !PERIOD_HEAD.test(norms[i]))
      return {
        date: findCol(headers, RX.date) ?? (byShape >= 0 ? byShape : undefined),
        description: findCol(headers, RX.desc), category: findCol(headers, RX.category), account: findCol(headers, RX.account),
        moneyIn: findCol(headers, RX.moneyIn), moneyOut: findCol(headers, RX.moneyOut), amount: findCol(headers, RX.amount),
        fee: findCol(headers, RX.fee), balance: findCol(headers, RX.balance),
      }
    }
    case 'budget': return { category: findCol(headers, RX.category), budget: findCol(headers, RX.budget), group: findCol(headers, RX.group) }
    case 'categories': return { category: findCol(headers, RX.category), group: findCol(headers, RX.group), notes: findCol(headers, RX.notes) }
    case 'accounts': {
      const bal = findCol(headers, /^(closing balance|current balance|balance now|balance)$/, /^closing/, /balance/)
      return {
        name: findCol(headers, RX.accountName), type: findCol(headers, RX.accountType),
        balance: bal !== undefined && RX.opening.test(norms[bal]) ? undefined : bal, opening: findCol(headers, RX.opening),
      }
    }
    case 'goals': return { name: findCol(headers, RX.goalName) ?? (firstText() >= 0 ? firstText() : undefined), balance: findCol(headers, RX.saved), target: findCol(headers, RX.target) }
    case 'debts': return { name: findCol(headers, RX.debtName), balance: findCol(headers, RX.saved), rate: findCol(headers, RX.rate) }
    case 'holidays': { const i = findCol(headers, RX.date); return { date: i ?? (p.findIndex(isDateCol) >= 0 ? p.findIndex(isDateCol) : undefined) } }
    default: return {}
  }
}

/* ------------------------------------------------------------------ roles */

const ORDER: Role[] = ['holidays', 'debts', 'goals', 'accounts', 'transactions', 'budget', 'categories', 'periods']

export function scoreRoles(headers: string[], rows: Cell[][]): Record<Role, number> {
  const p = profiles(headers, rows)
  const has = (m: Mapping, ...keys: string[]) => keys.every((k) => m[k] !== undefined)
  const dateCols = p.filter(isDateCol).length
  const out: Record<Role, number> = { transactions: 0, budget: 0, categories: 0, accounts: 0, goals: 0, debts: 0, periods: 0, holidays: 0, ignore: 0 }
  if (rows.length < 1) return out

  const tx = autoMapping('transactions', headers, rows)
  const amountish = tx.moneyIn !== undefined || tx.moneyOut !== undefined || tx.amount !== undefined
  if (tx.date !== undefined && amountish && (tx.description !== undefined || tx.category !== undefined || tx.account !== undefined)) {
    out.transactions = 6 + (tx.description !== undefined ? 1 : 0) + (tx.category !== undefined ? 1 : 0) + (tx.account !== undefined ? 1 : 0)
  }
  const hasDate = tx.date !== undefined

  const hol = autoMapping('holidays', headers, rows)
  if (norm(headers.join(' ')).includes('holiday') && hol.date !== undefined && rows.length >= 1) out.holidays = 8

  const debt = autoMapping('debts', headers, rows)
  if (has(debt, 'name', 'balance')) out.debts = 7

  const goal = autoMapping('goals', headers, rows)
  if (goal.target !== undefined && goal.balance !== undefined && goal.name !== undefined && p[goal.target] && isNumCol(p[goal.target])) out.goals = 7

  const acc = autoMapping('accounts', headers, rows)
  if (!hasDate && acc.name !== undefined && (acc.type !== undefined || acc.balance !== undefined || acc.opening !== undefined) && findCol(headers, RX.category) === undefined) out.accounts = 7

  const bud = autoMapping('budget', headers, rows)
  if (!hasDate && has(bud, 'category', 'budget')) out.budget = 6.5

  const cat = autoMapping('categories', headers, rows)
  if (!hasDate && has(cat, 'category', 'group') && bud.budget === undefined && !p.some(isNumCol)) out.categories = 6

  if (dateCols >= 2 && !amountish && rows.length >= 3) out.periods = 5
  return out
}

export function classify(headers: string[], rows: Cell[][]): Role {
  if (rows.length < 1) return 'ignore'
  const s = scoreRoles(headers, rows)
  let best: Role = 'ignore', top = 4.99
  for (const r of ORDER) if (s[r] > top) { best = r; top = s[r] }
  return best
}

/* ------------------------------------------------------------------ grouping */

export const allRows = (g: Pick<TableGroup, 'tables'>): Cell[][] => g.tables.flatMap((t) => t.rows)

function groupTables(tables: ScannedTable[]): TableGroup[] {
  const map = new Map<string, TableGroup>()
  for (const t of tables) {
    const key = t.headers.map(norm).join('|')
    const g = map.get(key)
    if (g) { g.tables.push(t); g.rowCount += t.rows.length; if (!g.sheets.includes(t.sheet)) g.sheets.push(t.sheet) }
    else map.set(key, { key, tables: [t], headers: t.headers, role: 'ignore', mapping: {}, enabled: false, rowCount: t.rows.length, sheets: [t.sheet] })
  }
  return [...map.values()]
}

/** How many distinct items a table lists: used to pick the "real" one among several views of the same data. */
export function keyCount(g: TableGroup): number {
  const k = g.mapping.category ?? g.mapping.name ?? g.mapping.date
  if (k === undefined) return g.rowCount
  return new Set(allRows(g).map((r) => text(r[k]) || (r[k] instanceof Date ? r[k].toISOString() : '')).filter(Boolean)).size
}

/** Roles that should come from one table only; extra tables are normally other views of the same data. */
const SINGLE: Role[] = ['budget', 'categories', 'accounts', 'goals', 'debts', 'periods', 'holidays']

/** How many useful columns were recognised. A table with more of them is the real one, not a summary of it. */
const richness = (g: TableGroup) => Object.values(g.mapping).filter((v) => v !== undefined).length

export function pickSingles(groups: TableGroup[]): void {
  for (const role of SINGLE) {
    const mine = groups.filter((g) => g.role === role)
    if (!mine.length) continue
    mine.sort((a, b) => richness(b) - richness(a) || keyCount(b) - keyCount(a) || a.tables[0].order - b.tables[0].order)
    mine.forEach((g, i) => {
      g.enabled = i === 0
      if (i > 0) g.note = `Looks like another view of "${mine[0].sheets[0]}"; left out so nothing is counted twice.`
    })
  }
}

/** Scans a workbook and proposes what every table is. Nothing here depends on sheet names. */
export function detectTables(sheets: readonly Sheet[]): Detection {
  const groups = groupTables(scanSheets(sheets))
  for (const g of groups) {
    const rows = allRows(g)
    g.role = g.rowCount >= 2 || classify(g.headers, rows) === 'holidays' ? classify(g.headers, rows) : 'ignore'
    g.mapping = autoMapping(g.role, g.headers, rows)
    g.enabled = g.role !== 'ignore'
  }
  pickSingles(groups)
  return { groups }
}

/** Re-propose columns when the person changes a table's role. */
export function withRole(g: TableGroup, role: Role): TableGroup {
  return { ...g, role, mapping: autoMapping(role, g.headers, allRows(g)), enabled: role !== 'ignore', note: undefined }
}

