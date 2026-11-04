import { useEffect, useMemo, useState } from 'react'
import type { ColumnMapping, DateFormat, Transaction } from '@/types'
import { useApp } from '@/app/AppContext'
import { CategorySelect } from '@/components/CategorySelect'
import { Empty, Page } from '@/components/ui'
import { db } from '@/db/db'
import { addImported, existingHashes } from '@/db/repo'
import { categorise, patternFor } from '@/domain/transactions/categorise'
import { useAccounts, useCategories, useGroups, useRules } from '@/hooks/useBudgetData'
import { newId } from '@/lib/id'
import { detectBank, fingerprints, guessMapping, mapRows, parseCsv, type ParsedCsv } from './parsers/csv'

const PREVIEW_LIMIT = 300
const storeKey = (headers: string[]) => `import-mapping:${headers.join('|')}`

const loadMapping = (headers: string[]): Partial<ColumnMapping> => {
  try {
    const saved = localStorage.getItem(storeKey(headers))
    if (saved) return JSON.parse(saved)
  } catch { /* storage unavailable: fall back to guessing */ }
  return guessMapping(headers)
}

export function Import({ go }: { go: (tab: string) => void }) {
  const { fmt } = useApp()
  const groups = useGroups(), categories = useCategories(), accounts = useAccounts(), rules = useRules()
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>({})
  const [mode, setMode] = useState<'signed' | 'split'>('signed')
  const [accountId, setAccountId] = useState('')
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const [dupes, setDupes] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState('')

  const complete = !!(mapping.date && mapping.description && (mode === 'signed' ? mapping.amount : mapping.moneyIn || mapping.moneyOut))
  const mapped = useMemo(
    () => (csv && complete ? mapRows(csv.rows, { dateFormat: 'auto', ...mapping, ...(mode === 'signed' ? { moneyIn: undefined, moneyOut: undefined } : { amount: undefined }) } as ColumnMapping) : null),
    [csv, mapping, mode, complete],
  )
  const hashes = useMemo(() => (mapped ? fingerprints(mapped.txs) : []), [mapped])

  useEffect(() => {
    let on = true
    if (hashes.length) existingHashes(hashes).then((s) => on && setDupes(s))
    else setDupes(new Set())
    return () => { on = false }
  }, [hashes])

  const autoCat = useMemo(() => (mapped && rules ? mapped.txs.map((t) => categorise(t.description, rules) ?? '') : []), [mapped, rules])
  const catFor = (i: number) => overrides[i] ?? autoCat[i] ?? ''

  if (!groups || !categories || !accounts) return null

  async function onFile(file: File) {
    setError(''); setResult(null); setOverrides({})
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.headers.length < 2 || parsed.rows.length === 0) throw new Error('No rows found. Is this a CSV export?')
      const m = loadMapping(parsed.headers)
      setCsv(parsed); setFileName(file.name); setMapping(m)
      setMode(m.moneyIn || m.moneyOut ? 'split' : 'signed')
    } catch (e) { setCsv(null); setError((e as Error).message) }
  }

  const fresh = mapped ? mapped.txs.map((_, i) => !dupes.has(hashes[i])) : []
  const freshCount = fresh.filter(Boolean).length

  async function doImport() {
    if (!mapped || !accountId) return
    const rows: Transaction[] = []
    const newRules = new Map<string, string>()
    mapped.txs.forEach((t, i) => {
      if (!fresh[i]) return
      const categoryId = catFor(i) || null
      rows.push({ id: newId(), date: t.date, accountId, categoryId, description: t.description, moneyIn: t.moneyIn, moneyOut: t.moneyOut, importHash: hashes[i] })
      if (overrides[i] && t.description) newRules.set(patternFor(t.description), overrides[i])
    })
    const added = await addImported(rows)
    for (const [pattern, categoryId] of newRules) {
      if (pattern && !(await db.rules.where('pattern').equals(pattern).first())) await db.rules.add({ id: newId(), pattern, categoryId })
    }
    try { localStorage.setItem(storeKey(csv!.headers), JSON.stringify(mapping)) } catch { /* remembering the mapping is optional */ }
    setResult(`Imported ${added} transaction${added === 1 ? '' : 's'}.`)
    setCsv(null)
  }

  const col = (key: 'date' | 'description' | 'amount' | 'moneyIn' | 'moneyOut', label: string) => (
    <label>{label}
      <select value={mapping[key] ?? ''} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value || undefined })}>
        <option value="">— none —</option>{csv!.headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
    </label>
  )

  return (
    <Page title="Import statement">
      {result && <div className="banner">{result} <button className="ghost" onClick={() => go('transactions')}>View</button></div>}
      {accounts.length === 0 ? (
        <Empty>Add an account first. <button className="ghost" onClick={() => go('settings')}>Open Settings</button></Empty>
      ) : (
        <div className="card stack">
          <p className="small muted" style={{ margin: 0 }}>Export a CSV statement from Discovery Bank, FNB, Capitec or any other bank. The file is read on this device and never uploaded.</p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f) }} aria-label="Statement CSV file" />
          {error && <div className="bad">{error}</div>}
        </div>
      )}

      {csv && (
        <>
          <h2>1. Match the columns {detectBank(csv.headers) && <span className="pill">Looks like {detectBank(csv.headers)}</span>}</h2>
          <div className="card stack">
            <div className="small muted">{fileName} · {csv.rows.length} rows{csv.preamble ? ` · skipped ${csv.preamble} header lines` : ''}</div>
            <div className="grid2">{col('date', 'Date')}{col('description', 'Description')}</div>
            <label>Amounts are in
              <select value={mode} onChange={(e) => setMode(e.target.value as 'signed' | 'split')}>
                <option value="signed">One column (negative = money out)</option><option value="split">Separate money in / money out columns</option>
              </select>
            </label>
            {mode === 'signed' ? col('amount', 'Amount') : <div className="grid2">{col('moneyIn', 'Money in')}{col('moneyOut', 'Money out')}</div>}
            <label>Date format
              <select value={mapping.dateFormat ?? 'auto'} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value as DateFormat })}>
                <option value="auto">Automatic (day first for 01/02/2026)</option><option value="MDY">Month first (02/01/2026)</option>
              </select>
            </label>
            <label>Import into account
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">Choose…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </label>
          </div>

          {mapped && (
            <>
              <h2>2. Check &amp; categorise</h2>
              {mapped.issues.length > 0 && <div className="banner">{mapped.issues.length} row(s) skipped: {mapped.issues.slice(0, 3).map((i) => `line ${i.line} (${i.reason})`).join('; ')}{mapped.issues.length > 3 ? '…' : ''}</div>}
              <p className="small muted">{freshCount} new · {mapped.txs.length - freshCount} already imported (skipped). Categories you change are remembered for next time.</p>
              <div className="card scroll">
                <table>
                  <thead><tr><th>Date</th><th>Description</th><th className="right">Amount</th><th>Category</th></tr></thead>
                  <tbody>
                    {mapped.txs.slice(0, PREVIEW_LIMIT).map((t, i) => (
                      <tr key={i} style={{ opacity: fresh[i] ? 1 : 0.45 }}>
                        <td className="num">{t.date}</td><td>{t.description}</td>
                        <td className={`right num ${t.moneyIn ? 'good' : ''}`}>{t.moneyIn ? '+' : '−'}{fmt(t.moneyIn || t.moneyOut)}</td>
                        <td style={{ minWidth: 150 }}>{fresh[i] ? <CategorySelect value={catFor(i)} onChange={(id) => setOverrides({ ...overrides, [i]: id })} groups={groups} categories={categories} /> : <span className="pill">duplicate</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mapped.txs.length > PREVIEW_LIMIT && <p className="small muted">Showing the first {PREVIEW_LIMIT}; all {mapped.txs.length} rows will be imported using the same rules.</p>}
              </div>
              <button className="primary" disabled={!accountId || freshCount === 0} onClick={doImport}>Import {freshCount} transaction{freshCount === 1 ? '' : 's'}</button>
              {!accountId && <span className="small muted"> Choose an account first.</span>}
            </>
          )}
        </>
      )}
    </Page>
  )
}
