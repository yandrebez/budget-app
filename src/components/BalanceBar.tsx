import { useMemo, useState } from 'react'
import { useApp } from '@/app/AppContext'
import { balancesByAccount, isSpendingAccount, periodFlow, totalBalance } from '@/domain/balances/balances'
import { todayISO } from '@/lib/dates'
import { monthLong } from '@/lib/format'
import { useLedger } from '@/hooks/useLedger'

const KIND_LABEL = { account: 'Account', card: 'Card', savings: 'Savings', cash: 'Cash' } as const

/** Always-visible strip: this month's running balance and the overall balance. Tap for the detail. */
export function BalanceBar() {
  const { fmt, cycle, isCurrentCycle, settings } = useApp()
  const ledger = useLedger()
  const [open, setOpen] = useState(false)

  const data = useMemo(() => {
    if (!ledger) return null
    // The headline covers spending accounts; savings accounts are shown separately.
    const spending = ledger.accounts.filter(isSpendingAccount)
    const balances = balancesByAccount(ledger.accounts, ledger.txs, todayISO())
    const spendingBalances = new Map([...balances].filter(([id]) => spending.some((a) => a.id === id)))
    return {
      balances, spending, savings: ledger.accounts.filter((a) => !isSpendingAccount(a)),
      overall: totalBalance(spendingBalances),
      flow: periodFlow(spending, ledger.txs, cycle.start, cycle.end, ledger.transferIds),
    }
  }, [ledger, cycle])

  if (!ledger || !data || ledger.accounts.length === 0) return null
  const { flow, overall, balances, spending, savings } = data
  const signed = (c: number) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${fmt(Math.abs(c))}`

  return (
    <div className="topbar">
      <button className="summary" aria-expanded={open} aria-controls="balance-panel" onClick={() => setOpen(!open)}>
        <span className="col">
          <span className="xs muted">{isCurrentCycle ? 'This month' : monthLong(cycle.year, cycle.month, settings.locale)}</span>
          <b className={`num ${flow.net < 0 ? 'bad' : flow.net > 0 ? 'good' : ''}`}>{signed(flow.net)}</b>
        </span>
        <span className="col">
          <span className="xs muted">Overall balance</span>
          <b className={`num ${overall < 0 ? 'bad' : ''}`}>{fmt(overall)}</b>
        </span>
      </button>
      {open && (
        <div className="card panel" id="balance-panel">
          <div className="grid2 small">
            <div className="stat"><span className="muted xs">Start of period</span><span className="num">{fmt(flow.opening)}</span></div>
            <div className="stat"><span className="muted xs">End of period</span><span className="num">{fmt(flow.closing)}</span></div>
            <div className="stat"><span className="muted xs">Money in</span><span className="num good">{fmt(flow.moneyIn)}</span></div>
            <div className="stat"><span className="muted xs">Money out</span><span className="num">{fmt(flow.moneyOut)}</span></div>
          </div>
          <div className="xs muted" style={{ margin: '12px 0 2px' }}>Spending accounts (today)</div>
          {spending.map((a) => (
            <div className="row between small" key={a.id} style={{ padding: '4px 0' }}>
              <span>{a.name} <span className="faint xs">{KIND_LABEL[a.kind ?? 'account']}</span></span>
              <span className={`num ${(balances.get(a.id) ?? 0) < 0 ? 'bad' : ''}`}>{fmt(balances.get(a.id) ?? 0)}</span>
            </div>
          ))}
          {savings.length > 0 && (
            <>
              <div className="xs muted" style={{ margin: '12px 0 2px' }}>Savings (not in the overall balance)</div>
              {savings.map((a) => (
                <div className="row between small" key={a.id} style={{ padding: '4px 0' }}>
                  <span>{a.name}</span><span className="num">{fmt(balances.get(a.id) ?? 0)}</span>
                </div>
              ))}
            </>
          )}
          <div className="xs muted" style={{ marginTop: 10 }}>
            Not matching your bank? <a href="#settings" onClick={() => setOpen(false)}>Match each account to its bank balance</a> in Settings.
          </div>
        </div>
      )}
    </div>
  )
}
