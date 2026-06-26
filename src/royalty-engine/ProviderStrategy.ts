/**
 * ProviderStrategy.ts
 *
 * Central table that defines, per provider, which fields to look for
 * (in priority order) to calculate net_total.
 *
 * Requirement: 4
 */

import { ALIAS_DICTIONARY } from './AliasDictionary'
import { Logger } from './Logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderName =
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
  | 'Spotify'
  | 'Apple Music'
  | 'Amazon Music'
  | 'Tidal'
  | 'YouTube'
  | 'TikTok'
  | 'Meta'
  | 'UNKNOWN'

export interface ProviderStrategyEntry {
  /** Normalized candidate field names to try in order. First found in the file wins. */
  earningsCandidates: string[]
  /** For Ditto: also capture currency_net_total as secondary */
  secondaryField?: string
}

// ---------------------------------------------------------------------------
// Strategy table  (Requirement 4.1)
// ---------------------------------------------------------------------------

export const PROVIDER_STRATEGIES: Record<ProviderName, ProviderStrategyEntry> = {
  Ditto:          { earningsCandidates: ['nettotal'],                                              secondaryField: 'currencynettotal' },
  DistroKid:      { earningsCandidates: ['netearnings', 'royaltyamount', 'payment'] },
  TuneCore:       { earningsCandidates: ['netrevenue', 'royaltyamount', 'netamount'] },
  ONErpm:         { earningsCandidates: ['netrevenue', 'amount', 'royalty'] },
  Believe:        { earningsCandidates: ['netamount', 'royalty'] },
  'CD Baby':      { earningsCandidates: ['netpayable', 'netearnings'] },
  Symphonic:      { earningsCandidates: ['netrevenue'] },
  UnitedMasters:  { earningsCandidates: ['royaltyamount'] },
  FUGA:           { earningsCandidates: ['royaltyamount'] },
  RouteNote:      { earningsCandidates: ['netamount'] },
  'Too Lost':     { earningsCandidates: ['netrevenue', 'royalty'] },
  Amuse:          { earningsCandidates: ['netrevenue'] },
  Spotify:        { earningsCandidates: ['royalty', 'revenue'] },
  'Apple Music':  { earningsCandidates: ['royalty', 'netamount'] },
  'Amazon Music': { earningsCandidates: ['royalty'] },
  Tidal:          { earningsCandidates: ['royalty'] },
  YouTube:        { earningsCandidates: ['partnerrevenue', 'netrevenue', 'royalty'] },
  TikTok:         { earningsCandidates: ['royalty', 'netrevenue'] },
  Meta:           { earningsCandidates: ['royalty', 'netrevenue'] },
  UNKNOWN:        { earningsCandidates: ['nettotal', 'royalty', 'netrevenue', 'netearnings', 'netamount'] },
}

// ---------------------------------------------------------------------------
// resolveEarningsColumn
// ---------------------------------------------------------------------------

/**
 * Given a provider and the normalized column headers already present in a
 * file, returns the column index and the matched candidate name.
 *
 * Resolution order (Requirement 4.6, 4.7):
 *  1. Iterate earningsCandidates in priority order → first exact match wins.
 *  2. If a candidate was skipped (fallback), log [WARN].
 *  3. If no candidate matched at all, fall back to ALIAS_DICTIONARY['net_total']
 *     aliases and log [ERROR].
 *
 * Logging (Requirement 17):
 *  - [INFO]  when a column is selected (always)
 *  - [WARN]  when the primary candidate was skipped and a fallback was used
 *  - [ERROR] when no strategy candidate matched and the generic alias was used
 */
export function resolveEarningsColumn(
  provider: ProviderName,
  normalizedHeaders: string[],
  logger: Logger,
): { colIdx: number | null; fieldUsed: string | null } {
  const strategy = PROVIDER_STRATEGIES[provider]
  const { earningsCandidates } = strategy

  let firstMiss = true   // tracks whether we had to skip the primary candidate

  for (let i = 0; i < earningsCandidates.length; i++) {
    const candidate = earningsCandidates[i]
    const idx = normalizedHeaders.indexOf(candidate)

    if (idx !== -1) {
      // Found a match
      const isPrimary = i === 0

      if (!isPrimary) {
        // We skipped at least one higher-priority candidate
        logger.warn(
          `Columna primaria no encontrada, usando fallback: ${candidate}`,
        )
      }

      // [INFO] always log the selected column
      logger.info(
        `Columna de ganancias seleccionada: ${normalizedHeaders[idx]} (estrategia: ${provider}, campo: ${candidate})`,
      )

      return { colIdx: idx, fieldUsed: candidate }
    }

    // Mark that we missed at least the first candidate
    if (i === 0) firstMiss = true
  }

  // -----------------------------------------------------------------------
  // No strategy candidate found — fallback to ALIAS_DICTIONARY net_total
  // -----------------------------------------------------------------------
  logger.error(
    'Ningún candidato de estrategia encontrado, usando alias genérico net_total',
  )

  const netTotalAliases = ALIAS_DICTIONARY['net_total']
  for (const alias of netTotalAliases) {
    const idx = normalizedHeaders.indexOf(alias)
    if (idx !== -1) {
      logger.info(
        `Columna de ganancias seleccionada: ${normalizedHeaders[idx]} (estrategia: ${provider}, campo: ${alias})`,
      )
      return { colIdx: idx, fieldUsed: alias }
    }
  }

  // Truly nothing found
  return { colIdx: null, fieldUsed: null }
}
