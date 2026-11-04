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
  monthlyBudget: number
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
}

export interface BackupFile {
  version: 1
  exportedAt: string
  data: Record<string, unknown[]>
}
