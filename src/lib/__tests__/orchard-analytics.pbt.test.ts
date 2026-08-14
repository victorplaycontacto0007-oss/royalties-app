/**
 * orchard-analytics.pbt.test.ts
 *
 * Property-based tests for OrchardAnalytics pure functions using fast-check.
 *
 * Property 5: Stream Reconciliation Invariant
 *   ∀ records → Σ(r.quantity) === sum of all category stream counts from computeBreakdown
 *
 * Property 6: Revenue Reconciliation Invariant
 *   ∀ records → |Σ(r.net_total) − Σ(category revenues)| ≤ 0.01
 *
 * Property 7: Filter Monotonicity
 *   Adding an extra filter never increases result count
 *
 * Property 8: Platform Summary Completeness
 *   Every platform in records appears in computePlatformSummaries output
 *
 * Property 9: Drill-Down Traceability
 *   rowIndexes from applyFilters result are always a subset of all rowIndexes in records
 *
 * Validates: Requirements 11.1, 11.4, 12.1, 12.4, 14.2, 14.3, 15.1, 18.2
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  computeBreakdown,
  computePlatformSummaries,
  applyFilters,
  type FilterState,
} from '../orchard-analytics'
import type { OrchardRecord, StreamCategory } from '../../royalty-engine/StreamTypeClassifier'

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const STREAM_CATEGORIES: StreamCategory[] = [
  'FULL_PAY',
  'FREE_AD_SUPPORTED',
  'FREE_TRIAL',
  'UNQUALIFIED',
  'FRAUDULENT',
  'OTHER',
  'UNKNOWN',
]

/**
 * Generates a single OrchardRecord with controlled fields.
 * - quantity is always a non-negative integer (streams cannot be negative)
 * - net_total is a float representing revenue (can be negative for chargebacks)
 * - rowIndex is a unique-ish positive integer (not guaranteed unique in gen, but fine for properties)
 */
const arbitraryOrchardRecord = fc.record<OrchardRecord>({
  net_total:            fc.float({ noNaN: true, min: -1000, max: 100_000 }),
  gross_total:          fc.float({ noNaN: true, min: 0, max: 100_000 }),
  taxes:                fc.float({ noNaN: true, min: 0, max: 1_000 }),
  channel_costs:        fc.float({ noNaN: true, min: 0, max: 1_000 }),
  other_costs:          fc.float({ noNaN: true, min: 0, max: 1_000 }),
  currency:             fc.constantFrom('USD', 'EUR', 'GBP', 'CAD'),
  artist:               fc.constantFrom('Artist A', 'Artist B', 'Artist C'),
  track:                fc.constantFrom('Track X', 'Track Y', 'Track Z'),
  album:                fc.constantFrom('Album 1', 'Album 2'),
  upc:                  fc.stringMatching(/^[0-9]{12}$/),
  isrc:                 fc.stringMatching(/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/),
  platform:             fc.constantFrom('Spotify', 'Apple Music', 'Amazon Music', 'YouTube Music'),
  country:              fc.constantFrom('US', 'MX', 'GB', 'DE', 'BR'),
  quantity:             fc.integer({ min: 0, max: 100_000 }),
  sale_period:          fc.constantFrom('2024-01', '2024-02', '2024-03', '2023-12'),
  artist_name:          fc.constantFrom('Artist A', 'Artist B', 'Artist C'),
  song_title:           fc.constantFrom('Track X', 'Track Y', 'Track Z'),
  album_name:           fc.constantFrom('Album 1', 'Album 2'),
  store:                fc.constantFrom('Spotify', 'Apple Music', 'Amazon Music', 'YouTube Music'),
  earnings_usd:         fc.float({ noNaN: true, min: 0, max: 100_000 }),
  rawStreamType:        fc.string({ maxLength: 50 }),
  normalizedStreamType: fc.constantFrom<StreamCategory>(...STREAM_CATEGORIES),
  rowIndex:             fc.integer({ min: 2, max: 999_999 }),
  sourceFile:           fc.constantFrom('orchard-2024-01.tsv', 'orchard-2024-02.tsv'),
})

/** Generates an array of 0–50 OrchardRecords. */
const arbitraryRecords = fc.array(arbitraryOrchardRecord, { minLength: 0, maxLength: 50 })

/** Non-empty records array for properties that require at least one record. */
const arbitraryNonEmptyRecords = fc.array(arbitraryOrchardRecord, { minLength: 1, maxLength: 50 })

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sums breakdown category streams including FREE_TRIAL (null → 0). */
function sumCategoryStreams(bd: ReturnType<typeof computeBreakdown>): number {
  return (
    bd.FULL_PAY.streams +
    bd.FREE_AD_SUPPORTED.streams +
    (bd.FREE_TRIAL?.streams ?? 0) +
    bd.UNQUALIFIED.streams +
    bd.FRAUDULENT.streams +
    bd.OTHER.streams +
    bd.UNKNOWN.streams
  )
}

/** Sums breakdown category revenues including FREE_TRIAL (null → 0). */
function sumCategoryRevenue(bd: ReturnType<typeof computeBreakdown>): number {
  return (
    bd.FULL_PAY.revenue +
    bd.FREE_AD_SUPPORTED.revenue +
    (bd.FREE_TRIAL?.revenue ?? 0) +
    bd.UNQUALIFIED.revenue +
    bd.FRAUDULENT.revenue +
    bd.OTHER.revenue +
    bd.UNKNOWN.revenue
  )
}

/** Builds a null-everything FilterState. */
function emptyFilters(): FilterState {
  return {
    period: null,
    platform: null,
    country: null,
    artist: null,
    track: null,
    release: null,
    isrc: null,
    upc: null,
    normalizedStreamType: null,
    rawStreamType: null,
  }
}

// ─── Property 5: Stream Reconciliation Invariant ─────────────────────────────
// ∀ records → Σ(r.quantity) === sum of all category stream counts from computeBreakdown
//
// The breakdown's total.streams must equal the arithmetic sum of all 7 category
// stream counts, and that sum must equal the direct sum of r.quantity across records.
//
// Validates: Requirements 11.1, 11.4

describe('Property 5 — Stream Reconciliation Invariant', () => {
  it('total streams in breakdown equals direct sum of record quantities', () => {
    fc.assert(
      fc.property(arbitraryRecords, (records) => {
        const breakdown = computeBreakdown(records)

        // Direct sum of quantities from all records
        const directSum = records.reduce((acc, r) => acc + r.quantity, 0)

        // Sum of all category streams from breakdown
        const categorySum = sumCategoryStreams(breakdown)

        // All three must agree
        expect(breakdown.total.streams).toBe(directSum)
        expect(breakdown.total.streams).toBe(categorySum)
      }),
      { numRuns: 500 },
    )
  })

  it('category streams sum equals breakdown.total.streams (no uncategorized streams)', () => {
    fc.assert(
      fc.property(arbitraryRecords, (records) => {
        const breakdown = computeBreakdown(records)
        const categorySum = sumCategoryStreams(breakdown)

        // Because every record has a valid normalizedStreamType, categorySum must
        // equal total.streams — there must be no uncategorized streams.
        expect(categorySum).toBe(breakdown.total.streams)
      }),
      { numRuns: 500 },
    )
  })

  it('holds for an empty record set (all zeros)', () => {
    const breakdown = computeBreakdown([])
    expect(breakdown.total.streams).toBe(0)
    expect(sumCategoryStreams(breakdown)).toBe(0)
  })
})

// ─── Property 6: Revenue Reconciliation Invariant ────────────────────────────
// ∀ records → |Σ(r.net_total) − Σ(category revenues)| ≤ 0.01
//
// Due to IEEE-754 floating-point addition ordering, the direct revenue sum may
// differ from the categorized sum by a tiny rounding error. We allow ≤ $0.01.
//
// Validates: Requirements 12.1, 12.4

describe('Property 6 — Revenue Reconciliation Invariant', () => {
  it('|direct revenue sum − categorized revenue sum| ≤ 0.01', () => {
    fc.assert(
      fc.property(arbitraryRecords, (records) => {
        const breakdown = computeBreakdown(records)

        const directSum = records.reduce((acc, r) => acc + r.net_total, 0)
        const categorySum = sumCategoryRevenue(breakdown)

        const discrepancy = Math.abs(directSum - categorySum)
        expect(discrepancy).toBeLessThanOrEqual(0.01)
      }),
      { numRuns: 500 },
    )
  })

  it('breakdown.total.revenue equals the direct sum of net_total', () => {
    fc.assert(
      fc.property(arbitraryRecords, (records) => {
        const breakdown = computeBreakdown(records)
        const directSum = records.reduce((acc, r) => acc + r.net_total, 0)

        // The breakdown accumulates net_total per category in the same order —
        // the total should match the direct sum exactly (same accumulation order).
        expect(Math.abs(breakdown.total.revenue - directSum)).toBeLessThanOrEqual(0.01)
      }),
      { numRuns: 500 },
    )
  })

  it('revenue invariant holds for empty records (zero discrepancy)', () => {
    const breakdown = computeBreakdown([])
    expect(breakdown.total.revenue).toBe(0)
    expect(sumCategoryRevenue(breakdown)).toBe(0)
  })
})

// ─── Property 7: Filter Monotonicity ─────────────────────────────────────────
// Adding an extra filter never increases the result count.
// ∀ records, baseFilters, extraFilter →
//   applyFilters(records, {...baseFilters, ...extraFilter}).length
//   ≤ applyFilters(records, baseFilters).length
//
// Validates: Requirements 14.2, 14.3

describe('Property 7 — Filter Monotonicity', () => {
  it('adding a platform filter to existing filters never increases result count', () => {
    fc.assert(
      fc.property(
        arbitraryRecords,
        fc.constantFrom('Spotify', 'Apple Music', 'Amazon Music', 'YouTube Music', 'NonExistentDSP'),
        (records, platform) => {
          const baseFilters = emptyFilters()
          const narrowerFilters: FilterState = { ...baseFilters, platform }

          const baseCount     = applyFilters(records, baseFilters).length
          const narrowerCount = applyFilters(records, narrowerFilters).length

          expect(narrowerCount).toBeLessThanOrEqual(baseCount)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('adding a country filter to an existing platform filter never increases count', () => {
    fc.assert(
      fc.property(
        arbitraryRecords,
        fc.constantFrom('Spotify', 'Apple Music', 'Amazon Music', 'YouTube Music'),
        fc.constantFrom('US', 'MX', 'GB', 'DE', 'ZZ'),
        (records, platform, country) => {
          const platformOnly: FilterState   = { ...emptyFilters(), platform }
          const withCountry:  FilterState   = { ...platformOnly, country }

          const platformCount = applyFilters(records, platformOnly).length
          const combinedCount = applyFilters(records, withCountry).length

          expect(combinedCount).toBeLessThanOrEqual(platformCount)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('adding a normalizedStreamType filter never increases count', () => {
    fc.assert(
      fc.property(
        arbitraryRecords,
        fc.constantFrom<StreamCategory>(...STREAM_CATEGORIES),
        (records, normalizedStreamType) => {
          const base      = emptyFilters()
          const narrower: FilterState = { ...base, normalizedStreamType }

          const baseCount     = applyFilters(records, base).length
          const narrowerCount = applyFilters(records, narrower).length

          expect(narrowerCount).toBeLessThanOrEqual(baseCount)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('stacking platform + country + streamType filters produces ≤ each subset', () => {
    fc.assert(
      fc.property(
        arbitraryRecords,
        fc.constantFrom('Spotify', 'Apple Music'),
        fc.constantFrom('US', 'MX'),
        fc.constantFrom<StreamCategory>('FULL_PAY', 'FREE_AD_SUPPORTED', 'UNKNOWN'),
        (records, platform, country, normalizedStreamType) => {
          const f0 = emptyFilters()
          const f1: FilterState = { ...f0, platform }
          const f2: FilterState = { ...f1, country }
          const f3: FilterState = { ...f2, normalizedStreamType }

          const c0 = applyFilters(records, f0).length
          const c1 = applyFilters(records, f1).length
          const c2 = applyFilters(records, f2).length
          const c3 = applyFilters(records, f3).length

          // Each additional filter is non-expanding
          expect(c1).toBeLessThanOrEqual(c0)
          expect(c2).toBeLessThanOrEqual(c1)
          expect(c3).toBeLessThanOrEqual(c2)
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ─── Property 8: Platform Summary Completeness ───────────────────────────────
// Every platform in records appears in computePlatformSummaries output.
// ∀ records → Set(records.map(r => r.platform)) ⊆ Set(summaries.map(s => s.platform))
//
// Validates: Requirement 15.1 (indirect — every DSP that produced data must be visible)

describe('Property 8 — Platform Summary Completeness', () => {
  it('every platform present in records appears in computePlatformSummaries', () => {
    fc.assert(
      fc.property(arbitraryRecords, (records) => {
        const platformsInRecords = new Set(records.map(r => r.platform))
        const summaries = computePlatformSummaries(records)
        const platformsInSummaries = new Set(summaries.map(s => s.platform))

        for (const platform of platformsInRecords) {
          expect(platformsInSummaries.has(platform)).toBe(true)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('computePlatformSummaries produces no phantom platforms not in records', () => {
    fc.assert(
      fc.property(arbitraryRecords, (records) => {
        const platformsInRecords = new Set(records.map(r => r.platform))
        const summaries = computePlatformSummaries(records)

        for (const summary of summaries) {
          expect(platformsInRecords.has(summary.platform)).toBe(true)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('summary count equals the number of distinct platforms in records', () => {
    fc.assert(
      fc.property(arbitraryRecords, (records) => {
        const distinctPlatforms = new Set(records.map(r => r.platform)).size
        const summaries = computePlatformSummaries(records)

        expect(summaries.length).toBe(distinctPlatforms)
      }),
      { numRuns: 500 },
    )
  })

  it('empty records produces empty summaries list', () => {
    const summaries = computePlatformSummaries([])
    expect(summaries).toHaveLength(0)
  })
})

// ─── Property 9: Drill-Down Traceability ─────────────────────────────────────
// rowIndexes from applyFilters result are always a subset of all rowIndexes in records.
// ∀ records, filters → applyFilters(records, filters).map(r => r.rowIndex) ⊆ records.map(r => r.rowIndex)
//
// Validates: Requirements 15.1, 18.2

describe('Property 9 — Drill-Down Traceability', () => {
  it('filtered rowIndexes are always a subset of all rowIndexes in records', () => {
    fc.assert(
      fc.property(
        arbitraryRecords,
        fc.constantFrom<StreamCategory | null>(...STREAM_CATEGORIES, null),
        fc.constantFrom<string | null>('Spotify', 'Apple Music', null),
        fc.constantFrom<string | null>('US', 'MX', null),
        (records, normalizedStreamType, platform, country) => {
          const filters: FilterState = {
            ...emptyFilters(),
            normalizedStreamType,
            platform,
            country,
          }

          const allRowIndexes   = new Set(records.map(r => r.rowIndex))
          const filteredRecords = applyFilters(records, filters)

          for (const r of filteredRecords) {
            expect(allRowIndexes.has(r.rowIndex)).toBe(true)
          }
        },
      ),
      { numRuns: 500 },
    )
  })

  it('filtered records are a reference-identical subset of the input array', () => {
    fc.assert(
      fc.property(
        arbitraryNonEmptyRecords,
        fc.constantFrom<StreamCategory>(...STREAM_CATEGORIES),
        (records, normalizedStreamType) => {
          const filters: FilterState = { ...emptyFilters(), normalizedStreamType }
          const filtered = applyFilters(records, filters)

          // Every filtered record must be the exact same object reference that
          // exists in records — applyFilters must not clone or mutate records.
          for (const filteredRecord of filtered) {
            expect(records).toContain(filteredRecord)
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  it('null filters (no filter active) returns all records unchanged', () => {
    fc.assert(
      fc.property(arbitraryRecords, (records) => {
        const filtered = applyFilters(records, emptyFilters())
        expect(filtered).toHaveLength(records.length)

        // Same objects in same order
        for (let i = 0; i < records.length; i++) {
          expect(filtered[i]).toBe(records[i])
        }
      }),
      { numRuns: 300 },
    )
  })

  it('filtering by a non-existent platform returns empty array', () => {
    fc.assert(
      fc.property(arbitraryRecords, (records) => {
        const filters: FilterState = { ...emptyFilters(), platform: '__nonexistent_platform__' }
        const filtered = applyFilters(records, filters)
        expect(filtered).toHaveLength(0)
      }),
      { numRuns: 200 },
    )
  })
})
