import { useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Empty, MoneyInput, Page, Progress } from '@/components/ui'
import { CategorySelect } from '@/components/CategorySelect'
import { db } from '@/db/db'
import { potProgress } from '@/domain/savings/progress'
import { useCategories, useGroups, usePots } from '@/hooks/useBudgetData'
import { newId } from '@/lib/id'

export function Savings() {
  const { fmt } = useApp()
  const pots = usePots(), categories = useCategories(), groups = useGroups()
  const [name, setName] = useState('')
  if (!pots || !categories || !groups) return null
  const monthly = (catId: string | null) => categories.find((c) => c.id === catId)?.monthlyBudget ?? 0

  return (
    <Page title="Savings">
      <div className="card row between"><b>Total saved</b><b className="num good">{fmt(pots.reduce((s, p) => s + p.balance, 0))}</b></div>
      {pots.length === 0 && <Empty>No savings pots yet.</Empty>}
      {pots.map((p) => {
        const pr = potProgress(p.balance, p.target, monthly(p.categoryId))
        return (
          <div className="card stack" key={p.id}>
            <div className="row between"><input className="grow" aria-label="Pot name" defaultValue={p.name} onBlur={(e) => db.pots.update(p.id, { name: e.target.value.trim() || p.name })} />
              <button className="ghost danger" aria-label={`Delete ${p.name}`} onClick={() => confirm(`Delete ${p.name}?`) && db.pots.delete(p.id)}>✕</button></div>
            <div className="grid2">
              <label>Balance now<MoneyInput value={p.balance} onChange={(balance) => db.pots.update(p.id, { balance })} /></label>
              <label>Target<MoneyInput value={p.target} onChange={(target) => db.pots.update(p.id, { target })} /></label>
            </div>
            <label>Monthly contribution comes from<CategorySelect value={p.categoryId ?? ''} onChange={(id) => db.pots.update(p.id, { categoryId: id || null })} groups={groups.filter((g) => g.kind === 'savings')} categories={categories} /></label>
            {p.target > 0 && <>
              <Progress fraction={pr.fraction} />
              <div className="small muted">{Math.round(pr.fraction * 100)}% · {fmt(pr.remaining)} to go{pr.monthsToTarget ? ` · about ${pr.monthsToTarget} months at ${fmt(monthly(p.categoryId))}/month` : ''}</div>
            </>}
          </div>
        )
      })}
      <div className="card row">
        <input className="grow" placeholder="New savings pot" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={async () => { if (!name.trim()) return; await db.pots.add({ id: newId(), name: name.trim(), balance: 0, target: 0, categoryId: null }); setName('') }}>Add</button>
      </div>
    </Page>
  )
}
