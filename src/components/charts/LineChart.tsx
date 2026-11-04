import { useMemo, useState } from 'react'
import { niceTicks } from '@/lib/format'
import { ChartFrame, Tooltip, useWidth, type Series } from './shared'

interface Props {
  labels: string[]
  series: Series[]
  fmt: (cents: number) => string
  axisFmt: (cents: number) => string
  height?: number
}

const M = { top: 16, right: 14, bottom: 24, left: 44 }

export function LineChart({ labels, series, fmt, axisFmt, height = 240 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const plotW = Math.max(60, width - M.left - M.right), plotH = height - M.top - M.bottom
  const n = labels.length

  const { ticks, y } = useMemo(() => {
    const all = series.flatMap((s) => s.values)
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all))
    const lo = ticks[0], hi = ticks[ticks.length - 1]
    return { ticks, y: (v: number) => M.top + ((hi - v) / (hi - lo || 1)) * plotH }
  }, [series, plotH])
  const x = (i: number) => M.left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1))

  function nearest(clientX: number, el: SVGSVGElement) {
    const px = clientX - el.getBoundingClientRect().left
    let best = 0
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    return best
  }

  return (
    <ChartFrame>
      <div ref={ref} style={{ position: 'relative' }}>
        <svg
          width={width} height={height} role="img" aria-label={`Line chart: ${series.map((s) => s.label).join(', ')} over ${n} periods`} tabIndex={0}
          onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget))} onPointerLeave={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setActive((a) => Math.min(n - 1, (a ?? -1) + 1))
            if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? n) - 1))
          }}
          onBlur={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
              <text x={M.left - 6} y={y(t) + 4} textAnchor="end">{axisFmt(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => <text key={l + i} x={x(i)} y={height - 6} textAnchor="middle">{l}</text>)}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} stroke="var(--faint)" strokeWidth={1} />}
          {series.map((s) => (
            <g key={s.key}>
              <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join('')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={active === i ? 5 : 4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          ))}
        </svg>
        {active !== null && (
          <Tooltip
            x={Math.min(width - 70, Math.max(70, x(active)))} y={Math.max(60, M.top + 40)}
            head={labels[active]} rows={series.map((s) => ({ label: s.label, value: fmt(s.values[active]), color: s.color }))}
          />
        )}
      </div>
    </ChartFrame>
  )
}
