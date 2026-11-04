import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'

/** Live-updating reads. Each returns `undefined` until the first load. */
export const useGroups = () => useLiveQuery(() => db.groups.orderBy('order').toArray(), [])
export const useCategories = () => useLiveQuery(() => db.categories.toArray(), [])
export const useAccounts = () => useLiveQuery(() => db.accounts.toArray(), [])
export const useTransactions = () => useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [])
export const useDebts = () => useLiveQuery(() => db.debts.toArray(), [])
export const usePots = () => useLiveQuery(() => db.pots.toArray(), [])
export const useRules = () => useLiveQuery(() => db.rules.toArray(), [])
