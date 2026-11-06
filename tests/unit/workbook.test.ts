import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import readXlsx from 'read-excel-file/universal'
import { applyPlan } from '@/features/import/applyWorkbook'
import { parseWorkbook, type WorkbookPlan } from '@/features/import/parsers/workbook'
import { db } from '@/db/db'
import { ensureSeed } from '@/db/repo'

const load = async (): Promise<WorkbookPlan> => {
  const buf = readFileSync('tests/fixtures/sample-budget.xlsx')
  return parseWorkbook(await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)))
}
const all = { settings: true, budget: true, accounts: true, debts: true, pots: true, transactions: true }

describe('parseWorkbook', () => {
  it('reads groups, budgets and notes by header', async () => {
    const p = await load()
    expect(p.groups.map((g) => [g.name, g.kind])).toEqual([
      ['Income', 'income'], ['Fixed', 'expense'], ['Debt', 'debt'], ['Variable', 'expense'], ['Savings', 'savings'], ['Transfer', 'transfer'], ['Imported', 'expense'],
    ])
    const rent = p.categories.find((c) => c.name === 'Rent')!
    expect(rent).toMatchObject({ group: 'Fixed', monthlyBudget: 400000, notes: 'Landlord' })
    expect(p.categories.find((c) => c.name === 'Gifts')).toMatchObject({ group: 'Variable', monthlyBudget: 0 }) // only on Setup
    expect(p.categories.some((c) => /total/i.test(c.name))).toBe(false)
  })
  it('reads transactions, skipping bad rows and flagging unknown categories', async () => {
    const p = await load()
    expect(p.transactions).toHaveLength(6)
    expect(p.transactions[2]).toEqual({ date: '2026-10-25', account: 'Main', category: 'Groceries', description: 'Corner shop', moneyIn: 0, moneyOut: 25050 })
    // A negative "Money out" is a refund (the sheet's own maths is in minus out), not an expense.
    expect(p.transactions[5]).toMatchObject({ description: 'Refund as negative out', moneyIn: 2000, moneyOut: 0 })
    expect(p.openingBalance).toBe(5000)
    expect(p.accounts.map((a) => a.name).sort()).toEqual(['Main', 'Savings acc'])
    expect(p.warnings.join(' ')).toMatch(/1 transaction row/)
    expect(p.categories.find((c) => c.name === 'Mystery')?.group).toBe('Imported')
  })
  it('reads debts (rate as fraction or percent), pots, and links by name', async () => {
    const p = await load()
    expect(p.debts).toEqual([
      { name: 'Loan A', balance: 5000000, interestRate: 0.12, category: 'Loan A' },
      { name: 'Card B', balance: 0, interestRate: 0.2, category: null },
    ])
    expect(p.pots.map((x) => [x.name, x.balance, x.target])).toEqual([['Rainy day', 120000, 500000], ['Holiday fund', 30000, 200000]])
  })
  it('detects pay day, weekend rule and holidays', async () => {
    expect((await load()).settings).toEqual({ payDay: 25, weekendRule: 'before', holidays: ['2026-01-01', '2026-12-25'] })
  })
  it('explains an unrecognised workbook', () => {
    const p = parseWorkbook([{ sheet: 'Random', data: [['a', 'b']] }])
    expect(p.warnings[0]).toMatch(/Nothing recognisable.*Random/)
  })
})

describe('applyPlan', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    await ensureSeed()
  })

  it('populates the app, reusing matching default groups', async () => {
    const r = await applyPlan(await load(), { include: all, mode: 'merge' })
    expect(r).toMatchObject({ transactions: 6, debts: 2, pots: 2, skippedDuplicates: 0 })
    expect((await db.groups.filter((g) => g.name === 'Income').count())).toBe(1) // not duplicated
    const loan = await db.categories.filter((c) => c.name === 'Loan A').first()
    expect((await db.debts.toArray()).find((d) => d.name === 'Loan A')?.categoryId).toBe(loan!.id)
    expect((await db.settings.get('main'))).toMatchObject({ payDay: 25, weekendRule: 'before' })
    expect(await db.accounts.count()).toBe(2)
  })

  it('is safe to import twice (no duplicate transactions or categories)', async () => {
    const plan = await load()
    await applyPlan(plan, { include: all, mode: 'merge' })
    const cats = await db.categories.count()
    const again = await applyPlan(plan, { include: all, mode: 'merge' })
    expect(again.transactions).toBe(0)
    expect(again.skippedDuplicates).toBe(6)
    expect(await db.categories.count()).toBe(cats)
    expect(await db.transactions.count()).toBe(6)
  })

  it('puts the opening balance on the chosen account', async () => {
    await applyPlan(await load(), { include: all, mode: 'merge', openingAccount: 'Savings acc' })
    expect((await db.accounts.filter((a) => a.name === 'Savings acc').first())?.openingBalance).toBe(5000)
    expect((await db.accounts.filter((a) => a.name === 'Main').first())?.openingBalance).toBe(0)
  })

  it('respects unticked sections and fresh mode', async () => {
    await db.accounts.add({ id: 'old', name: 'Old', openingBalance: 0 })
    await applyPlan(await load(), { include: { ...all, transactions: false, debts: false, accounts: false }, mode: 'fresh' })
    expect(await db.transactions.count()).toBe(0)
    expect(await db.debts.count()).toBe(0)
    expect(await db.accounts.count()).toBe(0)
    expect(await db.pots.count()).toBe(2)
  })
})
