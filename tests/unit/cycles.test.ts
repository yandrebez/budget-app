import { describe, expect, it } from 'vitest'
import { adjustPayday, cycleContaining, cycleForMonth, shiftCycle } from '@/domain/cycles/cycle'
import { southAfricanHolidays } from '@/domain/cycles/holidays'

const cfg = { payDay: 25, weekendRule: 'before' as const, holidays: southAfricanHolidays(2026, 2030) }

describe('pay cycle', () => {
  it('moves a weekend payday back to the previous working day', () => {
    expect(adjustPayday('2026-10-25', 'before', [])).toBe('2026-10-23') // Sunday -> Friday
    expect(adjustPayday('2026-04-25', 'before', [])).toBe('2026-04-24') // Saturday -> Friday
  })
  it('skips public holidays too', () => {
    expect(adjustPayday('2026-12-25', 'before', cfg.holidays)).toBe('2026-12-24')
  })
  it('can move forward or not at all', () => {
    expect(adjustPayday('2026-10-25', 'after', [])).toBe('2026-10-26')
    expect(adjustPayday('2026-10-25', 'none', [])).toBe('2026-10-25')
  })
  it('builds contiguous cycles', () => {
    const oct = cycleForMonth(cfg, 2026, 10)
    const nov = cycleForMonth(cfg, 2026, 11)
    expect(oct.start).toBe('2026-10-23')
    expect(nov.start).toBe('2026-11-25')
    expect(oct.end).toBe('2026-11-24')
  })
  it('finds the cycle containing a date and shifts across years', () => {
    expect(cycleContaining(cfg, '2026-11-04').key).toBe('2026-10')
    expect(shiftCycle(cfg, cycleForMonth(cfg, 2026, 12), 1).key).toBe('2027-01')
    expect(shiftCycle(cfg, cycleForMonth(cfg, 2026, 1), -1).key).toBe('2025-12')
  })
  it('calendar months when payDay is 1', () => {
    const c = cycleForMonth({ payDay: 1, weekendRule: 'none', holidays: [] }, 2026, 2)
    expect([c.start, c.end]).toEqual(['2026-02-01', '2026-02-28'])
  })
})

describe('SA holidays', () => {
  const h = southAfricanHolidays(2026, 2026)
  it('includes Easter based days and shifts Sunday holidays', () => {
    expect(h).toContain('2026-04-03') // Good Friday
    expect(h).toContain('2026-04-06') // Family Day
    expect(h).toContain('2026-08-10') // Women's Day moved: Aug 9 2026 is a Sunday
  })
})
