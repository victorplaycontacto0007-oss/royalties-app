/**
 * CurrencyDetector.test.ts
 * Unit tests for detectCurrency and detectCurrencyMap.
 *
 * Covers: Requirement 13 (all sub-criteria)
 */
import { describe, it, expect } from 'vitest'
import { detectCurrency, detectCurrencyMap } from './CurrencyDetector'
import { Logger } from './Logger'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal rows array where each row has one cell */
function makeRows(values: string[]): string[][] {
  return values.map(v => [v])
}

// ─── detectCurrencyMap ────────────────────────────────────────────────────────

describe('detectCurrencyMap', () => {

  it('returns empty map when rows and header have no currency values', () => {
    const map = detectCurrencyMap(makeRows(['Spotify', 'Apple Music', '10.00']), [])
    expect(map.size).toBe(0)
  })

  it('counts a single currency code correctly', () => {
    const map = detectCurrencyMap(makeRows(['USD', 'USD', 'USD']), [])
    expect(map.get('USD')).toBe(3)
  })

  it('counts multiple distinct currencies separately', () => {
    const map = detectCurrencyMap(makeRows(['USD', 'EUR', 'USD', 'GBP', 'EUR']), [])
    expect(map.get('USD')).toBe(2)
    expect(map.get('EUR')).toBe(2)
    expect(map.get('GBP')).toBe(1)
  })

  it('resolves $ symbol → USD', () => {
    const map = detectCurrencyMap(makeRows(['$', '$']), [])
    expect(map.get('USD')).toBe(2)
  })

  it('resolves € symbol → EUR', () => {
    const map = detectCurrencyMap(makeRows(['€']), [])
    expect(map.get('EUR')).toBe(1)
  })

  it('resolves £ symbol → GBP', () => {
    const map = detectCurrencyMap(makeRows(['£']), [])
    expect(map.get('GBP')).toBe(1)
  })

  it('includes header row cells in frequency count', () => {
    const map = detectCurrencyMap(makeRows(['USD']), ['EUR', 'USD'])
    expect(map.get('USD')).toBe(2) // 1 data + 1 header
    expect(map.get('EUR')).toBe(1) // header only
  })

  it('is case-insensitive for currency codes', () => {
    const map = detectCurrencyMap(makeRows(['usd', 'Usd', 'USD']), [])
    expect(map.get('USD')).toBe(3)
  })

  it('trims whitespace before matching', () => {
    const map = detectCurrencyMap(makeRows([' USD ', '  EUR  ']), [])
    expect(map.get('USD')).toBe(1)
    expect(map.get('EUR')).toBe(1)
  })

  it('ignores non-currency cell values', () => {
    const map = detectCurrencyMap(makeRows(['Hello', '123', 'Spotify', '']), [])
    expect(map.size).toBe(0)
  })

  it('scans ALL rows — not just first 30 (Requirement 13.1)', () => {
    // Put the currency only in row 50
    const rows: string[][] = Array.from({ length: 60 }, (_, i) =>
      i === 50 ? ['MXN'] : ['noise']
    )
    const map = detectCurrencyMap(rows, [])
    expect(map.get('MXN')).toBe(1)
  })

  it('recognizes all 13 required currency codes (Requirement 13.2)', () => {
    const required = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'MXN', 'COP', 'BRL', 'CHF', 'SEK', 'NOK', 'DKK']
    const rows = required.map(c => [c])
    const map = detectCurrencyMap(rows, [])
    for (const code of required) {
      expect(map.get(code), `Expected ${code} to be recognized`).toBe(1)
    }
  })

  it('handles rows with multiple cells — scans each cell', () => {
    const rows = [['Artist Name', 'USD', '10.00'], ['Artist Name', 'EUR', '5.00']]
    const map = detectCurrencyMap(rows, [])
    expect(map.get('USD')).toBe(1)
    expect(map.get('EUR')).toBe(1)
  })

  it('handles empty rows without throwing', () => {
    const rows: string[][] = [[], [], []]
    expect(() => detectCurrencyMap(rows, [])).not.toThrow()
  })

  it('handles null/undefined cells gracefully', () => {
    // Simulate rows with null cells (common in XLSX parsing)
    const rows = [[(null as unknown as string), 'USD']]
    expect(() => detectCurrencyMap(rows, [])).not.toThrow()
    const map = detectCurrencyMap(rows, [])
    expect(map.get('USD')).toBe(1)
  })
})

// ─── detectCurrency ───────────────────────────────────────────────────────────

describe('detectCurrency', () => {

  it('returns USD as default when no currency detected (Requirement 13.5)', () => {
    const result = detectCurrency(makeRows(['noise', 'nothing']), [])
    expect(result).toBe('USD')
  })

  it('logs [WARN] when no currency detected', () => {
    const logger = new Logger()
    detectCurrency(makeRows(['nothing']), [], logger)
    const warns = logger.toStrings().filter(s => s.includes('[WARN]'))
    expect(warns.length).toBeGreaterThan(0)
    expect(warns[0]).toContain('Moneda no detectada')
  })

  it('returns the sole detected currency when only one is found', () => {
    const result = detectCurrency(makeRows(['EUR', 'EUR', 'EUR']), [])
    expect(result).toBe('EUR')
  })

  it('does not log a warning for single-currency files', () => {
    const logger = new Logger()
    detectCurrency(makeRows(['EUR', 'EUR']), [], logger)
    const warns = logger.toStrings().filter(s => s.includes('[WARN]'))
    expect(warns).toHaveLength(0)
  })

  it('frequency-wins: returns the most frequent currency (Requirement 13.4)', () => {
    // USD appears 3 times, EUR appears 1 time → USD wins
    const result = detectCurrency(makeRows(['USD', 'USD', 'USD', 'EUR']), [])
    expect(result).toBe('USD')
  })

  it('frequency-wins: EUR wins when more frequent than USD', () => {
    const rows = makeRows(['EUR', 'EUR', 'EUR', 'USD'])
    const result = detectCurrency(rows, [])
    expect(result).toBe('EUR')
  })

  it('logs [WARN] when multiple distinct currencies detected (Requirement 13.4)', () => {
    const logger = new Logger()
    detectCurrency(makeRows(['USD', 'USD', 'EUR']), [], logger)
    const warns = logger.toStrings().filter(s => s.includes('[WARN]'))
    expect(warns.length).toBeGreaterThan(0)
    const multiWarn = warns.find(s => s.includes('Múltiples monedas'))
    expect(multiWarn).toBeDefined()
    expect(multiWarn).toContain('USD')
    expect(multiWarn).toContain('EUR')
  })

  it('[WARN] for multiple currencies includes the winning currency', () => {
    const logger = new Logger()
    detectCurrency(makeRows(['GBP', 'GBP', 'USD']), [], logger)
    const multiWarn = logger.toStrings().find(s => s.includes('Múltiples monedas'))
    expect(multiWarn).toContain('GBP')
  })

  it('works without a logger (backward compat — logger is optional)', () => {
    expect(() => detectCurrency(makeRows(['nothing']), [])).not.toThrow()
    expect(() => detectCurrency(makeRows(['USD']), [])).not.toThrow()
  })

  it('detects currency from $ symbol (Requirement 13.3)', () => {
    const result = detectCurrency(makeRows(['$', '$', '$']), [])
    expect(result).toBe('USD')
  })

  it('detects currency from € symbol (Requirement 13.3)', () => {
    const result = detectCurrency(makeRows(['€', '€']), [])
    expect(result).toBe('EUR')
  })

  it('detects currency from £ symbol (Requirement 13.3)', () => {
    const result = detectCurrency(makeRows(['£']), [])
    expect(result).toBe('GBP')
  })

  it('detects currency from header row', () => {
    const result = detectCurrency([], ['Artist', 'USD', 'Track'])
    expect(result).toBe('USD')
  })

  it('scans ALL rows — detects currency beyond first 30 (Requirement 13.1)', () => {
    // Currency only appears in row 40 (well past the old 30-row limit)
    const rows: string[][] = Array.from({ length: 50 }, (_, i) =>
      i === 40 ? ['CAD'] : ['noise']
    )
    const result = detectCurrency(rows, [])
    expect(result).toBe('CAD')
  })

  it('handles empty input without throwing', () => {
    expect(() => detectCurrency([], [])).not.toThrow()
    expect(detectCurrency([], [])).toBe('USD')
  })

  it('is case-insensitive — lowercase "eur" recognized as EUR', () => {
    const result = detectCurrency(makeRows(['eur', 'eur']), [])
    expect(result).toBe('EUR')
  })
})
