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
  // --- Flow Independiente / Global Sound Stars (label reports via The Orchard) ---
  // These files use the same 24-column format but arrive with the label name
  // in the filename instead of 'orchard'. They need a different payment column
  // ('revenue' vs 'net_revenue'), so they must be detected before The Orchard.
  { name: 'Flow Independiente', signals: ['flowindependiente'] },
  { name: 'Global Sound Stars', signals: ['globalsoundstars'] },
  // --- The Orchard ---
  // Filename match ('orchard') takes priority; header-based detection is a
  // fallback for files whose name does not contain 'orchard'. Header signals:
  // any transaction_type alias ('transactiontype', 'usagetype', 'streamtype',
  // 'subscriptiontype') combined with at least one platform-like column
  // ('platform', 'store', 'dsp', 'service', 'channel').
  // Both signal lists are checked against the combined search string so the
  // first-match/tiebreak logic of detectProvider() handles priority naturally:
  // if 'orchard' appears in the filename the combined string also contains it,
  // and the filename-only entry below is listed first.
  { name: 'The Orchard',    signals: ['orchard'] },
  // Dynastía (before generic DSPs — tiebreak by position) ---
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

  // --- The Orchard header-based fallback ---
  // When the filename does not contain 'orchard', detect The Orchard by
  // combination: any transaction_type alias present AND at least one
  // platform-like column present.
  const TRANSACTION_TYPE_ALIASES = [
    'transactiontype', 'usagetype', 'streamtype', 'subscriptiontype',
  ]
  const PLATFORM_LIKE_SIGNALS = [
    'platform', 'store', 'dsp', 'service', 'channel',
  ]
  const hasTransactionType = TRANSACTION_TYPE_ALIASES.some(a => headerStr.includes(a))
  const hasPlatform = PLATFORM_LIKE_SIGNALS.some(p => headerStr.includes(p))

  // --- Flow Independiente / Global Sound Stars header-based fallback ---
  // Files with LABEL IMPRINT + STATEMENT PERIOD + REVENUE are the 24-column
  // label report format even when the filename doesn't contain the label name.
  const hasLabelImprint    = headerStr.includes('labelimprint')   || headerStr.includes('LABEL IMPRINT')
  const hasRevenue         = headerStr.includes('revenue')        || headerStr.includes('REVENUE')
  const hasStatementPeriod = headerStr.includes('statementperiod')|| headerStr.includes('STATEMENT PERIOD')

  if (hasLabelImprint && hasRevenue && hasStatementPeriod) {
    logger?.info('Proveedor detectado: Flow Independiente (header fallback — label report format)')
    return 'Flow Independiente'
  }

  if (hasTransactionType && hasPlatform) {
    logger?.info('Proveedor detectado: The Orchard')
    return 'The Orchard'
  }

  // No provider matched — fall back to generic alias strategy.
  logger?.info('Proveedor detectado: UNKNOWN')
  logger?.warn('estrategia genérica en uso')
  return 'UNKNOWN'
}
