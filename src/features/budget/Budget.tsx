import { useMemo, useState } from 'react'
import type { GroupKind } from '@/types'
import { useApp } from '@/app/AppContext'
import { BudgetRow, GroupBlock, isActive } from '@/components/BudgetViews'
import { Chips, CycleSwitcher, Empty, MoneyInput, Page } from '@/components/ui'
import { db } from '@/db/db'
import { budgetFor, type BudgetScope } from '@/domain/budget/budgets'
import { summarise } from '@/domain/budget/summary'
import { shiftCycle } from '@/domain/cycles/cycle'
import { setCategoryBudget } from '@/db/repo'
import { monthLong } from '@/lib/format'
import { useLedger } from '@/hooks/useLedger'
import { Bonus } from './Bonus'
import { newId } from '@/lib/id'

const KINDS: { value: GroupKind; label: string }[] = [
  { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }, { value: 'debt', label: 'Debt' },
  { value: 'savings', label: 'Savings' }, { value: 'transfer', label: 'Transfer (not budgeted)' },
]

export function Budget() {
  const { fmt, cycle, settings } = useApp()
  const ledger = useLedger()
  const [view, setView] = useState<'monthly' | 'bonus'>('monthly')
  const [editing, setEditing] = useState(false)
  const [scope, setScope] = useState<BudgetScope>('onward')
  const [newCat, setNewCat] = useState<Record<string, string>>({})
  const [newGroup, setNewGroup] = useState({ name: '', kind: 'expense' as GroupKind })
  const s = useMemo(() => (ledger ? summarise(ledger.categories, ledger.groups, ledger.txs, cycle.start, cycle.end, cycle.key) : null), [ledger, cycle])
  if (!ledger || !s) return null
  const { groups, categories } = ledger
  const month = monthLong(cycle.year, cycle.month, settings.locale)
  const previous = shiftCycle(settings, cycle, -1)
  const previousMonth = monthLong(previous.year, previous.month, settings.locale)

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
    <Page title="Budget" actions={view === 'monthly' ? <button className={editing ? 'primary' : ''} onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit budget'}</button> : undefined}>
      <Chips label="Budget section" value={view} onChange={setView} options={[{ value: 'monthly', label: 'Monthly budget' }, { value: 'bonus', label: 'Bonus' }]} />
      {view === 'bonus' ? <Bonus /> : <>
      <CycleSwitcher />
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
          <div className="card stack">
            <Chips caption label="Apply a change to" value={scope} options={[{ value: 'onward', label: `${month} and later` }, { value: 'all', label: 'Every month' }]}
              onChange={(v) => { if (v === 'all' && !confirm('Every month means past months change too: their budgets are replaced and any earlier history of changes is cleared. Continue?')) return; setScope(v) }} />
            <p className="xs muted" style={{ margin: 0 }}>
              {scope === 'onward'
                ? <>You are changing the budget for <b>{month}</b> and the months after it, until you change it again. Earlier months keep the budget they had.</>
                : <>You are replacing the budget for <b>every</b> month, past and future. Use this only to correct a mistake.</>}
            </p>
          </div>
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
                    <div className="row" key={c.id} style={{ marginBottom: 8, alignItems: 'flex-start' }}>
                      <input className="grow" aria-label="Category name" defaultValue={c.name} onBlur={(e) => e.target.value.trim() && db.categories.update(c.id, { name: e.target.value.trim() })} />
                      {budgeted && (
                        <div style={{ width: 130 }}>
                          <MoneyInput label={`Monthly budget for ${c.name}`} value={budgetFor(c, cycle.key)} onChange={(cents) => setCategoryBudget(c.id, cycle.key, cents, scope)} />
                          {budgetFor(c, previous.key) !== budgetFor(c, cycle.key) && <span className="xs muted" style={{ display: 'block', marginTop: 2 }}>{previousMonth}: {fmt(budgetFor(c, previous.key))}</span>}
                        </div>
                      )}
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
      </>}
    </Page>
  )
}
