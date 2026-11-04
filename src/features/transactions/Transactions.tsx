import { useMemo, useState } from 'react'
import type { Transaction } from '@/types'
import { useApp } from '@/app/AppContext'
import { CycleSwitcher, Empty, Modal, MoneyInput, Page } from '@/components/ui'
import { CategorySelect } from '@/components/CategorySelect'
import { db } from '@/db/db'
import { patternFor } from '@/domain/transactions/categorise'
import { useAccounts, useCategories, useGroups, useTransactions } from '@/hooks/useBudgetData'
import { newId } from '@/lib/id'
import { todayISO } from '@/lib/dates'

type Draft = { id?: string; date: string; accountId: string; categoryId: string; description: string; kind: 'in' | 'out'; amount: number }

export function Transactions({ go }: { go: (tab: string) => void }) {
  const { cycle, fmt, settings } = useApp()
  const groups = useGroups(), categories = useCategories(), accounts = useAccounts(), txs = useTransactions()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'cycle' | 'all'>('cycle')

  const catName = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name])), [categories])
  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (txs ?? []).filter((t) =>
      (scope === 'all' || (t.date >= cycle.start && t.date <= cycle.end)) &&
      (!q || t.description.toLowerCase().includes(q) || (catName.get(t.categoryId ?? '') ?? '').toLowerCase().includes(q)))
  }, [txs, scope, cycle, query, catName])

  if (!groups || !categories || !accounts) return null

  const openNew = () => setDraft({ date: todayISO(), accountId: accounts[0]?.id ?? '', categoryId: '', description: '', kind: 'out', amount: 0 })
  const openEdit = (t: Transaction) => setDraft({
    id: t.id, date: t.date, accountId: t.accountId, categoryId: t.categoryId ?? '', description: t.description,
    kind: t.moneyIn > 0 ? 'in' : 'out', amount: t.moneyIn || t.moneyOut,
  })

  async function save() {
    if (!draft || !draft.accountId || draft.amount <= 0) return
    const row: Transaction = {
      id: draft.id ?? newId(), date: draft.date, accountId: draft.accountId, categoryId: draft.categoryId || null,
      description: draft.description.trim(), moneyIn: draft.kind === 'in' ? draft.amount : 0, moneyOut: draft.kind === 'out' ? draft.amount : 0,
    }
    const prev = draft.id ? await db.transactions.get(draft.id) : undefined
    await db.transactions.put(prev?.importHash ? { ...row, importHash: prev.importHash } : row)
    if (row.categoryId && row.description) {
      const pattern = patternFor(row.description)
      if (pattern && !(await db.rules.where('pattern').equals(pattern).first())) await db.rules.add({ id: newId(), pattern, categoryId: row.categoryId })
    }
    setDraft(null)
  }

  return (
    <Page title="Transactions" actions={<><button onClick={() => go('import')}>Import</button><button className="primary" onClick={openNew}>+ Add</button></>}>
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <input className="grow" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search transactions" />
        <select style={{ width: 'auto' }} value={scope} onChange={(e) => setScope(e.target.value as 'cycle' | 'all')} aria-label="Range">
          <option value="cycle">This period</option><option value="all">All time</option>
        </select>
      </div>
      {scope === 'cycle' && <CycleSwitcher />}
      {accounts.length === 0 && <div className="banner">Add an account in <button className="ghost" onClick={() => go('settings')}>Settings</button> before logging transactions.</div>}
      {shown.length === 0 ? <Empty>No transactions {scope === 'cycle' ? 'in this period' : 'yet'}.</Empty> : (
        <div className="card">
          {shown.map((t) => (
            <button key={t.id} className="line row between ghost" style={{ width: '100%', textAlign: 'left', borderRadius: 0 }} onClick={() => openEdit(t)}>
              <span className="grow"><b>{t.description || '(no description)'}</b><br /><span className="small muted">{t.date} · {accName.get(t.accountId) ?? '?'} · {catName.get(t.categoryId ?? '') ?? <span className="warn">Uncategorised</span>}</span></span>
              <b className={`num ${t.moneyIn > 0 ? 'good' : ''}`}>{t.moneyIn > 0 ? '+' : '−'}{fmt(t.moneyIn || t.moneyOut)}</b>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit transaction' : 'New transaction'}>
        {draft && (
          <div className="stack">
            <div className="grid2">
              <label>Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
              <label>Type<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as 'in' | 'out' })}><option value="out">Money out</option><option value="in">Money in</option></select></label>
            </div>
            <label>Amount ({settings.currency})<MoneyInput value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} /></label>
            <label>Description<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <label>Account<select value={draft.accountId} onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label>Category<CategorySelect value={draft.categoryId} onChange={(categoryId) => setDraft({ ...draft, categoryId })} groups={groups} categories={categories} /></label>
            <div className="row between">
              {draft.id ? <button className="danger" onClick={async () => { await db.transactions.delete(draft.id!); setDraft(null) }}>Delete</button> : <span />}
              <span className="row"><button onClick={() => setDraft(null)}>Cancel</button><button className="primary" onClick={save} disabled={!draft.accountId || draft.amount <= 0}>Save</button></span>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  )
}
