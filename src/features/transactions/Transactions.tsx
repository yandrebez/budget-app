import { useEffect, useMemo, useState } from 'react'
import type { Transaction } from '@/types'
import { useApp } from '@/app/AppContext'
import { CycleSwitcher, Empty, Modal, MoneyInput, Page } from '@/components/ui'
import { CategorySelect } from '@/components/CategorySelect'
import { MoveMoney } from './MoveMoney'
import { db } from '@/db/db'
import { balancesByAccount } from '@/domain/balances/balances'
import { patternFor } from '@/domain/transactions/categorise'
import { useLedger } from '@/hooks/useLedger'
import { newId } from '@/lib/id'
import { todayISO } from '@/lib/dates'
import { dayHeading } from '@/lib/format'

type Draft = { id?: string; date: string; accountId: string; categoryId: string; description: string; kind: 'in' | 'out'; amount: number }
const ALL = '__all__'
const STORE = 'tx-account'
const KIND_LABEL = { account: 'Account', card: 'Card', savings: 'Savings', cash: 'Cash' } as const

const remember = (v: string) => { try { localStorage.setItem(STORE, v) } catch { /* optional */ } }
const recall = () => { try { return localStorage.getItem(STORE) } catch { return null } }

export function Transactions({ go }: { go: (tab: string) => void }) {
  const { cycle, fmt, settings } = useApp()
  const ledger = useLedger()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'cycle' | 'all'>('cycle')
  const [selected, setSelected] = useState<string>(() => recall() ?? '')
  const [moving, setMoving] = useState(false)

  // Land on a real account (the first one) rather than a mixed list.
  const accounts = ledger?.accounts
  const active = accounts && accounts.length ? (selected === ALL || accounts.some((a) => a.id === selected) ? selected : accounts[0].id) : ''
  useEffect(() => { if (active && active !== selected) setSelected(active) }, [active, selected])

  const catName = useMemo(() => new Map((ledger?.categories ?? []).map((c) => [c.id, c.name])), [ledger])
  const accName = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a.name])), [accounts])
  const balances = useMemo(() => (ledger ? balancesByAccount(ledger.accounts, ledger.txs, todayISO()) : new Map<string, number>()), [ledger])

  const pick = (id: string) => { setSelected(id); remember(id) }

  const inAccount = useMemo(() => (ledger?.txs ?? []).filter((t) => active === ALL || t.accountId === active), [ledger, active])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inAccount.filter((t) =>
      (scope === 'all' || (t.date >= cycle.start && t.date <= cycle.end)) &&
      (!q || t.description.toLowerCase().includes(q) || (catName.get(t.categoryId ?? '') ?? '').toLowerCase().includes(q)))
  }, [inAccount, scope, cycle, query, catName])

  const days = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of shown) (map.get(t.date) ?? map.set(t.date, []).get(t.date)!).push(t)
    return [...map]
  }, [shown])

  if (!ledger) return null
  const { groups, categories } = ledger
  const acct = accounts!.find((a) => a.id === active)
  const periodIn = shown.reduce((s, t) => s + t.moneyIn, 0), periodOut = shown.reduce((s, t) => s + t.moneyOut, 0)
  const balance = active === ALL ? [...balances.values()].reduce((s, v) => s + v, 0) : balances.get(active) ?? 0

  const openNew = () => setDraft({ date: todayISO(), accountId: acct?.id ?? accounts![0]?.id ?? '', categoryId: '', description: '', kind: 'out', amount: 0 })
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
    <Page title="Activity" actions={<><button onClick={() => go('import')}>Import</button><button className="primary" onClick={openNew}>+ Add</button></>}>
      {accounts!.length === 0 ? (
        <Empty><p>Add an account to start logging transactions.</p><button className="primary" onClick={() => go('settings')}>Open Settings</button></Empty>
      ) : (
        <>
          <div className="chips" role="tablist" aria-label="Account">
            {accounts!.map((a) => <button key={a.id} role="tab" aria-selected={active === a.id} className="chip" onClick={() => pick(a.id)}>{a.name}</button>)}
            {accounts!.length > 1 && <button role="tab" aria-selected={active === ALL} className="chip" onClick={() => pick(ALL)}>All accounts</button>}
          </div>

          <div className="card">
            <div className="xs muted">{active === ALL ? 'Combined balance' : `${acct ? KIND_LABEL[acct.kind ?? 'account'] : ''} balance`}</div>
            <div className={`hero num ${balance < 0 ? 'bad' : ''}`}>{fmt(balance)}</div>
            {accounts!.length > 1 && <button className="link small" style={{ float: 'right' }} onClick={() => setMoving(true)}>⇄ Move money</button>}
            <div className="row xs muted" style={{ marginTop: 8, gap: 16 }}>
              <span>In <b className="num good">{fmt(periodIn)}</b></span><span>Out <b className="num">{fmt(periodOut)}</b></span>
              <span className="faint">{scope === 'cycle' ? 'this period' : 'all time'}</span>
            </div>
          </div>

          <div className="row wrap" style={{ marginBottom: 8 }}>
            <input className="grow" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search transactions" />
            <select style={{ width: 'auto' }} value={scope} onChange={(e) => setScope(e.target.value as 'cycle' | 'all')} aria-label="Range">
              <option value="cycle">This period</option><option value="all">All time</option>
            </select>
          </div>
          {scope === 'cycle' && <CycleSwitcher />}

          {days.length === 0 ? <Empty>No transactions {scope === 'cycle' ? 'in this period' : 'yet'}.</Empty> : (
            days.map(([date, list]) => (
              <div key={date}>
                <div className="daydiv">{dayHeading(date, settings.locale)}</div>
                <div className="card flush">
                  {list.map((t) => (
                    <button key={t.id} className="item row between" onClick={() => openEdit(t)}>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <span className="title" style={{ display: 'block' }}>{t.description || '(no description)'}</span>
                        <span className="xs muted">{catName.get(t.categoryId ?? '') ?? <span className="warn">Uncategorised</span>}{active === ALL ? ` · ${accName.get(t.accountId) ?? '?'}` : ''}</span>
                      </span>
                      <span className={`amount ${t.moneyIn > 0 ? 'good' : ''}`}>{t.moneyIn > 0 ? '+' : '−'}{fmt(t.moneyIn || t.moneyOut)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
      <MoveMoney open={moving} onClose={() => setMoving(false)} accounts={accounts!} defaultFrom={acct?.id ?? accounts![0]?.id ?? ''} />
      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Edit transaction' : 'New transaction'}>
        {draft && (
          <div className="stack">
            <div className="grid2">
              <label>Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
              <label>Type<select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as 'in' | 'out' })}><option value="out">Money out</option><option value="in">Money in</option></select></label>
            </div>
            <label>Amount ({settings.currency})<MoneyInput value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount })} /></label>
            <label>Description<input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <label>Account<select value={draft.accountId} onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}>{accounts!.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label>Category<CategorySelect value={draft.categoryId} onChange={(categoryId) => setDraft({ ...draft, categoryId })} groups={groups} categories={categories} /></label>
            <div className="row between">
              {draft.id ? <button className="danger" onClick={async () => {
                const row = await db.transactions.get(draft.id!)
                if (row?.transferId && confirm('This is one side of a transfer between your accounts. Delete both sides?')) await db.transactions.filter((t) => t.transferId === row.transferId).delete()
                else await db.transactions.delete(draft.id!)
                setDraft(null)
              }}>Delete</button> : <span />}
              <span className="row"><button onClick={() => setDraft(null)}>Cancel</button><button className="primary" onClick={save} disabled={!draft.accountId || draft.amount <= 0}>Save</button></span>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  )
}
