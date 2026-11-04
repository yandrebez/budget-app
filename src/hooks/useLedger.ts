import { useMemo } from 'react'
import type { Account, Category, Group, Transaction } from '@/types'
import { useAccounts, useCategories, useGroups, useTransactions } from './useBudgetData'

export interface Ledger {
  accounts: Account[]
  groups: Group[]
  categories: Category[]
  txs: Transaction[]
  /** Categories that belong to a transfer group (moving your own money). */
  transferIds: Set<string>
}

/** Everything the money screens need in one object, or null until it has loaded. */
export function useLedger(): Ledger | null {
  const accounts = useAccounts(), groups = useGroups(), categories = useCategories(), txs = useTransactions()
  return useMemo(() => {
    if (!accounts || !groups || !categories || !txs) return null
    const transferGroups = new Set(groups.filter((g) => g.kind === 'transfer').map((g) => g.id))
    return { accounts, groups, categories, txs, transferIds: new Set(categories.filter((c) => transferGroups.has(c.groupId)).map((c) => c.id)) }
  }, [accounts, groups, categories, txs])
}
