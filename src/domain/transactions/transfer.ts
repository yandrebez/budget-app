import type { ISODate, Transaction } from '@/types'

export interface TransferInput {
  fromId: string
  toId: string
  /** Positive cents. */
  amount: number
  date: ISODate
  note: string
  categoryId: string
  /** Ids are passed in so this stays a pure function. */
  ids: { out: string; in: string; transfer: string }
}

/** Moving your own money: one outflow and one matching inflow, linked by a shared transferId. */
export function buildTransfer(t: TransferInput): [Transaction, Transaction] {
  if (t.fromId === t.toId) throw new Error('Choose two different accounts')
  if (!(t.amount > 0)) throw new Error('Enter an amount above zero')
  const base = { date: t.date, categoryId: t.categoryId, description: t.note.trim() || 'Transfer', transferId: t.ids.transfer }
  return [
    { ...base, id: t.ids.out, accountId: t.fromId, moneyIn: 0, moneyOut: t.amount },
    { ...base, id: t.ids.in, accountId: t.toId, moneyIn: t.amount, moneyOut: 0 },
  ]
}
