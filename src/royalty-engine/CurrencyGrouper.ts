/**
 * CurrencyGrouper.ts
 *
 * Groups ParsedRow[] by currency and computes per-group totals using
 * DecimalAccumulator for Decimal(20,8) precision.
 *
 * Requirements: 5, 6
 */

import { DecimalAccumulator } from './DecimalAccumulator'
import { normalizeHeader } from './HeaderNormalizer'
import type { ParsedRow } from './UniversalParser'
import type { Logger } from './Logger'
import { PROVIDER_STRATEGIES, type ProviderName } from './ProviderStrategy'

// ---------------------------------------------------------------------------
// Currency column detection candidates (priority order, post-normalization)
// ---------------------------------------------------------------------------
const CURRENCY_CANDIDATES = [
  'currency',
  'currencycode',
  'clientcurrency',
  'paymentcurrency',
  'settlementcurrency',
]

const KNOWN_CODES = new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'MXN', 'COP', 'BRL', 'CHF', 'SEK', 'NOK', 'DKK',
])

const SYMBOL_MAP: Record<string, string> = { '$': 'USD', '€': 'EUR', '£': 'GBP' }

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CurrencyGroup {
  currency:     string   // ISO code, e.g. 'USD'
  total:        number   // DecimalAccumulator.toNumber()
  totalFixed8:  string   // DecimalAccumulator.toFixed8() for DB storage
  recordCount:  number
  percentage:   number   // (groupTotal / globalTotal) * 100
}

export interface CurrencyGrouperResult {
  groups:          CurrencyGroup[]
  currencyColIdx:  number | null  // index of detected currency column, or null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeCode(raw: string, defaultCurrency: string, logger: Logger, rowIdx: number): string {
  const trimmed = raw.trim().toUpperCase()
  if (!trimmed) return defaultCurrency

  if (KNOWN_CODES.has(trimmed)) return trimmed

  const fromSymbol = SYMBOL_MAP[trimmed]
  if (fromSymbol) return fromSymbol

  logger.warn(`Fila ${rowIdx}: código de moneda desconocido "${raw}", usando ${defaultCurrency}`)
  return defaultCurrency
}

// ---------------------------------------------------------------------------
// groupByCurrency
// ---------------------------------------------------------------------------

/**
 * Groups rows by currency and accumulates net_total per group.
 *
 * Algorithm (7 steps per design.md § 4):
 * 1. Detect currency column index from rawHeaders
 * 2. Determine defaultCurrency from provider strategy
 * 3. Per-row: resolve currency code via row.currency or defaultCurrency
 * 4-5. Accumulate with per-group DecimalAccumulator
 * 6. Calculate percentage
 * 7. Sort descending by total
 */
export function groupByCurrency(
  rows: ParsedRow[],
  rawHeaders: string[],
  provider: ProviderName,
  logger: Logger,
): CurrencyGrouperResult {
  // Step 1: detect currency column index
  const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h))
  let currencyColIdx: number | null = null
  for (const candidate of CURRENCY_CANDIDATES) {
    const idx = normalizedHeaders.indexOf(candidate)
    if (idx !== -1) { currencyColIdx = idx; break }
  }

  // Step 2: default currency from strategy
  const strategy = PROVIDER_STRATEGIES[provider as string]
  const defaultCurrency = strategy?.defaultCurrency ?? 'USD'
  if (!strategy?.defaultCurrency && currencyColIdx === null) {
    logger.warn('No se detecto columna de moneda; usando USD por defecto')
  }

  // Step 3-5: accumulate
  const accumulators = new Map<string, DecimalAccumulator>()
  const counts        = new Map<string, number>()

  rows.forEach((row, i) => {
    const rawCode = row.currency ?? ''
    const resolved = normalizeCode(rawCode, defaultCurrency, logger, i)

    if (!accumulators.has(resolved)) {
      accumulators.set(resolved, new DecimalAccumulator())
      counts.set(resolved, 0)
    }
    accumulators.get(resolved)!.add(row.net_total ?? 0)
    counts.set(resolved, (counts.get(resolved) ?? 0) + 1)
  })

  // Step 4: global total
  const globalAcc = new DecimalAccumulator()
  for (const acc of accumulators.values()) globalAcc.add(acc.toNumber())
  const globalTotal = globalAcc.toNumber()

  // Step 5-6: build CurrencyGroup[]
  const groups: CurrencyGroup[] = []
  for (const [currency, acc] of accumulators.entries()) {
    const total = acc.toNumber()
    const percentage = globalTotal > 0 ? (total / globalTotal) * 100 : 0
    groups.push({
      currency,
      total,
      totalFixed8: acc.toFixed8(),
      recordCount: counts.get(currency) ?? 0,
      percentage,
    })
  }

  // Step 7: sort descending by total
  groups.sort((a, b) => b.total - a.total)

  return { groups, currencyColIdx }
}
