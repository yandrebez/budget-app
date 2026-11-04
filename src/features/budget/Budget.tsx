import { useMemo, useState } from 'react'
import type { GroupKind } from '@/types'
import { useApp } from '@/app/AppContext'
import { Empty, MoneyInput, Page } from '@/components/ui'
import { db } from '@/db/db'
import { summarise } from '@/domain/budget/summary'
import { useCategories, useGroups, useTransactions } from '@/hooks/useBudgetData'
import { newId } from '@/lib/id'

const KINDS: { value: GroupKind; label: string }[] = [
  { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }, { value: 'debt', label: 'Debt' },
  { value: 'savings', label: 'Savings' }, { value: 'transfer', label: 'Transfer (not budgeted)' },
]

export function Budget() {
  const { fmt, cycle } = useApp()
  const groups = useGroups(), categories = useCategories(), txs = useTransactions()
  const [newCat, setNewCat] = useState<Record<string, string>>({})
  const [newGroup, setNewGroup] = useState({ name: '', kind: 'expense' as GroupKind })
  const s = useMemo(() => (groups && categories && txs ? summarise(categories, groups, txs, cycle.start, cycle.end) : null), [groups, categories, txs, cycle])
  if (!groups || !categories || !s) return null

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

  return (
    <Page title="Budget">
      <div className={`card row between ${s.leftToAllocate === 0 ? '' : 'banner'}`}>
        <div><b>Left to allocate</b><div className="small muted">Planned income minus everything given a job</div></div>
        <b className={`num ${s.leftToAllocate === 0 ? 'good' : s.leftToAllocate < 0 ? 'bad' : 'warn'}`}>{fmt(s.leftToAllocate)}</b>
      </div>
      <p className="small muted">One monthly budget; the same numbers apply to every period until you change them.</p>
      {groups.map((g) => {
        const cats = categories.filter((c) => c.groupId === g.id).sort((a, b) => a.name.localeCompare(b.name))
        const budgeted = g.kind !== 'transfer'
        return (
          <section key={g.id}>
            <div className="row between"><h2>{g.name} <span className="pill">{KINDS.find((k) => k.value === g.kind)?.label}</span></h2>
              <button className="ghost danger small" onClick={() => removeGroup(g.id)} aria-label={`Delete group ${g.name}`}>Delete group</button></div>
            <div className="card">
              {cats.length === 0 && <p className="muted small" style={{ margin: 0 }}>No categories yet.</p>}
              {cats.map((c) => (
                <div className="line row" key={c.id}>
                  <input className="grow" aria-label="Category name" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && db.categories.update(c.id, { name: e.target.value.trim() })} />
                  {budgeted && <div style={{ width: 120 }}><MoneyInput label={`Monthly budget for ${c.name}`} value={c.monthlyBudget} onChange={(monthlyBudget) => db.categories.update(c.id, { monthlyBudget })} /></div>}
                  <button className="ghost danger" aria-label={`Delete ${c.name}`} onClick={() => removeCategory(c.id)}>✕</button>
                </div>
              ))}
              <div className="row" style={{ marginTop: 8 }}>
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
      {categories.length === 0 && <Empty>Add categories above, then give each a monthly amount.</Empty>}
    </Page>
  )
}
