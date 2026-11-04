import type { Group, Settings } from '@/types'
import { newId } from '@/lib/id'

export const defaultSettings = (): Settings => ({
  id: 'main',
  currency: 'ZAR',
  locale: 'en-ZA',
  theme: 'system',
  payDay: 1,
  weekendRule: 'none',
  holidays: [],
  onboarded: false,
})

/** Structural groups only (one per kind) so budgets can be totalled. Rename or add freely. No categories or accounts. */
export const defaultGroups = (): Group[] => [
  { id: newId(), name: 'Income', kind: 'income', order: 0 },
  { id: newId(), name: 'Expenses', kind: 'expense', order: 1 },
  { id: newId(), name: 'Debt', kind: 'debt', order: 2 },
  { id: newId(), name: 'Savings', kind: 'savings', order: 3 },
  { id: newId(), name: 'Transfers', kind: 'transfer', order: 4 },
]
