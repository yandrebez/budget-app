import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { ColumnChart } from '@/components/charts/ColumnChart'
import { LineChart } from '@/components/charts/LineChart'
import { RankedBars, type Ranked } from '@/components/charts/RankedBars'
import { DataTable, Legend, type Series } from '@/components/charts/shared'
import { Chips, CycleSwitcher, Empty, Page } from '@/components/ui'
import { assignSlots, breakdown, entityOrder, foldTail, periodStats, seriesByPeriod, UNCATEGORISED, type Metric, type PeriodStats, type Split } from '@/domain/stats/stats'
import { useLedger, type Ledger } from '@/hooks/useLedger'
import { compactNumber, monthShort } from '@/lib/format'

type ChartKind = 'columns' | 'stacked' | 'line' | 'ranked'
interface Config { view: 'summary' | 'charts'; chart: ChartKind; metric: Metric; split: Split; range: 1 | 3 | 6 | 12; accountIds: string[]; categoryIds: string[]; table: boolean }

const DEFAULT: Config = { view: 'summary', chart: 'columns', metric: 'spending', split: 'none', range: 6, accountIds: [], categoryIds: [], table: false }
const STORE = 'stats-config'
const METRIC_LABEL: Record<Metric, string> = { spending: 'Spending', income: 'Income', saved: 'Saved', left: 'Left over' }
const SPLIT_LABEL: Record<Split, string> = { none: 'Total', group: 'Group', category: 'Category', account: 'Account' }

function load(): Config {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(STORE) ?? '{}') } } catch { return DEFAULT }
}

/** Keeps the combination of options valid whatever the user picks. */
function normalise(c: Config): Config {
  const n = { ...c }
  if (n.metric === 'left') { n.split = 'none'; if (n.chart === 'stacked' || n.chart === 'ranked') n.chart = 'columns' }
  if (n.chart === 'columns') n.split = 'none'
  if ((n.chart === 'stacked' || n.chart === 'ranked') && n.split === 'none') n.split = n.chart === 'ranked' ? 'category' : 'group'
  if (n.chart !== 'ranked' && n.range === 1) n.range = 6
  return n
}

export function Stats({ back }: { back?: { label: string; onClick: () => void } }) {
  const ledger = useLedger()
  const [cfg, setCfg] = useState<Config>(() => normalise(load()))
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(cfg)) } catch { /* optional */ } }, [cfg])
  const set = (patch: Partial<Config>) => setCfg((c) => normalise({ ...c, ...patch }))

  return (
    <Page title="Stats" back={back}>
      <Chips label="View" value={cfg.view} onChange={(view) => set({ view })} options={[{ value: 'summary', label: 'Summary' }, { value: 'charts', label: 'Charts' }]} />
      <CycleSwitcher />
      {!ledger ? null : ledger.txs.length === 0
        ? <Empty>Statistics appear once you have transactions.</Empty>
        : cfg.view === 'summary'
          ? <Summary ledger={ledger} />
          : <Charts ledger={ledger} cfg={cfg} set={set} />}
    </Page>
  )
}

function useLabels(ledger: Ledger) {
  return useMemo(() => {
    const m = new Map<string, string>([[UNCATEGORISED, 'Uncategorised']])
    ledger.groups.forEach((g) => m.set(g.id, g.name))
    ledger.categories.forEach((c) => m.set(c.id, c.name))
    ledger.accounts.forEach((a) => m.set(a.id, a.name))
    return (k: string) => (k === '__other__' ? 'Other' : m.get(k) ?? 'Unknown')
  }, [ledger])
}

const slotColor = (slot: number | undefined) => (slot === undefined ? 'var(--series-other)' : `var(--series-${slot + 1})`)

function periodLabels(periods: PeriodStats[], locale: string): string[] {
  const crossesYear = periods.length > 0 && periods[0].cycle.year !== periods[periods.length - 1].cycle.year
  return periods.map((p, i) => monthShort(p.cycle.year, p.cycle.month, locale, crossesYear && (i === 0 || p.cycle.month === 1)))
}

/* ---------------------------------------------------------------- Summary */

function Summary({ ledger }: { ledger: Ledger }) {
  const { cycle, settings, fmt, fmtWhole } = useApp()
  const label = useLabels(ledger)
  const periods = useMemo(() => periodStats(settings, cycle, 7, ledger), [settings, cycle, ledger])
  const [prev, cur] = [periods[periods.length - 2], periods[periods.length - 1]]
  const slices = useMemo(() => foldTail(breakdown([cur], 'spending', 'category', label), 7), [cur, label])
  const ranked: Ranked[] = slices.map((s) => ({ ...s, color: s.key === '__other__' ? 'var(--series-other)' : 'var(--series-1)' }))

  const past = periods.slice(0, -1).filter((p) => p.spending > 0)
  const typical = past.length ? Math.round(past.reduce((s, p) => s + p.spending, 0) / past.length) : 0
  const rate = cur.income > 0 ? Math.round((cur.saved / cur.income) * 100) : null

  const delta = (now: number, before: number) => {
    if (!before) return null
    const pct = Math.round(((now - before) / Math.abs(before)) * 100)
    return pct === 0 ? 'same as last period' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last period`
  }
  const tile = (name: string, value: number, d: string | null, cls = '') => (
    <div className="stat"><span className="xs muted">{name}</span><b className={`num ${cls}`}>{fmt(value)}</b><span className="xs muted">{d ?? ' '}</span></div>
  )

  return (
    <>
      <div className="card grid2" style={{ rowGap: 18 }}>
        {tile('Spent', cur.spending, delta(cur.spending, prev.spending))}
        {tile('Money in', cur.income, delta(cur.income, prev.income), 'good')}
        {tile('Saved', cur.saved, rate === null ? null : `${rate}% of income`)}
        {tile('Left over', cur.left, typical ? `typical spend ${fmt(typical)}` : null, cur.left < 0 ? 'bad' : '')}
      </div>

      <h2>Where it went</h2>
      <div className="card">
        {ranked.length === 0 ? <p className="muted small" style={{ margin: 0 }}>No spending in this period.</p> : <RankedBars items={ranked} fmt={fmt} />}
      </div>

      <h2>Last 6 periods</h2>
      <div className="card flush">
        <DataTable
          columns={['Period', 'In', 'Spent', 'Left over']}
          rows={periods.slice(1).reverse().filter((p) => p.income || p.spending || p.saved).map((p) => ({ label: monthShort(p.cycle.year, p.cycle.month, settings.locale, true), cells: [fmtWhole(p.income), fmtWhole(p.spending), fmtWhole(p.left)] }))}
        />
      </div>
      <p className="xs muted">Spent excludes savings and transfers between your own accounts. Saved is what you put aside. Left over = money in − spent − saved.</p>
    </>
  )
}

/* ----------------------------------------------------------------- Charts */

function Charts({ ledger, cfg, set }: { ledger: Ledger; cfg: Config; set: (p: Partial<Config>) => void }) {
  const { cycle, settings, fmt } = useApp()
  const label = useLabels(ledger)
  const timeChart = cfg.chart !== 'ranked'
  const periods = useMemo(
    () => periodStats(settings, cycle, cfg.range, { ...ledger, accountIds: cfg.accountIds, categoryIds: cfg.categoryIds }),
    [settings, cycle, cfg.range, cfg.accountIds, cfg.categoryIds, ledger],
  )
  const labels = periodLabels(periods, settings.locale)
  const axisFmt = (c: number) => compactNumber(c, settings.locale)
  const metric = cfg.metric
  const split = cfg.split

  const model = useMemo(() => {
    if (split === 'none' || metric === 'left') {
      const color = metric === 'income' ? 'var(--series-3)' : metric === 'saved' ? 'var(--series-7)' : 'var(--series-1)'
      return { series: [{ key: metric, label: METRIC_LABEL[metric], color, values: periods.map((p) => p[metric]) }] as Series[], ranked: [] as Ranked[] }
    }
    const m = metric as Exclude<Metric, 'left'>
    const order = entityOrder(ledger, m, split)
    const slices = breakdown(periods, m, split, label)
    const top = slices.slice(0, 7)
    const slots = assignSlots(top.map((s) => s.key), order)
    const rest = slices.slice(7)
    const map = seriesByPeriod(periods, m, split, slices.map((s) => s.key))
    const series: Series[] = top.map((s) => ({ key: s.key, label: s.label, color: slotColor(slots.get(s.key)), values: map.get(s.key)! }))
    if (rest.length) {
      series.push({ key: '__other__', label: 'Other', color: 'var(--series-other)', values: periods.map((_, i) => rest.reduce((t, r) => t + map.get(r.key)![i], 0)) })
    }
    const ranked: Ranked[] = foldTail(slices, 8).map((s) => ({ ...s, color: s.key === '__other__' ? 'var(--series-other)' : 'var(--series-1)' }))
    return { series, ranked }
  }, [periods, metric, split, ledger, label])

  const span = cfg.chart === 'ranked' && cfg.range === 1 ? 'this period' : `last ${cfg.range} periods`
  const title = `${METRIC_LABEL[metric]}${split !== 'none' && metric !== 'left' ? ` by ${SPLIT_LABEL[split].toLowerCase()}` : ''} · ${span}`
  const empty = cfg.chart === 'ranked' ? model.ranked.length === 0 : model.series.every((s) => s.values.every((v) => v === 0))
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const tableRows = cfg.chart === 'ranked'
    ? model.ranked.map((r) => ({ label: r.label, cells: [fmt(r.value)] }))
    : labels.map((l, i) => ({ label: l, cells: model.series.map((s) => fmt(s.values[i])) }))
  const tableCols = cfg.chart === 'ranked' ? ['Item', 'Amount'] : ['Period', ...model.series.map((s) => s.label)]

  return (
    <>
      <Chips caption label="Chart type" value={cfg.chart} onChange={(chart) => set({ chart })} options={[
        { value: 'columns', label: 'Columns' }, { value: 'stacked', label: 'Stacked', disabled: metric === 'left' },
        { value: 'line', label: 'Line' }, { value: 'ranked', label: 'Ranked bars', disabled: metric === 'left' },
      ]} />
      <Chips caption label="Show" value={metric} onChange={(m) => set({ metric: m })} options={(Object.keys(METRIC_LABEL) as Metric[]).map((m) => ({ value: m, label: METRIC_LABEL[m] }))} />
      {metric !== 'left' && (cfg.chart === 'line' || cfg.chart === 'stacked' || cfg.chart === 'ranked') && (
        <Chips caption label="Break down by" value={split} onChange={(s) => set({ split: s })} options={([...(cfg.chart === 'line' ? ['none'] : []), 'group', 'category', 'account'] as Split[]).map((s) => ({ value: s, label: s === 'none' ? 'Total' : SPLIT_LABEL[s] }))} />
      )}
      <Chips caption label="Range" value={cfg.range} onChange={(r) => set({ range: r })} options={[
        ...(cfg.chart === 'ranked' ? [{ value: 1 as const, label: 'This period' }] : []),
        { value: 3 as const, label: '3 periods' }, { value: 6 as const, label: '6 periods' }, { value: 12 as const, label: '12 periods' },
      ]} />

      <details style={{ marginBottom: 10 }}>
        <summary className="small muted" style={{ cursor: 'pointer' }}>Filters{cfg.accountIds.length + cfg.categoryIds.length ? ` (${cfg.accountIds.length + cfg.categoryIds.length})` : ''}</summary>
        <div className="card stack" style={{ marginTop: 8 }}>
          <div><div className="xs muted">Accounts (none selected = all)</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              {ledger.accounts.map((a) => <button key={a.id} className="chip" aria-pressed={cfg.accountIds.includes(a.id)} onClick={() => set({ accountIds: toggle(cfg.accountIds, a.id) })}>{a.name}</button>)}
            </div></div>
          <div><div className="xs muted">Categories (none selected = all)</div>
            <div className="row wrap" style={{ gap: 6, marginTop: 6, maxHeight: 160, overflowY: 'auto' }}>
              {[...ledger.categories, { id: UNCATEGORISED, name: 'Uncategorised' }].map((c) => <button key={c.id} className="chip" aria-pressed={cfg.categoryIds.includes(c.id)} onClick={() => set({ categoryIds: toggle(cfg.categoryIds, c.id) })}>{c.name}</button>)}
            </div></div>
          {(cfg.accountIds.length > 0 || cfg.categoryIds.length > 0) && <button className="link small" onClick={() => set({ accountIds: [], categoryIds: [] })}>Clear filters</button>}
        </div>
      </details>

      <div className="card">
        <div className="row between"><b>{title}</b><button className="link small" onClick={() => set({ table: !cfg.table })}>{cfg.table ? 'Show chart' : 'Show table'}</button></div>
        {empty ? <p className="muted small">Nothing to show for these options.</p> : cfg.table ? (
          <DataTable columns={tableCols} rows={tableRows} />
        ) : (
          <>
            {cfg.chart === 'ranked' && <RankedBars items={model.ranked} fmt={fmt} />}
            {cfg.chart === 'line' && <LineChart labels={labels} series={model.series} fmt={fmt} axisFmt={axisFmt} />}
            {(cfg.chart === 'columns' || cfg.chart === 'stacked') && <ColumnChart labels={labels} series={model.series} fmt={fmt} axisFmt={axisFmt} />}
            {timeChart && model.series.length > 1 && <Legend items={model.series.map((s) => ({ label: s.label, color: s.color }))} />}
          </>
        )}
      </div>
    </>
  )
}
