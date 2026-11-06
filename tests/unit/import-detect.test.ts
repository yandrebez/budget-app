import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import readXlsx from 'read-excel-file/universal'
import { autoDetect, buildPlan, parseWorkbook } from '@/features/import/parsers/workbook'
import { scanSheets } from '@/features/import/parsers/scan'
import { withRole } from '@/features/import/parsers/classify'
import type { Sheet } from '@/features/import/parsers/sheet'

const load = async (name: string) => {
  const buf = readFileSync(`tests/fixtures/${name}`)
  return readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) as Promise<Sheet[]>
}
const D = (s: string) => new Date(`${s}T00:00:00Z`)

describe('a workbook with a different shape (monthly sheets, side tables, fees, running balance)', () => {
  it('combines the monthly tabs into one transactions table and skips derived tables', async () => {
    const d = autoDetect(await load('sample-monthly.xlsx'))
    const tx = d.groups.filter((g) => g.role === 'transactions')
    expect(tx).toHaveLength(1)
    expect(tx[0].sheets).toEqual(['Sep-Oct 2026', 'Oct-Nov 2026'])
    expect(tx[0].rowCount).toBe(8)
    // The per-sheet account summary, the weekly tracker and the overview are other views of the same data.
    const enabled = d.groups.filter((g) => g.enabled).map((g) => g.role).sort()
    expect(enabled).toEqual(['accounts', 'budget', 'categories', 'goals', 'periods', 'transactions'])
    expect(d.groups.find((g) => g.sheets.includes('Overview'))?.role).toBe('ignore')
  })

  it('imports every transaction, adding bank fees to money out', async () => {
    const p = parseWorkbook(await load('sample-monthly.xlsx'))
    expect(p.transactions).toHaveLength(8)
    const rent = p.transactions.find((t) => t.description === 'Landlord')!
    expect(rent).toMatchObject({ account: 'Daily', category: 'Rent', moneyOut: 300200, moneyIn: 0 })
    expect(p.transactions.find((t) => t.description === 'Takeaway place')!.moneyOut).toBe(15150)
  })

  it('reads account types, and takes opening balances from the running balance column', async () => {
    const p = parseWorkbook(await load('sample-monthly.xlsx'))
    const by = Object.fromEntries(p.accounts.map((a) => [a.name, a]))
    expect(Object.keys(by).sort()).toEqual(['Biz Current', 'Daily', 'Fixed Deposit (Inv Account)', 'Rainy Day'])
    expect(by.Daily).toMatchObject({ kind: 'account', openingBalance: 50000 })
    expect(by['Rainy Day']).toMatchObject({ kind: 'savings', openingBalance: 200000 })
    expect(by['Fixed Deposit (Inv Account)']).toMatchObject({ kind: 'savings', openingBalance: 5000000 }) // no transactions: its balance
    expect(by['Biz Current'].kind).toBe('account')
  })

  it('warns when the accounts table disagrees with the transactions', async () => {
    const p = parseWorkbook(await load('sample-monthly.xlsx'))
    expect(p.warnings.join(' ')).toMatch(/"Daily": the accounts table says 6500.00 but the transactions add up to 14544.00/)
  })

  it('builds groups from the budget Type column and the category list', async () => {
    const p = parseWorkbook(await load('sample-monthly.xlsx'))
    expect(p.groups.map((g) => [g.name, g.kind])).toEqual([['Fixed', 'expense'], ['Variable', 'expense'], ['Transfer', 'transfer'], ['Income', 'income']])
    expect(p.categories.find((c) => c.name === 'Rent')).toMatchObject({ group: 'Fixed', monthlyBudget: 300000 })
    expect(p.categories.find((c) => c.name === 'Salary')).toMatchObject({ group: 'Income', monthlyBudget: 0 })
  })

  it('reads goals and the pay cycle (and does not mistake an "ends" column for weekend rules)', async () => {
    const p = parseWorkbook(await load('sample-monthly.xlsx'))
    expect(p.pots.map((x) => [x.name, x.balance, x.target])).toEqual([['Rainy Day', 210000, 500000], ['Holiday', 30000, 200000]])
    expect(p.settings).toEqual({ payDay: 25, weekendRule: 'none', holidays: [] })
  })
})

describe('scanner', () => {
  const sheet = (data: unknown[][]): Sheet[] => [{ sheet: 'S', data }]
  it('finds side-by-side tables, ignores titles and stops at TOTAL', () => {
    const t = scanSheets(sheet([
      ['My title'],
      ['Date', 'Note', 'Amount', null, 'Item', 'Cost'],
      [D('2026-01-01'), 'a', 10, null, 'x', 1],
      [D('2026-01-02'), 'b', 20, null, 'y', 2],
      ['TOTAL', null, 30],
    ]))
    expect(t.map((x) => [x.headers.join('|'), x.rows.length])).toEqual([['Date|Note|Amount', 2], ['Item|Cost', 2]])
  })
  it('bridges a blank row inside a ledger but not into an unrelated table below', () => {
    const t = scanSheets(sheet([
      ['Date', 'Description', 'Amount'],
      [D('2026-01-01'), 'a', 1], [D('2026-01-02'), 'b', 2], [D('2026-01-03'), 'c', 3],
      [null, null, null],
      [D('2026-01-04'), 'd', 4],
      [null, null, null],
      ['Notes', 'Value'],
      ['x', 1], ['y', 2],
    ]))
    expect(t[0].rows).toHaveLength(4)
    expect(t[1].headers).toEqual(['Notes', 'Value'])
  })
  it('bridges a blank row even when the next row leaves a numeric column empty (money out has no money in)', () => {
    const t = scanSheets(sheet([
      ['Date', 'Description', 'Money In', 'Money Out', 'Balance'],
      [D('2026-01-01'), 'a', 100, null, 100], [D('2026-01-02'), 'b', null, 10, 90], [D('2026-01-03'), 'c', 5, null, 95],
      [null, null, null, null, null],
      [D('2026-01-04'), 'd', null, 20, 75], [D('2026-01-05'), 'e', 30, null, 105],
    ]))
    expect(t).toHaveLength(1)
    expect(t[0].rows).toHaveLength(5)
  })
  it('drops a sentence from the edge of a header row instead of rejecting the whole table', () => {
    const t = scanSheets(sheet([
      ['Holiday', 'Date', 'Used to work out your payday. Add rows below to extend this list past the last year shown.'],
      ['New Year', D('2026-01-01')], ['Labour', D('2026-05-01')],
    ]))
    expect(t).toHaveLength(1)
    expect(t[0].headers).toEqual(['Holiday', 'Date'])
    expect(t[0].rows).toHaveLength(2)
  })
  it('does not end a table at a row that merely starts with the word Total', () => {
    const t = scanSheets(sheet([
      ['Category', 'Budget'], ['Total Wine', 100], ['TOTAL', 100], ['After', 5],
    ]))
    expect(t[0].rows.map((r) => r[0])).toEqual(['Total Wine'])
  })
  it('treats the first row of an all-text table as its header, and text values as numbers/dates when they look like them', () => {
    const t = scanSheets(sheet([['Category', 'Type'], ['A', 'Fixed'], ['B', 'Variable']]))
    expect(t).toHaveLength(1)
    expect(t[0].rows).toHaveLength(2)
  })
})

describe('lookalike tables', () => {
  it('prefers the full table over a dashboard summary of it', () => {
    const d = autoDetect([
      { sheet: 'Dashboard', data: [['Debt', 'Balance', 'Clears'], ['Car', 1000, 'in 2030'], ['Card', 50, 'in 2027']] },
      { sheet: 'Debts', data: [['Debt', 'Balance now', 'Interest rate', 'Payment'], ['Car', 1000, 0.12, 90], ['Card', 50, 0.2, 10]] },
    ])
    const used = d.groups.filter((g) => g.role === 'debts' && g.enabled)
    expect(used.map((g) => g.sheets[0])).toEqual(['Debts'])
    expect(buildPlan(d).debts.map((x) => [x.name, x.interestRate])).toEqual([['Car', 0.12], ['Card', 0.2]])
  })
})

describe('balance column trust', () => {
  const rows = (acct: string, balances: number[], nets: number[]) => balances.map((b, i) => [D(`2026-02-0${i + 1}`), acct, `${acct} ${i}`, nets[i] > 0 ? nets[i] : null, nets[i] < 0 ? -nets[i] : null, b])
  const head = ['Date', 'Account', 'Description', 'Money In', 'Money Out', 'Balance']

  it('derives each account\'s opening balance from its own balance column when it adds up', () => {
    const p = parseWorkbook([{ sheet: 'T', data: [head, ...rows('A', [110, 100, 130], [10, -10, 30]), ...rows('B', [550, 540], [50, -10])] }])
    const by = Object.fromEntries(p.accounts.map((a) => [a.name, a]))
    expect(by.A).toMatchObject({ openingBalance: 10000, openingSource: 'balance column' })
    expect(by.B).toMatchObject({ openingBalance: 50000, openingSource: 'balance column' })
  })

  it('still trusts the accounts that reconcile when another account does not', () => {
    const p = parseWorkbook([{ sheet: 'T', data: [head, ...rows('A', [110, 100, 130], [10, -10, 30]), ...rows('B', [550, 999], [50, -10])] }])
    expect(p.accounts.find((a) => a.name === 'A')).toMatchObject({ openingBalance: 10000, openingSource: 'balance column' })
    expect(p.accounts.find((a) => a.name === 'B')?.openingSource).toBeUndefined()
  })

  it('reads one running total across accounts as a single opening balance for the person to place', () => {
    const data = [
      head,
      [D('2026-02-01'), 'A', 'x', 10, null, 110], [D('2026-02-02'), 'B', 'y', null, 20, 90],
      [D('2026-02-03'), 'A', 'z', 5, null, 95], [D('2026-02-04'), 'B', 'w', null, 5, 90],
    ]
    const p = parseWorkbook([{ sheet: 'T', data }])
    expect(p.openingBalance).toBe(10000)
    expect(p.accounts.every((a) => a.openingBalance === null)).toBe(true)
  })
})

describe('when the importer cannot tell, the person can say', () => {
  const odd: Sheet[] = [{ sheet: 'Stuff', data: [
    ['When it happened', 'What for', 'Got', 'Gave', 'Where'],
    [D('2026-03-01'), 'Pay', 1000, null, 'Main'],
    [D('2026-03-02'), 'Shop', null, 40, 'Main'],
    [D('2026-03-03'), 'Bus', null, 15, 'Main'],
  ] }]

  it('does not guess at headings it does not know', () => {
    const d = autoDetect(odd)
    expect(d.groups[0].role).toBe('ignore')
    expect(buildPlan(d).transactions).toHaveLength(0)
    expect(buildPlan(d).warnings[0]).toMatch(/Nothing recognisable was found in: Stuff/)
  })

  it('imports it once the table is marked as transactions and the columns are chosen', () => {
    const d = autoDetect(odd)
    const g = withRole(d.groups[0], 'transactions')
    expect(g.mapping.date).toBe(0) // the date column is found from the cells themselves
    g.mapping = { ...g.mapping, description: 1, moneyIn: 2, moneyOut: 3, account: 4 }
    const p = buildPlan({ groups: [g] })
    expect(p.transactions.map((t) => [t.date, t.description, t.moneyIn, t.moneyOut, t.account])).toEqual([
      ['2026-03-01', 'Pay', 100000, 0, 'Main'], ['2026-03-02', 'Shop', 0, 4000, 'Main'], ['2026-03-03', 'Bus', 0, 1500, 'Main'],
    ])
    expect(p.accounts[0]).toMatchObject({ name: 'Main', kind: 'account' })
  })

  it('explains what is missing instead of silently importing nothing', () => {
    const g = withRole(autoDetect(odd).groups[0], 'transactions')
    g.mapping = { date: 0 }
    expect(buildPlan({ groups: [g] }).warnings.join(' ')).toMatch(/needs an amount/)
  })

  it('switches off a table that mostly repeats another so nothing counts twice', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => [D(`2026-04-0${i + 1}`), `Item ${i}`, 10 + i])
    const d = autoDetect([
      { sheet: 'All', data: [['Date', 'Description', 'Amount'], ...rows(5)] },
      { sheet: 'April', data: [['Date', 'Description', 'Money Out'], ...rows(4)] },
    ])
    const tx = d.groups.filter((g) => g.role === 'transactions')
    expect(tx).toHaveLength(2)
    expect(tx.filter((g) => g.enabled)).toHaveLength(1)
    expect(tx.find((g) => !g.enabled)?.note).toMatch(/same transactions/)
  })
})
