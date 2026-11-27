import type { BackupFile, BonusPlan, Settings, Transaction } from '@/types'
import { budgetPatch, type BudgetScope } from '@/domain/budget/budgets'
import { newId } from '@/lib/id'
import { db } from './db'
import { defaultGroups, defaultSettings } from './defaults'

const TABLES = ['settings', 'accounts', 'groups', 'categories', 'transactions', 'debts', 'pots', 'rules'] as const

/** Creates the settings row and structural groups on first launch. Idempotent. */
export async function ensureSeed(): Promise<void> {
  await db.transaction('rw', db.settings, db.groups, async () => {
    if (!(await db.settings.get('main'))) await db.settings.add(defaultSettings())
    if ((await db.groups.count()) === 0) await db.groups.bulkAdd(defaultGroups())
  })
}

export const updateSettings = (patch: Partial<Settings>) => db.settings.update('main', patch)

/** Inserts transactions, skipping any whose fingerprint is already stored. Returns how many were added. */
export async function addImported(txs: Transaction[]): Promise<number> {
  const hashes = txs.map((t) => t.importHash).filter((h): h is string => !!h)
  const existing = new Set((await db.transactions.where('importHash').anyOf(hashes).toArray()).map((t) => t.importHash))
  const fresh = txs.filter((t) => !t.importHash || !existing.has(t.importHash))
  await db.transactions.bulkAdd(fresh)
  return fresh.length
}

export async function existingHashes(hashes: string[]): Promise<Set<string>> {
  const rows = await db.transactions.where('importHash').anyOf(hashes).toArray()
  return new Set(rows.map((r) => r.importHash as string))
}

export async function exportBackup(): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {}
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  return { version: 1, exportedAt: new Date().toISOString(), data }
}

export async function importBackup(file: BackupFile): Promise<void> {
  if (file?.version !== 1 || typeof file.data !== 'object') throw new Error('Not a valid backup file')
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear()
      await db.table(t).bulkAdd((file.data[t] as object[]) ?? [])
    }
  })
}

export async function wipeAll(): Promise<void> {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear()
  })
  await ensureSeed()
}

/** Id of the category used for moving money between your own accounts, created on first use. */
export async function ensureTransferCategory(): Promise<string> {
  return db.transaction('rw', db.groups, db.categories, async () => {
    const groups = await db.groups.toArray()
    let group = groups.find((g) => g.kind === 'transfer')
    if (!group) {
      group = { id: newId(), name: 'Transfers', kind: 'transfer', order: groups.length }
      await db.groups.add(group)
    }
    const existing = (await db.categories.toArray()).filter((c) => c.groupId === group.id).sort((a, b) => a.name.localeCompare(b.name))[0]
    if (existing) return existing.id
    const category = { id: newId(), name: 'Transfer between accounts', groupId: group.id, monthlyBudget: 0 }
    await db.categories.add(category)
    return category.id
  })
}

/** Gives a category a new budget amount from a period onward (or for every month), without touching anything else. */
export async function setCategoryBudget(id: string, periodKey: string, cents: number, scope: BudgetScope): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    const c = await db.categories.get(id)
    if (!c) return
    const { budgets, monthlyBudget } = budgetPatch(c, periodKey, cents, scope)
    const next = { ...c, monthlyBudget }
    if (budgets) next.budgets = budgets
    else delete next.budgets
    await db.categories.put(next)
  })
}

/** Changes the bonus plans in one safe step (read, change, write), so quick edits never overwrite each other. */
export async function updateBonuses(change: (current: BonusPlan[]) => BonusPlan[]): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await db.settings.get('main')
    if (s) await db.settings.update('main', { bonuses: change(s.bonuses ?? []) })
  })
}
