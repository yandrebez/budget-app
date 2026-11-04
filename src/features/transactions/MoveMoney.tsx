import { useEffect, useState } from 'react'
import type { Account } from '@/types'
import { useApp } from '@/app/AppContext'
import { Modal, MoneyInput } from '@/components/ui'
import { db } from '@/db/db'
import { ensureTransferCategory } from '@/db/repo'
import { buildTransfer } from '@/domain/transactions/transfer'
import { todayISO } from '@/lib/dates'
import { newId } from '@/lib/id'

/** Move money between two of your own accounts (e.g. leftover into savings). */
export function MoveMoney({ open, onClose, accounts, defaultFrom }: { open: boolean; onClose: () => void; accounts: Account[]; defaultFrom: string }) {
  const { settings } = useApp()
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState('')
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  // Start fresh every time the dialog opens, from the account being viewed.
  useEffect(() => {
    if (!open) return
    setFrom(defaultFrom); setTo(''); setAmount(0); setNote(''); setDate(todayISO()); setError('')
  }, [open, defaultFrom])

  const dest = to || accounts.find((a) => a.id !== from)?.id || ''
  const source = accounts.some((a) => a.id === from) ? from : accounts[0]?.id ?? ''

  async function save() {
    try {
      const categoryId = await ensureTransferCategory()
      const rows = buildTransfer({ fromId: source, toId: dest, amount, date, note, categoryId, ids: { out: newId(), in: newId(), transfer: newId() } })
      await db.transactions.bulkAdd(rows)
      onClose()
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Move money">
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Records money moving between your own accounts. It leaves one and arrives in the other, and does not count as spending.</p>
        <div className="grid2">
          <label>From<select value={source} onChange={(e) => setFrom(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>To<select value={dest} onChange={(e) => setTo(e.target.value)}>{accounts.filter((a) => a.id !== source).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        </div>
        <div className="grid2">
          <label>Amount ({settings.currency})<MoneyInput value={amount} onChange={setAmount} /></label>
          <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Leftover to savings" /></label>
        {error && <div className="bad small" role="alert">{error}</div>}
        <div className="row between"><span /><span className="row"><button onClick={onClose}>Cancel</button><button className="primary" disabled={!(amount > 0) || !dest} onClick={save}>Move</button></span></div>
      </div>
    </Modal>
  )
}
