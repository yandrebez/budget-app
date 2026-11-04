export interface PotProgress {
  /** 0..1 */
  fraction: number
  remaining: number
  /** null when nothing is being contributed. */
  monthsToTarget: number | null
}

export function potProgress(balance: number, target: number, monthlyContribution: number): PotProgress {
  const remaining = Math.max(0, target - balance)
  return {
    fraction: target > 0 ? Math.min(1, balance / target) : 0,
    remaining,
    monthsToTarget: remaining === 0 ? 0 : monthlyContribution > 0 ? Math.ceil(remaining / monthlyContribution) : null,
  }
}
