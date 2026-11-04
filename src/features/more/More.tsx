import { Page } from '@/components/ui'

const ITEMS = [
  { id: 'debt', title: 'Debt', note: 'Balances, interest and payoff estimates' },
  { id: 'savings', title: 'Savings', note: 'Pots, targets and progress' },
  { id: 'import', title: 'Import', note: 'Bank statements (CSV, PDF) or an Excel budget' },
  { id: 'settings', title: 'Settings', note: 'Accounts, budget period, backup' },
]

export function More({ go }: { go: (tab: string) => void }) {
  return (
    <Page title="More">
      <div className="card flush">
        {ITEMS.map((i) => (
          <button key={i.id} className="item row between" onClick={() => go(i.id)}>
            <span><span className="title" style={{ display: 'block' }}>{i.title}</span><span className="xs muted">{i.note}</span></span>
            <span className="muted" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </Page>
  )
}
