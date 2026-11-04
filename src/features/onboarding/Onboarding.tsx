import { useState } from 'react'
import type { WeekendRule } from '@/types'
import { newId } from '@/lib/id'
import { db } from '@/db/db'
import { updateSettings } from '@/db/repo'
import { southAfricanHolidays } from '@/domain/cycles/holidays'

/** First-run wizard. Starts the user with a completely blank budget. */
export function Onboarding() {
  const [currency, setCurrency] = useState('ZAR')
  const [locale, setLocale] = useState('en-ZA')
  const [payDay, setPayDay] = useState(1)
  const [rule, setRule] = useState<WeekendRule>('none')
  const [saHolidays, setSaHolidays] = useState(false)
  const [account, setAccount] = useState('')

  async function finish() {
    const year = new Date().getFullYear()
    await updateSettings({
      currency: currency.trim().toUpperCase() || 'ZAR', locale: locale.trim() || 'en-ZA', payDay, weekendRule: rule,
      holidays: saHolidays ? southAfricanHolidays(year - 1, year + 5) : [], onboarded: true,
    })
    if (account.trim()) await db.accounts.add({ id: newId(), name: account.trim(), openingBalance: 0 })
  }

  return (
    <main>
      <h1>Welcome 👋</h1>
      <p className="muted">Your budget starts completely blank. Set a few basics now; everything can be changed later in Settings.</p>
      <div className="card stack">
        <div className="grid2">
          <label>Currency code<input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} /></label>
          <label>Locale<input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="en-ZA" /></label>
        </div>
        <label>Budget period starts on day of month
          <input type="number" min={1} max={31} value={payDay} onChange={(e) => setPayDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))} />
          <span className="small">1 = calendar months. Use your pay day if you budget from pay day to pay day.</span>
        </label>
        <label>If that day is a weekend or public holiday
          <select value={rule} onChange={(e) => setRule(e.target.value as WeekendRule)}>
            <option value="none">Leave it</option>
            <option value="before">Move to the previous working day</option>
            <option value="after">Move to the next working day</option>
          </select>
        </label>
        <label className="row" style={{ flexDirection: 'row' }}>
          <input type="checkbox" style={{ width: 'auto', minHeight: 0 }} checked={saHolidays} onChange={(e) => setSaHolidays(e.target.checked)} />
          Use South African public holidays
        </label>
        <label>Your first account (optional)<input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="e.g. Cheque account" /></label>
      </div>
      <button className="primary" onClick={finish}>Start budgeting</button>
    </main>
  )
}
