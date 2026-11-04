import { useMemo, useState } from 'react'
import { niceTicks } from '@/lib/format'
import { ChartFrame, endRect, Tooltip, useWidth, type Series } from './shared'

interface Props {
  labels: string[]
  series: Series[]
  fmt: (cents: number) => string
  axisFmt: (cents: number) => string
  height?: number
}

const M = { top: 20, right: 8, bottom: 24, left: 44 }
const GAP = 2

/** Single-series columns, or stacked segments when there are several series. */
export function ColumnChart({ labels, series, fmt, axisFmt, height = 240 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const plotW = Math.max(60, width - M.left - M.right), plotH = height - M.top - M.bottom

  const { ticks, y, pos, neg } = useMemo(() => {
    const pos = labels.map((_, i) => series.reduce((s, x) => s + Math.max(0, x.values[i]), 0))
    const neg = labels.map((_, i) => series.reduce((s, x) => s + Math.min(0, x.values[i]), 0))
    const ticks = niceTicks(Math.min(0, ...neg), Math.max(0, ...pos))
    const lo = ticks[0], hi = ticks[ticks.length - 1]
    return { ticks, pos, neg, y: (v: number) => M.top + ((hi - v) / (hi - lo || 1)) * plotH }
  }, [labels, series, plotH])

  const band = plotW / labels.length
  const colW = Math.min(24, band * 0.6)
  const stacked = series.length > 1
  const zero = y(0)

  return (
    <ChartFrame>
      <div ref={ref} style={{ position: 'relative' }}>
        <svg width={width} height={height} role="img" aria-label={`Columns chart: ${series.map((s) => s.label).join(', ')} over ${labels.length} periods`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
              <text x={M.left - 6} y={y(t) + 4} textAnchor="end">{axisFmt(t)}</text>
            </g>
          ))}
          {labels.map((label, i) => {
            const cx = M.left + band * i + band / 2
            let up = zero, down = zero
            const segs = series.map((s, si) => {
              const v = s.values[i]
              if (!v) return null
              const h = Math.abs(y(v) - zero)
              const isUp = v > 0
              const top = isUp ? up - h : down
              if (isUp) up -= h; else down += h
              const last = isUp ? si === lastIndex(series, i, true) : si === lastIndex(series, i, false)
              const draw = Math.max(0, h - (stacked ? GAP : 0))
              const yy = isUp ? top + (stacked ? GAP : 0) : top
              const d = last ? endRect(cx - colW / 2, isUp ? top + (stacked ? GAP : 0) : top, colW, draw, 4, isUp) : `M${cx - colW / 2},${yy}h${colW}v${draw}h${-colW}Z`
              return <path key={s.key} d={d} fill={s.color} opacity={active === null || active === i ? 1 : 0.55} />
            })
            return (
              <g key={label}>
                {segs}
                <text x={cx} y={height - 6} textAnchor="middle">{label}</text>
                <rect
                  x={M.left + band * i} y={M.top} width={band} height={plotH + M.bottom} fill="transparent" tabIndex={0}
                  aria-label={`${label}: ${series.map((s) => `${s.label} ${fmt(s.values[i])}`).join(', ')}`}
                  onPointerEnter={() => setActive(i)} onPointerMove={() => setActive(i)} onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                />
              </g>
            )
          })}
          <line className="grid" x1={M.left} x2={width - M.right} y1={zero} y2={zero} style={{ stroke: 'var(--faint)' }} />
          {!stacked && series[0] && labels.length > 0 && (
            <text x={M.left + band * (labels.length - 1) + band / 2} y={y(Math.max(0, series[0].values[labels.length - 1])) - 6} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 600 }}>
              {axisFmt(series[0].values[labels.length - 1])}
            </text>
          )}
        </svg>
        {active !== null && (
          <Tooltip
            x={Math.min(width - 70, Math.max(70, M.left + band * active + band / 2))}
            y={Math.max(60, y(pos[active] || 0) - 8)}
            head={labels[active]}
            rows={series.filter((s) => s.values[active]).map((s) => ({ label: s.label, value: fmt(s.values[active]), color: s.color }))}
            total={stacked ? fmt(pos[active] + neg[active]) : undefined}
          />
        )}
      </div>
    </ChartFrame>
  )
}

/** Index of the outermost series with a non-zero value on that side, so only it gets the rounded end. */
function lastIndex(series: Series[], i: number, positive: boolean): number {
  for (let k = series.length - 1; k >= 0; k--) if (positive ? series[k].values[i] > 0 : series[k].values[i] < 0) return k
  return -1
}
