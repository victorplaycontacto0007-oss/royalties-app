/**
 * StreamTypeClassifier.test.ts
 *
 * Deterministic unit tests for the classify() function.
 *
 * Covers all 7 StreamCategory values using:
 *  - Canonical Orchard values
 *  - Case variants
 *  - Ambiguous strings (priority-order checks)
 *  - Empty / null / whitespace-only → UNKNOWN
 *  - Truly unknown values → OTHER
 *
 * Requirements: 3.4, 3.6, 3.9, 16.1
 */

import { describe, it, expect } from 'vitest'
import { classify } from '../StreamTypeClassifier'

// ─── FULL_PAY ─────────────────────────────────────────────────────────────────

describe('classify() → FULL_PAY', () => {
  it('returns FULL_PAY for canonical "Subscription Audio Streams"', () => {
    expect(classify('Subscription Audio Streams')).toBe('FULL_PAY')
  })

  it('returns FULL_PAY for "subscription" (partial keyword)', () => {
    expect(classify('subscription')).toBe('FULL_PAY')
  })

  it('returns FULL_PAY for case variant "PREMIUM"', () => {
    expect(classify('PREMIUM')).toBe('FULL_PAY')
  })

  it('returns FULL_PAY for "paid"', () => {
    expect(classify('paid')).toBe('FULL_PAY')
  })

  it('returns FULL_PAY for "paid subscription"', () => {
    expect(classify('paid subscription')).toBe('FULL_PAY')
  })
})

// ─── FREE_AD_SUPPORTED ────────────────────────────────────────────────────────

describe('classify() → FREE_AD_SUPPORTED', () => {
  it('returns FREE_AD_SUPPORTED for canonical "Ad-Supported Audio Streams"', () => {
    expect(classify('Ad-Supported Audio Streams')).toBe('FREE_AD_SUPPORTED')
  })

  it('returns FREE_AD_SUPPORTED for case variant "ad supported"', () => {
    expect(classify('ad supported')).toBe('FREE_AD_SUPPORTED')
  })

  it('returns FREE_AD_SUPPORTED for "avod"', () => {
    expect(classify('avod')).toBe('FREE_AD_SUPPORTED')
  })

  it('returns FREE_AD_SUPPORTED for ambiguous "free" (NOT FREE_TRIAL)', () => {
    // "free" matches FREE_AD pattern but does NOT contain "trial"
    expect(classify('free')).toBe('FREE_AD_SUPPORTED')
  })

  it('returns FREE_AD_SUPPORTED for "ad-supported"', () => {
    expect(classify('ad-supported')).toBe('FREE_AD_SUPPORTED')
  })
})

// ─── FREE_TRIAL ───────────────────────────────────────────────────────────────

describe('classify() → FREE_TRIAL', () => {
  it('returns FREE_TRIAL for canonical "Free Trial"', () => {
    expect(classify('Free Trial')).toBe('FREE_TRIAL')
  })

  it('returns FREE_TRIAL for case variant "FREE TRIAL"', () => {
    expect(classify('FREE TRIAL')).toBe('FREE_TRIAL')
  })

  it('returns FREE_TRIAL for "trial" (partial keyword)', () => {
    expect(classify('trial')).toBe('FREE_TRIAL')
  })

  it('returns FREE_TRIAL for "free trial" and NOT FREE_AD_SUPPORTED (priority check)', () => {
    // FREE_TRIAL patterns are checked before FREE_AD patterns — "free trial" must
    // match FREE_TRIAL, never FREE_AD_SUPPORTED (Requirement 3.4)
    expect(classify('free trial')).toBe('FREE_TRIAL')
  })

  it('returns FREE_TRIAL for "trial subscription"', () => {
    expect(classify('trial subscription')).toBe('FREE_TRIAL')
  })
})

// ─── UNQUALIFIED ─────────────────────────────────────────────────────────────

describe('classify() → UNQUALIFIED', () => {
  it('returns UNQUALIFIED for canonical "Unqualified Audio Streams"', () => {
    expect(classify('Unqualified Audio Streams')).toBe('UNQUALIFIED')
  })

  it('returns UNQUALIFIED for "unqualified" (partial keyword)', () => {
    expect(classify('unqualified')).toBe('UNQUALIFIED')
  })

  it('returns UNQUALIFIED for "non-qualified"', () => {
    expect(classify('non-qualified')).toBe('UNQUALIFIED')
  })
})

// ─── FRAUDULENT ───────────────────────────────────────────────────────────────

describe('classify() → FRAUDULENT', () => {
  it('returns FRAUDULENT for canonical "Fraudulent Streams"', () => {
    expect(classify('Fraudulent Streams')).toBe('FRAUDULENT')
  })

  it('returns FRAUDULENT for "fraudulent" (partial keyword)', () => {
    expect(classify('fraudulent')).toBe('FRAUDULENT')
  })

  it('returns FRAUDULENT for ambiguous "fraud unqualified" (FRAUDULENT beats UNQUALIFIED — priority)', () => {
    // FRAUDULENT is checked before UNQUALIFIED, so "fraud unqualified" → FRAUDULENT
    // NOT UNQUALIFIED (Requirement 3.6)
    expect(classify('fraud unqualified')).toBe('FRAUDULENT')
  })

  it('returns FRAUDULENT for "artificial stream"', () => {
    expect(classify('artificial stream')).toBe('FRAUDULENT')
  })
})

// ─── UNKNOWN ──────────────────────────────────────────────────────────────────

describe('classify() → UNKNOWN (empty / null / whitespace)', () => {
  it('returns UNKNOWN for empty string', () => {
    expect(classify('')).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for null', () => {
    expect(classify(null)).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for undefined', () => {
    expect(classify(undefined)).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for whitespace-only string "   "', () => {
    expect(classify('   ')).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for tab-only whitespace', () => {
    expect(classify('\t')).toBe('UNKNOWN')
  })
})

// ─── OTHER ────────────────────────────────────────────────────────────────────

describe('classify() → OTHER (known value, no category match)', () => {
  it('returns OTHER for truly unknown value "something unknown"', () => {
    expect(classify('something unknown')).toBe('OTHER')
  })

  it('returns OTHER for a numeric string "12345"', () => {
    expect(classify('12345')).toBe('OTHER')
  })

  it('returns OTHER for a random category label "digital download"', () => {
    expect(classify('digital download')).toBe('OTHER')
  })
})

// ─── Priority order edge cases ────────────────────────────────────────────────

describe('classify() — priority order edge cases', () => {
  it('"free trial" → FREE_TRIAL, not FREE_AD_SUPPORTED', () => {
    // "free" is a FREE_AD pattern, but "free trial" matches FREE_TRIAL first
    expect(classify('free trial')).toBe('FREE_TRIAL')
    expect(classify('free trial')).not.toBe('FREE_AD_SUPPORTED')
  })

  it('"fraud unqualified" → FRAUDULENT, not UNQUALIFIED', () => {
    // "unqualified" is in the string, but FRAUDULENT is checked first
    expect(classify('fraud unqualified')).toBe('FRAUDULENT')
    expect(classify('fraud unqualified')).not.toBe('UNQUALIFIED')
  })

  it('"free" → FREE_AD_SUPPORTED, not FREE_TRIAL', () => {
    // "free" alone does NOT contain "trial", so it lands in FREE_AD_SUPPORTED
    expect(classify('free')).toBe('FREE_AD_SUPPORTED')
    expect(classify('free')).not.toBe('FREE_TRIAL')
  })
})

// ─── toOrchardRecords() ───────────────────────────────────────────────────────

import { toOrchardRecords, type OrchardRecord } from '../StreamTypeClassifier'
import type { RUPEResult, ParsedRow } from '../UniversalParser'

/** Minimal ParsedRow fixture — all numeric fields default to 0, strings to '' */
function makeRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    net_total:     0,
    gross_total:   0,
    taxes:         0,
    channel_costs: 0,
    other_costs:   0,
    currency:      'USD',
    artist:        'Test Artist',
    track:         'Test Track',
    album:         'Test Album',
    upc:           '000000000000',
    isrc:          'AA0000000000',
    platform:      'Spotify',
    country:       'US',
    quantity:      100,
    sale_period:   '2024-01',
    artist_name:   'Test Artist',
    song_title:    'Test Track',
    album_name:    'Test Album',
    store:         'Spotify',
    earnings_usd:  1.23,
    ...overrides,
  }
}

/** Minimal RUPEResult wrapping an array of ParsedRow fixtures */
function makeRUPEResult(rows: ParsedRow[]): RUPEResult {
  return {
    rows,
    stats: {
      rowsProcessed: rows.length,
      rowsSkipped:   0,
      rowsEmpty:     0,
      currenciesFound: [],
      platformsFound:  [],
    } as unknown as RUPEResult['stats'],
    audit: {} as RUPEResult['audit'],
    debug: {} as RUPEResult['debug'],
  }
}

describe('toOrchardRecords()', () => {
  it('assigns rowIndex = i + 2 (1-based, accounts for header row)', () => {
    const rows = [makeRow(), makeRow(), makeRow()]
    const result = makeRUPEResult(rows)
    const rawRows = [
      ['Subscription Audio Streams'],
      ['Ad-Supported Audio Streams'],
      ['Free Trial'],
    ]

    const records = toOrchardRecords(result, rawRows, 0, 'test.tsv')

    expect(records[0].rowIndex).toBe(2) // row 0 in data → file row 2
    expect(records[1].rowIndex).toBe(3)
    expect(records[2].rowIndex).toBe(4)
  })

  it('assigns sourceFile from fileName argument', () => {
    const result = makeRUPEResult([makeRow()])
    const rawRows = [['Subscription Audio Streams']]

    const records = toOrchardRecords(result, rawRows, 0, 'orchard-2024-01.tsv')

    expect(records[0].sourceFile).toBe('orchard-2024-01.tsv')
  })

  it('preserves rawStreamType exactly as it appears in the raw row (no transformation)', () => {
    const result = makeRUPEResult([makeRow()])
    const rawRows = [['  Subscription Audio Streams  ']]

    // The value is trimmed during extraction but the literal cell content is preserved
    const records = toOrchardRecords(result, rawRows, 0, 'test.tsv')

    // rawStreamType should be the trimmed value (toString().trim() is applied)
    expect(records[0].rawStreamType).toBe('Subscription Audio Streams')
  })

  it('sets rawStreamType to "" when transactionTypeColIdx is null', () => {
    const result = makeRUPEResult([makeRow()])
    const rawRows = [['some', 'other', 'cols']]

    const records = toOrchardRecords(result, rawRows, null, 'test.tsv')

    expect(records[0].rawStreamType).toBe('')
  })

  it('sets normalizedStreamType to UNKNOWN when transactionTypeColIdx is null', () => {
    const result = makeRUPEResult([makeRow()])
    const rawRows = [['some', 'other', 'cols']]

    const records = toOrchardRecords(result, rawRows, null, 'test.tsv')

    expect(records[0].normalizedStreamType).toBe('UNKNOWN')
  })

  it('classifies rawStreamType correctly for each row', () => {
    const rows = [makeRow(), makeRow(), makeRow(), makeRow(), makeRow()]
    const result = makeRUPEResult(rows)
    const rawRows = [
      ['Subscription Audio Streams'],  // → FULL_PAY
      ['Ad-Supported Audio Streams'],  // → FREE_AD_SUPPORTED
      ['Free Trial'],                  // → FREE_TRIAL
      ['Unqualified Audio Streams'],   // → UNQUALIFIED
      ['Fraudulent Streams'],          // → FRAUDULENT
    ]

    const records = toOrchardRecords(result, rawRows, 0, 'test.tsv')

    expect(records[0].normalizedStreamType).toBe('FULL_PAY')
    expect(records[1].normalizedStreamType).toBe('FREE_AD_SUPPORTED')
    expect(records[2].normalizedStreamType).toBe('FREE_TRIAL')
    expect(records[3].normalizedStreamType).toBe('UNQUALIFIED')
    expect(records[4].normalizedStreamType).toBe('FRAUDULENT')
  })

  it('handles UNKNOWN and OTHER categories', () => {
    const rows = [makeRow(), makeRow()]
    const result = makeRUPEResult(rows)
    const rawRows = [
      [''],                 // → UNKNOWN (empty string)
      ['digital download'], // → OTHER (unrecognized value)
    ]

    const records = toOrchardRecords(result, rawRows, 0, 'test.tsv')

    expect(records[0].normalizedStreamType).toBe('UNKNOWN')
    expect(records[1].normalizedStreamType).toBe('OTHER')
  })

  it('copies all ParsedRow fields to the OrchardRecord unchanged', () => {
    const row = makeRow({
      net_total:   4.56,
      quantity:    500,
      artist:      'My Artist',
      track:       'My Track',
      platform:    'Apple Music',
      country:     'MX',
      sale_period: '2024-03',
    })
    const result = makeRUPEResult([row])
    const rawRows = [['Premium']]

    const [rec] = toOrchardRecords(result, rawRows, 0, 'test.tsv')

    expect(rec.net_total).toBe(4.56)
    expect(rec.quantity).toBe(500)
    expect(rec.artist).toBe('My Artist')
    expect(rec.track).toBe('My Track')
    expect(rec.platform).toBe('Apple Music')
    expect(rec.country).toBe('MX')
    expect(rec.sale_period).toBe('2024-03')
  })

  it('returns empty array when result has no rows', () => {
    const result = makeRUPEResult([])
    const records = toOrchardRecords(result, [], 0, 'empty.tsv')
    expect(records).toHaveLength(0)
  })

  it('reads rawStreamType from the correct column index', () => {
    const result = makeRUPEResult([makeRow()])
    // Raw row has 3 columns; transaction_type is at index 2
    const rawRows = [['Spotify', '2024-01', 'Ad-Supported Audio Streams']]

    const records = toOrchardRecords(result, rawRows, 2, 'test.tsv')

    expect(records[0].rawStreamType).toBe('Ad-Supported Audio Streams')
    expect(records[0].normalizedStreamType).toBe('FREE_AD_SUPPORTED')
  })

  it('sets rawStreamType to "" when rawRows[i] is undefined', () => {
    const rows = [makeRow(), makeRow()]
    const result = makeRUPEResult(rows)
    // Only one raw row provided, second is missing
    const rawRows = [['Premium']]

    const records = toOrchardRecords(result, rawRows, 0, 'test.tsv')

    expect(records[0].rawStreamType).toBe('Premium')
    expect(records[1].rawStreamType).toBe('') // missing raw row → ""
    expect(records[1].normalizedStreamType).toBe('UNKNOWN')
  })
})
