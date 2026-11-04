import { useState } from 'react'
import { useApp } from '@/app/AppContext'
import { applyPlan, type ApplyOptions, type ApplyResult } from './applyWorkbook'
import { parseWorkbook, type WorkbookPlan } from './parsers/workbook'

type Include = ApplyOptions['include']

export function ExcelImport({ go }: { go: (tab: string) => void }) {
  const { fmt } = useApp()
  const [plan, setPlan] = useState<WorkbookPlan | null>(null)
  const [fileName, setFileName] = useState('')
  const [include, setInclude] = useState<Include>({ settings: true, budget: true, debts: true, pots: true, transactions: true })
  const [mode, setMode] = useState<ApplyOptions['mode']>('merge')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)

  async function onFile(file: File) {
    setError(''); setResult(null); setPlan(null)
    if (!/\.xlsx$/i.test(file.name)) return setError('Please choose an .xlsx file. In Excel use Save As → Excel Workbook. Older .xls files are not supported.')
    setBusy(true)
    try {
      const { default: readXlsx } = await import('read-excel-file/universal')
      const p = parseWorkbook(await readXlsx(await file.arrayBuffer()))
      setFileName(file.name)
      setPlan(p)
      setInclude({ settings: !!p.settings, budget: p.categories.length > 0, debts: p.debts.length > 0, pots: p.pots.length > 0, transactions: p.transactions.length > 0 })
    } catch (e) {
      setError(`Could not read this file. ${(e as Error).message}`)
    } finally { setBusy(false) }
  }

  async function doImport() {
    if (!plan) return
    if (mode === 'fresh' && !confirm('This erases your current groups, categories, accounts, transactions, debts and savings first. Continue?')) return
    setBusy(true)
    try { setResult(await applyPlan(plan, { include, mode })); setPlan(null) }
    catch (e) { setError(`Import failed. Nothing was changed. ${(e as Error).message}`) }
    finally { setBusy(false) }
  }

  const row = (k: keyof Include, label: string, count: number, detail?: string) => (
    <label className="row" style={{ flexDirection: 'row', alignItems: 'flex-start', color: 'var(--text)', fontSize: '1rem' }}>
      <input type="checkbox" style={{ width: 'auto', minHeight: 0, marginTop: 5 }} disabled={count === 0 && k !== 'settings'} checked={include[k]} onChange={(e) => setInclude({ ...include, [k]: e.target.checked })} />
      <span className="grow"><b>{label}</b> <span className="muted">{k === 'settings' ? '' : `(${count})`}</span>{detail && <div className="small muted">{detail}</div>}</span>
    </label>
  )

  const incomeIn = plan ? plan.transactions.reduce((s, t) => s + t.moneyIn, 0) : 0
  const out = plan ? plan.transactions.reduce((s, t) => s + t.moneyOut, 0) : 0
  const dates = plan?.transactions.map((t) => t.date).sort() ?? []

  return (
    <>
      {result && (
        <div className="banner">
          Imported {result.categories} new categories, {result.transactions} transactions, {result.debts} debts and {result.pots} savings pots
          {result.skippedDuplicates ? ` (${result.skippedDuplicates} transactions were already there)` : ''}.
          <button className="ghost" onClick={() => go('dashboard')}>Open dashboard</button>
        </div>
      )}
      <div className="card stack">
        <p className="small muted" style={{ margin: 0 }}>
          Choose your existing budget workbook (.xlsx). It is read on this device and never uploaded. Sheets are found by name and column headings:
          Budget, Setup, Transactions, Debt, Savings and Cycles. You will see a preview before anything is saved.
        </p>
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Excel budget file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f) }} />
        {busy && <div className="muted small">Working…</div>}
        {error && <div className="bad" role="alert">{error}</div>}
      </div>

      {plan && (
        <>
          <h2>Preview <span className="small muted">{fileName}</span></h2>
          {plan.warnings.map((w) => <div className="banner" key={w}>{w}</div>)}
          <div className="card stack">
            {row('budget', 'Groups, categories & monthly budget', plan.categories.length, `${plan.groups.length} groups · ${plan.categories.filter((c) => c.monthlyBudget > 0).length} with an amount`)}
            {row('transactions', 'Transactions', plan.transactions.length,
              plan.transactions.length ? `${dates[0]} → ${dates[dates.length - 1]} · ${fmt(incomeIn)} in · ${fmt(out)} out · accounts: ${plan.accounts.join(', ')}` : undefined)}
            {row('debts', 'Debts', plan.debts.length, plan.debts.map((d) => d.name).join(', '))}
            {row('pots', 'Savings pots', plan.pots.length, plan.pots.map((d) => d.name).join(', '))}
            {row('settings', 'Budget period', plan.settings ? 1 : 0,
              plan.settings ? `Starts on day ${plan.settings.payDay}, ${plan.settings.weekendRule === 'before' ? 'moves to the previous working day' : plan.settings.weekendRule === 'after' ? 'moves to the next working day' : 'no weekend adjustment'}, ${plan.settings.holidays.length} public holidays` : 'No Cycles sheet found')}
          </div>
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
