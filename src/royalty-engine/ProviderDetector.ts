/**
 * ProviderDetector.ts
 *
 * Detects the distributor/provider from the file name and normalized column
 * headers ONLY — cell content is never examined.
 *
 * Tiebreak rule: when multiple providers could match the same file, the one
 * listed FIRST in the PROVIDERS array wins. Signals are evaluated in order;
 * the first provider whose any signal is found in the combined search string
 * is returned immediately.
 *
 * Requirement: 3
 */

import { Logger } from './Logger'
import type { ProviderName } from './ProviderStrategy'

// ---------------------------------------------------------------------------
// Provider signal table — ordered by specificity; first match wins (tiebreak)
//
// Signals are matched against: normalizedFileName + ' ' + normalizedHeaders
// - fileName  : lowercased + spaces/hyphens/dots/underscores stripped
// - headers   : already normalized by HeaderNormalizer (lowercase, no accents
//               or special chars)
// Detection is strictly limited to file name + column headers (Req 3.1).
// ---------------------------------------------------------------------------

const PROVIDERS: Array<{ name: ProviderName; signals: string[] }> = [
  // --- Distributors ---
  { name: 'Ditto',          signals: ['ditto', 'tenantid', 'confirmationreportdate'] },
  { name: 'DistroKid',      signals: ['distrokid', 'youearned', 'bankname'] },
  { name: 'TuneCore',       signals: ['tunecore'] },
  { name: 'CD Baby',        signals: ['cdbaby', 'cdbabypro'] },
  { name: 'Believe',        signals: ['believe'] },
  { name: 'FUGA',           signals: ['fuga', 'fugamusic'] },
  { name: 'Symphonic',      signals: ['symphonic'] },
  { name: 'ONErpm',         signals: ['onerpm'] },
  { name: 'Too Lost',       signals: ['toolost'] },
  { name: 'Amuse',          signals: ['amuse'] },
  { name: 'RouteNote',      signals: ['routenote'] },
  { name: 'UnitedMasters',  signals: ['unitedmasters'] },
  // --- Dinastía (before generic DSPs — tiebreak by position) ---
  { name: 'Dinastía',             signals: ['dinastia', 'nettotalclientcurrency', 'clientcurrency'] },
  // --- DSPs (renamed V2) ---
  { name: 'Spotify Direct',       signals: ['spotifydirect'] },
  { name: 'Apple Music Reports',  signals: ['applemusicreports', 'applemusic'] },
  { name: 'Amazon Music Reports', signals: ['amazonmusicreports', 'amazonmusic'] },
  { name: 'Tidal Reports',        signals: ['tidalreports', 'tidal'] },
  { name: 'YouTube Content ID',   signals: ['youtubecontentid', 'youtube', 'contentid', 'partnerrevenue'] },
  { name: 'TikTok',               signals: ['tiktok', 'bytedance'] },
  { name: 'Meta',                 signals: ['meta', 'facebook', 'instagram'] },
]

// ---------------------------------------------------------------------------
// detectProvider
// ---------------------------------------------------------------------------

/**
 * Detects the provider by examining the file name and normalized column headers.
 *
 * @param fileName         - Original file name (normalized internally).
 * @param normalizedHeaders - Column headers already normalized by HeaderNormalizer
 *                           (lowercase, no accents/spaces/special chars).
 * @param logger           - Optional Logger. When provided:
 *                           • emits [INFO] with the detected provider name (Req 3.4)
 *                           • emits [WARN] "estrategia genérica en uso" when
 *                             provider is UNKNOWN (Req 3.5)
 *
 * @returns The detected ProviderName, or 'UNKNOWN' when no match is found.
 */
export function detectProvider(
  fileName: string,
  normalizedHeaders: string[],
  logger?: Logger,
): ProviderName {
  // Normalize the file name the same way headers are normalized so that signals
  // like 'distrokid' match both "DistroKid_report.tsv" and a header "distrokid".
  const normalizedFileName = fileName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accent marks
    .replace(/[\s\-_.]+/g, '')        // remove spaces, hyphens, dots, underscores
    .replace(/[^a-z0-9]/g, '')        // keep alphanumeric only

  // Join normalized headers into a single searchable string.
  const headerStr = normalizedHeaders.join(' ')

  // Single combined search target — file name checked first.
  const combined = normalizedFileName + ' ' + headerStr

  // First-match wins (tiebreak: position in PROVIDERS array above).
  for (const p of PROVIDERS) {
    if (p.signals.some(s => combined.includes(s))) {
      logger?.info(`Proveedor detectado: ${p.name}`)
      return p.name
    }
  }

  // No provider matched — fall back to generic alias strategy.
  logger?.info('Proveedor detectado: UNKNOWN')
  logger?.warn('estrategia genérica en uso')
  return 'UNKNOWN'
}
