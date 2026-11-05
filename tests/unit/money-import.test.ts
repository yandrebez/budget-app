import { describe, expect, it } from 'vitest'
import { parseAmount, parseTypedNumber } from '@/lib/money'
import { parseDate } from '@/features/import/parsers/dates'
import { detectBank, fingerprints, guessMapping, mapRows, parseCsv } from '@/features/import/parsers/csv'

describe('parseAmount', () => {
  it.each([
    ['1,234.56', 123456], ['R 1 234,56', 123456], ['-12.5', -1250], ['(50.00)', -5000],
    ['12.50 Dr', -1250], ['12.50 Cr', 1250], ['1,234', 123400], ['12,5', 1250], ['1.234.567,89', 123456789],
  ])('%s -> %i', (input, cents) => expect(parseAmount(input)).toBe(cents))
  it('rejects non numbers', () => { expect(parseAmount('abc')).toBeNull(); expect(parseAmount('')).toBeNull() })
})

describe('parseDate', () => {
  it.each([
    ['2026-08-25', '2026-08-25'], ['2026/08/25', '2026-08-25'], ['25/08/2026', '2026-08-25'],
    ['25 Aug 2026', '2026-08-25'], ['20260825', '2026-08-25'],
  ])('%s', (i, o) => expect(parseDate(i)).toBe(o))
  it('honours month-first', () => expect(parseDate('08/25/2026', 'MDY')).toBe('2026-08-25'))
  it('rejects impossible dates', () => expect(parseDate('31/02/2026')).toBeNull())
})

describe('csv import', () => {
  const capitec = 'Nr,Account,Posting Date,Transaction Date,Description,Money In,Money Out,Balance\n1,X,2026-08-25,2026-08-24,Woolworths 123,,150.50,100\n2,X,2026-08-26,2026-08-26,Salary,14850.00,,500'
  it('maps in/out columns and detects the layout', () => {
    const p = parseCsv(capitec)
    expect(detectBank(p.headers)).toBe('Capitec')
    const m = guessMapping(p.headers)
    expect(m.date).toBe('Transaction Date')
    const { txs } = mapRows(p.rows, m as never)
    expect(txs).toEqual([
      { date: '2026-08-24', description: 'Woolworths 123', moneyIn: 0, moneyOut: 15050 },
      { date: '2026-08-26', description: 'Salary', moneyIn: 1485000, moneyOut: 0 },
    ])
  })
  it('skips preamble lines and uses a signed amount column', () => {
    const p = parseCsv('Account: 123\nStatement\nDate,Amount,Balance,Description\n2026/08/01,-99.99,10,Netflix\n2026/08/02,500,510,Refund')
    expect(p.preamble).toBe(2)
    expect(detectBank(p.headers)).toBe('FNB')
    const { txs } = mapRows(p.rows, guessMapping(p.headers) as never)
    expect(txs.map((t) => [t.moneyIn, t.moneyOut])).toEqual([[0, 9999], [50000, 0]])
  })
  it('reports bad rows', () => {
    const p = parseCsv('Date,Description,Amount\nnope,x,1\n2026-01-01,y,abc')
    expect(mapRows(p.rows, guessMapping(p.headers) as never).issues).toHaveLength(2)
  })
  it('keeps genuine same-day duplicates distinct but stable', () => {
    const t = { date: '2026-01-01', description: 'Coffee', moneyIn: 0, moneyOut: 3000 }
    const [a, b] = fingerprints([t, t])
    expect(a).not.toBe(b)
    expect(fingerprints([t, t])).toEqual([a, b])
  })
})

describe('parseTypedNumber (amount boxes)', () => {
  it.each([
    ['3928,09', 3928.09], ['3928.09', 3928.09], ['12,5', 12.5], ['1 234,56', 1234.56], ['1,234.56', 1234.56],
    ['1.234,56', 1234.56], ['1,234,567', 1234567], ['12,', 12], ['-198,63', -198.63], ['0', 0],
  ])('%s -> %d', (input, n) => expect(parseTypedNumber(input)).toBe(n))
  it('returns null until there is a number', () => {
    for (const t of ['', '-', ',', '.', ' ', 'abc']) expect(parseTypedNumber(t)).toBeNull()
  })
})
