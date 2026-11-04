import Papa from 'papaparse'
import type { ColumnMapping, ISODate } from '@/types'
import { parseAmount } from '@/lib/money'
import { normalise } from '@/domain/transactions/categorise'
import { parseDate } from './dates'

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  /** Free-text lines above the header row (account info some banks add). */
  preamble: number
}

export interface ParsedTx {
  date: ISODate
  description: string
  moneyIn: number
  moneyOut: number
}

export interface RowIssue { line: number; reason: string }

const SYN = {
  date: ['transaction date', 'date', 'posting date', 'value date', 'trans date', 'processed date'],
  description: ['description', 'details', 'narrative', 'reference', 'transaction description', 'original description', 'memo'],
  amount: ['amount', 'transaction amount', 'value'],
  moneyIn: ['money in', 'credit', 'credits', 'credit amount', 'deposit', 'deposits', 'in'],
  moneyOut: ['money out', 'debit', 'debits', 'debit amount', 'withdrawal', 'withdrawals', 'out'],
}

const find = (headers: string[], names: string[]): string | undefined => {
  const lower = headers.map((h) => h.trim().toLowerCase())
  for (const n of names) {
    const i = lower.indexOf(n)
    if (i >= 0) return headers[i]
  }
  return undefined
}

/** Best-effort column guess from header names. The user can always correct it. */
export function guessMapping(headers: string[]): Partial<ColumnMapping> {
  const moneyIn = find(headers, SYN.moneyIn)
  const moneyOut = find(headers, SYN.moneyOut)
  return {
    date: find(headers, SYN.date),
    description: find(headers, SYN.description),
    amount: moneyIn && moneyOut ? undefined : find(headers, SYN.amount),
    moneyIn,
    moneyOut,
    dateFormat: 'auto',
  }
}

/** Looks for a recognisable bank layout. Labels only; mapping still comes from guessMapping. */
export function detectBank(headers: string[]): string | null {
  const h = new Set(headers.map((x) => x.trim().toLowerCase()))
  if (h.has('money in') && h.has('money out') && (h.has('posting date') || h.has('transaction date'))) return 'Capitec'
  if (h.has('date') && h.has('amount') && h.has('description') && h.has('balance')) return 'FNB'
  if (h.has('date') && h.has('description') && (h.has('amount') || h.has('debit'))) return 'Discovery Bank'
  return null
}

/** Reads CSV text, skipping any preamble lines before the real header row. */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, '')
  const grid = Papa.parse<string[]>(clean, { skipEmptyLines: 'greedy' }).data
  let headerIdx = 0
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const g = guessMapping(grid[i].map((c) => c ?? ''))
    if (g.date && g.description && (g.amount || (g.moneyIn && g.moneyOut))) { headerIdx = i; break }
  }
  const headers = (grid[headerIdx] ?? []).map((h) => (h ?? '').trim())
  const rows = grid.slice(headerIdx + 1)
    .filter((r) => r.some((c) => c && c.trim()))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))
  return { headers, rows, preamble: headerIdx }
}

export function mapRows(rows: Record<string, string>[], m: ColumnMapping): { txs: ParsedTx[]; issues: RowIssue[] } {
  const txs: ParsedTx[] = []
  const issues: RowIssue[] = []
  rows.forEach((row, idx) => {
    const date = parseDate(row[m.date], m.dateFormat)
    if (!date) return void issues.push({ line: idx + 1, reason: `Unreadable date "${row[m.date] ?? ''}"` })
    let moneyIn = 0
    let moneyOut = 0
    if (m.moneyIn || m.moneyOut) {
      moneyIn = Math.abs(parseAmount(m.moneyIn ? row[m.moneyIn] : '') ?? 0)
      moneyOut = Math.abs(parseAmount(m.moneyOut ? row[m.moneyOut] : '') ?? 0)
    } else if (m.amount) {
      const a = parseAmount(row[m.amount])
      if (a == null) return void issues.push({ line: idx + 1, reason: `Unreadable amount "${row[m.amount] ?? ''}"` })
      if (a >= 0) moneyIn = a; else moneyOut = -a
    }
    if (moneyIn === 0 && moneyOut === 0) return void issues.push({ line: idx + 1, reason: 'No amount' })
    txs.push({ date, description: (row[m.description] ?? '').trim(), moneyIn, moneyOut })
  })
  return { txs, issues }
}

/**
 * Fingerprints for duplicate detection. Identical rows within one file get an
 * occurrence suffix so two genuine same-day same-amount purchases both survive.
 */
export function fingerprints(txs: ParsedTx[]): string[] {
  const seen = new Map<string, number>()
  return txs.map((t) => {
    const base = `${t.date}|${t.moneyIn - t.moneyOut}|${normalise(t.description)}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return `${base}|${n}`
  })
}
