import type { ISODate } from '@/types'

/** Dates are handled as UTC midnight so DST / timezone never shifts a day. */
export const toDate = (iso: ISODate): Date => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export const toISO = (d: Date): ISODate => d.toISOString().slice(0, 10)

export const addDays = (iso: ISODate, n: number): ISODate => {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}

export const daysBetween = (a: ISODate, b: ISODate): number =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000)

export const isWeekend = (iso: ISODate): boolean => {
  const day = toDate(iso).getUTCDay()
  return day === 0 || day === 6
}

export const todayISO = (): ISODate => {
  const n = new Date()
  return toISO(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())))
}

export const makeISO = (y: number, m: number, d: number): ISODate =>
  toISO(new Date(Date.UTC(y, m - 1, d)))

export const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate()

export const formatDate = (iso: ISODate, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(toDate(iso))
