import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fromCents, parseTypedNumber, toCents } from '@/lib/money'
import { useApp } from '@/app/AppContext'
import { formatDate } from '@/lib/dates'
import { monthLong } from '@/lib/format'

export function Page({ title, actions, back, children }: { title: string; actions?: ReactNode; back?: { label: string; onClick: () => void }; children: ReactNode }) {
  return (
    <>
      {back && <button className="link small" style={{ marginTop: 6 }} onClick={back.onClick}>‹ {back.label}</button>}
      <div className="row between wrap"><h1>{title}</h1><div className="row">{actions}</div></div>
      {children}
    </>
  )
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="card empty">{children}</div>

export function Progress({ fraction, over, calm, thick }: { fraction: number; over?: boolean; calm?: boolean; thick?: boolean }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return <div className={`bar${thick ? ' thick' : ''}${over ? ' over' : fraction > 0.85 && !calm ? ' warn' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
}

/**
 * Amount box that edits whole currency units but reports integer cents. It is a text field (not
 * type="number") so a comma works on phones that use a decimal comma; both "12,50" and "12.50" are read.
 */
export function MoneyInput({ value, onChange, label, allowNegative, ...rest }: { value: number; onChange: (cents: number) => void; label?: string; allowNegative?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value ? String(fromCents(value)) : '')
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) { last.current = value; setText(value ? String(fromCents(value)) : '') }
  }, [value])

  const update = (raw: string) => {
    const cleaned = raw.replace(allowNegative ? /[^\d.,\-−–\s]/g : /[^\d.,\s]/g, '')
    setText(cleaned)
    const n = parseTypedNumber(cleaned)
    const cents = n === null ? 0 : toCents(n)
    last.current = cents
    onChange(cents)
  }

  return (
    <div className="row" style={{ gap: 6 }}>
      <input
        type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" aria-label={label} placeholder="0,00" {...rest}
        value={text} onChange={(e) => update(e.target.value)}
      />
      {allowNegative && (
        <button type="button" aria-label="Switch between positive and negative" title="Positive / negative" style={{ minWidth: 44, padding: '8px 0' }}
          onClick={() => update(/^[-−–]/.test(text.trim()) ? text.trim().replace(/^[-−–]\s*/, '') : `-${text.trim()}`)}>±</button>
      )}
    </div>
  )
}

/** Plain decimal box (e.g. an interest rate): same comma-friendly behaviour, reports a number or null. */
export function DecimalInput({ value, onChange, label, ...rest }: { value: number; onChange: (n: number) => void; label?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value ? String(value) : '')
  const last = useRef(value)
  useEffect(() => {
    if (value !== last.current) { last.current = value; setText(value ? String(value) : '') }
  }, [value])
  return (
    <input
      type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off" aria-label={label} placeholder="0" {...rest}
      value={text}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d.,\s]/g, '')
        setText(cleaned)
        const n = Math.max(0, parseTypedNumber(cleaned) ?? 0)
        last.current = n
        onChange(n)
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
  return (
    <div className="row between" style={{ marginBottom: 10 }}>
      <button className="ghost" onClick={() => moveCycle(-1)} aria-label="Previous period">‹</button>
      <div style={{ textAlign: 'center' }}>
        <b>{monthLong(cycle.year, cycle.month, settings.locale)}</b>
        <div className="xs muted">{formatDate(cycle.start, settings.locale)} – {formatDate(cycle.end, settings.locale)}</div>
        {!isCurrentCycle && <button className="link xs" onClick={goCurrent}>Back to current</button>}
      </div>
      <button className="ghost" onClick={() => moveCycle(1)} aria-label="Next period">›</button>
    </div>
  )
}

/** A row of single-choice chips (radio behaviour). */
export function Chips<T extends string | number>({ value, options, onChange, label, caption }: {
  value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string; caption?: boolean
}) {
  return (
    <div>
      {caption && <div className="xs muted" style={{ margin: '6px 0 0' }}>{label}</div>}
      <div className="chips" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.value)} className="chip" aria-pressed={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}
