import { parseAmount } from '@/lib/money'
import { parseDate } from './dates'
import type { ParsedCsv } from './csv'

/** One piece of text with its position on the page (PDF units; y grows upwards). */
export interface TextItem { str: string; x: number; y: number; width: number; height: number; page: number }

interface Cell { text: string; x1: number; x2: number }
interface Line { page: number; y: number; cells: Cell[] }

export interface PdfTable extends ParsedCsv {
  /** True when no header row was found and columns were guessed. Amounts need a careful look. */
  headerless: boolean
  /** Rows where money in/out had to be worked out from the running balance. */
  inferredFromBalance: number
}

const NUMERIC_HEAD = /^(amount|balance|debit|credit|debits|credits|money in|money out|fee|fees|in|out|withdrawals?|deposits?)$/i
const DATE_HEAD = /^(date|transaction date|posting date|value date|trans date)$/i
const DESC_HEAD = /^(description|details|narrative|transaction description|reference)$/i
const DATE_START = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{8}|\d{1,2}[\s-]+[A-Za-z]{3}[A-Za-z]*\.?[\s,-]+\d{4}|\d{1,2}[\s-]+[A-Za-z]{3}[A-Za-z]*\.?|\d{1,2}[/-]\d{1,2})$/
const NOISE = /(balance (brought|carried)|brought forward|carried forward|opening balance|closing balance|page \d|total|statement|^\s*$)/i

const isAmount = (s: string) => /^[-(R\s]*\d[\d\s.,]*\)?\s*(cr|dr)?\.?-?$/i.test(s.trim()) && parseAmount(s) !== null

/** Group items into lines by page and y, then merge touching items into cells. */
function toLines(items: TextItem[]): Line[] {
  const lines: Line[] = []
  const byPage = new Map<number, TextItem[]>()
  for (const it of items) if (it.str.trim()) (byPage.get(it.page) ?? byPage.set(it.page, []).get(it.page)!).push(it)
  for (const [page, its] of [...byPage].sort((a, b) => a[0] - b[0])) {
    its.sort((a, b) => b.y - a.y || a.x - b.x)
    let cur: TextItem[] = []
    let curY = 0
    const flush = () => { if (cur.length) lines.push(buildLine(page, curY, cur)); cur = [] }
    for (const it of its) {
      if (cur.length && Math.abs(it.y - curY) > Math.max(2.5, it.height * 0.4)) flush()
      if (!cur.length) curY = it.y
      cur.push(it)
    }
    flush()
  }
  return lines
}

function buildLine(page: number, y: number, items: TextItem[]): Line {
  items.sort((a, b) => a.x - b.x)
  const cells: Cell[] = []
  for (const it of items) {
    const last = cells[cells.length - 1]
    const gap = last ? it.x - last.x2 : Infinity
    if (last && gap < Math.max(2, it.height * 0.45)) {
      last.text += (gap > 0.5 ? ' ' : '') + it.str.trim()
      last.x2 = it.x + it.width
    } else cells.push({ text: it.str.trim(), x1: it.x, x2: it.x + it.width })
  }
  return { page, y, cells }
}

interface Col { name: string; x1: number; x2: number; numeric: boolean; kind: 'date' | 'desc' | 'other' }

function findHeader(line: Line): Col[] | null {
  const heads = line.cells.map((c) => c.text.trim())
  const hasDate = heads.some((h) => DATE_HEAD.test(h))
  const hasDesc = heads.some((h) => DESC_HEAD.test(h))
  const nNum = heads.filter((h) => NUMERIC_HEAD.test(h)).length
  if (!hasDate || !hasDesc || nNum === 0) return null
  return line.cells.map((c) => ({
    name: c.text.trim(), x1: c.x1, x2: c.x2,
    numeric: NUMERIC_HEAD.test(c.text.trim()),
    kind: DATE_HEAD.test(c.text.trim()) ? 'date' : DESC_HEAD.test(c.text.trim()) ? 'desc' : 'other',
  }))
}

/** Nearest numeric column by right edge / centre (amounts are normally right-aligned under their header). */
function numericColumn(cell: Cell, cols: Col[]): Col | null {
  let best: Col | null = null, bestD = Infinity
  for (const c of cols) {
    if (!c.numeric) continue
    const d = Math.min(Math.abs(cell.x2 - c.x2), Math.abs((cell.x1 + cell.x2) / 2 - (c.x1 + c.x2) / 2), Math.abs(cell.x1 - c.x1))
    if (d < bestD) { bestD = d; best = c }
  }
  return best
}

function textColumn(cell: Cell, cols: Col[]): Col {
  const nonNumeric = cols.filter((c) => !c.numeric)
  let best = nonNumeric[0]
  for (const c of nonNumeric) if (cell.x1 >= c.x1 - 3) best = c
  return best
}

/** Most common 4-digit year in the document, for statements that print dates like "25 Aug". */
function guessYear(lines: Line[]): number {
  const counts = new Map<number, number>()
  for (const l of lines) for (const m of l.cells.map((c) => c.text).join(' ').matchAll(/\b(20\d{2})\b/g)) counts.set(+m[1], (counts.get(+m[1]) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? new Date().getFullYear()
}

function withYear(s: string, year: number): string {
  if (parseDate(s)) return s
  if (/^\d{1,2}[\s-]+[A-Za-z]{3}[A-Za-z]*\.?$/.test(s)) return `${s} ${year}`
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})$/)
  return m ? `${m[1]}/${m[2]}/${year}` : s
}

export function buildTable(items: TextItem[]): PdfTable | null {
  const lines = toLines(items)
  if (!lines.length) return null
  const year = guessYear(lines)

  let cols: Col[] | null = null
  let headerless = false
  const rows: Record<string, string>[] = []
  const order: string[] = []

  // 1) Header-driven layout
  for (const line of lines) {
    const header = findHeader(line)
    if (header) { cols = header; if (!order.length) order.push(...header.map((c) => c.name)); continue }
    if (!cols) continue
    const dateCol = cols.find((c) => c.kind === 'date')!
    const descCol = cols.find((c) => c.kind === 'desc')!
    const first = line.cells[0]
    const startsRow = first && DATE_START.test(first.text) && first.x1 <= dateCol.x2 + 5
    const row: Record<string, string> = {}
    if (startsRow) {
      for (const cell of line.cells) {
        const col = isAmount(cell.text) && cols.some((c) => c.numeric) && cell !== first ? numericColumn(cell, cols)! : textColumn(cell, cols)
        const target = cell === first ? dateCol : col
        row[target.name] = row[target.name] ? `${row[target.name]} ${cell.text}` : cell.text
      }
      row[dateCol.name] = withYear(row[dateCol.name], year)
      rows.push(row)
    } else if (rows.length) {
      const text = line.cells.filter((c) => !isAmount(c.text)).map((c) => c.text).join(' ')
      const hasNumbers = line.cells.some((c) => isAmount(c.text))
      if (text && !hasNumbers && !NOISE.test(text) && line.cells[0].x1 >= descCol.x1 - 3) {
        const prev = rows[rows.length - 1]
        prev[descCol.name] = `${prev[descCol.name] ?? ''} ${text}`.trim()
      }
    }
  }

  // 2) No header found: treat any line starting with a date as a row, last numbers = amount (+ balance)
  if (!cols) {
    headerless = true
    order.push('Date', 'Description', 'Amount', 'Balance')
    for (const line of lines) {
      const first = line.cells[0]
      if (!first || !DATE_START.test(first.text)) continue
      const nums = line.cells.slice(1).filter((c) => isAmount(c.text))
      if (!nums.length) continue
      const text = line.cells.slice(1).filter((c) => !nums.includes(c)).map((c) => c.text).join(' ')
      const row: Record<string, string> = { Date: withYear(first.text, year), Description: text, Amount: nums[nums.length >= 2 ? nums.length - 2 : 0].text }
      if (nums.length >= 2) row.Balance = nums[nums.length - 1].text
      rows.push(row)
    }
  }

  const clean = rows.filter((r) => Object.values(r).some(Boolean))
  if (!clean.length) return null
  const headers = order.length ? order : Object.keys(clean[0])
  const full = clean.map((r) => Object.fromEntries(headers.map((h) => [h, (r[h] ?? '').trim()])))
  const inferred = inferDirections(full, headers)
  return { headers, rows: full, preamble: 0, headerless, inferredFromBalance: inferred }
}

const hasMarker = (s: string) => /[-−–(]|\b(cr|dr)\b\.?$/i.test(s.trim()) || /(cr|dr)\.?$/i.test(s.trim())

/**
 * Banks often print unsigned amounts next to a running balance. Money in vs out is then worked
 * out from how the balance moved, trying both top-to-bottom and bottom-to-top ordering.
 * Mutates `rows` (adds a leading "-" to outflows). Returns how many rows were inferred.
 */
export function inferDirections(rows: Record<string, string>[], headers: string[]): number {
  const amtH = headers.find((h) => /^amount$/i.test(h)), balH = headers.find((h) => /^balance$/i.test(h))
  if (!amtH || !balH || rows.length < 2) return 0
  const amt = rows.map((r) => parseAmount(r[amtH])), bal = rows.map((r) => parseAmount(r[balH]))
  if (amt.some((a) => a == null) || bal.some((b) => b == null)) return 0
  const A = amt as number[], B = bal as number[]
  const near = (a: number, b: number) => Math.abs(a - b) <= 1
  let asc = 0, desc = 0
  for (let i = 1; i < rows.length; i++) {
    if (near(Math.abs(B[i] - B[i - 1]), Math.abs(A[i]))) asc++
    if (near(Math.abs(B[i - 1] - B[i]), Math.abs(A[i - 1]))) desc++
  }
  const best = Math.max(asc, desc)
  if (best < (rows.length - 1) * 0.6) return 0
  const ascending = asc >= desc
  let n = 0
  rows.forEach((r, i) => {
    if (hasMarker(r[amtH])) return
    const prev = ascending ? i - 1 : i + 1
    if (prev < 0 || prev >= rows.length) return
    // The balance step that produced this row: from the row above (oldest first) or below (newest first).
    const delta = B[i] - B[prev]
    if (delta < 0) { r[amtH] = `-${r[amtH].replace(/^[-−–]/, '')}`; n++ } else n++
  })
  return n
}
