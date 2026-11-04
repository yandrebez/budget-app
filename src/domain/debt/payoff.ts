export interface Payoff {
  /** null = the payment never clears the debt (does not cover interest). */
  months: number | null
  totalInterest: number | null
}

/** Months and interest to clear `balance` paying `payment` monthly at an annual rate. All values in cents. */
export function payoff(balance: number, annualRate: number, payment: number): Payoff {
  if (balance <= 0) return { months: 0, totalInterest: 0 }
  if (payment <= 0) return { months: null, totalInterest: null }
  const r = annualRate / 12
  if (r === 0) {
    const months = Math.ceil(balance / payment)
    return { months, totalInterest: 0 }
  }
  if (payment <= balance * r) return { months: null, totalInterest: null }
  const months = Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r))
  const totalInterest = Math.max(0, Math.round(payment * months - balance))
  return { months, totalInterest }
}
