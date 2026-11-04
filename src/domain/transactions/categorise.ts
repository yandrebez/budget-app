import type { Rule } from '@/types'

/** Lower-cases and strips digits/punctuation so "WOOLWORTHS 1234 CPT" matches "Woolworths 98 JHB". */
export const normalise = (s: string): string =>
  s.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()

/** A reusable pattern for a description: its first two meaningful words. */
export const patternFor = (description: string): string =>
  normalise(description).split(' ').filter((w) => w.length > 1).slice(0, 2).join(' ')

export function categorise(description: string, rules: Rule[]): string | null {
  const text = normalise(description)
  let best: Rule | null = null
  for (const r of rules) {
    if (r.pattern && text.includes(r.pattern) && (!best || r.pattern.length > best.pattern.length)) best = r
  }
  return best?.categoryId ?? null
}
