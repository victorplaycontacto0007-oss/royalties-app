/**
 * CurrencyConverter.test.ts
 *
 * Unit tests + property-based tests for CurrencyConverter with mocked fetch.
 * Covers: Requirements 8.2, 8.3, 8.4, 8.5, 8.6
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { convertCurrencies, type TargetCurrency } from './CurrencyConverter'
import type { CurrencyGroup } from './CurrencyGrouper'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(currency: string, total: number): CurrencyGroup {
  return {
    currency,
    total,
    totalFixed8: total.toFixed(8),
    recordCount: 1,
    percentage: 100,
  }
}

/** A valid rates response from open.er-api.com (USD-base) */
const VALID_RATES_RESPONSE = {
  result: 'success',
  rates: {
    USD: 1,
    EUR: 0.92,
    COP: 4200,
    GBP: 0.79,
    MXN: 17.5,
    CAD: 1.36,
    JPY: 155,
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Test: Timeout > 10s → error message containing "tiempo límite"
// Requirement 8.5
// ---------------------------------------------------------------------------

describe('CurrencyConverter — timeout', () => {
  it('throws with "tiempo límite" when the request exceeds 10 seconds', async () => {
    vi.useFakeTimers()

    // Simulate a fetch that hangs until the AbortSignal fires
    vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = options?.signal
        if (signal) {
          if (signal.aborted) {
            reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
            return
          }
          signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
          })
        }
      })
    }))

    const groups = [makeGroup('USD', 100)]

    // Attach the catch handler BEFORE advancing timers so the rejection
    // is never "unhandled".
    let caughtError: Error | undefined
    const promise = convertCurrencies(groups, 'EUR').catch((e: Error) => {
      caughtError = e
    })

    // Advance past the 10-second timeout so the AbortController fires
    await vi.advanceTimersByTimeAsync(11_000)
    await promise

    vi.useRealTimers()

    expect(caughtError).toBeDefined()
    expect(caughtError?.message).toMatch(/tiempo límite/i)
  })
})

// ---------------------------------------------------------------------------
// Test: HTTP 429 → error message containing "HTTP 429"
// Requirement 8.6
// ---------------------------------------------------------------------------

describe('CurrencyConverter — non-2xx HTTP status', () => {
  it('throws with "HTTP 429" when the API responds with status 429', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'rate-limited' }), {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      ),
    ))

    const groups = [makeGroup('USD', 100)]
    await expect(convertCurrencies(groups, 'EUR')).rejects.toThrow(/429/)
  })

  it('throws with "HTTP 500" when the API responds with status 500', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(
        new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error',
        }),
      ),
    ))

    const groups = [makeGroup('USD', 100)]
    await expect(convertCurrencies(groups, 'EUR')).rejects.toThrow(/500/)
  })
})

// ---------------------------------------------------------------------------
// Test: JSON without `rates` field → error message containing "inválida"
// Requirement 8.6 (invalid response shape)
// ---------------------------------------------------------------------------

describe('CurrencyConverter — invalid JSON response', () => {
  it('throws with "inválida" when the response JSON has no "rates" field', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ result: 'error', error: 'unknown' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ))

    const groups = [makeGroup('USD', 100)]
    await expect(convertCurrencies(groups, 'EUR')).rejects.toThrow(/inv[aá]lid/i)
  })

  it('throws with "inválida" when rates object is missing the target currency', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ rates: { USD: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ))

    const groups = [makeGroup('USD', 100)]
    // EUR is the target but not in rates
    await expect(convertCurrencies(groups, 'EUR')).rejects.toThrow(/inv[aá]lid/i)
  })
})

// ---------------------------------------------------------------------------
// Test: Network error (fetch rejects with TypeError) → error containing "red"
// Requirement 8.5 (network failure)
// ---------------------------------------------------------------------------

describe('CurrencyConverter — network error', () => {
  it('throws with "red" when fetch rejects with a TypeError (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    ))

    const groups = [makeGroup('USD', 100)]
    await expect(convertCurrencies(groups, 'EUR')).rejects.toThrow(/red/i)
  })
})

// ---------------------------------------------------------------------------
// Test: source currency === target currency → rate: 1, convertedTotal === originalTotal
// Requirement 8.4
// ---------------------------------------------------------------------------

describe('CurrencyConverter — identity conversion (source === target)', () => {
  it('returns rate 1 and convertedTotal === originalTotal when currency matches target', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(VALID_RATES_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ))

    const originalTotal = 1234.56
    const groups = [makeGroup('EUR', originalTotal)]
    const result = await convertCurrencies(groups, 'EUR' as TargetCurrency)

    expect(result.groups).toHaveLength(1)
    expect(result.groups[0].rate).toBe(1)
    expect(result.groups[0].convertedTotal).toBe(originalTotal)
  })

  it('returns rate 1 for USD→USD conversion', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(VALID_RATES_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ))

    const groups = [makeGroup('USD', 500)]
    const result = await convertCurrencies(groups, 'USD' as TargetCurrency)

    expect(result.groups[0].rate).toBe(1)
    expect(result.groups[0].convertedTotal).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// Test: Successful cross-currency conversion
// Requirement 8.3
// ---------------------------------------------------------------------------

describe('CurrencyConverter — successful conversion', () => {
  it('converts USD to EUR using cross-rate formula', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(VALID_RATES_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ))

    const groups = [makeGroup('USD', 100)]
    const result = await convertCurrencies(groups, 'EUR' as TargetCurrency)

    // rate = rates['EUR'] / rates['USD'] = 0.92 / 1 = 0.92
    expect(result.groups[0].rate).toBeCloseTo(0.92, 5)
    // convertedTotal = round(100 * 0.92, 2) = 92.00
    expect(result.groups[0].convertedTotal).toBeCloseTo(92, 2)
  })

  it('returns the targetCurrency on the result', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(VALID_RATES_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ))

    const groups = [makeGroup('USD', 100)]
    const result = await convertCurrencies(groups, 'COP' as TargetCurrency)

    expect(result.targetCurrency).toBe('COP')
  })
})

// ---------------------------------------------------------------------------
// Property 13: Identidad de conversión (source === target)
// Feature: payment-column-currency-strategy, Property 13: Identidad de conversión
// Requirement 8.4
// ---------------------------------------------------------------------------

describe('Property 13 — Identidad de conversión (source === target)', () => {
  it('returns rate === 1 and convertedTotal === originalTotal for any group where currency === targetCurrency', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Pick any supported currency — it will be both the group's currency and the target
        fc.constantFrom(...(['USD', 'EUR', 'COP', 'GBP', 'MXN', 'CAD', 'JPY'] as const)),
        // Arbitrary positive total
        fc.float({ min: Math.fround(0.01), max: Math.fround(1_000_000), noNaN: true }),
        async (currency, total) => {
          const group: CurrencyGroup = {
            currency,
            total,
            totalFixed8: total.toFixed(8),
            recordCount: 1,
            percentage: 100,
          }

          // Provide a valid rates response so the function reaches the mapping step
          vi.stubGlobal('fetch', vi.fn(() =>
            Promise.resolve(
              new Response(
                JSON.stringify({
                  result: 'success',
                  rates: { USD: 1, EUR: 0.92, COP: 4200, GBP: 0.79, MXN: 17.5, CAD: 1.36, JPY: 155 },
                }),
                { status: 200, headers: { 'Content-Type': 'application/json' } },
              ),
            ),
          ))

          try {
            const result = await convertCurrencies([group], currency as TargetCurrency)
            const converted = result.groups[0]

            // Identity: when source === target, rate must be exactly 1 and totals must match
            return converted.rate === 1 && converted.convertedTotal === total
          } finally {
            vi.unstubAllGlobals()
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 12: Cross-rate de conversión — fórmula fuente→USD→destino
// Feature: payment-column-currency-strategy, Property 12: Cross-rate de conversión
// Requirement 8.3
// ---------------------------------------------------------------------------

/** Supported currencies matching TargetCurrency type */
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'COP', 'GBP', 'MXN', 'CAD', 'JPY'] as const

/**
 * Generates a CurrencyGroup with an arbitrary currency from the supported set
 * and a realistic positive total.
 */
function arbitraryCurrencyGroup(): fc.Arbitrary<CurrencyGroup> {
  return fc.record({
    currency: fc.constantFrom(...SUPPORTED_CURRENCIES),
    total: fc.float({ min: Math.fround(0.01), max: Math.fround(1_000_000), noNaN: true }),
    recordCount: fc.integer({ min: 1, max: 10_000 }),
  }).map(({ currency, total, recordCount }) => ({
    currency,
    total,
    totalFixed8: total.toFixed(8),
    recordCount,
    percentage: 100,
  }))
}

/**
 * Generates a rates map with USD=1 and realistic rates for all supported currencies.
 * This models a real USD-base response from open.er-api.com.
 */
function arbitraryRatesMap(): fc.Arbitrary<Record<string, number>> {
  return fc.record({
    USD: fc.constant(1),
    EUR: fc.float({ min: Math.fround(0.5),  max: Math.fround(1.5),   noNaN: true }),
    COP: fc.float({ min: Math.fround(3000), max: Math.fround(5000),  noNaN: true }),
    GBP: fc.float({ min: Math.fround(0.5),  max: Math.fround(1.0),   noNaN: true }),
    MXN: fc.float({ min: Math.fround(10),   max: Math.fround(25),    noNaN: true }),
    CAD: fc.float({ min: Math.fround(1.0),  max: Math.fround(2.0),   noNaN: true }),
    JPY: fc.float({ min: Math.fround(100),  max: Math.fround(200),   noNaN: true }),
  })
}

describe('Property 12 — Cross-rate de conversión (fuente→USD→destino)', () => {
  // Validates: Requirements 8.3
  it('convertedTotal matches round(total × (rates[target] / rates[source]), 2) for all source/target pairs', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryCurrencyGroup(),
        arbitraryRatesMap(),
        fc.constantFrom(...SUPPORTED_CURRENCIES),
        async (group, rates, targetCurrency) => {
          // Stub fetch to return the generated rates map
          vi.stubGlobal('fetch', vi.fn(() =>
            Promise.resolve(
              new Response(JSON.stringify({ result: 'success', rates }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              }),
            ),
          ))

          try {
            const result = await convertCurrencies([group], targetCurrency as TargetCurrency)

            const sourceRate = rates[group.currency]
            const targetRate = rates[targetCurrency]
            const expectedConverted = Math.round(group.total * (targetRate / sourceRate) * 100) / 100
            const actualConverted = result.groups[0].convertedTotal

            return Math.abs(actualConverted - expectedConverted) < 0.01
          } finally {
            vi.unstubAllGlobals()
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
