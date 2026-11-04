/** Compact axis numbers (12K, 1.2M) without a currency symbol. */
export const compactNumber = (cents: number, locale: string): string =>
  new Intl.NumberFormat(locale, { notation: Math.abs(cents) >= 1_000_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(cents / 100)

export const monthShort = (year: number, month: number, locale: string, withYear = false): string =>
  new Intl.DateTimeFormat(locale, { month: 'short', ...(withYear ? { year: '2-digit' } : {}), timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))

export const monthLong = (year: number, month: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))

export const dayHeading = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

/** Rounds a maximum up to a "nice" tick step. Returns ticks from 0 (or negative min) to max, in cents. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const hi = Math.max(max, 0), lo = Math.min(min, 0)
  const span = hi - lo || 100
  const rough = span / count
  const pow = 10 ** Math.floor(Math.log10(rough))
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10)
  const ticks: number[] = []
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + 1e-9; v += step) ticks.push(Math.round(v))
  return ticks
}
