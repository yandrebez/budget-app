import { useMemo, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { applyPlan, type ApplyOptions, type ApplyResult } from './applyWorkbook'
import { ROLE_FIELDS, ROLE_LABEL, withRole, type Detection, type Role, type TableGroup } from './parsers/classify'
import { autoDetect, buildPlan } from './parsers/workbook'
import type { Cell } from './parsers/sheet'

type Include = ApplyOptions['include']
const ROLES = Object.keys(ROLE_LABEL) as Role[]
const KIND_LABEL = { account: 'bank account', card: 'card', savings: 'savings', cash: 'cash' } as const

const show = (c: Cell): string => (c instanceof Date ? c.toISOString().slice(0, 10) : c == null ? '' : String(c))

export function ExcelImport({ go }: { go: (tab: string) => void }) {
  const { fmt } = useApp()
  const [detection, setDetection] = useState<Detection | null>(null)
  const [fileName, setFileName] = useState('')
  const [off, setOff] = useState<Partial<Record<keyof Include, boolean>>>({})
  const [mode, setMode] = useState<ApplyOptions['mode']>('merge')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [openingAccount, setOpeningAccount] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const plan = useMemo(() => (detection ? buildPlan(detection) : null), [detection])

  async function onFile(file: File) {
    setError(''); setResult(null); setDetection(null); setOff({}); setOpen(null)
    if (!/\.xlsx$/i.test(file.name)) return setError('Please choose an .xlsx file. In Excel use Save As → Excel Workbook. Older .xls files are not supported.')
    setBusy(true)
    try {
      const { default: readXlsx } = await import('read-excel-file/universal')
      const d = autoDetect(await readXlsx(await file.arrayBuffer()))
      setFileName(file.name)
      setDetection(d)
      setOpeningAccount(buildPlan(d).accounts[0]?.name ?? '')
    } catch (e) {
      setError(`Could not read this file. ${(e as Error).message}`)
    } finally { setBusy(false) }
  }

  const update = (key: string, fn: (g: TableGroup) => TableGroup) =>
    setDetection((d) => (d ? { ...d, groups: d.groups.map((g) => (g.key === key ? fn(g) : g)) } : d))

  const counts = plan ? {
    budget: plan.categories.length, accounts: plan.accounts.length, transactions: plan.transactions.length,
    debts: plan.debts.length, pots: plan.pots.length, settings: plan.settings ? 1 : 0,
  } : null
  const include: Include | null = counts ? {
    budget: counts.budget > 0 && !off.budget, accounts: counts.accounts > 0 && !off.accounts, transactions: counts.transactions > 0 && !off.transactions,
    debts: counts.debts > 0 && !off.debts, pots: counts.pots > 0 && !off.pots, settings: counts.settings > 0 && !off.settings,
  } : null

  async function doImport() {
    if (!plan || !include) return
    if (mode === 'fresh' && !confirm('This erases your current groups, categories, accounts, transactions, debts and savings first. Continue?')) return
    setBusy(true)
    try { setResult(await applyPlan(plan, { include, mode, openingAccount })); setDetection(null) }
    catch (e) { setError(`Import failed. Nothing was changed. ${(e as Error).message}`) }
    finally { setBusy(false) }
  }

  const row = (k: keyof Include, label: string, detail?: string) => (
    <label className="row" style={{ flexDirection: 'row', alignItems: 'flex-start', color: 'var(--text)', fontSize: '1rem' }}>
      <input type="checkbox" style={{ marginTop: 5 }} disabled={!counts || counts[k] === 0} checked={!!include?.[k]} onChange={(e) => setOff({ ...off, [k]: !e.target.checked })} />
      <span className="grow"><b>{label}</b> <span className="muted">{counts && k !== 'settings' ? `(${counts[k]})` : ''}</span>{detail && <div className="small muted">{detail}</div>}</span>
    </label>
  )

  const groups = detection?.groups ?? []
  // Only what is actually being used is shown up front; ignored tables and lookalikes wait in the folded list.
  const used = groups.filter((g) => g.role !== 'ignore' && g.enabled)
  const skipped = groups.filter((g) => g.role === 'ignore' || !g.enabled)

  const card = (g: TableGroup) => {
    const fields = g.role === 'ignore' ? [] : ROLE_FIELDS[g.role]
    const expanded = open === g.key
    const sample = g.tables[0].rows.slice(0, 3)
    return (
      <div className="card stack" key={g.key} style={{ opacity: g.enabled || g.role === 'ignore' ? 1 : 0.7 }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          {g.role !== 'ignore' && <input type="checkbox" aria-label={`Use ${g.sheets[0]}`} style={{ marginTop: 6 }} checked={g.enabled} onChange={(e) => update(g.key, (x) => ({ ...x, enabled: e.target.checked }))} />}
          <div className="grow">
            <select aria-label={`What is the table on ${g.sheets[0]}`} value={g.role} onChange={(e) => update(g.key, (x) => withRole(x, e.target.value as Role))}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <div className="xs muted" style={{ marginTop: 4 }}>
              {g.sheets.length > 1 ? `${g.sheets.length} sheets (${g.sheets[0]}, …)` : g.sheets[0]} · {g.rowCount} rows · {g.headers.slice(0, 5).join(', ')}{g.headers.length > 5 ? '…' : ''}
            </div>
            {g.note && <div className="xs warn" style={{ marginTop: 4 }}>{g.note}</div>}
          </div>
        </div>
        <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(expanded ? null : g.key)}>{expanded ? 'Hide columns' : 'Check or change columns'}</button>
        {expanded && (
          <>
            {fields.length > 0 && (
              <div className="grid2">
                {fields.map((f) => (
                  <label key={f.key}>{f.label}{f.required ? ' *' : ''}
                    <select value={g.mapping[f.key] ?? ''} onChange={(e) => update(g.key, (x) => ({ ...x, mapping: { ...x.mapping, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) } }))}>
                      <option value="">— none —</option>
                      {g.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <div className="scroll">
              <table>
                <thead><tr>{g.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
                <tbody>{sample.map((r, ri) => <tr key={ri}>{g.headers.map((_, ci) => <td key={ci}>{show(r[ci])}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
    )
  }

  const dates = plan?.transactions.map((t) => t.date).sort() ?? []
  const incomeIn = plan?.transactions.reduce((s, t) => s + t.moneyIn, 0) ?? 0
  const out = plan?.transactions.reduce((s, t) => s + t.moneyOut, 0) ?? 0

  return (
    <>
      {result && (
        <div className="banner">
          Imported {result.categories} new categories, {result.transactions} transactions, {result.debts} debts and {result.pots} savings pots
          {result.skippedDuplicates ? ` (${result.skippedDuplicates} transactions were already there)` : ''}.
          <button className="link" onClick={() => go('dashboard')}>Open dashboard</button>
        </div>
      )}
      <div className="card stack">
        <p className="small muted" style={{ margin: 0 }}>
          Choose any Excel budget or tracker (.xlsx). It is read on this device and never uploaded. Sheet names and layout don't matter: tables are found by how they look,
          and you can correct anything before it is saved.
        </p>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Excel budget file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f) }} />
        {busy && <div className="muted small">Working…</div>}
        {error && <div className="bad" role="alert">{error}</div>}
      </div>

      {detection && plan && counts && include && (
        <>
          <h2>What we found <span className="small muted" style={{ textTransform: 'none', letterSpacing: 0 }}>{fileName}</span></h2>
          {used.length === 0 && <div className="banner">No tables were recognised. Open "Other tables" below, pick the one that holds your transactions or budget, and say what it is.</div>}
          {used.map(card)}
          {skipped.length > 0 && (
            <details>
              <summary className="small muted" style={{ cursor: 'pointer', marginBottom: 8 }}>Other tables, not used ({skipped.length}). Open to use one or see why it was left out.</summary>
              {skipped.map(card)}
            </details>
          )}

          <h2>What will be imported</h2>
          {plan.warnings.map((w) => <div className="banner" key={w}>{w}</div>)}
          <div className="card stack">
            {row('budget', 'Groups, categories & monthly budget', `${plan.groups.length} groups · ${plan.categories.filter((c) => c.monthlyBudget > 0).length} with an amount`)}
            {row('accounts', 'Accounts and balances', `${plan.accounts.map((a) => `${a.name} (${KIND_LABEL[a.kind]})`).join(', ')}${[...new Set(plan.accounts.map((a) => a.openingSource).filter(Boolean))].map((x) => `. Opening balances come from the ${x}`).join('')}`)}
            {row('transactions', 'Transactions', plan.transactions.length ? `${dates[0]} → ${dates[dates.length - 1]} · ${fmt(incomeIn)} in · ${fmt(out)} out` : undefined)}
            {row('debts', 'Debts', plan.debts.map((d) => d.name).join(', '))}
            {row('pots', 'Savings goals', plan.pots.map((d) => d.name).join(', '))}
            {row('settings', 'Budget period', plan.settings
              ? `Starts on day ${plan.settings.payDay}, ${plan.settings.weekendRule === 'before' ? 'moves to the previous working day' : plan.settings.weekendRule === 'after' ? 'moves to the next working day' : 'no weekend adjustment'}${plan.settings.holidays.length ? `, ${plan.settings.holidays.length} public holidays` : ''}`
              : 'No pay periods found')}
          </div>
          {plan.openingBalance > 0 && include.transactions && plan.accounts.length > 0 && (
            <div className="card stack">
              <label>Your workbook starts with a balance of {fmt(plan.openingBalance)} across your accounts. Which account holds it?
                <select value={openingAccount} onChange={(e) => setOpeningAccount(e.target.value)}>{plan.accounts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}</select>
              </label>
            </div>
          )}
          <div className="card stack">
            <label>When data already exists
              <select value={mode} onChange={(e) => setMode(e.target.value as ApplyOptions['mode'])}>
                <option value="merge">Add and update (safe to repeat; nothing is duplicated)</option>
                <option value="fresh">Start fresh: erase current data first</option>
              </select>
            </label>
          </div>
          <button className="primary" disabled={busy || !Object.values(include).some(Boolean)} onClick={doImport}>Import into my budget</button>
        </>
      )}
    </>
  )
}
