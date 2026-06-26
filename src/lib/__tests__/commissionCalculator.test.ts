import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { calculateCommission } from '../commissionCalculator'

// ── Unit tests (concrete examples) ────────────────────────

describe('calculateCommission — unit tests', () => {
  it('calculates 20% of $20 = $4', () => {
    expect(calculateCommission(20, 20)).toBe(4)
  })

  it('calculates 25% of $100 = $25', () => {
    expect(calculateCommission(100, 25)).toBe(25)
  })

  it('rounds to 2 decimal places', () => {
    // 20 * (15/100) = 3.0 — exact
    expect(calculateCommission(20, 15)).toBe(3)
    // 10 * (33.33/100) = 3.333 → rounded to 3.33
    expect(calculateCommission(10, 33.33)).toBe(3.33)
  })

  it('handles minimum percentage (0.01%)', () => {
    expect(calculateCommission(1000, 0.01)).toBe(0.1)
  })

  it('handles maximum percentage (100%)', () => {
    expect(calculateCommission(50, 100)).toBe(50)
  })

  it('handles small amounts', () => {
    expect(calculateCommission(3, 20)).toBe(0.6)
  })

  it('handles large amounts', () => {
    expect(calculateCommission(99999.99, 20)).toBe(20000)
  })
})

// ── Property 1: Cálculo de comisión es correcto para cualquier entrada válida
// Validates: Requirements 1.5, 2.3

describe('calculateCommission — Property 1', () => {
  it('always equals Math.round(p * c / 100 * 100) / 100 for any valid input', () => {
    // fc.float requires 32-bit floats; use fc.double with custom range instead
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 100,     noNaN: true, noDefaultInfinity: true }),
        (amount, pct) => {
          const result   = calculateCommission(amount, pct)
          const expected = Math.round(amount * (pct / 100) * 100) / 100
          return result === expected
        },
      ),
      { numRuns: 200 },
    )
  })

  it('result is always >= 0', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 100,     noNaN: true, noDefaultInfinity: true }),
        (amount, pct) => calculateCommission(amount, pct) >= 0,
      ),
      { numRuns: 200 },
    )
  })

  it('result is always <= purchase amount (pct <= 100)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 100,     noNaN: true, noDefaultInfinity: true }),
        (amount, pct) => calculateCommission(amount, pct) <= amount + 0.01,
      ),
      { numRuns: 200 },
    )
  })
})
