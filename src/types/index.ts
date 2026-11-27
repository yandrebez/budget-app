/** All money values are integer cents. All dates are ISO `YYYY-MM-DD` strings. */
export type ISODate = string

export type GroupKind = 'income' | 'expense' | 'debt' | 'savings' | 'transfer'

export type AccountKind = 'account' | 'card' | 'savings' | 'cash'

export interface Account {
  id: string
  name: string
  /** Display only. Balance maths is the same for every kind (a card going negative means money owed). */
  kind?: AccountKind
  openingBalance: number
}

export interface Group {
  id: string
  name: string
  kind: GroupKind
  order: number
}

export interface Category {
  id: string
  name: string
  groupId: string
  /** The budget for any period before the first entry in `budgets` (and for every period if there are none). */
  monthlyBudget: number
  /**
   * Changes to the budget over time, keyed by period (`YYYY-MM`, as in a cycle's key). Each applies from that period
   * until the next change. Absent on categories that have never had a change, which then use `monthlyBudget` throughout.
   */
  budgets?: Record<string, number>
  notes?: string
}

export interface Transaction {
  id: string
  date: ISODate
  accountId: string
  categoryId: string | null
  description: string
  moneyIn: number
  moneyOut: number
  /** Fingerprint used to skip duplicates when importing statements. */
  importHash?: string
  /** Shared by the two sides of a transfer between your own accounts. */
  transferId?: string
  /**
   * The bonus plan this belongs to: bonus money arriving, or a payment made from it. Such a transaction still moves
   * the account balance, but stays out of the salary budget, Stats and the forecast.
   */
  bonusId?: string
}

export interface Debt {
  id: string
  name: string
  balance: number
  /** Annual rate as a fraction, 0.12 = 12 %. */
  interestRate: number
  categoryId: string | null
}

export interface SavingsPot {
  id: string
  name: string
  balance: number
  target: number
  categoryId: string | null
}

/** Remembers "description contains X → category Y" for auto-categorising imports. */
export interface Rule {
  id: string
  pattern: string
  categoryId: string
}

export interface ColumnMapping {
  date: string
  description: string
  /** Signed amount column (positive = in, negative = out). */
  amount?: string
  moneyIn?: string
  moneyOut?: string
  dateFormat: DateFormat
}

export type DateFormat = 'auto' | 'YMD' | 'DMY' | 'MDY'
export type WeekendRule = 'before' | 'after' | 'none'

/** One slice of a bonus: where some of it is going. */
export interface BonusPart {
  id: string
  label: string
  /** Cents. */
  amount: number
  /** Optional: the budget category it belongs to (e.g. an emergency fund or a loan). */
  categoryId: string | null
  /** Ticked off once the money has actually been moved or paid. */
  done: boolean
}

/** Extra money on top of salary, planned separately from the monthly budget. */
export interface BonusPlan {
  id: string
  name: string
  /** Cents expected, after tax. */
  amount: number
  /** The period it is expected to arrive in (`YYYY-MM`). */
  period: string
  parts: BonusPart[]
}

export interface Settings {
  id: 'main'
  currency: string
  locale: string
  theme: 'system' | 'light' | 'dark'
  /** Day of month the cycle starts (e.g. payday). 1 = calendar months. */
  payDay: number
  /** What to do when that day is a weekend / holiday. */
  weekendRule: WeekendRule
  holidays: ISODate[]
  onboarded: boolean
  /** Bonus plans. Optional, so existing data needs no change. */
  bonuses?: BonusPlan[]
}

export interface BackupFile {
  version: 1
  exportedAt: string
  data: Record<string, unknown[]>
}
