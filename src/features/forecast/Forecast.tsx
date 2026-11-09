import { useMemo, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { ForecastChart } from '@/components/charts/ForecastChart'
import { Legend } from '@/components/charts/shared'
import { Chips, Empty, MoneyInput, Page } from '@/components/ui'
import type { WhatIf } from '@/domain/forecast/forecast'
import { compactNumber, dayMonth } from '@/lib/format'
import { useForecast } from './useForecast'
import { VERDICT } from './verdict'

const SPEND: { value: number; label: string }[] = [
  { value: 0.7, label: '−30%' }, { value: 0.8, label: '−20%' }, { value: 0.9, label: '−10%' },
  { value: 1, label: 'As usual' }, { value: 1.1, label: '+10%' }, { value: 1.2, label: '+20%' },
]

export function Forecast({ back, go }: { back?: { label: string; onClick: () => void }; go: (tab: string) => void }) {
  const { fmt, settings } = useApp()
  const [mult, setMult] = useState(1)
  const [oneOff, setOneOff] = useState(0)
  const [counted, setCounted] = useState<Record<string, boolean>>({})
  const [everydayOff, setEverydayOff] = useState<string[]>([])
  const whatIf = useMemo<WhatIf>(() => ({ spendMultiplier: mult, oneOff, counted, everydayOff }), [mult, oneOff, counted, everydayOff])
  const f = useForecast(whatIf)
  const base = useForecast()
  const d = (iso: string) => dayMonth(iso, settings.locale)
  const changed = mult !== 1 || oneOff > 0 || Object.keys(counted).length > 0 || everydayOff.length > 0

  if (!f || !base) {
    return (
      <Page title="Forecast" back={back}>
        <Empty><p>The forecast needs an account and some transactions to learn from.</p><button className="primary" onClick={() => go('transactions')}>Open Activity</button></Empty>
      </Page>
    )
  }
  const v = VERDICT[f.verdict]
  const delta = f.endBalance - base.endBalance
  const money = (c: number) => `${c < 0 ? '−' : '+'}${fmt(Math.abs(c))}`

  const headline = f.remaining === 0
    ? <>The period ends today. Your balance is <b className="num">{fmt(f.balanceNow)}</b>.</>
    : f.verdict === 'short'
      ? <>You may run short on <b>{d(f.firstNegativeDate ?? f.minDate)}</b>.</>
      : f.verdict === 'tight'
        ? <>Only about <b className="num">{fmt(f.endBalance)}</b> left at the end.</>
        : <>About <b className="num">{fmt(f.endBalance)}</b> left at the end of the period.</>

  return (
    <Page title="Forecast" back={back}>
      <div className="card">
        <b className={v.cls} style={{ fontSize: '1.05rem' }}>{v.icon} {v.word}</b>
        <div className="hero num" style={{ fontSize: '1.5rem', marginTop: 6, fontWeight: 600 }}>{headline}</div>
        {f.remaining > 0 && (
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            Likely between <b className="num">{fmt(f.endRange.low)}</b> and <b className="num">{fmt(f.endRange.high)}</b> on {d(f.end)}.
            {f.minBalance < f.balanceNow && <> Lowest point <b className="num">{fmt(f.minBalance)}</b> on {d(f.minDate)}.</>}
          </p>
        )}
        {f.staleDays > 0 && f.remaining > 0 && <p className="xs muted" style={{ margin: '8px 0 0' }}>Based on your transactions up to {d(f.asOf)}. The {f.staleDays} day{f.staleDays === 1 ? '' : 's'} since are forecast, so adding them will sharpen this.</p>}
        {f.limitedHistory && <p className="xs warn" style={{ margin: '8px 0 0' }}>Not much history yet, so this leans on your budget and this period only. It gets sharper after a few months of transactions.</p>}
      </div>

      {f.remaining > 0 && (
        <div className="card stack">
          <h3>Can I save?</h3>
          {f.verdict === 'short' ? (
            <p style={{ margin: 0 }}>
              Not this month as things stand.{' '}
              {f.cutPerDay !== null && f.cutIsEnough
                ? <>Spending about <b className="num">{fmt(f.cutPerDay)}</b> less per day on everyday things (about {fmt(Math.max(0, f.everydayPerDay - f.cutPerDay))} instead of {fmt(f.everydayPerDay)}) would keep you above zero.</>
                : <>Even with no everyday spending your expected payments are bigger than your balance. Moving money back from savings, or leaving out a payment below that isn't really due, would help.</>}
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              {f.safeToSave > 0
                ? <>You could put about <b className="num good">{fmt(f.safeToSave)}</b> into savings now and still cover everything expected, with a small cushion.</>
                : <>There isn't spare money to save beyond what is already planned.</>}
            </p>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            Safe to spend about <b className="num">{fmt(f.safeDaily)}</b> a day on everyday things. You're averaging <b className="num">{fmt(f.everydayPerDay)}</b>. Savings transfers you make regularly are already counted.
          </p>
        </div>
      )}

      <div className="card">
        <ForecastChart
          start={f.start} end={f.end} today={f.asOf} todayLabel={f.staleDays > 0 ? 'Last entry' : 'Today'} history={f.history} projection={f.projection} lowPath={f.lowPath} highPath={f.highPath}
          events={f.events} fmt={fmt} axisFmt={(c) => compactNumber(c, settings.locale)} locale={settings.locale}
        />
        <Legend items={[
          { label: 'Balance so far', color: 'var(--series-1)' }, { label: 'Expected (dashed)', color: 'var(--series-1)' },
          { label: 'Likely range', color: 'color-mix(in srgb, var(--series-1) 25%, transparent)' },
          { label: 'Bill', color: 'var(--series-2)' }, { label: 'Pay', color: 'var(--series-3)' },
        ]} />
      </div>

      {f.remaining > 0 && (
        <>
          <h2>Still to come</h2>
          <div className="card flush">
            {f.events.length === 0 && <p className="small muted" style={{ padding: '12px 0', margin: 0 }}>No bills or pay expected that I know of. I learn them from your earlier periods.</p>}
            {f.events.map((e) => (
              <label key={e.id} className="item row" style={{ flexDirection: 'row', color: 'var(--text)', fontSize: '1rem', opacity: e.skipped ? 0.5 : 1 }}>
                {e.id !== 'oneoff' && <input type="checkbox" aria-label={`Count ${e.label}`} checked={!e.skipped} onChange={(ev) => setCounted({ ...counted, [e.id]: ev.target.checked })} />}
                <span className="grow">
                  <span className="title" style={{ display: 'block' }}>{e.label}</span>
                  <span className="xs muted">{e.overdue ? (e.skipped ? 'Usually earlier this period, not seen · left out. Tick to count it' : 'Usually earlier, not seen yet · counted tomorrow') : e.late ? 'Usually earlier, not seen yet · assumed next day' : d(e.date)}</span>
                </span>
                <span className={`amount ${e.amount > 0 ? 'good' : ''}`}>{money(e.amount)}</span>
              </label>
            ))}
            <div className="item row between">
              <span><span className="title" style={{ display: 'block' }}>Everyday spending</span><span className="xs muted">about {fmt(f.everydayPerDay)} a day for {f.remaining} more days</span></span>
              <span className="amount">{money(-f.everydayRemaining)}</span>
            </div>
            {f.everyday.length > 0 && (() => {
              const regular = f.everyday.filter((e) => e.repeats || e.off)
              const oneOffs = f.everyday.filter((e) => !e.repeats && !e.off && e.soFar > 0)
              return (
                <details className="item" style={{ cursor: 'default' }}>
                  <summary className="xs muted" style={{ cursor: 'pointer' }}>What's in it, and what was left out</summary>
                  <div style={{ marginTop: 6 }}>
                    {regular.slice(0, 8).map((e) => {
                      const id = e.categoryId ?? '__none__'
                      return (
                        <label key={id} className="row between small" style={{ flexDirection: 'row', color: 'var(--text)', padding: '6px 0', opacity: e.off ? 0.5 : 1 }}>
                          <span className="row" style={{ gap: 8 }}>
                            <input type="checkbox" aria-label={`Count ${e.name} in everyday spending`} checked={!e.off} onChange={(ev) => setEverydayOff(ev.target.checked ? everydayOff.filter((x) => x !== id) : [...everydayOff, id])} />
                            <span>{e.name}</span>
                          </span>
                          <span className="num muted">≈ {fmt(e.wouldBe)}/day · {fmt(e.soFar)} so far</span>
                        </label>
                      )
                    })}
                    {regular.length > 8 && <p className="xs muted" style={{ margin: '4px 0 0' }}>and {regular.length - 8} smaller ones.</p>}
                    {oneOffs.length > 0 && (
                      <p className="xs muted" style={{ margin: '8px 0 0' }}>
                        <b>Not repeated:</b> {oneOffs.map((e) => `${e.name} ${fmt(e.soFar)}`).join(' · ')}. These look like one-offs, so they are already in your balance but are not expected again.
                      </p>
                    )}
                  </div>
                </details>
              )
            })()}
          </div>

          {f.risks.length > 0 && (
            <>
              <h2>Watch out</h2>
              <div className="card flush">
                {f.risks.map((r) => (
                  <div className="item row between" key={r.categoryId ?? 'none'} style={{ cursor: 'default' }}>
                    <span><span className="title" style={{ display: 'block' }}>{r.name}</span><span className="xs muted">on course for {fmt(r.projected)} against a {fmt(r.budget)} budget</span></span>
                    <span className="amount bad">{fmt(r.over)} over</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2>What if?</h2>
          <div className="card stack">
            <Chips caption label="Everyday spending" value={mult} onChange={setMult} options={SPEND} />
            <label>One-off expense tomorrow<MoneyInput label="One-off expense" value={oneOff} onChange={setOneOff} /></label>
            {changed && (
              <div className="row between small">
                <span>{delta === 0 ? 'No change to the end balance.' : <>End balance <b className={`num ${delta > 0 ? 'good' : 'bad'}`}>{money(delta)}</b> compared with the usual forecast.</>}</span>
                <button className="link" onClick={() => { setMult(1); setOneOff(0); setCounted({}); setEverydayOff([]) }}>Reset</button>
              </div>
            )}
          </div>
        </>
      )}

      <details>
        <summary className="small muted" style={{ cursor: 'pointer' }}>How this is worked out</summary>
        <div className="small muted stack" style={{ marginTop: 8 }}>
          <p style={{ margin: 0 }}>It starts from what is in your spending accounts today (savings accounts are not counted). Payments that showed up about once in each of your last few periods, at a similar amount, are treated as bills or pay and placed on their usual day. Bills that haven't happened yet are subtracted; ones that look late are assumed tomorrow.</p>
          <p style={{ margin: 0 }}>Everyday spending (groceries, fuel, eating out and so on) is worked out per category. Two guides are blended, with more weight on this period's pace the further through the period you are: what that category usually costs in a period (less what you've already spent), and this period's pace (only when there are at least three purchases). A category with fewer than three purchases and no history of repeating, such as a repair or a gift, is treated as a one-off and is not repeated. The shaded band shows everyday spending running 25% higher or lower.</p>
          <p style={{ margin: 0 }}>It is an estimate. A one-off expense, a late salary or a bill that isn't regular won't be seen coming, so use the checkboxes and "What if?" to test them.</p>
        </div>
      </details>
    </Page>
  )
}
