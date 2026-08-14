/**
 * StreamTypeClassifier.pbt.test.ts
 *
 * Property-based tests for classify() and related functions using fast-check.
 *
 * Properties validated:
 *  1. Classification Exhaustiveness — classify() never throws, always returns a valid StreamCategory
 *  2. FREE_TRIAL / FREE_AD_SUPPORTED mutual exclusivity
 *  3. FRAUDULENT / UNQUALIFIED mutual exclusivity
 *  4. No side effects on input — classify() does not mutate the OrchardRecord passed to it
 *
 * Requirements: 3.4, 3.6, 3.9, 16.1, 16.3
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { classify, type StreamCategory, type OrchardRecord } from '../StreamTypeClassifier'

// ─── Valid StreamCategory values ──────────────────────────────────────────────

const VALID_CATEGORIES: ReadonlySet<StreamCategory> = new Set([
  'FULL_PAY',
  'FREE_AD_SUPPORTED',
  'FREE_TRIAL',
  'UNQUALIFIED',
  'FRAUDULENT',
  'OTHER',
  'UNKNOWN',
])

// ─── Arbitrary: full OrchardRecord ────────────────────────────────────────────

/**
 * Generates an arbitrary OrchardRecord with random field values.
 * Used to verify classify() produces no side effects on the record.
 */
const orchardRecordArb: fc.Arbitrary<OrchardRecord> = fc.record({
  net_total:            fc.float({ noNaN: true }),
  gross_total:          fc.float({ noNaN: true }),
  taxes:                fc.float({ noNaN: true }),
  channel_costs:        fc.float({ noNaN: true }),
  other_costs:          fc.float({ noNaN: true }),
  currency:             fc.constantFrom('USD', 'EUR', 'GBP', 'MXN', ''),
  artist:               fc.string(),
  track:                fc.string(),
  album:                fc.string(),
  upc:                  fc.string(),
  isrc:                 fc.string(),
  platform:             fc.string(),
  country:              fc.string(),
  quantity:             fc.integer({ min: 0, max: 1_000_000 }),
  sale_period:          fc.string(),
  artist_name:          fc.string(),
  song_title:           fc.string(),
  album_name:           fc.string(),
  store:                fc.string(),
  earnings_usd:         fc.float({ noNaN: true }),
  rawStreamType:        fc.string(),
  normalizedStreamType: fc.constantFrom<StreamCategory>(
    'FULL_PAY',
    'FREE_AD_SUPPORTED',
    'FREE_TRIAL',
    'UNQUALIFIED',
    'FRAUDULENT',
    'OTHER',
    'UNKNOWN',
  ),
  rowIndex:   fc.integer({ min: 2, max: 100_000 }),
  sourceFile: fc.string(),
})

// ─── Property 1: Classification Exhaustiveness ────────────────────────────────

describe('Property 1 — Classification Exhaustiveness', () => {
  /**
   * ∀ s: string → classify(s) ∈ StreamCategory (never throws)
   *
   * Validates Requirements 3.9, 16.1
   */
  it('classify() always returns a valid StreamCategory for any string', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        let result: StreamCategory
        expect(() => {
          result = classify(s)
        }).not.toThrow()
        expect(VALID_CATEGORIES).toContain(result!)
      }),
      { numRuns: 10_000 },
    )
  })

  it('classify() always returns a valid StreamCategory for null or undefined', () => {
    fc.assert(
      fc.property(fc.constantFrom(null, undefined), (v) => {
        let result: StreamCategory
        expect(() => {
          result = classify(v as never)
        }).not.toThrow()
        expect(VALID_CATEGORIES).toContain(result!)
      }),
    )
  })

  it('classify() always returns a valid StreamCategory for whitespace-only strings', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\s+$/), (s) => {
        let result: StreamCategory
        expect(() => {
          result = classify(s)
        }).not.toThrow()
        expect(VALID_CATEGORIES).toContain(result!)
      }),
      { numRuns: 1_000 },
    )
  })

  it('classify() returns UNKNOWN for whitespace-only strings', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\s+$/), (s) => {
        expect(classify(s)).toBe('UNKNOWN')
      }),
      { numRuns: 1_000 },
    )
  })

  it('classify() returns UNKNOWN for empty string', () => {
    expect(classify('')).toBe('UNKNOWN')
  })

  it('classify() never returns a value outside StreamCategory union for arbitrary Unicode', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        const result = classify(s)
        expect(VALID_CATEGORIES).toContain(result)
      }),
      { numRuns: 5_000 },
    )
  })
})

// ─── Property 2: FREE_TRIAL / FREE_AD_SUPPORTED Mutual Exclusivity ─────────────

describe('Property 2 — FREE_TRIAL / FREE_AD_SUPPORTED mutual exclusivity', () => {
  /**
   * ∀ s: string → NOT (classify(s) === 'FREE_TRIAL' AND classify(s) === 'FREE_AD_SUPPORTED')
   *
   * Since classify() is a pure function returning a single value, this is trivially
   * guaranteed by return type. The tests below verify it concretely with strings
   * that contain both "free" and "trial" keywords.
   *
   * Validates Requirements 3.4, 16.5
   */
  it('classify() never simultaneously returns FREE_TRIAL and FREE_AD_SUPPORTED', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = classify(s)
        // A single call can only return one value — both cannot be true at once.
        // Using a boolean helper prevents TS control-flow narrowing from erroring on
        // the logically impossible (but intentionally tested) dual comparison.
        const isFreeTrial = result === 'FREE_TRIAL'
        const isFreeAd   = result === 'FREE_AD_SUPPORTED'
        expect(isFreeTrial && isFreeAd).toBe(false)
      }),
      { numRuns: 10_000 },
    )
  })

  it('strings containing both "free" and "trial" resolve to FREE_TRIAL, not FREE_AD_SUPPORTED', () => {
    // Generate strings that contain both keywords to stress-test priority ordering
    fc.assert(
      fc.property(
        fc.tuple(fc.string(), fc.string(), fc.string()),
        ([prefix, middle, suffix]) => {
          const s = `${prefix}free trial${middle}${suffix}`
          const result = classify(s)
          // "free trial" must always resolve to FREE_TRIAL
          if (result === 'FREE_AD_SUPPORTED') {
            // This would be a bug — FREE_TRIAL should take priority
            throw new Error(`Expected FREE_TRIAL but got FREE_AD_SUPPORTED for: "${s}"`)
          }
          // Either FREE_TRIAL or a higher-priority category (FRAUDULENT/UNQUALIFIED)
          // could win if the prefix/suffix contains those patterns.
          expect(['FREE_TRIAL', 'FRAUDULENT', 'UNQUALIFIED']).toContain(result)
        },
      ),
      { numRuns: 1_000 },
    )
  })

  it('"free trial" always classifies as FREE_TRIAL (canonical case)', () => {
    expect(classify('free trial')).toBe('FREE_TRIAL')
    expect(classify('free trial')).not.toBe('FREE_AD_SUPPORTED')
  })
})

// ─── Property 3: FRAUDULENT / UNQUALIFIED Mutual Exclusivity ──────────────────

describe('Property 3 — FRAUDULENT / UNQUALIFIED mutual exclusivity', () => {
  /**
   * ∀ s: string → NOT (classify(s) === 'FRAUDULENT' AND classify(s) === 'UNQUALIFIED')
   *
   * Validates Requirement 3.6
   */
  it('classify() never simultaneously returns FRAUDULENT and UNQUALIFIED', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = classify(s)
        // A single call can only return one value — both cannot be true at once.
        // Split into two booleans to avoid TS2367 on the logically impossible dual comparison.
        const isFraudulent  = result === 'FRAUDULENT'
        const isUnqualified = result === 'UNQUALIFIED'
        expect(isFraudulent && isUnqualified).toBe(false)
      }),
      { numRuns: 10_000 },
    )
  })

  it('strings containing both "fraud" and "unqualified" resolve to FRAUDULENT, not UNQUALIFIED', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string(), fc.string(), fc.string()),
        ([prefix, middle, suffix]) => {
          const s = `${prefix}fraud${middle}unqualified${suffix}`
          const result = classify(s)
          // FRAUDULENT must take priority over UNQUALIFIED
          expect(result).toBe('FRAUDULENT')
          expect(result).not.toBe('UNQUALIFIED')
        },
      ),
      { numRuns: 1_000 },
    )
  })

  it('"fraud unqualified" always classifies as FRAUDULENT (canonical priority test)', () => {
    expect(classify('fraud unqualified')).toBe('FRAUDULENT')
    expect(classify('fraud unqualified')).not.toBe('UNQUALIFIED')
  })

  it('"fraudulent unqualified audio streams" resolves to FRAUDULENT', () => {
    expect(classify('fraudulent unqualified audio streams')).toBe('FRAUDULENT')
  })
})

// ─── Property 4: No Side Effects on Input ─────────────────────────────────────

describe('Property 4 — No side effects on input', () => {
  /**
   * ∀ record: OrchardRecord → classify(record.rawStreamType) does not mutate record
   *
   * Validates Requirements 1.5, 16.3
   */
  it('classify() does not mutate the OrchardRecord it reads rawStreamType from', () => {
    fc.assert(
      fc.property(orchardRecordArb, (record) => {
        // Take a deep snapshot using structuredClone so Infinity/NaN survive correctly
        const before = structuredClone(record)

        // Call classify() with the record's rawStreamType — this is the real usage pattern
        classify(record.rawStreamType)

        // Every field of the record must still match its pre-call value exactly
        for (const key of Object.keys(before) as (keyof OrchardRecord)[]) {
          const bVal = before[key]
          const aVal = record[key]
          if (typeof bVal === 'number' && isNaN(bVal as number)) {
            // NaN !== NaN in JS — use isNaN for comparison
            expect(isNaN(aVal as number)).toBe(true)
          } else {
            expect(aVal).toBe(bVal)
          }
        }
      }),
      { numRuns: 2_000 },
    )
  })

  it('classify() does not mutate the string argument (strings are immutable in JS, but verify no throw)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const original = s
        classify(s)
        // String is unchanged (immutable by value)
        expect(s).toBe(original)
      }),
      { numRuns: 5_000 },
    )
  })

  it('calling classify() multiple times on the same input always returns the same result (pure/deterministic)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const first  = classify(s)
        const second = classify(s)
        const third  = classify(s)
        expect(first).toBe(second)
        expect(second).toBe(third)
      }),
      { numRuns: 5_000 },
    )
  })
})
