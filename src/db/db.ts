import Dexie, { type EntityTable } from 'dexie'
import type { Account, Category, Debt, Group, Rule, SavingsPot, Settings, Transaction } from '@/types'

export class BudgetDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  accounts!: EntityTable<Account, 'id'>
  groups!: EntityTable<Group, 'id'>
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  debts!: EntityTable<Debt, 'id'>
  pots!: EntityTable<SavingsPot, 'id'>
  rules!: EntityTable<Rule, 'id'>

  constructor(name = 'budget-app') {
    super(name)
    // Add a new `this.version(n)` block for every schema change; never edit old ones.
    this.version(1).stores({
      settings: 'id',
      accounts: 'id',
      groups: 'id, order',
      categories: 'id, groupId',
      transactions: 'id, date, accountId, categoryId, importHash',
      debts: 'id',
      pots: 'id',
      rules: 'id, pattern',
    })
  }
}

export const db = new BudgetDB()
