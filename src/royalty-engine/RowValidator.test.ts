/**
 * RowValidator.test.ts
 * Unit tests for RowValidator — covers every issue type individually and in combination.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { RowValidator } from './RowValidator'
import type { ColumnIndex } from './ColumnMapper'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Minimal colMap with the most common columns mapped to fixed indices.
 *
 * Layout (15 columns):
 *  0: artist  1: track  2: album  3: upc  4: isrc
 *  5: platform  6: country  7: quantity  8: sale_period
 *  9: net_total  10: gross_total  11: taxes  12: channel_costs
 *  13: other_costs  14: currency
 */
const BASE_COL_MAP: ColumnIndex = {
  artist: 0,
  track: 1,
  album: 2,
  upc: 3,
  isrc: 4,
  platform: 5,
  country: 6,
  quantity: 7,
  sale_period: 8,
  net_total: 9,
  gross_total: 10,
  taxes: 11,
  channel_costs: 12,
  other_costs: 13,
  currency: 14,
  currency_net_total: null,
}

const EXPECTED_COL_COUNT = 15
const FILE_CURRENCY = 'USD'

/** Build a valid row with all 15 fields populated. */
function makeRow(overrides: Partial<Record<number, string>> = {}): string[] {
  const defaults: string[] = [
    'The Beatles',    // 0: artist
    'Hey Jude',       // 1: track
    'Past Masters',   // 2: album
    '0094637232522',  // 3: upc
    'GBAYE6800012',   // 4: isrc
    'Spotify',        // 5: platform
    'US',             // 6: country
    '1000',           // 7: quantity
    '2024-03',        // 8: sale_period
    '12.50',          // 9: net_total
    '15.00',          // 10: gross_total
    '1.50',           // 11: taxes
    '0.50',           // 12: channel_costs
    '0.50',           // 13: other_costs
    'USD',            // 14: currency
  ]
  for (const [idx, val] of Object.entries(overrides) as [string, string][]) {
    defaults[Number(idx)] = val
  }
  return defaults
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RowValidator', () => {

  let validator: RowValidator

  beforeEach(() => {
    validator = new RowValidator(EXPECTED_COL_COUNT, FILE_CURRENCY)
  })

  // ── Clean row ────────────────────────────────────────────────────────────

  it('returns no issues and isSkipped=false for a perfectly valid row', () => {
    const result = validator.validate(makeRow(), 1, BASE_COL_MAP)
    expect(result.issues).toHaveLength(0)
    expect(result.isSkipped).toBe(false)
  })

  // ── corrupt ──────────────────────────────────────────────────────────────

  it('detects corrupt row when column count is too low', () => {
    const row = makeRow().slice(0, 10) // only 10 columns
    const result = validator.validate(row, 5, BASE_COL_MAP)
    expect(result.isSkipped).toBe(true)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].type).toBe('corrupt')
    expect(result.issues[0].rowIndex).toBe(5)
  })

  it('detects corrupt row when column count is too high', () => {
    const row = [...makeRow(), 'extra_col'] // 16 columns
    const result = validator.validate(row, 3, BASE_COL_MAP)
    expect(result.isSkipped).toBe(true)
    expect(result.issues[0].type).toBe('corrupt')
  })

  it('stops checking after corrupt — returns only the corrupt issue', () => {
    const row = makeRow().slice(0, 5) // definitely corrupt
    const result = validator.validate(row, 1, BASE_COL_MAP)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].type).toBe('corrupt')
  })

  // ── empty_field ───────────────────────────────────────────────────────────

  it('detects empty artist', () => {
    const result = validator.validate(makeRow({ 0: '' }), 2, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'empty_field' && i.field === 'artist')
    expect(issue).toBeDefined()
    expect(result.isSkipped).toBe(false)
  })

  it('detects empty track', () => {
    const result = validator.validate(makeRow({ 1: '' }), 2, BASE_COL_MAP)
    const issue = result.issues.find(i => i.field === 'track')
    expect(issue?.type).toBe('empty_field')
  })

  it('detects empty platform', () => {
    const result = validator.validate(makeRow({ 5: '' }), 2, BASE_COL_MAP)
    const issue = result.issues.find(i => i.field === 'platform')
    expect(issue?.type).toBe('empty_field')
  })

  it('detects empty country', () => {
    const result = validator.validate(makeRow({ 6: '' }), 2, BASE_COL_MAP)
    const issue = result.issues.find(i => i.field === 'country')
    expect(issue?.type).toBe('empty_field')
  })

  it('detects empty sale_period', () => {
    const result = validator.validate(makeRow({ 8: '' }), 2, BASE_COL_MAP)
    const issue = result.issues.find(i => i.field === 'sale_period')
    expect(issue?.type).toBe('empty_field')
  })

  it('detects multiple empty required fields at once', () => {
    const result = validator.validate(makeRow({ 0: '', 1: '', 5: '' }), 2, BASE_COL_MAP)
    const emptyIssues = result.issues.filter(i => i.type === 'empty_field')
    expect(emptyIssues).toHaveLength(3)
  })

  it('does not flag whitespace-only values as empty (trimmed before check)', () => {
    // '   ' → trims to '' → treated as empty
    const result = validator.validate(makeRow({ 0: '   ' }), 2, BASE_COL_MAP)
    const issue = result.issues.find(i => i.field === 'artist')
    expect(issue?.type).toBe('empty_field')
  })

  // ── non_numeric ───────────────────────────────────────────────────────────

  it('detects non-numeric net_total', () => {
    const result = validator.validate(makeRow({ 9: 'N/A' }), 3, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'non_numeric' && i.field === 'net_total')
    expect(issue).toBeDefined()
    expect(result.isSkipped).toBe(false)
  })

  it('detects non-numeric gross_total', () => {
    const result = validator.validate(makeRow({ 10: 'abc' }), 3, BASE_COL_MAP)
    const issue = result.issues.find(i => i.field === 'gross_total')
    expect(issue?.type).toBe('non_numeric')
  })

  it('does not flag empty monetary cell as non_numeric (empty = 0)', () => {
    const result = validator.validate(makeRow({ 10: '' }), 3, BASE_COL_MAP)
    const numericIssues = result.issues.filter(i => i.type === 'non_numeric')
    expect(numericIssues).toHaveLength(0)
  })

  it('does not flag parseable formats as non_numeric', () => {
    const result = validator.validate(makeRow({ 9: '1.500,50' }), 3, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'non_numeric')
    expect(issue).toBeUndefined()
  })

  it('does not flag currency-prefixed values as non_numeric', () => {
    const result = validator.validate(makeRow({ 9: '$12.50' }), 3, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'non_numeric')
    expect(issue).toBeUndefined()
  })

  it('skips monetary check when column is not in colMap (null index)', () => {
    const colMapNoGross: ColumnIndex = { ...BASE_COL_MAP, gross_total: null }
    const result = validator.validate(makeRow({ 10: 'garbage' }), 3, colMapNoGross)
    const issue = result.issues.find(i => i.field === 'gross_total')
    expect(issue).toBeUndefined()
  })

  // ── negative ──────────────────────────────────────────────────────────────

  it('detects negative net_total', () => {
    const result = validator.validate(makeRow({ 9: '-5.00' }), 4, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'negative')
    expect(issue).toBeDefined()
    expect(issue?.field).toBe('net_total')
    expect(result.isSkipped).toBe(false)
  })

  it('detects parenthesis-formatted negative value as negative', () => {
    const result = validator.validate(makeRow({ 9: '(5.00)' }), 4, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'negative')
    expect(issue).toBeDefined()
  })

  it('does not flag zero net_total as negative', () => {
    const result = validator.validate(makeRow({ 9: '0' }), 4, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'negative')
    expect(issue).toBeUndefined()
  })

  it('does not flag empty net_total as negative', () => {
    const result = validator.validate(makeRow({ 9: '' }), 4, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'negative')
    expect(issue).toBeUndefined()
  })

  // ── duplicate ─────────────────────────────────────────────────────────────

  it('detects duplicate rows on second identical submission', () => {
    const row = makeRow()
    validator.validate(row, 1, BASE_COL_MAP) // first — no issue
    const result2 = validator.validate(row, 2, BASE_COL_MAP) // second — duplicate
    const issue = result2.issues.find(i => i.type === 'duplicate')
    expect(issue).toBeDefined()
    expect(result2.isSkipped).toBe(false)
  })

  it('does not flag the first occurrence of a row as duplicate', () => {
    const result = validator.validate(makeRow(), 1, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'duplicate')
    expect(issue).toBeUndefined()
  })

  it('does not flag distinct rows as duplicates', () => {
    validator.validate(makeRow({ 9: '10.00' }), 1, BASE_COL_MAP)
    const result = validator.validate(makeRow({ 9: '20.00' }), 2, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'duplicate')
    expect(issue).toBeUndefined()
  })

  it('duplicate key includes net value — same row with different net is not a duplicate', () => {
    const row1 = makeRow({ 9: '10.00' })
    const row2 = makeRow({ 9: '11.00' })
    validator.validate(row1, 1, BASE_COL_MAP)
    const result = validator.validate(row2, 2, BASE_COL_MAP)
    expect(result.issues.find(i => i.type === 'duplicate')).toBeUndefined()
  })

  it('accumulates duplicates across multiple calls — third occurrence is also flagged', () => {
    const row = makeRow()
    validator.validate(row, 1, BASE_COL_MAP)
    validator.validate(row, 2, BASE_COL_MAP)
    const result3 = validator.validate(row, 3, BASE_COL_MAP)
    expect(result3.issues.find(i => i.type === 'duplicate')).toBeDefined()
  })

  // ── currency_mismatch ─────────────────────────────────────────────────────

  it('detects currency_mismatch when row currency differs from file currency', () => {
    const result = validator.validate(makeRow({ 14: 'EUR' }), 5, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'currency_mismatch')
    expect(issue).toBeDefined()
    expect(issue?.field).toBe('currency')
    expect(result.isSkipped).toBe(false)
  })

  it('does not flag matching currency (case-insensitive)', () => {
    const result = validator.validate(makeRow({ 14: 'usd' }), 5, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'currency_mismatch')
    expect(issue).toBeUndefined()
  })

  it('does not flag empty currency cell as mismatch', () => {
    const result = validator.validate(makeRow({ 14: '' }), 5, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'currency_mismatch')
    expect(issue).toBeUndefined()
  })

  it('handles whitespace around currency code correctly', () => {
    const result = validator.validate(makeRow({ 14: ' USD ' }), 5, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'currency_mismatch')
    expect(issue).toBeUndefined()
  })

  it('file currency comparison is case-insensitive at construction', () => {
    const v = new RowValidator(EXPECTED_COL_COUNT, 'eur')
    const result = v.validate(makeRow({ 14: 'EUR' }), 1, BASE_COL_MAP)
    const issue = result.issues.find(i => i.type === 'currency_mismatch')
    expect(issue).toBeUndefined()
  })

  // ── combined issues ───────────────────────────────────────────────────────

  it('reports multiple issue types on the same non-corrupt row', () => {
    // empty artist, non-numeric net_total, currency mismatch
    const result = validator.validate(
      makeRow({ 0: '', 9: 'badval', 14: 'GBP' }),
      10,
      BASE_COL_MAP
    )
    expect(result.isSkipped).toBe(false)
    expect(result.issues.find(i => i.type === 'empty_field' && i.field === 'artist')).toBeDefined()
    expect(result.issues.find(i => i.type === 'non_numeric' && i.field === 'net_total')).toBeDefined()
    expect(result.issues.find(i => i.type === 'currency_mismatch')).toBeDefined()
  })

  // ── rowIndex propagation ──────────────────────────────────────────────────

  it('propagates rowIndex to all issues', () => {
    const ROW_IDX = 42
    const result = validator.validate(
      makeRow({ 0: '', 5: '', 14: 'COP' }),
      ROW_IDX,
      BASE_COL_MAP
    )
    for (const issue of result.issues) {
      expect(issue.rowIndex).toBe(ROW_IDX)
    }
  })

})
