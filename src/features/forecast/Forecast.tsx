import { useMemo, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { ForecastChart } from '@/components/charts/ForecastChart'
import { Legend } from '@/components/charts/shared'
import { Chips, Empty, MoneyInput, Page } from '@/components/ui'
import type { Basis, SpendLine, WhatIf } from '@/domain/forecast/forecast'
import { compactNumber, dayMonth } from '@/lib/format'
import { useForecast } from './useForecast'
import { VERDICT } from './verdict'

const SPEND: { value: number; label: string }[] = [
  { value: 0.7, label: '−30%' }, { value: 0.8, label: '−20%' }, { value: 0.9, label: '−10%' },
  { value: 1, label: 'As usual' }, { value: 1.1, label: '+10%' }, { value: 1.2, label: '+20%' },
]

const BASES: { value: Basis; label: string; note: string }[] = [
  { value: 'cautious', label: 'Budget & habits', note: 'For each category, whichever is higher: what is left of its budget, or what you usually spend. The careful view.' },
  { value: 'budget', label: 'My budget', note: 'You spend what is left of every budget, and nothing more. Categories with no budget add nothing.' },
  { value: 'habits', label: 'My habits', note: 'What you usually spend, from your earlier periods and this one, ignoring your budget.' },
]

const key = (l: SpendLine) => l.categoryId ?? '__none__'

export function Forecast({ back, go }: { back?: { label: string; onClick: () => void }; go: (tab: string) => void }) {
  const { fmt, settings } = useApp()
  const [basis, setBasis] = useState<Basis>('cautious')
  const [mult, setMult] = useState(1)
  const [oneOff, setOneOff] = useState(0)
  const [counted, setCounted] = useState<Record<string, boolean>>({})
  const [leftOut, setLeftOut] = useState<string[]>([])
  const whatIf = useMemo<WhatIf>(() => ({ basis, spendMultiplier: mult, oneOff, counted, everydayOff: leftOut }), [basis, mult, oneOff, counted, leftOut])
  const plain = useMemo<WhatIf>(() => ({ basis }), [basis])
  const f = useForecast(whatIf)
  const base = useForecast(plain)
  const d = (iso: string) => dayMonth(iso, settings.locale)
  const changed = mult !== 1 || oneOff > 0 || Object.keys(counted).length > 0 || leftOut.length > 0

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
  const note = BASES.find((b) => b.value === basis)!.note

  const headline = f.remaining === 0
    ? <>The period ends today. Your balance is <b className="num">{fmt(f.balanceNow)}</b>.</>
    : f.verdict === 'short'
      ? <>You may run short on <b>{d(f.firstNegativeDate ?? f.minDate)}</b>.</>
      : f.verdict === 'tight'
        ? <>Only about <b className="num">{fmt(f.endBalance)}</b> left at the end.</>
        : <>About <b className="num">{fmt(f.endBalance)}</b> left at the end of the period.</>

  // What the lines say, split the ways a budget is read.
  const expectedLines = f.lines.filter((l) => l.wouldBe > 0)
  const unbudgeted = f.lines.filter((l) => l.budget === 0 && l.spent > 0)
  const unused = f.lines.filter((l) => l.budget > 0 && l.spent <= 0)
  const spread = Math.abs(f.ends.budget - f.ends.habits) > 100

  const lineNote = (l: SpendLine) =>
    l.budget > 0 ? `budget ${fmt(l.budget)} · ${l.spent > 0 ? `spent ${fmt(l.spent)}` : 'not used yet'}` : `no budget · spent ${fmt(l.spent)}`

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
        {f.remaining > 0 && spread && (
          <p className="small muted" style={{ margin: '8px 0 0' }}>
            Spend what is left of every budget: about <b className="num">{fmt(f.ends.budget)}</b>. Go by your habits alone: about <b className="num">{fmt(f.ends.habits)}</b>.
          </p>
        )}
        {f.staleDays > 0 && f.remaining > 0 && <p className="xs muted" style={{ margin: '8px 0 0' }}>Based on your transactions up to {d(f.asOf)}. The {f.staleDays} day{f.staleDays === 1 ? '' : 's'} since are forecast, so adding them will sharpen this.</p>}
        {f.limitedHistory && <p className="xs warn" style={{ margin: '8px 0 0' }}>Not much history yet, so habits are guessed from this period only. Your budget fills the gap.</p>}
      </div>

      <div className="card">
        <Chips caption label="Based on" value={basis} onChange={setBasis} options={BASES.map((b) => ({ value: b.value, label: b.label }))} />
        <p className="xs muted" style={{ margin: 0 }}>{note}</p>
      </div>

      {f.remaining > 0 && (
        <div className="card stack">
          <h3>Can I save?</h3>
          {f.verdict === 'short' ? (
            <p style={{ margin: 0 }}>
              Not this month as things stand.{' '}
              {f.cutPerDay !== null && f.cutIsEnough
                ? <>Spending about <b className="num">{fmt(f.cutPerDay)}</b> a day less than expected on the categories below would keep you above zero.</>
                : <>Even with no spending beyond your bills you would be short: what is expected is bigger than your balance. Moving money back from savings, leaving out a payment below that isn't really due, or switching a category off would help.</>}
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              {f.safeToSave > 0
                ? <>You could put about <b className="num good">{fmt(f.safeToSave)}</b> into savings now and still cover everything expected, with a small cushion.</>
                : <>There isn't spare money to save beyond what is already planned.</>}
            </p>
          )}
          <p className="small muted" style={{ margin: 0 }}>
            After your bills, you could spend about <b className="num">{fmt(f.safeDaily)}</b> a day in total on everything else and stay above zero. Savings transfers you make regularly are already counted.
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
              <span><span className="title" style={{ display: 'block' }}>Other spending expected</span><span className="xs muted">{expectedLines.filter((l) => !l.off).length} categories, by category rather than a daily average</span></span>
              <span className="amount">{money(-f.spendingLeft)}</span>
            </div>
            {expectedLines.length > 0 && (
              <details className="item" style={{ cursor: 'default' }} open>
                <summary className="xs muted" style={{ cursor: 'pointer' }}>By category. Untick one you don't expect to spend in</summary>
                <div style={{ marginTop: 6 }}>
                  {expectedLines.slice(0, 12).map((l) => (
                    <label key={key(l)} className="row between small" style={{ flexDirection: 'row', color: 'var(--text)', padding: '6px 0', opacity: l.off ? 0.5 : 1, alignItems: 'flex-start' }}>
                      <span className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                        <input type="checkbox" style={{ marginTop: 3 }} aria-label={`Count ${l.name} in expected spending`} checked={!l.off} onChange={(ev) => setLeftOut(ev.target.checked ? leftOut.filter((x) => x !== key(l)) : [...leftOut, key(l)])} />
                        <span><span style={{ display: 'block' }}>{l.name}</span><span className="xs muted">{lineNote(l)}</span></span>
                      </span>
                      <span className="num amount">{money(-Math.round(l.wouldBe * mult))}</span>
                    </label>
                  ))}
                  {expectedLines.length > 12 && <p className="xs muted" style={{ margin: '4px 0 0' }}>and {expectedLines.length - 12} smaller ones.</p>}
                </div>
              </details>
            )}
          </div>

          {(f.risks.length > 0 || unbudgeted.length > 0 || unused.length > 0) && (
            <>
              <h2>Against your budget</h2>
              <div className="card stack">
                {f.risks.length > 0 && (
                  <div>
                    <b className="small">On course to go over</b>
                    {f.risks.map((r) => (
                      <div className="row between small" key={r.categoryId ?? 'none'} style={{ padding: '6px 0' }}>
                        <span>{r.name}<span className="xs muted" style={{ display: 'block' }}>{fmt(r.projected)} against a {fmt(r.budget)} budget</span></span>
                        <b className="num bad">{fmt(r.over)} over</b>
                      </div>
                    ))}
                  </div>
                )}
                {unbudgeted.length > 0 && (
                  <div>
                    <b className="small">Spent, but not in your budget</b>
                    <p className="xs muted" style={{ margin: '2px 0 4px' }}>Already out of your balance. Not expected again unless it becomes a habit. Add a budget for these to plan for them.</p>
                    {unbudgeted.map((l) => (
                      <div className="row between small" key={key(l)} style={{ padding: '4px 0' }}><span>{l.name}</span><b className="num">{fmt(l.spent)}</b></div>
                    ))}
                  </div>
                )}
                {unused.length > 0 && (
                  <div>
                    <b className="small">In your budget, not used yet</b>
                    <p className="xs muted" style={{ margin: '2px 0 4px' }}>{basis === 'habits' ? 'Not counted, because you are going by habits alone.' : 'Counted as likely to be spent before the period ends. Untick a category above if you won\'t.'}</p>
                    {unused.map((l) => (
                      <div className="row between small" key={key(l)} style={{ padding: '4px 0' }}><span>{l.name}{l.kept && <span className="xs muted"> · kept in the account, not counted</span>}</span><span className="num muted">{fmt(l.budget)} budgeted</span></div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          <h2>What if?</h2>
          <div className="card stack">
            <Chips caption label="Spending still to come" value={mult} onChange={setMult} options={SPEND} />
            <label>One-off expense tomorrow<MoneyInput label="One-off expense" value={oneOff} onChange={setOneOff} /></label>
            {changed && (
              <div className="row between small">
                <span>{delta === 0 ? 'No change to the end balance.' : <>End balance <b className={`num ${delta > 0 ? 'good' : 'bad'}`}>{money(delta)}</b> compared with the usual forecast.</>}</span>
                <button className="link" onClick={() => { setMult(1); setOneOff(0); setCounted({}); setLeftOut([]) }}>Reset</button>
              </div>
            )}
          </div>
        </>
      )}

      <details>
        <summary className="small muted" style={{ cursor: 'pointer' }}>How this is worked out</summary>
        <div className="small muted stack" style={{ marginTop: 8 }}>
          <p style={{ margin: 0 }}>It starts from what is in your spending accounts at your last entry (savings accounts are not counted). Payments that showed up about once in each of your last few periods, in the same category at a similar amount, are treated as bills or pay and placed on their usual day. Bills that haven't happened yet are subtracted; ones a few days late are assumed to come next day, and ones more than a week overdue start switched off.</p>
          <p style={{ margin: 0 }}>Everything else is worked out per category, then added up. <b>Budget:</b> what is left of the category's budget after what you've spent and any bill still due in it (this includes loan and savings amounts you haven't paid yet; money meant to stay in the account, such as a "buffer", is not assumed to be spent). <b>Habits:</b> a blend of what the category usually costs per period and this period's pace, which needs at least three purchases so a lone repair or gift is never repeated. <b>Budget &amp; habits</b> takes the higher of the two for each category.</p>
          <p style={{ margin: 0 }}>The money is spread evenly over the days left only to draw the line. The shaded band shows spending 25% higher or lower. It is an estimate: a late salary, a one-off expense or an irregular bill won't be seen coming, so use the tick boxes and "What if?" to test them.</p>
        </div>
      </details>
    </Page>
  )
}
