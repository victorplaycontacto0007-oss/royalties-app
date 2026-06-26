/**
 * MoneyParser.test.ts
 * Validates: Requirement 5
 */
import { describe, it, expect } from 'vitest'
import { parseMoney } from './MoneyParser'

// ─── Requirement 5.1 — All numeric string formats ───────────────────────────
describe('Requirement 5.1 — numeric formats', () => {
  it('parses plain integer', () => {
    expect(parseMoney('100')).toBe(100)
  })

  it('parses dot-decimal', () => {
    expect(parseMoney('100.55')).toBe(100.55)
  })

  it('parses comma-decimal (European)', () => {
    expect(parseMoney('100,55')).toBe(100.55)
  })

  it('parses comma-thousands + dot-decimal: 1,500.50', () => {
    expect(parseMoney('1,500.50')).toBe(1500.50)
  })

  it('parses dot-thousands + comma-decimal: 1.500,50', () => {
    expect(parseMoney('1.500,50')).toBe(1500.50)
  })

  it('parses space-thousands + dot-decimal: 15 000.55', () => {
    expect(parseMoney('15 000.55')).toBe(15000.55)
  })

  it('parses space-thousands + comma-decimal: 15 000,55', () => {
    expect(parseMoney('15 000,55')).toBe(15000.55)
  })
})

// ─── Requirement 5.2 — Currency symbol / code stripping ─────────────────────
describe('Requirement 5.2 — currency symbol and code stripping', () => {
  it('strips $ prefix', () => {
    expect(parseMoney('$100')).toBe(100)
  })

  it('strips € prefix', () => {
    expect(parseMoney('€100')).toBe(100)
  })

  it('strips £ prefix', () => {
    expect(parseMoney('£100')).toBe(100)
  })

  it('strips ¥ prefix', () => {
    expect(parseMoney('¥100')).toBe(100)
  })

  // Original codes
  it('strips USD prefix', () => {
    expect(parseMoney('USD 123.45')).toBe(123.45)
  })

  it('strips EUR prefix', () => {
    expect(parseMoney('EUR 123.45')).toBe(123.45)
  })

  it('strips COP prefix', () => {
    expect(parseMoney('COP 123.45')).toBe(123.45)
  })

  it('strips GBP prefix', () => {
    expect(parseMoney('GBP 123.45')).toBe(123.45)
  })

  // New codes
  it('strips MXN prefix with space: MXN 123.45', () => {
    expect(parseMoney('MXN 123.45')).toBe(123.45)
  })

  it('strips MXN prefix without space: MXN123.45', () => {
    expect(parseMoney('MXN123.45')).toBe(123.45)
  })

  it('strips BRL prefix', () => {
    expect(parseMoney('BRL 99.90')).toBe(99.90)
  })

  it('strips CHF prefix', () => {
    expect(parseMoney('CHF 88.00')).toBe(88.00)
  })

  it('strips SEK prefix', () => {
    expect(parseMoney('SEK 500')).toBe(500)
  })

  it('strips NOK prefix', () => {
    expect(parseMoney('NOK 250.75')).toBe(250.75)
  })

  it('strips DKK prefix', () => {
    expect(parseMoney('DKK 100')).toBe(100)
  })

  it('strips CAD prefix with space: CAD 1,234.56', () => {
    expect(parseMoney('CAD 1,234.56')).toBe(1234.56)
  })

  it('strips CAD prefix without space: CAD1,234.56', () => {
    expect(parseMoney('CAD1,234.56')).toBe(1234.56)
  })

  it('strips AUD prefix', () => {
    expect(parseMoney('AUD 75.50')).toBe(75.50)
  })

  it('strips JPY prefix', () => {
    expect(parseMoney('JPY 1500')).toBe(1500)
  })

  it('is case-insensitive for currency code stripping', () => {
    expect(parseMoney('mxn 50.00')).toBe(50.00)
    expect(parseMoney('Usd 10.00')).toBe(10.00)
  })
})

// ─── Req 5 — Accounting parentheses ─────────────────────────────────────────
describe('accounting parentheses notation', () => {
  it('converts (1234.56) to -1234.56', () => {
    expect(parseMoney('(1234.56)')).toBe(-1234.56)
  })

  it('converts (1,234.56) to -1234.56', () => {
    expect(parseMoney('(1,234.56)')).toBe(-1234.56)
  })

  it('converts (0.01) to -0.01', () => {
    expect(parseMoney('(0.01)')).toBe(-0.01)
  })
})

// ─── Requirement 5.5 — Round-trip: parse → format → parse ───────────────────
describe('Requirement 5.5 — round-trip property (parse → format → parse)', () => {
  /**
   * Validates: Requirements 5.5
   *
   * For any valid numeric string, parsing it to a number, converting back to
   * a string via toFixed(2) or toString(), then parsing again must produce
   * the same numeric value (within floating-point tolerance).
   */
  const cases: [string, number][] = [
    ['100', 100],
    ['100.55', 100.55],
    ['100,55', 100.55],
    ['1,500.50', 1500.50],
    ['1.500,50', 1500.50],
    ['15 000.55', 15000.55],
    ['15 000,55', 15000.55],
    ['$100', 100],
    ['€100', 100],
    ['MXN 123.45', 123.45],
    ['CAD 1,234.56', 1234.56],
    ['(1234.56)', -1234.56],
  ]

  for (const [input, expected] of cases) {
    it(`round-trip for "${input}"`, () => {
      const first = parseMoney(input)
      expect(first).toBeCloseTo(expected, 8)
      // Format as fixed string, then re-parse
      const formatted = first.toFixed(2)
      const second = parseMoney(formatted)
      expect(second).toBeCloseTo(first, 8)
    })
  }
})

// ─── Edge cases ──────────────────────────────────────────────────────────────
describe('edge cases', () => {
  it('returns 0 for empty string', () => {
    expect(parseMoney('')).toBe(0)
  })

  it('returns the number as-is for numeric input', () => {
    expect(parseMoney(42.5)).toBe(42.5)
  })

  it('returns 0 for non-numeric string after stripping', () => {
    expect(parseMoney('N/A')).toBe(0)
  })
})
