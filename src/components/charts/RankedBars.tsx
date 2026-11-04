import { useState } from 'react'
import { ChartFrame, Tooltip, useWidth } from './shared'

export interface Ranked { key: string; label: string; value: number; color: string }

const ROW = 36, BAR = 14

/** Part-to-whole as ranked horizontal bars: largest first, value at the tip. */
export function RankedBars({ items, fmt }: { items: Ranked[]; fmt: (cents: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0)
  const max = Math.max(1, ...items.map((i) => i.value))
  const labelW = Math.min(150, Math.max(90, width * 0.36)), valueW = 118
  const barMax = Math.max(40, width - labelW - valueW - 8)

  return (
    <ChartFrame>
      <div ref={ref} style={{ position: 'relative' }}>
        <svg width={width} height={items.length * ROW + 4} role="img" aria-label={`Ranked bars: ${items.map((i) => `${i.label} ${fmt(i.value)}`).join(', ')}`}>
          {items.map((it, i) => {
            const w = Math.max(2, (Math.max(0, it.value) / max) * barMax)
            const cy = i * ROW + ROW / 2
            return (
              <g key={it.key} opacity={active === null || active === i ? 1 : 0.6}>
                <text x={0} y={cy + 4} style={{ fill: 'var(--text)', fontSize: 12 }}>{clip(it.label, Math.floor(labelW / 6.6))}</text>
                <path d={`M${labelW},${cy - BAR / 2}h${w - 4}a4,4 0 0 1 4,4v${BAR - 8}a4,4 0 0 1 -4,4h${-(w - 4)}z`} fill={it.color} />
                <text x={labelW + w + 8} y={cy + 4} style={{ fill: 'var(--text)', fontWeight: 600, fontSize: 12 }}>
                  {fmt(it.value)}<tspan style={{ fill: 'var(--muted)', fontWeight: 400 }}> {total > 0 ? `${Math.round((Math.max(0, it.value) / total) * 100)}%` : ''}</tspan>
                </text>
                <rect
                  x={0} y={i * ROW} width={width} height={ROW} fill="transparent" tabIndex={0}
                  aria-label={`${it.label}: ${fmt(it.value)}`}
                  onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                />
              </g>
            )
          })}
        </svg>
        {active !== null && (
          <Tooltip x={Math.min(width - 70, labelW + 60)} y={active * ROW + 2} head={items[active].label} rows={[{ label: 'Amount', value: fmt(items[active].value), color: items[active].color }]} />
        )}
      </div>
    </ChartFrame>
  )
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s)
