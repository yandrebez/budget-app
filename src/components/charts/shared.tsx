import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface Series { key: string; label: string; color: string; values: number[] }

/** Width of an element in px, kept current with ResizeObserver. */
export function useWidth<T extends HTMLElement>(initial = 320) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth || initial)
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width) || initial))
    ro.observe(el)
    return () => ro.disconnect()
  }, [initial])
  return [ref, width] as const
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend" aria-label="Legend">
      {items.map((i) => <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>)}
    </div>
  )
}

/** Hover readout. Values lead, labels follow. Text goes in via React (escaped), never innerHTML. */
export function Tooltip({ x, y, head, rows, total }: { x: number; y: number; head: string; rows: { label: string; value: string; color: string }[]; total?: string }) {
  return (
    <div className="tip" style={{ left: x, top: y }} role="status">
      <div className="head">{head}</div>
      {rows.map((r) => (
        <div className="row between" key={r.label} style={{ gap: 14 }}><span><span className="key" style={{ background: r.color }} />{r.label}</span><b>{r.value}</b></div>
      ))}
      {total && <div className="row between" style={{ gap: 14, marginTop: 4, borderTop: '1px solid var(--line)', paddingTop: 4 }}><span>Total</span><b>{total}</b></div>}
    </div>
  )
}

/** Accessible alternative to any chart: the same numbers as a table. */
export function DataTable({ columns, rows }: { columns: string[]; rows: { label: string; cells: string[] }[] }) {
  return (
    <div className="scroll">
      <table>
        <thead><tr><th>{columns[0]}</th>{columns.slice(1).map((c) => <th className="right" key={c}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td>{r.cells.map((c, i) => <td className="right num" key={i}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export const ChartFrame = ({ children }: { children: ReactNode }) => <div className="chart">{children}</div>

/** Rect with only the data-end corners rounded (square at the baseline). */
export function endRect(x: number, y: number, w: number, h: number, r: number, up: boolean): string {
  const rr = Math.min(r, w / 2, h)
  if (h <= 0) return ''
  return up
    ? `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
    : `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`
}
