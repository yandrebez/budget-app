import type { Verdict } from '@/domain/forecast/forecast'

/** Words and a symbol as well as a colour, so the answer never depends on colour alone. */
export const VERDICT: Record<Verdict, { icon: string; word: string; cls: string }> = {
  ok: { icon: '✓', word: 'On track', cls: 'good' },
  tight: { icon: '⚠', word: 'Tight', cls: 'warn' },
  short: { icon: '✕', word: 'You may run short', cls: 'bad' },
}
