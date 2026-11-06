import { cellType, colLetter, isEmptyCell, text, type Cell, type CellType, type Sheet } from './sheet'

/** A block of cells with a header row on top, found purely from how the cells look. */
export interface ScannedTable {
  id: string
  sheet: string
  sheetIndex: number
  /** Order of the table inside the workbook (sheet by sheet, top to bottom, left to right). */
  order: number
  headers: string[]
  /** Data rows, each aligned to `headers`. */
  rows: Cell[][]
  /** 1-based sheet row numbers, for messages. */
  rowNumbers: number[]
  range: string
}

const MAX_GAP = 3
/** A totals row: "Total", "Subtotal", "Grand total", or an upper-case label such as "TOTAL OUT" / "BUSINESS TOTAL". "Total Wine" is data. */
export const isTotalText = (t: string): boolean =>
  /^(sub ?total|grand total|totals?)\s*(\(.*\))?[:.]*$/i.test(t.trim()) || /^TOTAL\b/.test(t.trim()) || /\bTOTAL$/.test(t.trim())

type Seg = [number, number]

const width = (s: Seg) => s[1] - s[0] + 1
const overlap = (a: Seg, b: Seg) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]) + 1)

/** Runs of consecutive non-empty cells in a row. */
function segments(row: readonly unknown[] | undefined): Seg[] {
  const out: Seg[] = []
  if (!row) return out
  let start = -1
  for (let c = 0; c <= row.length; c++) {
    const filled = c < row.length && !isEmptyCell(row[c])
    if (filled && start < 0) start = c
    if (!filled && start >= 0) { out.push([start, c - 1]); start = -1 }
  }
  return out
}

const isLongText = (v: unknown) => cellType(v) === 'text' && (text(v).length > 60 || text(v).split(/\s+/).length > 8)

/** A sentence sitting in the last (or first) header cell is a note, not a column: drop it from the edge. */
function trimNotes(row: readonly unknown[], seg: Seg): Seg | null {
  let [a, b] = seg
  while (a <= b && isLongText(row[a])) a++
  while (b >= a && isLongText(row[b])) b--
  return b - a + 1 >= 2 ? [a, b] : null
}

/** Header rows are short labels: two or more cells, all plain text, none a number or date. */
function isHeaderSegment(row: readonly unknown[], seg: Seg): boolean {
  if (width(seg) < 2) return false
  let total = 0
  for (let c = seg[0]; c <= seg[1]; c++) {
    const v = row[c]
    if (cellType(v) !== 'text') return false
    const s = text(v)
    if (s.length > 60 || s.split(/\s+/).length > 8) return false
    total += s.length
  }
  return total / width(seg) <= 40
}

/** The dominant type of each column among the rows collected so far. */
function dominantTypes(rows: Cell[][], cols: number): (CellType | null)[] {
  return Array.from({ length: cols }, (_, c) => {
    const counts: Record<string, number> = {}
    let filled = 0
    for (const r of rows) { const t = cellType(r[c]); if (t !== 'empty') { counts[t] = (counts[t] ?? 0) + 1; filled++ } }
    if (!filled) return null
    const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return n / filled >= 0.7 ? (best as CellType) : null
  })
}

/**
 * After a blank gap, is this row the same kind of row as the table above it? Dated columns must hold a date;
 * number columns hold a number or are left empty (a money-out row has no money-in).
 */
function continuesTable(slice: Cell[], rows: Cell[][]): boolean {
  if (rows.length < 3) return false
  const dom = dominantTypes(rows, slice.length)
  let matched = 0
  for (let c = 0; c < slice.length; c++) {
    if (dom[c] !== 'date' && dom[c] !== 'number') continue
    const t = cellType(slice[c])
    if (t === dom[c]) matched++
    else if (!(dom[c] === 'number' && t === 'empty')) return false
  }
  return matched > 0 && slice.filter((v) => !isEmptyCell(v)).length >= 2
}

function extract(g: readonly (readonly unknown[])[], r: number, seg: Seg, sheet: string, sheetIndex: number, order: number): ScannedTable | null {
  const headers = []
  for (let c = seg[0]; c <= seg[1]; c++) headers.push(text(g[r][c]))
  const cols = headers.length
  const rows: Cell[][] = []
  const rowNumbers: number[] = []
  let blanks = 0
  for (let rr = r + 1; rr < g.length; rr++) {
    const slice: Cell[] = []
    for (let c = seg[0]; c <= seg[1]; c++) slice.push(g[rr]?.[c] as Cell)
    const filled = slice.filter((v) => !isEmptyCell(v)).length
    if (filled === 0) { if (++blanks > MAX_GAP) break; continue }
    const first = slice.find((v) => !isEmptyCell(v))
    if (typeof first === 'string' && isTotalText(first)) break
    const dom = rows.length >= 2 ? dominantTypes(rows, cols) : []
    const hasNumeric = dom.some((t) => t === 'date' || t === 'number')
    // Another header row, or a lone caption, ends a table that is clearly numeric/dated.
    if (hasNumeric && isHeaderSegment(slice, [0, cols - 1])) break
    if (hasNumeric && filled === 1 && cellType(first) === 'text') break
    if (blanks > 0 && !continuesTable(slice, rows)) break
    blanks = 0
    rows.push(slice)
    rowNumbers.push(rr + 1)
  }
  if (!rows.length) return null
  const range = `${colLetter(seg[0])}${r + 1}:${colLetter(seg[1])}${rowNumbers[rowNumbers.length - 1]}`
  return { id: `${sheetIndex}:${r}:${seg[0]}`, sheet, sheetIndex, order, headers, rows, rowNumbers, range }
}

/** Finds every table on every sheet. Sheet names and positions are never used. */
export function scanSheets(sheets: readonly Sheet[]): ScannedTable[] {
  const tables: ScannedTable[] = []
  sheets.forEach((s, si) => {
    const g = s.data
    let prev: Seg[] = []
    const spans: { r0: number; r1: number; seg: Seg }[] = []
    for (let r = 0; r < g.length; r++) {
      const row = g[r] ?? []
      const cands = segments(row).map((seg) => trimNotes(row, seg)).filter((seg): seg is Seg => !!seg && isHeaderSegment(row, seg))
      for (const seg of cands) {
        // In a run of all-text rows only the first is the header; the rest are its data.
        if (prev.some((p) => overlap(p, seg) >= width(seg) * 0.5)) continue
        // A text-only data row inside a table already found is not a new header.
        if (spans.some((sp) => r > sp.r0 && r <= sp.r1 && overlap(sp.seg, seg) >= width(seg) * 0.5)) continue
        const t = extract(g, r, seg, s.sheet, si, tables.length)
        if (t) { tables.push(t); spans.push({ r0: r, r1: t.rowNumbers[t.rowNumbers.length - 1] - 1, seg }) }
      }
      prev = cands
    }
  })
  return tables
}
