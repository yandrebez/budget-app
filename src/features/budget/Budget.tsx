import { useMemo, useState } from 'react'
import type { GroupKind } from '@/types'
import { useApp } from '@/app/AppContext'
import { BudgetRow, GroupBlock, isActive } from '@/components/BudgetViews'
import { CycleSwitcher, Empty, MoneyInput, Page } from '@/components/ui'
import { db } from '@/db/db'
import { summarise } from '@/domain/budget/summary'
import { useLedger } from '@/hooks/useLedger'
import { newId } from '@/lib/id'

const KINDS: { value: GroupKind; label: string }[] = [
  { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }, { value: 'debt', label: 'Debt' },
  { value: 'savings', label: 'Savings' }, { value: 'transfer', label: 'Transfer (not budgeted)' },
]

export function Budget() {
  const { fmt, cycle } = useApp()
  const ledger = useLedger()
  const [editing, setEditing] = useState(false)
  const [newCat, setNewCat] = useState<Record<string, string>>({})
  const [newGroup, setNewGroup] = useState({ name: '', kind: 'expense' as GroupKind })
  const s = useMemo(() => (ledger ? summarise(ledger.categories, ledger.groups, ledger.txs, cycle.start, cycle.end) : null), [ledger, cycle])
  if (!ledger || !s) return null
  const { groups, categories } = ledger

  const addCategory = async (groupId: string) => {
    const name = (newCat[groupId] ?? '').trim()
    if (!name) return
    await db.categories.add({ id: newId(), name, groupId, monthlyBudget: 0 })
    setNewCat({ ...newCat, [groupId]: '' })
  }
  const removeCategory = async (id: string) => {
    if (!confirm('Delete this category? Its transactions become uncategorised.')) return
    await db.transaction('rw', db.categories, db.transactions, db.rules, async () => {
      await db.transactions.where('categoryId').equals(id).modify({ categoryId: null })
      await db.rules.filter((r) => r.categoryId === id).delete()
      await db.categories.delete(id)
    })
  }
  const removeGroup = async (id: string) => {
    if (categories.some((c) => c.groupId === id)) return alert('Move or delete the categories in this group first.')
    await db.groups.delete(id)
  }

  const allocation = (
    <div className={`card row between ${s.leftToAllocate === 0 ? '' : 'banner'}`} style={{ marginBottom: 14 }}>
      <div><b>Left to allocate</b><div className="xs muted">Planned income minus everything given a job</div></div>
      <b className={`num ${s.leftToAllocate === 0 ? 'good' : s.leftToAllocate < 0 ? 'bad' : 'warn'}`}>{fmt(s.leftToAllocate)}</b>
    </div>
  )

  return (
    <Page title="Budget" actions={<button className={editing ? 'primary' : ''} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit budget'}</button>}>
      {!editing && <CycleSwitcher />}
      {allocation}

      {!editing ? (
        s.lines.length === 0
          ? <Empty><p>No categories yet.</p><button className="primary" onClick={() => setEditing(true)}>Add categories</button></Empty>
          : groups.map((g) => {
              const lines = s.lines.filter((l) => l.group.id === g.id && isActive(l))
              return lines.length ? (
                <GroupBlock key={g.id} name={g.name} kind={g.kind} lines={lines}>
                  {lines.map((l) => <BudgetRow key={l.category.id} line={l} />)}
                </GroupBlock>
              ) : null
            })
      ) : (
        <>
          <p className="small muted">One monthly budget; the same numbers apply to every period until you change them.</p>
          {groups.map((g) => {
            const cats = categories.filter((c) => c.groupId === g.id).sort((a, b) => a.name.localeCompare(b.name))
            const budgeted = g.kind !== 'transfer'
            return (
              <section key={g.id}>
                <div className="section-head">
                  <h2>{g.name} · {KINDS.find((k) => k.value === g.kind)?.label}</h2>
                  <button className="link xs bad" onClick={() => removeGroup(g.id)} aria-label={`Delete group ${g.name}`}>Delete group</button>
                </div>
                <div className="card">
                  {cats.length === 0 && <p className="muted small" style={{ margin: 0 }}>No categories yet.</p>}
                  {cats.map((c) => (
                    <div className="row" key={c.id} style={{ marginBottom: 8 }}>
                      <input className="grow" aria-label="Category name" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && db.categories.update(c.id, { name: e.target.value.trim() })} />
                      {budgeted && <div style={{ width: 120 }}><MoneyInput label={`Monthly budget for ${c.name}`} value={c.monthlyBudget} onChange={(monthlyBudget) => db.categories.update(c.id, { monthlyBudget })} /></div>}
                      <button className="ghost danger" aria-label={`Delete ${c.name}`} onClick={() => removeCategory(c.id)}>✕</button>
                    </div>
                  ))}
                  <div className="row" style={{ marginTop: 6 }}>
                    <input className="grow" placeholder="New category" value={newCat[g.id] ?? ''} onChange={(e) => setNewCat({ ...newCat, [g.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addCategory(g.id)} />
                    <button onClick={() => addCategory(g.id)}>Add</button>
                  </div>
                </div>
              </section>
            )
          })}
          <h2>Add a group</h2>
          <div className="card row wrap">
            <input className="grow" placeholder="Group name" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })} />
            <select style={{ width: 'auto' }} value={newGroup.kind} onChange={(e) => setNewGroup({ ...newGroup, kind: e.target.value as GroupKind })}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
            <button onClick={async () => { if (!newGroup.name.trim()) return; await db.groups.add({ id: newId(), name: newGroup.name.trim(), kind: newGroup.kind, order: groups.length }); setNewGroup({ ...newGroup, name: '' }) }}>Add</button>
          </div>
        </>
      )}
    </Page>
  )
}
