/**
 * DecimalAccumulator.test.ts
 *
 * Unit tests for DecimalAccumulator.
 * Covers: Requirement 6.1, 6.2, 6.3
 *
 * Key correctness property (design.md — Property 1):
 *   DecimalAccumulator.toNumber() for N rows with values v_i must satisfy
 *   |result - Σv_i| < 1e-8
 *
 * Specific verification required by task:
 *   Accumulating 100,000 values of 0.00000001 must produce exactly 0.00100000
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { DecimalAccumulator } from './DecimalAccumulator'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAccumulator(): DecimalAccumulator {
  return new DecimalAccumulator()
}

// ---------------------------------------------------------------------------
// Basic operations
// ---------------------------------------------------------------------------

describe('DecimalAccumulator — basic operations', () => {
  it('starts at zero', () => {
    const acc = makeAccumulator()
    expect(acc.toNumber()).toBe(0)
    expect(acc.toFixed8()).toBe('0.00000000')
  })

  it('adds a single positive integer value', () => {
    const acc = makeAccumulator()
    acc.add(100)
    expect(acc.toNumber()).toBe(100)
    expect(acc.toFixed8()).toBe('100.00000000')
  })

  it('adds a single decimal value with 2 places', () => {
    const acc = makeAccumulator()
    acc.add(100.55)
    expect(acc.toFixed8()).toBe('100.55000000')
  })

  it('adds a single value with 8 decimal places', () => {
    const acc = makeAccumulator()
    acc.add(0.00000001)
    expect(acc.toFixed8()).toBe('0.00000001')
  })

  it('accumulates multiple values correctly', () => {
    const acc = makeAccumulator()
    acc.add(1.5)
    acc.add(2.5)
    expect(acc.toNumber()).toBe(4)
    expect(acc.toFixed8()).toBe('4.00000000')
  })

  it('reset() brings total back to zero', () => {
    const acc = makeAccumulator()
    acc.add(12345.67890123)
    acc.reset()
    expect(acc.toNumber()).toBe(0)
    expect(acc.toFixed8()).toBe('0.00000000')
  })

  it('handles negative values', () => {
    const acc = makeAccumulator()
    acc.add(-50.25)
    expect(acc.toFixed8()).toBe('-50.25000000')
    expect(acc.toNumber()).toBe(-50.25)
  })

  it('handles a mix of positive and negative values', () => {
    const acc = makeAccumulator()
    acc.add(100)
    acc.add(-30.5)
    acc.add(0.5)
    expect(acc.toNumber()).toBe(70)
    expect(acc.toFixed8()).toBe('70.00000000')
  })

  it('handles zero additions without changing total', () => {
    const acc = makeAccumulator()
    acc.add(5)
    acc.add(0)
    acc.add(0)
    expect(acc.toNumber()).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// toFixed8 formatting
// ---------------------------------------------------------------------------

describe('DecimalAccumulator — toFixed8 formatting', () => {
  it('produces exactly 8 decimal places', () => {
    const acc = makeAccumulator()
    acc.add(1.5)
    const result = acc.toFixed8()
    const decPart = result.split('.')[1]
    expect(decPart).toHaveLength(8)
  })

  it('formats large integer total correctly', () => {
    const acc = makeAccumulator()
    acc.add(1000000)
    expect(acc.toFixed8()).toBe('1000000.00000000')
  })

  it('formats value less than 1 with leading zero', () => {
    const acc = makeAccumulator()
    acc.add(0.00123456)
    expect(acc.toFixed8()).toBe('0.00123456')
  })

  it('formats negative value with minus sign', () => {
    const acc = makeAccumulator()
    acc.add(-0.00000001)
    expect(acc.toFixed8()).toBe('-0.00000001')
  })

  it('formats 12450.30 correctly', () => {
    const acc = makeAccumulator()
    acc.add(12450.30)
    expect(acc.toFixed8()).toBe('12450.30000000')
  })
})

// ---------------------------------------------------------------------------
// Float drift prevention — key correctness requirement
// ---------------------------------------------------------------------------

describe('DecimalAccumulator — float drift prevention (Requirement 6.2)', () => {
  it('accumulating 100,000 values of 0.00000001 produces exactly 0.00100000', () => {
    // This is the canonical check from the task spec.
    // A naive float sum: 100000 * 0.00000001 using JS number yields float drift.
    // DecimalAccumulator must return exactly 0.001.
    const acc = makeAccumulator()
    for (let i = 0; i < 100_000; i++) {
      acc.add(0.00000001)
    }
    expect(acc.toFixed8()).toBe('0.00100000')
    expect(acc.toNumber()).toBe(0.001)
  })

  it('naive JS float addition drifts (demonstrates why BigInt is needed)', () => {
    // This test documents that the problem exists with regular floats,
    // proving DecimalAccumulator solves a real issue.
    let sum = 0
    for (let i = 0; i < 100_000; i++) {
      sum += 0.00000001
    }
    // Float result is NOT exactly 0.001 — it drifts
    // We assert this to confirm the test is meaningful
    expect(Math.abs(sum - 0.001)).toBeGreaterThan(0)
  })

  it('accumulating 10 values of 0.1 produces exactly 1.00000000', () => {
    // 0.1 is a classic float precision issue
    const acc = makeAccumulator()
    for (let i = 0; i < 10; i++) {
      acc.add(0.1)
    }
    expect(acc.toFixed8()).toBe('1.00000000')
    expect(acc.toNumber()).toBe(1)
  })

  it('accumulating 3 values of 0.1 produces 0.30000000 exactly', () => {
    // 0.1 + 0.1 + 0.1 = 0.30000000000000004 in IEEE 754
    const acc = makeAccumulator()
    acc.add(0.1)
    acc.add(0.1)
    acc.add(0.1)
    expect(acc.toFixed8()).toBe('0.30000000')
  })

  it('accumulating 1000 values of 12.50 produces exactly 12500.00000000', () => {
    const acc = makeAccumulator()
    for (let i = 0; i < 1000; i++) {
      acc.add(12.50)
    }
    expect(acc.toFixed8()).toBe('12500.00000000')
    expect(acc.toNumber()).toBe(12500)
  })

  it('result satisfies |accumulated - expected| < 1e-8 for typical royalty values', () => {
    // Property 1 from design.md:
    // |result - Σv_i| < 1e-8
    const values = [1.23456789, 0.00000001, 99.9999999, 0.12345678, 1000.0]
    const expected = values.reduce((s, v) => s + v, 0)

    const acc = makeAccumulator()
    for (const v of values) {
      acc.add(v)
    }

    expect(Math.abs(acc.toNumber() - expected)).toBeLessThan(1e-8)
  })
})

// ---------------------------------------------------------------------------
// reset() behaviour
// ---------------------------------------------------------------------------

describe('DecimalAccumulator — reset', () => {
  it('reset allows re-use for a second accumulation', () => {
    const acc = makeAccumulator()
    acc.add(500)
    acc.reset()
    acc.add(0.00000001)
    expect(acc.toFixed8()).toBe('0.00000001')
  })

  it('toFixed8 after reset returns zero string', () => {
    const acc = makeAccumulator()
    acc.add(99999.12345678)
    acc.reset()
    expect(acc.toFixed8()).toBe('0.00000000')
  })
})
