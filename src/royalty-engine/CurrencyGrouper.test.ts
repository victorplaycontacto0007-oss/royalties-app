/**
 * CurrencyGrouper.test.ts
 *
 * Unit tests for CurrencyGrouper module.
 * Covers: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 *
 * Property-based tests:
 * - Property 8: Aislamiento por moneda (Requirements 4.4, 6.1, 6.2, 6.5)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { groupByCurrency } from './CurrencyGrouper'
import type { ParsedRow } from './UniversalParser'
import { Logger } from './Logger'
import type { ProviderName } from './ProviderStrategy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return new Logger()
}

function logLines(logger: Logger): string[] {
  return logger.toStrings()
}

/**
 * Minimal factory for ParsedRow — only fields CurrencyGrouper cares about.
 */
function makeRow(net_total: number, currency: string): ParsedRow {
  return {
    net_total,
    gross_total: 0,
    taxes: 0,
    channel_costs: 0,
    other_costs: 0,
    currency,
    artist: 'Test Artist',
    track: 'Test Track',
    album: 'Test Album',
    upc: '',
    isrc: '',
    platform: '',
    country: '',
    quantity: 1,
    sale_period: '',
    artist_name: 'Test Artist',
    song_title: 'Test Track',
    album_name: 'Test Album',
    store: '',
    earnings_usd: 0,
  } as ParsedRow
}

// ---------------------------------------------------------------------------
// Requirement 5.5 — currencyColIdx es null cuando no hay columna de moneda
// ---------------------------------------------------------------------------

describe('currencyColIdx detection', () => {
  it('currencyColIdx es null cuando no hay columna de moneda en headers (Req 5.1)', () => {
    const logger = makeLogger()
    const rows = [makeRow(10, 'USD')]
    const result = groupByCurrency(rows, ['artist', 'track', 'nettotal'], 'Ditto', logger)
    expect(result.currencyColIdx).toBeNull()
  })

  it('currencyColIdx es el índice correcto cuando se detecta "currency" en headers (Req 5.1)', () => {
    const logger = makeLogger()
    const rows = [makeRow(10, 'USD')]
    const result = groupByCurrency(rows, ['artist', 'currency', 'nettotal'], 'Ditto', logger)
    expect(result.currencyColIdx).toBe(1)
  })

  it('currencyColIdx es el índice correcto cuando la columna es "currencycode" (Req 5.1)', () => {
    const logger = makeLogger()
    const rows = [makeRow(10, 'USD')]
    const result = groupByCurrency(rows, ['currencycode', 'artist'], 'Ditto', logger)
    expect(result.currencyColIdx).toBe(0)
  })

  it('currencyColIdx es el índice correcto cuando la columna es "clientcurrency" (Req 5.1)', () => {
    const logger = makeLogger()
    const rows = [makeRow(10, 'COP')]
    const result = groupByCurrency(rows, ['track', 'clientcurrency', 'total'], 'Dinastía', logger)
    expect(result.currencyColIdx).toBe(1)
  })

  it('currencyColIdx es el índice correcto cuando la columna es "paymentcurrency" (Req 5.1)', () => {
    const logger = makeLogger()
    const rows = [makeRow(5, 'EUR')]
    const result = groupByCurrency(rows, ['paymentcurrency', 'artist'], 'Believe', logger)
    expect(result.currencyColIdx).toBe(0)
  })

  it('currencyColIdx es el índice correcto cuando la columna es "settlementcurrency" (Req 5.1)', () => {
    const logger = makeLogger()
    const rows = [makeRow(5, 'USD')]
    const result = groupByCurrency(rows, ['artist', 'track', 'settlementcurrency'], 'DistroKid', logger)
    expect(result.currencyColIdx).toBe(2)
  })

  it('usa el primer candidato cuando hay múltiples columnas de moneda en headers (Req 5.1 — prioridad)', () => {
    const logger = makeLogger()
    const rows = [makeRow(5, 'USD')]
    // 'currency' aparece en índice 1, 'currencycode' en índice 2 — debe elegir índice 1
    const result = groupByCurrency(rows, ['artist', 'currency', 'currencycode'], 'Ditto', logger)
    expect(result.currencyColIdx).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Requirement 5.5 — código de moneda vacío usa defaultCurrency del proveedor
// ---------------------------------------------------------------------------

describe('Código de moneda vacío usa defaultCurrency del proveedor (Req 5.5)', () => {
  it('fila con currency="" usa defaultCurrency (USD para Ditto)', () => {
    const logger = makeLogger()
    const rows = [makeRow(100, '')]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].currency).toBe('USD')
    expect(result.groups[0].total).toBeCloseTo(100, 8)
  })

  it('fila con currency="" usa defaultCurrency (COP para Dinastía)', () => {
    const logger = makeLogger()
    const rows = [makeRow(50, '')]
    const result = groupByCurrency(rows, ['clientcurrency'], 'Dinastía', logger)
    expect(result.groups[0].currency).toBe('COP')
  })

  it('fila con currency="" usa defaultCurrency (EUR para Believe)', () => {
    const logger = makeLogger()
    const rows = [makeRow(25, '')]
    const result = groupByCurrency(rows, ['currency'], 'Believe', logger)
    expect(result.groups[0].currency).toBe('EUR')
  })

  it('código vacío no emite [WARN] (silencioso, Req 5.5)', () => {
    const logger = makeLogger()
    const rows = [makeRow(10, '')]
    groupByCurrency(rows, ['currency'], 'Ditto', logger)
    const warns = logLines(logger).filter(l => l.startsWith('[WARN]'))
    // El código vacío se maneja silenciosamente — no debe haber WARN por moneda desconocida
    const unknownCodeWarns = warns.filter(w => w.includes('desconocido'))
    expect(unknownCodeWarns).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Requirement 5.6 — código desconocido usa defaultCurrency y emite [WARN]
// ---------------------------------------------------------------------------

describe('Código desconocido usa defaultCurrency y emite [WARN] (Req 5.6)', () => {
  it('código desconocido "XYZ" → usa USD (Ditto) y emite [WARN]', () => {
    const logger = makeLogger()
    const rows = [makeRow(100, 'XYZ')]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups[0].currency).toBe('USD')
    const warns = logLines(logger).filter(l => l.startsWith('[WARN]'))
    expect(warns.length).toBeGreaterThan(0)
  })

  it('warning de código desconocido incluye el índice de la fila (Req 5.6)', () => {
    const logger = makeLogger()
    const rows = [makeRow(10, 'ZZZ')]
    groupByCurrency(rows, ['currency'], 'Ditto', logger)
    const warns = logLines(logger).filter(l => l.startsWith('[WARN]'))
    // El warn debe mencionar el row index (0) y el código inválido
    expect(warns.some(w => w.includes('0'))).toBe(true)
    expect(warns.some(w => w.includes('ZZZ'))).toBe(true)
  })

  it('warning de código desconocido incluye el código inválido (Req 5.6)', () => {
    const logger = makeLogger()
    const rows = [makeRow(10, 'BADCODE')]
    groupByCurrency(rows, ['currency'], 'Ditto', logger)
    const warns = logLines(logger).filter(l => l.startsWith('[WARN]'))
    expect(warns.some(w => w.includes('BADCODE'))).toBe(true)
  })

  it('código desconocido en fila 3 → [WARN] menciona índice 3', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(10, 'USD'),
      makeRow(20, 'EUR'),
      makeRow(30, 'GBP'),
      makeRow(40, 'NOPE'),
    ]
    groupByCurrency(rows, ['currency'], 'Ditto', logger)
    const warns = logLines(logger).filter(l => l.startsWith('[WARN]'))
    expect(warns.some(w => w.includes('3'))).toBe(true)
    expect(warns.some(w => w.includes('NOPE'))).toBe(true)
  })

  it('símbolo de moneda desconocido "¥" no mapeado → usa defaultCurrency con [WARN]', () => {
    // ¥ no está en SYMBOL_MAP — debe tratarse como desconocido
    const logger = makeLogger()
    const rows = [makeRow(10, '¥')]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    // Debe caer en defaultCurrency
    expect(result.groups[0].currency).toBe('USD')
    const warns = logLines(logger).filter(l => l.startsWith('[WARN]'))
    expect(warns.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Requirement 5.3 & 5.4 — sin columna de moneda y sin defaultCurrency → 'USD' + [WARN]
// ---------------------------------------------------------------------------

describe('Sin columna de moneda y sin defaultCurrency → usa USD con [WARN] (Req 5.3, 5.4)', () => {
  it('proveedor UNKNOWN (defaultCurrency = USD) sin columna de moneda no emite WARN extra', () => {
    // UNKNOWN tiene defaultCurrency = 'USD', así que no debe haber warn por "sin defaultCurrency"
    const logger = makeLogger()
    const rows = [makeRow(10, '')]
    groupByCurrency(rows, ['artist', 'track'], 'UNKNOWN', logger)
    const warns = logLines(logger).filter(l => l.startsWith('[WARN]'))
    // Solo puede haber WARN de "estrategia genérica", no de "sin columna de moneda"
    const noCurrencyColWarn = warns.filter(w => w.includes('No se detecto columna de moneda'))
    expect(noCurrencyColWarn).toHaveLength(0)
  })

  it('proveedor sin defaultCurrency y sin columna de moneda → usa USD y emite [WARN] (Req 5.4)', () => {
    // Simulamos un proveedor cuya entrada no tiene defaultCurrency definida.
    // El diseño dice: si !strategy?.defaultCurrency && currencyColIdx === null → warn + USD
    // UNKNOWN tiene defaultCurrency = 'USD', así que usamos un provider no registrado.
    // La lógica en CurrencyGrouper: strategy?.defaultCurrency ?? 'USD'
    // La condición de warn es: !strategy?.defaultCurrency && currencyColIdx === null
    // Un proveedor no registrado (undefined strategy) → defaultCurrency = undefined → warn
    const logger = makeLogger()
    const rows = [makeRow(15, '')]
    // Cast a ProviderName para simular proveedor desconocido sin defaultCurrency
    const result = groupByCurrency(rows, ['artist'], 'TikTok' as ProviderName, logger)
    // TikTok tiene defaultCurrency = 'USD', así que no disparará el warn de "sin defaultCurrency"
    // Revisemos: el warn se emite cuando !strategy?.defaultCurrency — TikTok sí tiene USD
    // Por lo tanto usamos un string de proveedor que no existe en la tabla
    const logger2 = makeLogger()
    const result2 = groupByCurrency(rows, ['artist'], 'FakeProvider' as ProviderName, logger2)
    // strategy será undefined → defaultCurrency = undefined → warn debería emitirse
    const warns2 = logLines(logger2).filter(l => l.startsWith('[WARN]'))
    // Debe usar USD como fallback
    expect(result2.groups[0].currency).toBe('USD')
    expect(warns2.some(w => w.includes('USD'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Requirement 5.2 & 6.1 — filas con múltiples monedas generan un CurrencyGroup por moneda
// ---------------------------------------------------------------------------

describe('Filas con múltiples monedas generan un CurrencyGroup por moneda (Req 5.2, 6.1)', () => {
  it('dos monedas distintas generan exactamente 2 grupos', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(100, 'USD'),
      makeRow(200, 'EUR'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups).toHaveLength(2)
    const currencies = result.groups.map(g => g.currency)
    expect(currencies).toContain('USD')
    expect(currencies).toContain('EUR')
  })

  it('tres monedas distintas generan exactamente 3 grupos', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(100, 'USD'),
      makeRow(200, 'EUR'),
      makeRow(300, 'GBP'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups).toHaveLength(3)
  })

  it('múltiples filas con la misma moneda se acumulan en un solo grupo', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(10, 'USD'),
      makeRow(20, 'USD'),
      makeRow(30, 'USD'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].currency).toBe('USD')
    expect(result.groups[0].total).toBeCloseTo(60, 8)
    expect(result.groups[0].recordCount).toBe(3)
  })

  it('grupos no mezclan totales de monedas distintas (Req 6.5)', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(100, 'USD'),
      makeRow(200, 'EUR'),
      makeRow(50, 'USD'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    const usd = result.groups.find(g => g.currency === 'USD')
    const eur = result.groups.find(g => g.currency === 'EUR')
    expect(usd?.total).toBeCloseTo(150, 8)
    expect(eur?.total).toBeCloseTo(200, 8)
  })

  it('cada grupo tiene recordCount correcto', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(10, 'USD'),
      makeRow(20, 'EUR'),
      makeRow(30, 'USD'),
      makeRow(40, 'EUR'),
      makeRow(50, 'EUR'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    const usd = result.groups.find(g => g.currency === 'USD')
    const eur = result.groups.find(g => g.currency === 'EUR')
    expect(usd?.recordCount).toBe(2)
    expect(eur?.recordCount).toBe(3)
  })

  it('grupos ordenados descendente por total (Req 6.4)', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(50, 'USD'),
      makeRow(300, 'EUR'),
      makeRow(10, 'GBP'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups[0].currency).toBe('EUR')  // mayor
    expect(result.groups[1].currency).toBe('USD')
    expect(result.groups[2].currency).toBe('GBP')  // menor
  })

  it('porcentajes suman ~100% cuando hay múltiples monedas (Req 6.3)', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(100, 'USD'),
      makeRow(200, 'EUR'),
      makeRow(300, 'GBP'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    const sum = result.groups.reduce((s, g) => s + g.percentage, 0)
    expect(Math.abs(sum - 100)).toBeLessThan(0.001)
  })

  it('totalFixed8 refleja el total con precisión decimal (Req 6.1, 6.2)', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(0.00000001, 'USD'),
      makeRow(0.00000001, 'USD'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups[0].totalFixed8).toBe('0.00000002')
  })

  it('suma de grupos iguala suma de net_total del input (Req 6.6)', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(10.5, 'USD'),
      makeRow(20.25, 'EUR'),
      makeRow(5.125, 'GBP'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    const groupSum = result.groups.reduce((s, g) => s + g.total, 0)
    const rowSum = rows.reduce((s, r) => s + r.net_total, 0)
    expect(Math.abs(groupSum - rowSum)).toBeLessThan(1e-8)
  })
})

// ---------------------------------------------------------------------------
// Casos borde adicionales
// ---------------------------------------------------------------------------

describe('Casos borde', () => {
  it('array de filas vacío → groups vacío, currencyColIdx null o número', () => {
    const logger = makeLogger()
    const result = groupByCurrency([], ['currency'], 'Ditto', logger)
    expect(result.groups).toHaveLength(0)
  })

  it('fila única con moneda conocida → 1 grupo, percentage = 100', () => {
    const logger = makeLogger()
    const rows = [makeRow(50, 'USD')]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].percentage).toBeCloseTo(100, 5)
  })

  it('globalTotal = 0 → percentage = 0 para todos los grupos (Req 6.3)', () => {
    const logger = makeLogger()
    const rows = [
      makeRow(0, 'USD'),
      makeRow(0, 'EUR'),
    ]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    for (const g of result.groups) {
      expect(g.percentage).toBe(0)
    }
  })

  it('símbolo $ es mapeado a USD', () => {
    const logger = makeLogger()
    const rows = [makeRow(100, '$')]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups[0].currency).toBe('USD')
  })

  it('símbolo € es mapeado a EUR', () => {
    const logger = makeLogger()
    const rows = [makeRow(100, '€')]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups[0].currency).toBe('EUR')
  })

  it('símbolo £ es mapeado a GBP', () => {
    const logger = makeLogger()
    const rows = [makeRow(100, '£')]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups[0].currency).toBe('GBP')
  })

  it('código en minúsculas "usd" es normalizado a "USD"', () => {
    const logger = makeLogger()
    const rows = [makeRow(100, 'usd')]
    const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)
    expect(result.groups[0].currency).toBe('USD')
  })

  it('headers vacíos → currencyColIdx null', () => {
    const logger = makeLogger()
    const rows = [makeRow(10, 'USD')]
    const result = groupByCurrency(rows, [], 'Ditto', logger)
    expect(result.currencyColIdx).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Property 8: Aislamiento por moneda — no mezcla de acumuladores
// Validates: Requirements 4.4, 6.1, 6.2, 6.5
// ---------------------------------------------------------------------------

/**
 * Arbitrary that generates any ParsedRow with a known ISO currency code
 * (USD, EUR, GBP, CAD, AUD, MXN, COP, BRL) and a non-negative net_total.
 * Used by Property 9 to test total conservation across all currencies.
 */
function arbitraryParsedRow(): fc.Arbitrary<ParsedRow> {
  return fc.record({
    net_total:     fc.integer({ min: 0, max: 100000 }).map(n => n / 100),
    gross_total:   fc.constant(0),
    taxes:         fc.constant(0),
    channel_costs: fc.constant(0),
    other_costs:   fc.constant(0),
    currency:      fc.constantFrom('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'COP', 'BRL'),
    artist:        fc.constant('Test Artist'),
    track:         fc.constant('Test Track'),
    album:         fc.constant('Test Album'),
    upc:           fc.constant(''),
    isrc:          fc.constant(''),
    platform:      fc.constant(''),
    country:       fc.constant(''),
    quantity:      fc.constant(1),
    sale_period:   fc.constant(''),
    artist_name:   fc.constant('Test Artist'),
    song_title:    fc.constant('Test Track'),
    album_name:    fc.constant('Test Album'),
    store:         fc.constant(''),
    earnings_usd:  fc.constant(0),
  }) as fc.Arbitrary<ParsedRow>
}

/**
 * Arbitrary that generates a ParsedRow with currency restricted to
 * USD, EUR, or COP and a non-negative net_total in [0, 1000].
 */
function arbitraryParsedRowWithCurrency(): fc.Arbitrary<ParsedRow> {
  return fc.record({
    // Use integer-based generator to produce values with at most 2 decimal
    // places — this ensures DecimalAccumulator rounding (8 dp) is a no-op
    // and the direct float sum matches the accumulator output within 1e-8.
    net_total:     fc.integer({ min: 0, max: 100000 }).map(n => n / 100),
    gross_total:   fc.constant(0),
    taxes:         fc.constant(0),
    channel_costs: fc.constant(0),
    other_costs:   fc.constant(0),
    currency:      fc.constantFrom('USD', 'EUR', 'COP'),
    artist:        fc.constant('Test Artist'),
    track:         fc.constant('Test Track'),
    album:         fc.constant('Test Album'),
    upc:           fc.constant(''),
    isrc:          fc.constant(''),
    platform:      fc.constant(''),
    country:       fc.constant(''),
    quantity:      fc.constant(1),
    sale_period:   fc.constant(''),
    artist_name:   fc.constant('Test Artist'),
    song_title:    fc.constant('Test Track'),
    album_name:    fc.constant('Test Album'),
    store:         fc.constant(''),
    earnings_usd:  fc.constant(0),
  }) as fc.Arbitrary<ParsedRow>
}

describe('Property 8: Aislamiento por moneda — no mezcla de acumuladores', () => {
  it(
    // Feature: payment-column-currency-strategy, Property 8: Aislamiento por moneda
    'el total de cada grupo de moneda debe ser igual a la suma directa de net_total de las filas de esa moneda (tolerancia 1e-8)',
    () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryParsedRowWithCurrency(), { minLength: 1, maxLength: 100 }),
          (rows) => {
            const logger = new Logger()
            const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)

            for (const currency of ['USD', 'EUR', 'COP'] as const) {
              const group = result.groups.find(g => g.currency === currency)
              const directSum = rows
                .filter(r => r.currency === currency)
                .reduce((s, r) => s + r.net_total, 0)

              if (directSum === 0 && !group) {
                // No rows for this currency → no group expected, OK
                continue
              }

              if (group === undefined) {
                // There are rows but no group — isolation violated
                return false
              }

              if (Math.abs(group.total - directSum) >= 1e-8) {
                return false
              }
            }

            return true
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})

// ---------------------------------------------------------------------------
// Property 9: Conservación de totales — round-trip monetario
// Validates: Requirements 6.6
// ---------------------------------------------------------------------------

describe('Property 9: Conservación de totales — round-trip monetario', () => {
  it(
    // Feature: payment-column-currency-strategy, Property 9: Conservación de totales
    'la suma de todos los CurrencyGroup.total debe ser igual a la suma directa de row.net_total (tolerancia 1e-8)',
    () => {
      fc.assert(
        fc.property(
          fc.array(arbitraryParsedRow(), { minLength: 0, maxLength: 200 }),
          (rows) => {
            const logger = new Logger()
            const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)

            const groupSum = result.groups.reduce((s, g) => s + g.total, 0)
            const rowSum   = rows.reduce((s, r) => s + r.net_total, 0)

            return Math.abs(groupSum - rowSum) < 1e-8
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})

// ---------------------------------------------------------------------------
// Property 10: Grupos ordenados descendente por total
// Validates: Requirements 6.4
// ---------------------------------------------------------------------------

/**
 * Arbitrary that generates a ParsedRow array guaranteed to produce at least
 * 2 distinct currency groups with non-zero totals.
 *
 * Strategy:
 * - Pick 2 distinct currencies from a fixed set.
 * - For each currency, generate at least 1 row with a positive net_total.
 * - Optionally mix in additional rows of either currency.
 */
function arbitraryRowsWithTwoDistinctCurrencies(): fc.Arbitrary<ParsedRow[]> {
  const availableCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'COP', 'BRL'] as const
  type Currency = typeof availableCurrencies[number]

  function rowsForCurrency(currency: Currency): fc.Arbitrary<ParsedRow[]> {
    return fc.array(
      fc.integer({ min: 1, max: 100000 }).map(n =>
        makeRow(n / 100, currency),
      ),
      { minLength: 1, maxLength: 10 },
    )
  }

  // Choose 2 distinct currencies by picking an index and an offset
  return fc.integer({ min: 0, max: availableCurrencies.length - 1 }).chain(idx1 =>
    fc.integer({ min: 1, max: availableCurrencies.length - 1 }).map(offset => ({
      currency1: availableCurrencies[idx1] as Currency,
      currency2: availableCurrencies[(idx1 + offset) % availableCurrencies.length] as Currency,
    }))
  ).chain(({ currency1, currency2 }) =>
    fc.tuple(
      rowsForCurrency(currency1),
      rowsForCurrency(currency2),
    ).map(([rows1, rows2]) => [...rows1, ...rows2])
  )
}

describe('Property 10: Grupos ordenados descendente por total', () => {
  it(
    // Feature: payment-column-currency-strategy, Property 10: Grupos ordenados descendente
    'para ≥ 2 grupos de moneda distintos, groups[i].total >= groups[i+1].total para todo i',
    () => {
      fc.assert(
        fc.property(
          arbitraryRowsWithTwoDistinctCurrencies(),
          (rows) => {
            const logger = new Logger()
            const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)

            // Must have at least 2 groups (guaranteed by generator)
            if (result.groups.length < 2) return false

            // Verify descending order for every consecutive pair
            for (let i = 0; i < result.groups.length - 1; i++) {
              if (result.groups[i].total < result.groups[i + 1].total) {
                return false
              }
            }

            return true
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})

// ---------------------------------------------------------------------------
// Property 11: Porcentajes suman ~100%
// Validates: Requirements 6.3
// ---------------------------------------------------------------------------

describe('Property 11: Porcentajes suman ~100%', () => {
  it(
    // Feature: payment-column-currency-strategy, Property 11: Porcentajes suman ~100%
    'para cualquier input no-vacío con globalTotal > 0, |sum(group.percentage) - 100| < 0.001',
    () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              net_total:     fc.integer({ min: 1, max: 100000 }).map(n => n / 100),
              gross_total:   fc.constant(0),
              taxes:         fc.constant(0),
              channel_costs: fc.constant(0),
              other_costs:   fc.constant(0),
              currency:      fc.constantFrom('USD', 'EUR', 'COP'),
              artist:        fc.constant('Test Artist'),
              track:         fc.constant('Test Track'),
              album:         fc.constant('Test Album'),
              upc:           fc.constant(''),
              isrc:          fc.constant(''),
              platform:      fc.constant(''),
              country:       fc.constant(''),
              quantity:      fc.constant(1),
              sale_period:   fc.constant(''),
              artist_name:   fc.constant('Test Artist'),
              song_title:    fc.constant('Test Track'),
              album_name:    fc.constant('Test Album'),
              store:         fc.constant(''),
              earnings_usd:  fc.constant(0),
            }) as fc.Arbitrary<ParsedRow>,
            { minLength: 1, maxLength: 200 },
          ),
          (rows) => {
            const logger = new Logger()
            const result = groupByCurrency(rows, ['currency'], 'Ditto', logger)

            // globalTotal > 0 is guaranteed because all rows have net_total >= 0.01
            const percentageSum = result.groups.reduce((s, g) => s + g.percentage, 0)
            return Math.abs(percentageSum - 100) < 0.001
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})
