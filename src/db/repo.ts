import type { BackupFile, Settings, Transaction } from '@/types'
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
