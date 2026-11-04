import { useState } from 'react'
import { useApp } from '@/app/AppContext'
import { Empty, MoneyInput, Page } from '@/components/ui'
import { CategorySelect } from '@/components/CategorySelect'
import { db } from '@/db/db'
import { payoff } from '@/domain/debt/payoff'
import { useCategories, useDebts, useGroups } from '@/hooks/useBudgetData'
import { newId } from '@/lib/id'

export function Debt() {
  const { fmt } = useApp()
  const debts = useDebts(), categories = useCategories(), groups = useGroups()
  const [name, setName] = useState('')
  if (!debts || !categories || !groups) return null
  const monthly = (catId: string | null) => categories.find((c) => c.id === catId)?.monthlyBudget ?? 0
  const total = debts.reduce((s, d) => s + d.balance, 0)

  return (
    <Page title="Debt">
      <div className="card row between"><b>Total owed</b><b className="num">{fmt(total)}</b></div>
      <p className="small muted">Update each balance when your statement arrives. The monthly payment comes from the budget category you link.</p>
      {debts.length === 0 && <Empty>No debts tracked.</Empty>}
      {debts.map((d) => {
        const pay = monthly(d.categoryId)
        const p = payoff(d.balance, d.interestRate, pay)
        return (
          <div className="card stack" key={d.id}>
            <div className="row between"><input className="grow" aria-label="Debt name" defaultValue={d.name} onBlur={(e) => db.debts.update(d.id, { name: e.target.value.trim() || d.name })} />
              <button className="ghost danger" aria-label={`Delete ${d.name}`} onClick={() => confirm(`Delete ${d.name}?`) && db.debts.delete(d.id)}>✕</button></div>
            <div className="grid2">
              <label>Balance now<MoneyInput value={d.balance} onChange={(balance) => db.debts.update(d.id, { balance })} /></label>
              <label>Interest rate (% a year)<input type="number" step="0.01" min="0" defaultValue={d.interestRate * 100 || ''} onBlur={(e) => db.debts.update(d.id, { interestRate: (Number(e.target.value) || 0) / 100 })} /></label>
            </div>
            <label>Paid from budget category<CategorySelect value={d.categoryId ?? ''} onChange={(id) => db.debts.update(d.id, { categoryId: id || null })} groups={groups.filter((g) => g.kind === 'debt')} categories={categories} /></label>
            <div className="small muted">
              {d.balance <= 0 ? <span className="good">Paid off 🎉</span>
                : p.months === null ? <span className="warn">{pay > 0 ? 'The monthly payment does not cover the interest.' : 'Link a budget category with a monthly amount to see a payoff estimate.'}</span>
                : <>Paying {fmt(pay)}/month clears this in <b>{p.months}</b> months, with about {fmt(p.totalInterest ?? 0)} interest.</>}
            </div>
          </div>
        )
      })}
      <div className="card row">
        <input className="grow" placeholder="New debt (e.g. loan name)" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={async () => { if (!name.trim()) return; await db.debts.add({ id: newId(), name: name.trim(), balance: 0, interestRate: 0, categoryId: null }); setName('') }}>Add</button>
      </div>
    </Page>
  )
}
