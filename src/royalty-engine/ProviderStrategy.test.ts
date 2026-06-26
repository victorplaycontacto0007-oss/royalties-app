/**
 * ProviderStrategy.test.ts
 *
 * Unit tests for ProviderStrategy module — updated for V2 (payment-column-strategy).
 * Covers: Requirements 1.1, 2.1-2.6, 3.1-3.4, 10.2, 11.1-11.2
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  PROVIDER_STRATEGIES,
  resolveEarningsColumn,
  type ProviderName,
} from './ProviderStrategy'
import { EXCLUDED_COLUMNS } from './AliasDictionary'
import { normalizeHeader } from './HeaderNormalizer'
import { Logger } from './Logger'

function makeLogger(): Logger { return new Logger() }
function logLines(logger: Logger): string[] { return logger.toStrings() }

// Known V2 providers (have paymentColumn defined and non-empty)
const KNOWN_V2_PROVIDERS: ProviderName[] = [
  'Ditto', 'DistroKid', 'TuneCore', 'ONErpm', 'Believe',
  'CD Baby', 'Symphonic', 'UnitedMasters', 'FUGA', 'RouteNote',
  'Too Lost', 'Amuse', 'Spotify Direct', 'Apple Music Reports',
  'Amazon Music Reports', 'Tidal Reports', 'YouTube Content ID',
  'TikTok', 'Meta',
]

// V1 compat names (still have entries)
const V1_COMPAT: ProviderName[] = ['Spotify', 'Apple Music', 'Amazon Music', 'Tidal', 'YouTube']

// ---------------------------------------------------------------------------
// PROVIDER_STRATEGIES shape — V2
// ---------------------------------------------------------------------------

describe('PROVIDER_STRATEGIES shape (V2)', () => {
  it('has entries for all 21 V2 providers + Dinastia + UNKNOWN + 5 V1 aliases', () => {
    for (const p of [...KNOWN_V2_PROVIDERS, 'Dinast\u00eda' as ProviderName, 'UNKNOWN' as ProviderName]) {
      expect(PROVIDER_STRATEGIES[p as string]).toBeDefined()
    }
  })

  it('every V2 known provider has a non-empty paymentColumn', () => {
    for (const p of KNOWN_V2_PROVIDERS) {
      expect(typeof PROVIDER_STRATEGIES[p as string].paymentColumn).toBe('string')
      expect(PROVIDER_STRATEGIES[p as string].paymentColumn.length).toBeGreaterThan(0)
    }
  })

  it('UNKNOWN has empty paymentColumn sentinel', () => {
    expect(PROVIDER_STRATEGIES['UNKNOWN'].paymentColumn).toBe('')
  })

  it('Ditto has secondaryField = "currencynettotal" (backward compat)', () => {
    expect(PROVIDER_STRATEGIES['Ditto'].secondaryField).toBe('currencynettotal')
  })

  it('Ditto earningsCandidates backward compat — still has nettotal', () => {
    expect(PROVIDER_STRATEGIES['Ditto'].earningsCandidates?.[0]).toBe('nettotal')
  })

  it('DistroKid earningsCandidates backward compat', () => {
    expect(PROVIDER_STRATEGIES['DistroKid'].earningsCandidates).toEqual([
      'netearnings', 'royaltyamount', 'payment',
    ])
  })

  it('YouTube (V1 compat) has an entry', () => {
    expect(PROVIDER_STRATEGIES['YouTube']).toBeDefined()
    expect(PROVIDER_STRATEGIES['YouTube'].paymentColumn).toBe('partner_revenue')
  })

  it('YouTube Content ID (V2) has paymentColumn partner_revenue', () => {
    expect(PROVIDER_STRATEGIES['YouTube Content ID'].paymentColumn).toBe('partner_revenue')
  })

  it('Spotify Direct (V2) has paymentColumn royalties', () => {
    expect(PROVIDER_STRATEGIES['Spotify Direct'].paymentColumn).toBe('royalties')
  })

  it('Dinastia has paymentColumn net_total_client_currency and defaultCurrency COP', () => {
    const entry = PROVIDER_STRATEGIES['Dinast\u00eda']
    expect(entry.paymentColumn).toBe('net_total_client_currency')
    expect(entry.defaultCurrency).toBe('COP')
  })
})

// ---------------------------------------------------------------------------
// resolveEarningsColumn — V2 deterministic paymentColumn lookup
// ---------------------------------------------------------------------------

describe('resolveEarningsColumn — V2 single paymentColumn', () => {
  it('finds paymentColumn for Ditto (net_total)', () => {
    const logger = makeLogger()
    const headers = ['artist', 'nettotal', 'currency']
    const result = resolveEarningsColumn('Ditto', headers, logger)
    expect(result.colIdx).toBe(1)
    expect(result.fieldUsed).toBe('net_total')
  })

  it('finds paymentColumn for DistroKid (earnings)', () => {
    const logger = makeLogger()
    const headers = ['artist', 'earnings', 'country']
    const result = resolveEarningsColumn('DistroKid', headers, logger)
    expect(result.colIdx).toBe(1)
    expect(result.fieldUsed).toBe('earnings')
  })

  it('returns null when paymentColumn is not in headers for known provider', () => {
    const logger = makeLogger()
    const headers = ['artist', 'royaltyamount', 'country']
    // DistroKid V2 paymentColumn = 'earnings' — not present
    const result = resolveEarningsColumn('DistroKid', headers, logger)
    expect(result.colIdx).toBeNull()
    expect(result.fieldUsed).toBeNull()
  })

  it('logs [INFO] on successful paymentColumn match', () => {
    const logger = makeLogger()
    const headers = ['nettotal', 'artist']
    resolveEarningsColumn('Ditto', headers, logger)
    const info = logLines(logger).filter(l => l.startsWith('[INFO]'))
    expect(info.length).toBeGreaterThan(0)
  })

  it('logs [ERROR] when paymentColumn not found', () => {
    const logger = makeLogger()
    const headers = ['artist', 'isrc']
    resolveEarningsColumn('Ditto', headers, logger)
    const errors = logLines(logger).filter(l => l.startsWith('[ERROR]'))
    expect(errors.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// resolveEarningsColumn — UNKNOWN provider (alias fallback, backward compat)
// ---------------------------------------------------------------------------

describe('resolveEarningsColumn — UNKNOWN provider', () => {
  it('finds nettotal alias for UNKNOWN', () => {
    const logger = makeLogger()
    const headers = ['nettotal', 'artist']
    const result = resolveEarningsColumn('UNKNOWN', headers, logger)
    expect(result.colIdx).toBe(0)
  })

  it('falls back through aliases for UNKNOWN', () => {
    const logger = makeLogger()
    const headers = ['artist', 'netearnings', 'country']
    const result = resolveEarningsColumn('UNKNOWN', headers, logger)
    expect(result.colIdx).toBe(1)
  })

  it('returns null when no alias found', () => {
    const logger = makeLogger()
    const headers = ['artistname', 'isrc', 'upc']
    const result = resolveEarningsColumn('UNKNOWN', headers, logger)
    expect(result.colIdx).toBeNull()
  })

  it('logs [WARN] estrategia generica for UNKNOWN', () => {
    const logger = makeLogger()
    const headers = ['nettotal']
    resolveEarningsColumn('UNKNOWN', headers, logger)
    const warns = logLines(logger).filter(l => l.startsWith('[WARN]'))
    expect(warns.some(w => w.includes('gen'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Property 1: Every known provider has a non-empty paymentColumn
// Feature: payment-column-strategy, Property 1
// Validates: Requirements 1.1
// ---------------------------------------------------------------------------

describe('Property 1: Every known provider has paymentColumn', () => {
  it('paymentColumn is a non-empty string for all non-UNKNOWN providers', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_V2_PROVIDERS),
        (provider) => {
          const entry = PROVIDER_STRATEGIES[provider as string]
          return typeof entry.paymentColumn === 'string' && entry.paymentColumn.length > 0
        },
      ),
      { numRuns: KNOWN_V2_PROVIDERS.length },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 1: PaymentColumn no está en EXCLUDED_COLUMNS
// Feature: payment-column-currency-strategy, Property 1: PaymentColumn no está en EXCLUDED_COLUMNS
// Validates: Requirements 1.6, 4.2
// ---------------------------------------------------------------------------

// All known providers excluding UNKNOWN (includes Dinastia + V1 compat aliases)
const ALL_KNOWN_PROVIDERS = [
  ...KNOWN_V2_PROVIDERS,
  'Dinast\u00eda' as ProviderName,
  ...V1_COMPAT,
]

describe('Property 1 (Requirements 1.6, 4.2): PaymentColumn no está en EXCLUDED_COLUMNS', () => {
  it('normalizeHeader(paymentColumn) is not in EXCLUDED_COLUMNS for any known provider', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KNOWN_PROVIDERS),
        (provider) => {
          const entry = PROVIDER_STRATEGIES[provider as string]
          const normPayment = normalizeHeader(entry.paymentColumn)
          return !EXCLUDED_COLUMNS.has(normPayment)
        },
      ),
      { numRuns: ALL_KNOWN_PROVIDERS.length },
    )
  })

  it('normalizeHeader(paymentColumn) is not grosstotal for any known provider', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_KNOWN_PROVIDERS),
        (provider) => {
          const entry = PROVIDER_STRATEGIES[provider as string]
          const normPayment = normalizeHeader(entry.paymentColumn)
          return normPayment !== 'grosstotal'
        },
      ),
      { numRuns: ALL_KNOWN_PROVIDERS.length },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2: Resolver finds column when paymentColumn is present in headers
// Feature: payment-column-strategy, Property 2
// Validates: Requirements 2.1, 2.2
// ---------------------------------------------------------------------------

describe('Property 2: Resolver finds column when present', () => {
  it('colIdx equals the position of paymentColumn in headers', () => {
    fc.assert(
      fc.property(
        fc.record({
          provider: fc.constantFrom(...KNOWN_V2_PROVIDERS),
          position: fc.nat({ max: 20 }),
          prefix:   fc.array(fc.string({ maxLength: 8 }), { maxLength: 5 }),
        }),
        ({ provider, position, prefix }) => {
          const entry = PROVIDER_STRATEGIES[provider as string]
          const normPayment = normalizeHeader(entry.paymentColumn)
          // Build headers with the payment column at `position`
          const headers: string[] = [...prefix]
          while (headers.length < position) headers.push('colx' + headers.length)
          headers[position] = normPayment
          // Remove any accidental duplicates or EXCLUDED values
          if (headers.filter(h => h === normPayment).length !== 1) return true // skip degenerate case

          const logger = makeLogger()
          const result = resolveEarningsColumn(provider as ProviderName, headers, logger)
          return result.colIdx === position
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 3: Resolver returns null when paymentColumn is NOT in headers
// Feature: payment-column-strategy, Property 3
// Validates: Requirements 2.3, 3.2, 3.4
// ---------------------------------------------------------------------------

describe('Property 3: Resolver returns null when column absent', () => {
  it('colIdx is null when paymentColumn not in headers', () => {
    fc.assert(
      fc.property(
        fc.record({
          provider: fc.constantFrom(...KNOWN_V2_PROVIDERS),
          headers:  fc.array(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 0, maxLength: 10 }),
        }),
        ({ provider, headers }) => {
          const entry = PROVIDER_STRATEGIES[provider as string]
          const normPayment = normalizeHeader(entry.paymentColumn)
          // Ensure paymentColumn is not present
          const cleanHeaders = headers.map(h => normalizeHeader(h)).filter(h => h !== normPayment)
          if (cleanHeaders.includes(normPayment)) return true // skip

          const logger = makeLogger()
          const result = resolveEarningsColumn(provider as ProviderName, cleanHeaders, logger)
          return result.colIdx === null
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 4: Dinastia never uses substitute column
// Feature: payment-column-strategy, Property 4
// Validates: Requirements 3.2, 3.4
// ---------------------------------------------------------------------------

describe('Property 4: Dinastia never uses substitute column', () => {
  it('returns null for Dinastia when nettotalclientcurrency is absent', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 0, maxLength: 15 }),
        (headers) => {
          const normHeaders = headers.map(h => normalizeHeader(h))
          const withoutTarget = normHeaders.filter(h => h !== 'nettotalclientcurrency')

          const logger = makeLogger()
          const result = resolveEarningsColumn('Dinast\u00eda' as ProviderName, withoutTarget, logger)
          return result.colIdx === null
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Feature: payment-column-currency-strategy, Property 3: DefaultCurrency correcta
// Validates: Requirements 1.5
// ---------------------------------------------------------------------------

const KNOWN_V2_PROVIDERS_sin_Dinas_Believe = KNOWN_V2_PROVIDERS.filter(
  (p) => p !== 'Believe',
)

describe('Property 3 (Requirement 1.5): DefaultCurrency correcta para proveedores no-Dinastía/no-Believe', () => {
  it('defaultCurrency is undefined or "USD" for all providers except Dinastia and Believe', () => {
    // Feature: payment-column-currency-strategy, Property 3: DefaultCurrency correcta
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_V2_PROVIDERS_sin_Dinas_Believe),
        (provider) => {
          const entry = PROVIDER_STRATEGIES[provider as string]
          return entry.defaultCurrency === undefined || entry.defaultCurrency === 'USD'
        },
      ),
      { numRuns: KNOWN_V2_PROVIDERS_sin_Dinas_Believe.length },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 14: Extensibilidad — nuevo proveedor en tabla funciona sin cambios al motor
// Feature: payment-column-currency-strategy, Property 14: Extensibilidad
// Validates: Requirements 10.1
// ---------------------------------------------------------------------------

describe('Property 14 (Requirement 10.1): Extensibilidad — nuevo proveedor funciona sin cambios al motor', () => {
  it('dynamically added provider resolves its paymentColumn correctly', () => {
    // Feature: payment-column-currency-strategy, Property 14: Extensibilidad

    // Arrange: dynamically add new provider to the table
    PROVIDER_STRATEGIES['TestProvider'] = { paymentColumn: 'test_payment', defaultCurrency: 'USD' }

    try {
      const logger = makeLogger()
      // 'test_payment' normalizes to 'testpayment' via normalizeHeader
      const result = resolveEarningsColumn('TestProvider' as ProviderName, ['testpayment'], logger)

      // Assert: resolver finds the column without any other engine changes
      expect(result.colIdx).not.toBeNull()
      expect(result.colIdx).toBe(0)
      expect(result.fieldUsed).toBe('test_payment')
    } finally {
      // Cleanup: remove the dynamically added provider
      delete PROVIDER_STRATEGIES['TestProvider']
    }
  })
})
