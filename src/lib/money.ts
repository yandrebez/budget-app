/** Money is stored as integer cents to avoid floating-point drift. */
export const toCents = (amount: number): number => Math.round(amount * 100)
export const fromCents = (cents: number): number => cents / 100

export const formatMoney = (cents: number, currency: string, locale: string): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)

/**
 * Parses bank-style amounts to cents. Handles "R 1 234,56", "1,234.56", "(50.00)",
 * "-12.5", "12.50 Dr", "12.50 Cr". Returns null when the text is not a number.
 */
export function parseAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (/\bdr\b\.?$/i.test(s)) { negative = true; s = s.replace(/\s*dr\.?$/i, '') }
  else if (/\bcr\b\.?$/i.test(s)) s = s.replace(/\s*cr\.?$/i, '')
  if (/^[-−–]/.test(s) || /[-−–]$/.test(s)) { negative = true }
  s = s.replace(/[^\d.,]/g, '')
  if (!/\d/.test(s)) return null
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever separator comes last is the decimal mark.
    const dec = lastDot > lastComma ? '.' : ','
    const thousands = dec === '.' ? ',' : '.'
    s = s.split(thousands).join('').replace(dec, '.')
  } else if (lastComma >= 0) {
    // "1,234" / "1,234,567" = thousands; "12,5" / "12,50" = decimal
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot >= 0 && (s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return negative ? -cents : cents
}
