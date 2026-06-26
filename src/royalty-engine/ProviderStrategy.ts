/**
 * ProviderStrategy.ts
 *
 * Central table that defines, per provider, the single payment column to use
 * for net_total accumulation (V2: deterministic paymentColumn).
 *
 * Backward-compat: resolveEarningsColumn() public signature is unchanged.
 *
 * Requirements: 1, 2, 3, 4, 10, 11
 */

import { ALIAS_DICTIONARY, EXCLUDED_COLUMNS } from './AliasDictionary'
import { normalizeHeader } from './HeaderNormalizer'
import { Logger } from './Logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderName =
  | 'Dinastía'             // NEW V2
  | 'Ditto'
  | 'DistroKid'
  | 'TuneCore'
  | 'ONErpm'
  | 'Believe'
  | 'CD Baby'
  | 'Symphonic'
  | 'UnitedMasters'
  | 'FUGA'
  | 'RouteNote'
  | 'Too Lost'
  | 'Amuse'
  | 'Spotify Direct'       // renamed from 'Spotify'
  | 'Apple Music Reports'  // renamed from 'Apple Music'
  | 'Amazon Music Reports' // renamed from 'Amazon Music'
  | 'Tidal Reports'        // renamed from 'Tidal'
  | 'YouTube Content ID'   // renamed from 'YouTube'
  | 'TikTok'
  | 'Meta'
  | 'UNKNOWN'
  // V1 names kept in union for backward compat with DB records
  | 'Spotify'
  | 'Apple Music'
  | 'Amazon Music'
  | 'Tidal'
  | 'YouTube'

export interface ProviderStrategyEntry {
  /**
   * Pre-normalization name of the single payment column for this provider.
   * PaymentColumnResolver normalizes this with normalizeHeader() before lookup.
   * No fallbacks — if this column is absent, resolution returns null.
   * UNKNOWN uses '' as sentinel for alias-fallback path.
   */
  paymentColumn: string

  /**
   * Default ISO currency code when no currency column is detected in the file.
   * Defaults to 'USD' when absent.
   */
  defaultCurrency?: string

  /**
   * @deprecated V1 field kept for backward compat with existing tests.
   * resolveEarningsColumn() now delegates to paymentColumn internally.
   */
  earningsCandidates?: string[]

  /** @deprecated V1 secondary field for Ditto. Ignored by new resolver. */
  secondaryField?: string
}

// ---------------------------------------------------------------------------
// Strategy table  (Req 1.1 — 21 entries + UNKNOWN + V1 aliases)
// ---------------------------------------------------------------------------

export const PROVIDER_STRATEGIES: Record<string, ProviderStrategyEntry> = {
  'Dinastía':             { paymentColumn: 'net_total_client_currency', defaultCurrency: 'COP' },
  'Ditto':                { paymentColumn: 'net_total',                 defaultCurrency: 'USD',
                            earningsCandidates: ['nettotal'],           secondaryField: 'currencynettotal' },
  'DistroKid':            { paymentColumn: 'earnings',                  defaultCurrency: 'USD',
                            earningsCandidates: ['netearnings', 'royaltyamount', 'payment'] },
  'TuneCore':             { paymentColumn: 'net_revenue',               defaultCurrency: 'USD',
                            earningsCandidates: ['netrevenue', 'royaltyamount', 'netamount'] },
  'ONErpm':               { paymentColumn: 'net_revenue',               defaultCurrency: 'USD',
                            earningsCandidates: ['netrevenue', 'amount', 'royalty'] },
  'Believe':              { paymentColumn: 'net_amount',                defaultCurrency: 'EUR',
                            earningsCandidates: ['netamount', 'royalty'] },
  'CD Baby':              { paymentColumn: 'net_payable',               defaultCurrency: 'USD',
                            earningsCandidates: ['netpayable', 'netearnings'] },
  'Symphonic':            { paymentColumn: 'net_revenue',               defaultCurrency: 'USD',
                            earningsCandidates: ['netrevenue'] },
  'UnitedMasters':        { paymentColumn: 'royalty',                   defaultCurrency: 'USD',
                            earningsCandidates: ['royaltyamount'] },
  'FUGA':                 { paymentColumn: 'royalty_amount',            defaultCurrency: 'USD',
                            earningsCandidates: ['royaltyamount'] },
  'RouteNote':            { paymentColumn: 'net_amount',                defaultCurrency: 'USD',
                            earningsCandidates: ['netamount'] },
  'Too Lost':             { paymentColumn: 'royalty',                   defaultCurrency: 'USD',
                            earningsCandidates: ['netrevenue', 'royalty'] },
  'Amuse':                { paymentColumn: 'net_revenue',               defaultCurrency: 'USD',
                            earningsCandidates: ['netrevenue'] },
  'Spotify Direct':       { paymentColumn: 'royalties',                 defaultCurrency: 'USD',
                            earningsCandidates: ['royalty', 'revenue'] },
  'Apple Music Reports':  { paymentColumn: 'royalty',                   defaultCurrency: 'USD',
                            earningsCandidates: ['royalty', 'netamount'] },
  'Amazon Music Reports': { paymentColumn: 'royalty',                   defaultCurrency: 'USD',
                            earningsCandidates: ['royalty'] },
  'Tidal Reports':        { paymentColumn: 'royalty',                   defaultCurrency: 'USD',
                            earningsCandidates: ['royalty'] },
  'YouTube Content ID':   { paymentColumn: 'partner_revenue',           defaultCurrency: 'USD',
                            earningsCandidates: ['partnerrevenue', 'netrevenue', 'royalty'] },
  'TikTok':               { paymentColumn: 'royalty',                   defaultCurrency: 'USD',
                            earningsCandidates: ['royalty', 'netrevenue'] },
  'Meta':                 { paymentColumn: 'revenue',                   defaultCurrency: 'USD',
                            earningsCandidates: ['royalty', 'netrevenue'] },
  'UNKNOWN':              { paymentColumn: '',                          defaultCurrency: 'USD',
                            earningsCandidates: ['nettotal', 'royalty', 'netrevenue', 'netearnings', 'netamount'] },
  // V1 names — alias to their V2 equivalents for backward compat
  'Spotify':              { paymentColumn: 'royalties',                 defaultCurrency: 'USD',
                            earningsCandidates: ['royalty', 'revenue'] },
  'Apple Music':          { paymentColumn: 'royalty',                   defaultCurrency: 'USD',
                            earningsCandidates: ['royalty', 'netamount'] },
  'Amazon Music':         { paymentColumn: 'royalty',                   defaultCurrency: 'USD',
                            earningsCandidates: ['royalty'] },
  'Tidal':                { paymentColumn: 'royalty',                   defaultCurrency: 'USD',
                            earningsCandidates: ['royalty'] },
  'YouTube':              { paymentColumn: 'partner_revenue',           defaultCurrency: 'USD',
                            earningsCandidates: ['partnerrevenue', 'netrevenue', 'royalty'] },
}

// ---------------------------------------------------------------------------
// PaymentColumnResolver (internal) + resolveEarningsColumn (public)
// ---------------------------------------------------------------------------

/**
 * resolveEarningsColumn — public signature UNCHANGED (Req 11.2).
 *
 * Internally delegates to PaymentColumnResolver algorithm:
 *
 * 1. Guard: unknown provider → delegate to UNKNOWN
 * 2. UNKNOWN / empty paymentColumn → iterate ALIAS_DICTIONARY['net_total']
 * 3. Known provider → single paymentColumn lookup
 * 4. Column not found → return null (no fallback for known providers)
 */
export function resolveEarningsColumn(
  provider: ProviderName,
  normalizedHeaders: string[],
  logger: Logger,
): { colIdx: number | null; fieldUsed: string | null } {

  const strategy = PROVIDER_STRATEGIES[provider as string]

  // Guard: provider not in table
  if (!strategy) {
    logger.warn(`Proveedor "${provider}" no encontrado en PROVIDER_STRATEGIES; usando UNKNOWN`)
    return resolveEarningsColumn('UNKNOWN', normalizedHeaders, logger)
  }

  // Path 1: UNKNOWN or empty paymentColumn — alias fallback (backward compat)
  if (provider === 'UNKNOWN' || strategy.paymentColumn === '') {
    const netTotalAliases = ALIAS_DICTIONARY['net_total']
    for (const alias of netTotalAliases) {
      const normAlias = normalizeHeader(alias)
      if (EXCLUDED_COLUMNS.has(normAlias)) continue
      const idx = normalizedHeaders.indexOf(normAlias)
      if (idx !== -1) {
        logger.warn('estrategia genérica en uso')
        logger.info(`Columna seleccionada: ${normalizedHeaders[idx]} (UNKNOWN alias)`)
        return { colIdx: idx, fieldUsed: alias }
      }
    }
    return { colIdx: null, fieldUsed: null }
  }

  // Path 2: Known provider — single paymentColumn lookup
  const normPayment = normalizeHeader(strategy.paymentColumn)

  // Safety: never return an EXCLUDED column
  if (EXCLUDED_COLUMNS.has(normPayment)) {
    logger.error(`paymentColumn "${strategy.paymentColumn}" está en EXCLUDED_COLUMNS`)
    return { colIdx: null, fieldUsed: null }
  }

  const idx = normalizedHeaders.indexOf(normPayment)

  if (idx !== -1) {
    logger.info(`Columna de pago: ${normalizedHeaders[idx]} (proveedor: ${provider})`)
    return { colIdx: idx, fieldUsed: strategy.paymentColumn }
  }

  // Column not found — no fallback
  if (provider === 'Dinastía') {
    logger.error(`Columna oficial de Dinastia "net_total_client_currency" no encontrada`)
  } else {
    logger.error(`Columna de pago "${strategy.paymentColumn}" no encontrada para ${provider}`)
  }

  return { colIdx: null, fieldUsed: null }
}
