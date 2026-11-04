import type { DateFormat, ISODate } from '@/types'
import { makeISO } from '@/lib/dates'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function valid(y: number, m: number, d: number): ISODate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null
  const iso = makeISO(y, m, d)
  return Number(iso.slice(5, 7)) === m ? iso : null
}

/** Parses the common statement date styles. Numeric day/month defaults to day-first. */
export function parseDate(raw: string | undefined, fmt: DateFormat = 'auto'): ISODate | null {
  if (!raw) return null
  const s = raw.trim()
  let m: RegExpMatchArray | null

  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return valid(+m[1], +m[2], +m[3])
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return valid(+m[1], +m[2], +m[3])
  if ((m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*\.?[\s,-]+(\d{4})/))) {
    const mi = MONTHS.indexOf(m[2].toLowerCase())
    return mi < 0 ? null : valid(+m[3], mi + 1, +m[1])
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) {
    const a = +m[1], b = +m[2], y = +m[3]
    if (fmt === 'MDY') return valid(y, a, b)
    return valid(y, b, a) // DMY (also the default for 'auto')
  }
  return null
}
