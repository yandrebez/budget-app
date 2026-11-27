import { useMemo } from 'react'
import type { Account, Category, Group, Transaction } from '@/types'
import { useApp } from '@/app/AppContext'
import { bonusIdSet, salaryOnly } from '@/domain/budget/bonus'
import { useAccounts, useCategories, useGroups, useTransactions } from './useBudgetData'

export interface Ledger {
  accounts: Account[]
  groups: Group[]
  categories: Category[]
  /** Every transaction: what really moved in and out of the accounts. */
  txs: Transaction[]
  /** The salary side: everything except bonus money and payments made from it. Budget, Stats and the forecast read this. */
  salaryTxs: Transaction[]
  /** Ids of the bonus plans that exist. */
  bonusIds: Set<string>
  /** Categories that belong to a transfer group (moving your own money). */
  transferIds: Set<string>
}

/** Everything the money screens need in one object, or null until it has loaded. */
export function useLedger(): Ledger | null {
  const accounts = useAccounts(), groups = useGroups(), categories = useCategories(), txs = useTransactions()
  const { settings } = useApp()
  return useMemo(() => {
    if (!accounts || !groups || !categories || !txs) return null
    const transferGroups = new Set(groups.filter((g) => g.kind === 'transfer').map((g) => g.id))
    const bonusIds = bonusIdSet(settings.bonuses)
    return { accounts, groups, categories, txs, salaryTxs: salaryOnly(txs, bonusIds), bonusIds, transferIds: new Set(categories.filter((c) => transferGroups.has(c.groupId)).map((c) => c.id)) }
  }, [accounts, groups, categories, txs, settings.bonuses])
}
