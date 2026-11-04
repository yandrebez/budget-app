import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractItems } from '@/features/import/parsers/pdf'
import { buildTable, inferDirections, type TextItem } from '@/features/import/parsers/pdfTable'
import { guessMapping, mapRows } from '@/features/import/parsers/csv'

const load = async (name: string) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const buf = readFileSync(`tests/fixtures/${name}`)
  return extractItems(pdfjs as never, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}
const toTxs = (t: NonNullable<ReturnType<typeof buildTable>>) => mapRows(t.rows, { dateFormat: 'auto', ...guessMapping(t.headers) } as never).txs

describe('PDF statements', () => {
  it('reads a header table and works out money in/out from the running balance', async () => {
    const t = buildTable(await load('statement-balance.pdf'))!
    expect(t.headers).toEqual(['Date', 'Description', 'Amount', 'Balance'])
    expect(t.headerless).toBe(false)
    expect(toTxs(t).map((x) => [x.date, x.description, x.moneyIn, x.moneyOut])).toEqual([
      ['2026-10-01', 'Opening salary', 1000000, 0],
      ['2026-10-02', 'Corner shop', 0, 25050],
      ['2026-10-03', 'Phone bill', 0, 30000],
      ['2026-10-04', 'Refund', 7500, 0],
    ])
  })
  it('reads separate money in / money out columns with yyyy/mm/dd dates', async () => {
    const t = buildTable(await load('statement-inout.pdf'))!
    expect(toTxs(t).map((x) => [x.description, x.moneyIn, x.moneyOut])).toEqual([
      ['Salary', 1000000, 0], ['Corner shop', 0, 25050], ['Pharmacy', 0, 9999],
    ])
  })
})

const item = (str: string, x: number, y: number, page = 1): TextItem => ({ str, x, y, width: str.length * 5, height: 9, page })

describe('buildTable edge cases', () => {
  it('appends wrapped description lines and infers the year for "25 Aug" dates', () => {
    const t = buildTable([
      item('Statement 2026', 40, 800),
      item('Date', 40, 700), item('Description', 100, 700), item('Amount', 400, 700),
      item('25 Aug', 40, 680), item('Long merchant name', 100, 680), item('-50.00', 400, 680),
      item('continued reference', 100, 668),
    ])!
    expect(t.rows[0].Date).toBe('25 Aug 2026')
    expect(t.rows[0].Description).toBe('Long merchant name continued reference')
  })
  it('falls back to guessing columns when there is no header', () => {
    const t = buildTable([item('01/10/2026', 40, 700), item('Shop', 120, 700), item('10.00', 400, 700), item('90.00', 480, 700)])!
    expect(t.headerless).toBe(true)
    expect(t.rows[0]).toMatchObject({ Date: '01/10/2026', Description: 'Shop', Amount: '10.00', Balance: '90.00' })
  })
  it('reads multi-page tables and returns null for text with no rows', () => {
    const t = buildTable([
      item('Date', 40, 700), item('Description', 100, 700), item('Amount', 400, 700),
      item('01/10/2026', 40, 680), item('A', 100, 680), item('1.00', 400, 680),
      item('02/10/2026', 40, 700, 2), item('B', 100, 700, 2), item('2.00', 400, 700, 2),
    ])!
    expect(t.rows.map((r) => r.Description)).toEqual(['A', 'B'])
    expect(buildTable([item('Hello world', 40, 700)])).toBeNull()
  })
  it('handles newest-first statements', () => {
    const rows = [
      { Amount: '75.00', Balance: '9,574.50' }, // refund (in)
      { Amount: '300.00', Balance: '9,499.50' }, // phone (out)
      { Amount: '250.50', Balance: '9,799.50' }, // shop (out)
      { Amount: '10,000.00', Balance: '10,050.00' }, // salary: oldest, direction unknown without an opening balance
    ]
    inferDirections(rows, ['Amount', 'Balance'])
    expect(rows.slice(0, 3).map((r) => r.Amount.startsWith('-'))).toEqual([false, true, true])
  })
  it('leaves explicit Cr/Dr markers alone and skips unrelated tables', () => {
    const rows = [{ Amount: '5.00 Dr', Balance: '95.00' }, { Amount: '5.00', Balance: '100.00' }]
    inferDirections(rows, ['Amount', 'Balance'])
    expect(rows[0].Amount).toBe('5.00 Dr')
    expect(inferDirections([{ Amount: '1', Balance: '999' }, { Amount: '2', Balance: '5' }], ['Amount', 'Balance'])).toBe(0)
  })
})
