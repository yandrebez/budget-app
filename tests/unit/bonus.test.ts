import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/db'
import { ensureSeed, updateBonuses } from '@/db/repo'
import { doneTotal, leftToPlan, plannedShare, plannedTotal, planState, sortBonuses } from '@/domain/budget/bonus'
import type { BonusPlan } from '@/types'

const R = (rand: number) => Math.round(rand * 100)
const part = (id: string, amount: number, done = false) => ({ id, label: id, amount: R(amount), categoryId: null, done })
const bonus = (over: Partial<BonusPlan> = {}): BonusPlan => ({ id: 'b', name: 'December bonus', amount: R(20000), period: '2026-12', parts: [], ...over })

describe('planning a bonus', () => {
  it('shows how much is planned, how much is left, and how much is done', () => {
    const b = bonus({ parts: [part('emergency', 10000, true), part('holiday', 5000), part('loan', 3500, true)] })
    expect(plannedTotal(b)).toBe(R(18500))
    expect(leftToPlan(b)).toBe(R(1500))
    expect(doneTotal(b)).toBe(R(13500))
    expect(plannedShare(b)).toBeCloseTo(0.925)
  })

  it('names the state: empty, open, complete, or over-planned', () => {
    expect(planState(bonus({ amount: 0 }))).toBe('empty')
    expect(planState(bonus())).toBe('open') // an amount with nothing planned yet
    expect(planState(bonus({ parts: [part('a', 12000), part('b', 8000)] }))).toBe('complete')
    expect(planState(bonus({ parts: [part('a', 21000)] }))).toBe('over')
    expect(leftToPlan(bonus({ parts: [part('a', 21000)] }))).toBe(-R(1000))
  })

  it('never reports more than 100% planned', () => {
    expect(plannedShare(bonus({ parts: [part('a', 30000)] }))).toBe(1)
    expect(plannedShare(bonus({ amount: 0, parts: [part('a', 100)] }))).toBe(0)
  })

  it('lists the soonest bonus first', () => {
    const list = [bonus({ id: '3', period: '2027-03', name: 'B' }), bonus({ id: '1', period: '2026-12', name: 'Z' }), bonus({ id: '2', period: '2026-12', name: 'A' })]
    expect(sortBonuses(list).map((b) => b.id)).toEqual(['2', '1', '3'])
  })
})

describe('storing bonus plans', () => {
  beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); await ensureSeed() })

  it('keeps them on the settings without touching anything else', async () => {
    const before = await db.settings.get('main')
    expect(before?.bonuses).toBeUndefined() // nothing is written until a bonus is planned
    await updateBonuses((cur) => [...cur, bonus()])
    const after = (await db.settings.get('main'))!
    expect(after.bonuses).toHaveLength(1)
    expect({ ...after, bonuses: undefined }).toEqual({ ...before, bonuses: undefined })
  })

  it('applies quick successive edits without losing any of them', async () => {
    await updateBonuses(() => [bonus()])
    await Promise.all([
      updateBonuses((cur) => cur.map((b) => ({ ...b, name: 'Renamed' }))),
      updateBonuses((cur) => cur.map((b) => ({ ...b, parts: [...b.parts, part('a', 100)] }))),
      updateBonuses((cur) => cur.map((b) => ({ ...b, amount: R(25000) }))),
    ])
    const [b] = (await db.settings.get('main'))!.bonuses!
    expect(b).toMatchObject({ name: 'Renamed', amount: R(25000) })
    expect(b.parts).toHaveLength(1)
  })
})
