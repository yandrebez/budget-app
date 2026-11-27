import { useMemo, useState } from 'react'
import type { BonusPart, BonusPlan } from '@/types'
import { useApp } from '@/app/AppContext'
import { Empty, MoneyInput, Progress } from '@/components/ui'
import { db } from '@/db/db'
import { updateBonuses } from '@/db/repo'
import { bonusSpending, doneTotal, leftToPlan, partSpent, plannedShare, plannedTotal, planState, sortBonuses, unplannedSpent } from '@/domain/budget/bonus'
import { shiftCycle } from '@/domain/cycles/cycle'
import { useLedger, type Ledger } from '@/hooks/useLedger'
import { newId } from '@/lib/id'
import { monthLong } from '@/lib/format'

/** Categories a bonus can be put towards: things you spend, pay off or save. Not income or transfers. */
function CategoryPick({ ledger, value, onChange, label }: { ledger: Ledger; value: string | null; onChange: (id: string | null) => void; label: string }) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} style={{ minHeight: 34, fontSize: '.85rem' }}>
      <option value="">No budget category</option>
      {ledger.groups.filter((g) => g.kind === 'expense' || g.kind === 'debt' || g.kind === 'savings').map((g) => {
        const cats = ledger.categories.filter((c) => c.groupId === g.id)
        return cats.length ? <optgroup key={g.id} label={g.name}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null
      })}
    </select>
  )
}

const change = (id: string, fn: (b: BonusPlan) => BonusPlan) => updateBonuses((cur) => cur.map((b) => (b.id === id ? fn(b) : b)))
const changePart = (id: string, partId: string, fn: (p: BonusPart) => BonusPart) =>
  change(id, (b) => ({ ...b, parts: b.parts.map((p) => (p.id === partId ? fn(p) : p)) }))

/**
 * Bonus plans: extra money on top of salary, planned on their own so the monthly budget stays exactly as it is.
 * Each bonus is split into parts (where it is going); tick a part off once the money has actually been moved.
 */
export function Bonus() {
  const { fmt, settings, current } = useApp()
  const ledger = useLedger()
  const list = sortBonuses(settings.bonuses ?? [])
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [period, setPeriod] = useState(current.key)

  // A year of months to choose from, plus any month an existing plan already uses.
  const months = useMemo(() => {
    const seen = new Map<string, string>()
    for (let k = -1; k <= 12; k++) { const c = shiftCycle(settings, current, k); seen.set(c.key, monthLong(c.year, c.month, settings.locale)) }
    for (const b of settings.bonuses ?? []) if (!seen.has(b.period)) seen.set(b.period, b.period)
    return [...seen].sort((a, b) => a[0].localeCompare(b[0]))
  }, [settings, current])
  const monthName = (key: string) => months.find(([k]) => k === key)?.[1] ?? key

  if (!ledger) return null

  async function add() {
    if (amount <= 0) return
    const plan: BonusPlan = { id: newId(), name: name.trim() || 'Bonus', amount, period, parts: [] }
    await updateBonuses((cur) => [...cur, plan])
    setName(''); setAmount(0)
  }

  return (
    <>
      <p className="small muted" style={{ marginTop: 0 }}>
        Plan extra money on top of your salary here. It is kept apart from your monthly budget. When you log a transaction, turn on <b>Paid from bonus</b> (or <b>This is bonus money</b> for the bonus arriving) and it stays out of your salary budget, Stats and forecast, while still moving your account balance.
      </p>

      {list.length === 0 && <Empty><p>No bonus planned yet.</p><p className="small">Add one below to decide where it goes before it lands.</p></Empty>}

      {list.map((b) => <BonusCard key={b.id} b={b} ledger={ledger} monthName={monthName} months={months} fmt={fmt} />)}

      <h2>Plan a bonus</h2>
      <div className="card stack">
        <label>Name<input value={name} placeholder="e.g. December bonus" onChange={(e) => setName(e.target.value)} /></label>
        <div className="grid2">
          <label>Amount you expect ({settings.currency}, after tax)<MoneyInput label="Bonus amount" value={amount} onChange={setAmount} /></label>
          <label>Arrives in<select aria-label="Month the bonus arrives" value={period} onChange={(e) => setPeriod(e.target.value)}>{months.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <button className="primary" disabled={amount <= 0} onClick={add}>Add bonus plan</button>
      </div>
    </>
  )
}

function BonusCard({ b, ledger, monthName, months, fmt }: { b: BonusPlan; ledger: Ledger; monthName: (k: string) => string; months: [string, string][]; fmt: (c: number) => string }) {
  const [label, setLabel] = useState('')
  const [partAmount, setPartAmount] = useState(0)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const planned = plannedTotal(b), left = leftToPlan(b), done = doneTotal(b), state = planState(b)
  const catName = (id: string | null) => ledger.categories.find((c) => c.id === id)?.name

  const isIncome = (id: string | null) => !!id && ledger.groups.find((g) => g.id === ledger.categories.find((c) => c.id === id)?.groupId)?.kind === 'income'
  const sp = bonusSpending(b, ledger.txs, isIncome)
  const unplanned = unplannedSpent(b, sp)

  async function removePlan() {
    const tagged = ledger.txs.filter((t) => t.bonusId === b.id).length
    const msg = tagged > 0
      ? `Delete the plan "${b.name}"? ${tagged} transaction${tagged === 1 ? ' is' : 's are'} marked as bonus money. They will go back into your salary budget.`
      : `Delete the plan "${b.name}"?`
    if (!confirm(msg)) return
    await db.transaction('rw', db.transactions, db.settings, async () => {
      await db.transactions.filter((t) => t.bonusId === b.id).modify((t) => { delete t.bonusId })
      const cur = await db.settings.get('main')
      if (cur) await db.settings.update('main', { bonuses: (cur.bonuses ?? []).filter((x) => x.id !== b.id) })
    })
  }

  async function addPart() {
    if (partAmount <= 0) return
    const part: BonusPart = { id: newId(), label: label.trim() || catName(categoryId) || 'Part', amount: partAmount, categoryId, done: false }
    await change(b.id, (x) => ({ ...x, parts: [...x.parts, part] }))
    setLabel(''); setPartAmount(0); setCategoryId(null)
  }

  return (
    <div className="card stack">
      <div className="row">
        <input className="grow" aria-label="Bonus name" defaultValue={b.name} onBlur={(e) => { const v = e.target.value.trim(); if (v) void change(b.id, (x) => ({ ...x, name: v })) }} />
        <button className="ghost danger" aria-label={`Delete ${b.name}`} onClick={() => removePlan()}>✕</button>
      </div>
      <div className="grid2">
        <label>Amount<MoneyInput label={`Amount of ${b.name}`} value={b.amount} onChange={(amount) => change(b.id, (x) => ({ ...x, amount }))} /></label>
        <label>Arrives in<select aria-label={`Month ${b.name} arrives`} value={b.period} onChange={(e) => { const period = e.target.value; void change(b.id, (x) => ({ ...x, period })) }}>{months.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>

      <div>
        <div className="row between small">
          <span>Planned <b className="num">{fmt(planned)}</b> of <b className="num">{fmt(b.amount)}</b></span>
          {state === 'complete' ? <b className="good">✓ Fully planned</b> : state === 'over' ? <b className="bad">Over by {fmt(-left)}</b> : <span>Left to plan <b className="num warn">{fmt(left)}</b></span>}
        </div>
        <Progress fraction={plannedShare(b)} over={state === 'over'} calm />
        {planned > 0 && <div className="xs muted" style={{ marginTop: 6 }}>{fmt(done)} of {fmt(planned)} ticked off · arrives in {monthName(b.period)}</div>}
      </div>

      {sp.count > 0 && (
        <div className="stack small" style={{ background: 'var(--bg)', borderRadius: 12, padding: 12 }}>
          {sp.received > 0 && <div className="row between"><span className="muted">Bonus received</span><b className="num good">{fmt(sp.received)}</b></div>}
          <div className="row between"><span className="muted">Spent from it so far</span><b className="num">{fmt(sp.spent)}</b></div>
          <div className="row between"><span className="muted">Left{sp.received > 0 ? '' : ' (of the planned amount)'}</span><b className={`num ${sp.left < 0 ? 'bad' : ''}`}>{fmt(sp.left)}</b></div>
          {unplanned > 0 && <div className="xs muted">{fmt(unplanned)} was spent in categories that no part below covers.</div>}
        </div>
      )}

      {b.parts.length > 0 && (
        <div>
          {b.parts.map((p) => (
            <div key={p.id} className="stack" style={{ padding: '10px 0', borderTop: '1px solid var(--line)', opacity: p.done ? 0.6 : 1 }}>
              <div className="row">
                <input type="checkbox" aria-label={`${p.label} is done`} checked={p.done} onChange={(e) => { const done = e.target.checked; void changePart(b.id, p.id, (x) => ({ ...x, done })) }} />
                <input className="grow" aria-label="What this part is for" defaultValue={p.label} onBlur={(e) => { const v = e.target.value.trim(); if (v) void changePart(b.id, p.id, (x) => ({ ...x, label: v })) }} />
                <div style={{ width: 120 }}><MoneyInput label={`Amount for ${p.label}`} value={p.amount} onChange={(amount) => changePart(b.id, p.id, (x) => ({ ...x, amount }))} /></div>
                <button className="ghost danger" aria-label={`Remove ${p.label}`} onClick={() => change(b.id, (x) => ({ ...x, parts: x.parts.filter((y) => y.id !== p.id) }))}>✕</button>
              </div>
              <CategoryPick ledger={ledger} label={`Budget category for ${p.label}`} value={p.categoryId} onChange={(id) => changePart(b.id, p.id, (x) => ({ ...x, categoryId: id }))} />
              {partSpent(p, sp) !== null && (
                <div>
                  <div className="row between xs muted"><span>Spent from the bonus</span><span className="num">{fmt(partSpent(p, sp) as number)} of {fmt(p.amount)}</span></div>
                  <Progress fraction={p.amount > 0 ? (partSpent(p, sp) as number) / p.amount : 0} over={(partSpent(p, sp) as number) > p.amount} calm />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <div className="xs muted">Add a part: where is some of it going?</div>
        <div className="row">
          <input className="grow" aria-label={`New part of ${b.name}`} placeholder="e.g. Emergency fund" value={label} onChange={(e) => setLabel(e.target.value)} />
          <div style={{ width: 120 }}><MoneyInput label={`Amount of new part of ${b.name}`} value={partAmount} onChange={setPartAmount} /></div>
        </div>
        <CategoryPick ledger={ledger} label={`Category of new part of ${b.name}`} value={categoryId} onChange={setCategoryId} />
        <div className="row between">
          <span className="xs muted">{left > 0 ? `${fmt(left)} still to plan` : ''}</span>
          <span className="row">
            {left > 0 && <button onClick={() => setPartAmount(left)}>Use the rest</button>}
            <button className="primary" disabled={partAmount <= 0} onClick={addPart}>Add part</button>
          </span>
        </div>
      </div>
    </div>
  )
}
