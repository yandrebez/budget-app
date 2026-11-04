import type { Category, Group, Transaction } from '@/types'
import { db } from '@/db/db'
import { updateSettings } from '@/db/repo'
import { newId } from '@/lib/id'
import { fingerprints } from './parsers/csv'
import type { WorkbookPlan } from './parsers/workbook'

export interface ApplyOptions {
  /** Which parts of the plan to write. */
  include: { settings: boolean; budget: boolean; debts: boolean; pots: boolean; transactions: boolean }
  /** `fresh` erases existing budget data first; `merge` adds to / updates what exists. */
  mode: 'merge' | 'fresh'
  /** Account (by name) that receives the workbook's opening balance. */
  openingAccount?: string
}

export interface ApplyResult { categories: number; transactions: number; skippedDuplicates: number; debts: number; pots: number }

const k = (s: string) => s.trim().toLowerCase()

export async function applyPlan(plan: WorkbookPlan, { include, mode, openingAccount }: ApplyOptions): Promise<ApplyResult> {
  const result: ApplyResult = { categories: 0, transactions: 0, skippedDuplicates: 0, debts: 0, pots: 0 }
  await db.transaction('rw', [db.groups, db.categories, db.accounts, db.transactions, db.debts, db.pots, db.rules], async () => {
    if (mode === 'fresh') {
      await Promise.all([db.groups, db.categories, db.accounts, db.transactions, db.debts, db.pots, db.rules].map((t) => t.clear()))
    }
    const groups = new Map((await db.groups.toArray()).map((g) => [k(g.name), g]))
    const cats = new Map((await db.categories.toArray()).map((c) => [`${c.groupId}|${k(c.name)}`, c]))
    const catByName = new Map((await db.categories.toArray()).map((c) => [k(c.name), c]))

    const ensureGroup = async (name: string, kind: Group['kind']): Promise<Group> => {
      let g = groups.get(k(name))
      if (!g) { g = { id: newId(), name, kind, order: groups.size }; await db.groups.add(g); groups.set(k(name), g) }
      return g
    }
    const ensureCategory = async (name: string, groupName: string, kind: Group['kind'], budget: number, notes?: string) => {
      const g = await ensureGroup(groupName, kind)
      const existing = cats.get(`${g.id}|${k(name)}`) ?? catByName.get(k(name))
      if (existing) {
        if (include.budget) await db.categories.update(existing.id, { monthlyBudget: budget, ...(notes ? { notes } : {}) })
        return existing
      }
      const c: Category = { id: newId(), name, groupId: g.id, monthlyBudget: budget, ...(notes ? { notes } : {}) }
      await db.categories.add(c); cats.set(`${g.id}|${k(name)}`, c); catByName.set(k(name), c); result.categories++
      return c
    }

    const needCategories = include.budget || include.transactions || include.debts || include.pots
    if (needCategories) {
      const kinds = new Map(plan.groups.map((g) => [g.name, g.kind]))
      for (const c of plan.categories) await ensureCategory(c.name, c.group, kinds.get(c.group) ?? 'expense', include.budget ? c.monthlyBudget : 0, c.notes)
    }

    if (include.debts) {
      const existing = new Map((await db.debts.toArray()).map((d) => [k(d.name), d]))
      for (const d of plan.debts) {
        const row = { name: d.name, balance: d.balance, interestRate: d.interestRate, categoryId: d.category ? catByName.get(k(d.category))?.id ?? null : null }
        const prev = existing.get(k(d.name))
        if (prev) await db.debts.update(prev.id, row); else await db.debts.add({ id: newId(), ...row })
        result.debts++
      }
    }
    if (include.pots) {
      const existing = new Map((await db.pots.toArray()).map((p) => [k(p.name), p]))
      for (const p of plan.pots) {
        const row = { name: p.name, balance: p.balance, target: p.target, categoryId: p.category ? catByName.get(k(p.category))?.id ?? null : null }
        const prev = existing.get(k(p.name))
        if (prev) await db.pots.update(prev.id, row); else await db.pots.add({ id: newId(), ...row })
        result.pots++
      }
    }

    if (include.transactions) {
      const accounts = new Map((await db.accounts.toArray()).map((a) => [k(a.name), a]))
      for (const name of plan.accounts) {
        if (!accounts.has(k(name))) { const a = { id: newId(), name, openingBalance: 0 }; await db.accounts.add(a); accounts.set(k(name), a) }
      }
      const opening = openingAccount && accounts.get(k(openingAccount))
      if (opening && plan.openingBalance) await db.accounts.update(opening.id, { openingBalance: plan.openingBalance })
      const hashes = fingerprints(plan.transactions)
      const seen = new Set((await db.transactions.where('importHash').anyOf(hashes).toArray()).map((t) => t.importHash))
      const rows: Transaction[] = []
      plan.transactions.forEach((t, i) => {
        if (seen.has(hashes[i])) { result.skippedDuplicates++; return }
        rows.push({
          id: newId(), date: t.date, accountId: accounts.get(k(t.account))!.id,
          categoryId: t.category ? catByName.get(k(t.category))?.id ?? null : null,
          description: t.description, moneyIn: t.moneyIn, moneyOut: t.moneyOut, importHash: hashes[i],
        })
      })
      await db.transactions.bulkAdd(rows)
      result.transactions = rows.length
    }
  })
  if (include.settings && plan.settings) await updateSettings(plan.settings)
  return result
}
