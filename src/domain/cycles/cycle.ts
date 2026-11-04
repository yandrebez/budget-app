import type { ISODate, Settings, WeekendRule } from '@/types'
import { addDays, daysInMonth, isWeekend, makeISO } from '@/lib/dates'

export type CycleConfig = Pick<Settings, 'payDay' | 'weekendRule' | 'holidays'>

export interface Cycle {
  /** `YYYY-MM` of the month the cycle's nominal pay day falls in. */
  key: string
  year: number
  month: number
  /** First day of the cycle (the adjusted pay day). */
  start: ISODate
  /** Last day of the cycle, inclusive. */
  end: ISODate
}

const isOff = (d: ISODate, holidays: Set<ISODate>) => isWeekend(d) || holidays.has(d)

/** Moves a date off weekends / holidays according to the rule. */
export function adjustPayday(date: ISODate, rule: WeekendRule, holidays: ISODate[]): ISODate {
  if (rule === 'none') return date
  const set = new Set(holidays)
  const step = rule === 'before' ? -1 : 1
  let d = date
  while (isOff(d, set)) d = addDays(d, step)
  return d
}

export const cycleKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

function paydayFor(cfg: CycleConfig, year: number, month: number): ISODate {
  const day = Math.min(cfg.payDay, daysInMonth(year, month))
  return adjustPayday(makeISO(year, month, day), cfg.weekendRule, cfg.holidays)
}

/** The cycle whose nominal pay day is in the given calendar month. */
export function cycleForMonth(cfg: CycleConfig, year: number, month: number): Cycle {
  const ny = month === 12 ? year + 1 : year
  const nm = month === 12 ? 1 : month + 1
  return {
    key: cycleKey(year, month),
    year,
    month,
    start: paydayFor(cfg, year, month),
    end: addDays(paydayFor(cfg, ny, nm), -1),
  }
}

/** The cycle that contains a given date. */
export function cycleContaining(cfg: CycleConfig, date: ISODate): Cycle {
  const [y, m] = date.split('-').map(Number)
  for (const [yy, mm] of [[y, m], m === 1 ? [y - 1, 12] : [y, m - 1], m === 12 ? [y + 1, 1] : [y, m + 1]]) {
    const c = cycleForMonth(cfg, yy, mm)
    if (date >= c.start && date <= c.end) return c
  }
  return cycleForMonth(cfg, y, m)
}

export function shiftCycle(cfg: CycleConfig, c: Cycle, by: number): Cycle {
  const idx = c.year * 12 + (c.month - 1) + by
  return cycleForMonth(cfg, Math.floor(idx / 12), (idx % 12) + 1)
}
