import type { ISODate } from '@/types'
import { addDays, makeISO, toDate } from '@/lib/dates'

/** Western Easter Sunday (Anonymous Gregorian algorithm). */
function easterSunday(year: number): ISODate {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return makeISO(year, month, day)
}

/** South African public holidays; a holiday on a Sunday moves to the Monday. */
export function southAfricanHolidays(fromYear: number, toYear: number): ISODate[] {
  const out = new Set<ISODate>()
  for (let y = fromYear; y <= toYear; y++) {
    const easter = easterSunday(y)
    const fixed = [[1, 1], [3, 21], [4, 27], [5, 1], [6, 16], [8, 9], [9, 24], [12, 16], [12, 25], [12, 26]]
    for (const [m, d] of fixed) {
      const iso = makeISO(y, m, d)
      out.add(toDate(iso).getUTCDay() === 0 ? addDays(iso, 1) : iso)
    }
    out.add(addDays(easter, -2)) // Good Friday
    out.add(addDays(easter, 1)) // Family Day
  }
  return [...out].sort()
}
