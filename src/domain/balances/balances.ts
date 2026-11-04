import type { Account, ISODate, Transaction } from '@/types'

/** Savings accounts hold money you have set aside, so they are kept out of the headline balance. */
export const isSpendingAccount = (a: Account): boolean => a.kind !== 'savings'

/** Balance of every account as of a date (inclusive). Future-dated rows are ignored when `asOf` is given. */
export function balancesByAccount(accounts: Account[], txs: Transaction[], asOf?: ISODate): Map<string, number> {
  const out = new Map(accounts.map((a) => [a.id, a.openingBalance]))
  for (const t of txs) {
    if (asOf && t.date > asOf) continue
    if (out.has(t.accountId)) out.set(t.accountId, (out.get(t.accountId) ?? 0) + t.moneyIn - t.moneyOut)
  }
  return out
}

export const totalBalance = (balances: Map<string, number>): number => [...balances.values()].reduce((s, v) => s + v, 0)

export interface PeriodFlow {
  /** Balance across all accounts the moment the period starts. */
  opening: number
  /** Money in / out excluding transfers between your own accounts. */
  moneyIn: number
  moneyOut: number
  net: number
  /** Balance across all accounts at the end of the period (or today if the period is still running). */
  closing: number
}

export function periodFlow(
  accounts: Account[], txs: Transaction[], start: ISODate, end: ISODate, transferCategoryIds: Set<string>,
): PeriodFlow {
  const known = new Set(accounts.map((a) => a.id))
  let opening = accounts.reduce((s, a) => s + a.openingBalance, 0)
  let moneyIn = 0, moneyOut = 0, within = 0
  for (const t of txs) {
    if (!known.has(t.accountId)) continue
    if (t.date < start) opening += t.moneyIn - t.moneyOut
    else if (t.date <= end) {
      within += t.moneyIn - t.moneyOut
      if (!t.categoryId || !transferCategoryIds.has(t.categoryId)) { moneyIn += t.moneyIn; moneyOut += t.moneyOut }
    }
  }
  return { opening, moneyIn, moneyOut, net: moneyIn - moneyOut, closing: opening + within }
}

/**
 * The opening balance that makes an account's balance (as of `asOf`) equal what the bank says.
 * Only the starting point moves; no transaction is changed.
 */
export function openingToMatch(account: Account, txs: Transaction[], actual: number, asOf: ISODate): number {
  const current = balancesByAccount([account], txs, asOf).get(account.id) ?? account.openingBalance
  return account.openingBalance + (actual - current)
}
