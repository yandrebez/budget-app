import { useApp } from '@/app/AppContext'
import { dayMonth } from '@/lib/format'
import { useForecast } from './useForecast'
import { VERDICT } from './verdict'

/** The one-line answer for Home. Tapping it opens the full forecast. */
export function ForecastCard({ go }: { go: (tab: string) => void }) {
  const { fmt, settings } = useApp()
  const f = useForecast()
  if (!f || f.remaining === 0) return null
  const v = VERDICT[f.verdict]
  return (
    <button className="card item row between" style={{ marginBottom: 14 }} onClick={() => go('forecast')} aria-label="Open the month-end forecast">
      <span className="grow">
        <span className="xs muted" style={{ display: 'block' }}>Forecast to {dayMonth(f.end, settings.locale)}{f.staleDays > 0 ? ` · from your ${dayMonth(f.asOf, settings.locale)} entries` : ''}</span>
        <b className={v.cls}>{v.icon} {v.word}</b>
        <span className="small muted" style={{ display: 'block' }}>
          {f.verdict === 'short' && f.firstNegativeDate ? `Short from ${dayMonth(f.firstNegativeDate, settings.locale)}` : `About ${fmt(f.endBalance)} left at the end`}
        </span>
      </span>
      <span className="muted" aria-hidden="true">›</span>
    </button>
  )
}
