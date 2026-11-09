import { useMemo, useState } from 'react'
import type { DayPoint, ForecastEvent } from '@/domain/forecast/forecast'
import { addDays, daysBetween } from '@/lib/dates'
import { dayMonth, niceTicks } from '@/lib/format'
import { ChartFrame, Tooltip, useWidth } from './shared'

interface Props {
  start: string
  end: string
  today: string
  history: DayPoint[]
  projection: DayPoint[]
  lowPath: number[]
  highPath: number[]
  events: ForecastEvent[]
  fmt: (cents: number) => string
  axisFmt: (cents: number) => string
  locale: string
  /** Label for the divider between what happened and what is forecast. */
  todayLabel?: string
  height?: number
}

const M = { top: 22, right: 12, bottom: 26, left: 44 }
const KIND_COLOR = { bill: 'var(--series-2)', income: 'var(--series-3)', oneoff: 'var(--series-4)' } as const

/** Balance so far (solid), expected balance (dashed) with a likely range, and the bills and pay that drive it. */
export function ForecastChart({ start, end, today, history, projection, lowPath, highPath, events, fmt, axisFmt, locale, todayLabel = 'Today', height = 260 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const total = daysBetween(start, end) + 1
  const todayIdx = daysBetween(start, today)
  const plotW = Math.max(80, width - M.left - M.right), plotH = height - M.top - M.bottom
  const x = (i: number) => M.left + (total === 1 ? plotW / 2 : (plotW * i) / (total - 1))

  const { ticks, y } = useMemo(() => {
    const all = [...history.map((p) => p.balance), ...projection.map((p) => p.balance), ...lowPath, ...highPath]
    const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all))
    const lo = ticks[0], hi = ticks[ticks.length - 1]
    return { ticks, y: (v: number) => M.top + ((hi - v) / (hi - lo || 1)) * plotH }
  }, [history, projection, lowPath, highPath, plotH])

  const line = (pts: DayPoint[]) => pts.map((p, k) => `${k ? 'L' : 'M'}${x(daysBetween(start, p.date))},${y(p.balance)}`).join('')
  const band = projection.length > 1
    ? `${projection.map((p, k) => `${k ? 'L' : 'M'}${x(daysBetween(start, p.date))},${y(Math.max(lowPath[k], highPath[k]))}`).join('')}${[...projection].reverse().map((p, k) => `L${x(daysBetween(start, p.date))},${y(Math.min(lowPath[projection.length - 1 - k], highPath[projection.length - 1 - k]))}`).join('')}Z`
    : ''
  const lowest = ticks[0]
  const live = events.filter((e) => !e.skipped)
  const at = (i: number) => {
    const date = addDays(start, i)
    const actual = i <= todayIdx ? history[i]?.balance : undefined
    const pi = projection.findIndex((p) => p.date === date)
    return { date, actual, forecast: i >= todayIdx && pi >= 0 ? projection[pi].balance : undefined, pi, evs: live.filter((e) => e.date === date) }
  }
  const labelIdx = Array.from(new Set([0, Math.round((total - 1) * 0.25), Math.round((total - 1) * 0.5), Math.round((total - 1) * 0.75), total - 1]))
  const nearest = (clientX: number, el: SVGSVGElement) => {
    const px = clientX - el.getBoundingClientRect().left
    return Math.max(0, Math.min(total - 1, Math.round(((px - M.left) / (plotW || 1)) * (total - 1))))
  }
  const a = active === null ? null : at(active)
  const last = projection[projection.length - 1]

  return (
    <ChartFrame>
      <div ref={ref} style={{ position: 'relative' }}>
        <svg
          width={width} height={height} role="img" tabIndex={0}
          aria-label={`Balance from ${fmt(history[0]?.balance ?? 0)} at the start of the period to about ${fmt(last?.balance ?? 0)} on ${dayMonth(end, locale)}`}
          onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget))} onPointerLeave={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setActive((v) => Math.min(total - 1, (v ?? todayIdx - 1) + 1))
            if (e.key === 'ArrowLeft') setActive((v) => Math.max(0, (v ?? todayIdx + 1) - 1))
          }}
          onBlur={() => setActive(null)}
        >
          {lowest < 0 && <rect x={M.left} y={y(0)} width={plotW} height={Math.max(0, y(lowest) - y(0))} fill="var(--bad)" opacity={0.08} />}
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} style={t === 0 ? { stroke: 'var(--faint)' } : undefined} />
              <text x={M.left - 6} y={y(t) + 4} textAnchor="end">{axisFmt(t)}</text>
            </g>
          ))}
          {labelIdx.map((i) => <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === total - 1 ? 'end' : 'middle'}>{dayMonth(addDays(start, i), locale)}</text>)}
          {band && <path d={band} fill="var(--series-1)" opacity={0.14} />}
          <line x1={x(todayIdx)} x2={x(todayIdx)} y1={M.top - 4} y2={M.top + plotH} stroke="var(--faint)" strokeWidth={1} />
          <text x={x(todayIdx)} y={M.top - 8} textAnchor="middle" style={{ fill: 'var(--text)', fontWeight: 600 }}>{todayLabel}</text>
          <path d={line(history)} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={line(projection)} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" />
          {live.map((e) => {
            const p = projection.find((q) => q.date === e.date)
            return p ? <circle key={e.id} cx={x(daysBetween(start, e.date))} cy={y(p.balance)} r={4.5} fill={KIND_COLOR[e.kind]} stroke="var(--surface)" strokeWidth={2} /> : null
          })}
          {last && <circle cx={x(daysBetween(start, last.date))} cy={y(last.balance)} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />}
          {active !== null && <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} stroke="var(--faint)" strokeWidth={1} />}
        </svg>
        {a && (
          <Tooltip
            x={Math.min(width - 80, Math.max(80, x(active as number)))} y={M.top + 70}
            head={dayMonth(a.date, locale)}
            rows={[
              ...(a.actual !== undefined ? [{ label: 'Actual', value: fmt(a.actual), color: 'var(--series-1)' }] : []),
              ...(a.actual === undefined && a.forecast !== undefined ? [{ label: 'Expected', value: fmt(a.forecast), color: 'var(--series-1)' }] : []),
              ...(a.actual === undefined && a.pi > 0 ? [{ label: 'Range', value: `${fmt(Math.min(lowPath[a.pi], highPath[a.pi]))} – ${fmt(Math.max(lowPath[a.pi], highPath[a.pi]))}`, color: 'var(--series-other)' }] : []),
              ...a.evs.map((e) => ({ label: e.label, value: `${e.amount < 0 ? '−' : '+'}${fmt(Math.abs(e.amount))}`, color: KIND_COLOR[e.kind] })),
            ]}
          />
        )}
      </div>
    </ChartFrame>
  )
}
