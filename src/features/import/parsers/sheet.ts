import type { ISODate } from '@/types'
import { toISO } from '@/lib/dates'
import { parseAmount } from '@/lib/money'
import { parseDate } from './dates'

export type Cell = string | number | boolean | Date | null | undefined

/** Loosely typed on purpose: accepts whatever the xlsx reader returns. Cells are narrowed inside. */
export interface Sheet { sheet: string; data: readonly (readonly unknown[])[] }

const ERROR_CELL = /^#(N\/A|REF!|DIV\/0!|VALUE!|NAME\?|NUM!|NULL!)$/i
const NUMERIC_TEXT = /^[-−–(]?\s*(?:R|ZAR|\$|€|£)?\s*[-−–]?[\d\s.,]+\)?\s*(?:cr|dr)?\.?$/i

/** Plain text of a cell ('' for empty, dates and numbers-as-dates). */
export const text = (c: unknown): string => (c == null || c instanceof Date ? '' : String(c).trim())

/** Blank cells, whitespace and spreadsheet error values all count as empty. */
export const isEmptyCell = (c: unknown): boolean =>
  c == null || (typeof c === 'string' && (c.trim() === '' || ERROR_CELL.test(c.trim())))

/** A date from a real date cell or from date-looking text ("2026-10-25", "25/10/2026", "25 Oct 2026"). */
export function asDate(c: unknown): ISODate | null {
  if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : toISO(c)
  if (typeof c !== 'string') return null
  const s = c.trim()
  if (s.length < 6 || s.length > 16) return null
  return parseDate(s)
}

/** Cents from a number cell or number-looking text ("R 1 234,56", "(50.00)"). */
export function asCents(c: unknown): number | null {
  if (typeof c === 'number') return Number.isFinite(c) ? Math.round(c * 100) : null
  if (typeof c !== 'string') return null
  const s = c.trim()
  if (!s || !/\d/.test(s) || !NUMERIC_TEXT.test(s)) return null
  return parseAmount(s)
}

export type CellType = 'empty' | 'date' | 'number' | 'text'

export function cellType(c: unknown): CellType {
  if (isEmptyCell(c)) return 'empty'
  if (c instanceof Date) return 'date'
  if (typeof c === 'number') return 'number'
  if (typeof c === 'boolean') return 'text'
  if (asDate(c) !== null) return 'date'
  if (asCents(c) !== null) return 'number'
  return 'text'
}

export const colLetter = (i: number): string => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
