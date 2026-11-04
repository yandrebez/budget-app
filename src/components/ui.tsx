import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fromCents, toCents } from '@/lib/money'
import { useApp } from '@/app/AppContext'

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="row between wrap"><h1>{title}</h1><div className="row">{actions}</div></div>
      {children}
    </>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="card empty">{children}</div>

export function Progress({ fraction, over, calm }: { fraction: number; over?: boolean; calm?: boolean }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return <div className={`bar${over ? ' over' : fraction > 0.85 && !calm ? ' warn' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
}

/** Number input that edits whole currency units but reports integer cents. */
export function MoneyInput({ value, onChange, label, ...rest }: { value: number; onChange: (cents: number) => void; label?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value ? String(fromCents(value)) : '')
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) { last.current = value; setText(value ? String(fromCents(value)) : '') }
  }, [value])
  return (
    <input
      inputMode="decimal" type="number" step="0.01" min="0" aria-label={label} placeholder="0.00" {...rest}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const c = e.target.value === '' ? 0 : toCents(Number(e.target.value))
        last.current = c
        onChange(Number.isFinite(c) ? c : 0)
      }}
    />
  )
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      {open && children}
    </dialog>
  )
}

export function CycleSwitcher() {
  const { cycle, moveCycle, goCurrent, isCurrentCycle, settings } = useApp()
  const label = new Intl.DateTimeFormat(settings.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(cycle.year, cycle.month - 1, 1)))
  return (
    <div className="row between" style={{ marginBottom: 12 }}>
      <button onClick={() => moveCycle(-1)} aria-label="Previous period">‹</button>
      <div style={{ textAlign: 'center' }}>
        <b>{label}</b>
        <div className="small muted">{cycle.start} → {cycle.end}</div>
        {!isCurrentCycle && <button className="ghost small" onClick={goCurrent}>Back to current</button>}
      </div>
      <button onClick={() => moveCycle(1)} aria-label="Next period">›</button>
    </div>
  )
}
