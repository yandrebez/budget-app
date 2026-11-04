import { useState } from 'react'
import { Page } from '@/components/ui'
import { ExcelImport } from './ExcelImport'
import { StatementImport } from './StatementImport'

type Mode = 'statement' | 'excel'

export function Import({ go, back }: { go: (tab: string) => void; back?: { label: string; onClick: () => void } }) {
  const [mode, setMode] = useState<Mode>('statement')
  return (
    <Page title="Import" back={back}>
      <div className="row" role="tablist" aria-label="What to import" style={{ marginBottom: 12 }}>
        <button role="tab" aria-selected={mode === 'statement'} className={mode === 'statement' ? 'primary' : ''} onClick={() => setMode('statement')}>Bank statement</button>
        <button role="tab" aria-selected={mode === 'excel'} className={mode === 'excel' ? 'primary' : ''} onClick={() => setMode('excel')}>Excel budget</button>
      </div>
      {mode === 'statement' ? <StatementImport go={go} embedded /> : <ExcelImport go={go} />}
    </Page>
  )
}
