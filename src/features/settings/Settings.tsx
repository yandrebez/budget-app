import { useRef, useState } from 'react'
import type { AccountKind, BackupFile, WeekendRule } from '@/types'
import { useApp } from '@/app/AppContext'
import { MoneyInput, Page } from '@/components/ui'
import { db } from '@/db/db'
import { exportBackup, importBackup, updateSettings, wipeAll } from '@/db/repo'
import { southAfricanHolidays } from '@/domain/cycles/holidays'
import { useAccounts } from '@/hooks/useBudgetData'
import { newId } from '@/lib/id'

export function Settings({ back }: { back?: { label: string; onClick: () => void } }) {
  const { settings } = useApp()
  const accounts = useAccounts()
  const [acc, setAcc] = useState('')
  const [holiday, setHoliday] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  if (!accounts) return null

  async function download() {
    const blob = new Blob([JSON.stringify(await exportBackup(), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `budget-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function restore(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile
      if (!confirm('Restoring replaces ALL current data. Continue?')) return
      await importBackup(parsed)
      alert('Backup restored.')
    } catch (e) {
      alert(`Could not restore: ${(e as Error).message}`)
    }
  }

  return (
    <Page title="Settings" back={back}>
      <h2>General</h2>
      <div className="card stack">
        <div className="grid2">
          <label>Currency code<input defaultValue={settings.currency} maxLength={3} onBlur={(e) => /^[A-Za-z]{3}$/.test(e.target.value) && updateSettings({ currency: e.target.value.toUpperCase() })} /></label>
          <label>Locale<input defaultValue={settings.locale} onBlur={(e) => { try { new Intl.NumberFormat(e.target.value); updateSettings({ locale: e.target.value }) } catch { e.target.value = settings.locale } }} /></label>
        </div>
        <label>Theme<select value={settings.theme} onChange={(e) => { const theme = e.target.value as typeof settings.theme; updateSettings({ theme }) }}><option value="system">Match device</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      </div>

      <h2>Budget period</h2>
      <div className="card stack">
        <label>Period starts on day<input type="number" min={1} max={31} defaultValue={settings.payDay} onBlur={(e) => updateSettings({ payDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} /></label>
        <label>If that day is a weekend or holiday
          <select value={settings.weekendRule} onChange={(e) => updateSettings({ weekendRule: e.target.value as WeekendRule })}>
            <option value="none">Leave it</option><option value="before">Previous working day</option><option value="after">Next working day</option>
          </select>
        </label>
        <div className="row between"><span>Public holidays loaded: <b>{settings.holidays.length}</b></span>
          <span className="row"><button onClick={() => { const y = new Date().getFullYear(); updateSettings({ holidays: [...new Set([...settings.holidays, ...southAfricanHolidays(y - 1, y + 5)])].sort() }) }}>Add SA holidays</button>
            <button className="danger" onClick={() => updateSettings({ holidays: [] })}>Clear</button></span></div>
        <div className="row"><input type="date" value={holiday} onChange={(e) => setHoliday(e.target.value)} aria-label="Custom holiday" />
          <button onClick={() => { if (holiday) { updateSettings({ holidays: [...new Set([...settings.holidays, holiday])].sort() }); setHoliday('') } }}>Add day off</button></div>
      </div>

      <h2>Accounts</h2>
      <div className="card">
        {accounts.map((a) => (
          <div className="stack" key={a.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <div className="row">
              <input className="grow" aria-label="Account name" defaultValue={a.name} onBlur={(e) => e.target.value.trim() && db.accounts.update(a.id, { name: e.target.value.trim() })} />
              <button className="ghost danger" aria-label={`Delete ${a.name}`} onClick={async () => {
                if ((await db.transactions.where('accountId').equals(a.id).count()) > 0) return alert('This account has transactions. Delete or move them first.')
                await db.accounts.delete(a.id)
              }}>✕</button>
            </div>
            <div className="grid2">
              <label>Type
                <select aria-label={`Type of ${a.name}`} value={a.kind ?? 'account'} onChange={(e) => db.accounts.update(a.id, { kind: e.target.value as AccountKind })}>
                  <option value="account">Bank account</option><option value="card">Credit card</option><option value="savings">Savings</option><option value="cash">Cash</option>
                </select>
              </label>
              <label>Balance before your first transaction<MoneyInput label={`Opening balance for ${a.name}`} value={a.openingBalance} onChange={(openingBalance) => db.accounts.update(a.id, { openingBalance })} /></label>
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8 }}>
          <input className="grow" placeholder="New account" value={acc} onChange={(e) => setAcc(e.target.value)} />
          <button onClick={async () => { if (!acc.trim()) return; await db.accounts.add({ id: newId(), name: acc.trim(), openingBalance: 0 }); setAcc('') }}>Add</button>
        </div>
      </div>

      <h2>Your data</h2>
      <div className="card stack">
        <p className="small muted" style={{ margin: 0 }}>Everything is stored only on this device. Download a backup regularly.</p>
        <div className="row wrap">
          <button onClick={download}>Download backup</button>
          <button onClick={() => fileRef.current?.click()}>Restore backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = '' }} />
          <button className="danger" onClick={async () => { if (confirm('Delete ALL data and start over? This cannot be undone.')) await wipeAll() }}>Erase everything</button>
        </div>
      </div>
    </Page>
  )
}
