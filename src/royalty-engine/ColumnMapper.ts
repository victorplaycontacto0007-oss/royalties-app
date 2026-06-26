/**
 * ColumnMapper.ts
 * Maps raw header row to canonical field indices using AliasDictionary.
 * Never uses fixed positions. Always looks up by name.
 */
import { ALIAS_DICTIONARY, EXCLUDED_COLUMNS, type CanonicalField } from './AliasDictionary'
import { normalizeHeader, normalizeHeaders } from './HeaderNormalizer'
import type { Logger } from './Logger'

export type ColumnIndex = Record<CanonicalField, number | null>

/**
 * Fields that must ONLY be mapped via exact match — never partial.
 * This prevents net_total_client_currency from matching net_total, etc.
 */
const EXACT_ONLY_FIELDS = new Set<CanonicalField>([
  'net_total',
  'gross_total',
  'taxes',
  'channel_costs',
  'other_costs',
  'currency_net_total',
])

export function mapColumns(rawHeaders: string[], logger: Logger): ColumnIndex {
  const normalized = normalizeHeaders(rawHeaders)
  const result = {} as ColumnIndex

  for (const field of Object.keys(ALIAS_DICTIONARY) as CanonicalField[]) {
    result[field] = null
    const aliases = ALIAS_DICTIONARY[field]
    const exactOnly = EXACT_ONLY_FIELDS.has(field)

    // Pass 1: strict exact match after normalization — pick FIRST occurrence only
    for (const alias of aliases) {
      const normAlias = normalizeHeader(alias)
      if (EXCLUDED_COLUMNS.has(normAlias)) continue
      // findIndex returns the FIRST match — for net_total this will be col 12,
      // not col 17 (net_total_client_currency) because they normalize differently
      const idx = normalized.findIndex(h => h === normAlias)
      if (idx !== -1) {
        // Extra safety: make sure the matched header IS exactly the alias
        // (not a superset like nettotalclientcurrency matching nettotal)
        const rawNorm = normalizeHeader(rawHeaders[idx] ?? '')
        if (rawNorm !== normAlias) continue
        result[field] = idx
        logger.info(`"${field}" → col[${idx}] "${rawHeaders[idx]}" (exact)`)
        break
      }
    }

    if (result[field] !== null) continue
    if (exactOnly) continue  // money fields: never do fuzzy/partial matching

    // Pass 2: partial match — only for non-money fields (artist, track, platform, etc.)
    for (const alias of aliases) {
      const normAlias = normalizeHeader(alias)
      if (EXCLUDED_COLUMNS.has(normAlias)) continue
      const idx = normalized.findIndex(h => {
        if (EXCLUDED_COLUMNS.has(h)) return false
        return h.includes(normAlias) || normAlias.includes(h)
      })
      if (idx !== -1) {
        result[field] = idx
        logger.info(`"${field}" → col[${idx}] "${rawHeaders[idx]}" (partial)`)
        break
      }
    }
  }

  // Warnings for missing critical fields
  const critical: CanonicalField[] = ['net_total', 'artist', 'track', 'platform', 'country', 'quantity', 'sale_period']
  for (const f of critical) {
    if (result[f] === null) logger.warn(`Columna crítica "${f}" no encontrada`)
  }

  // Fallback: if net_total not found, try currency_net_total
  if (result.net_total === null && result.currency_net_total !== null) {
    result.net_total = result.currency_net_total
    logger.warn(`"net_total" no encontrado — usando "currency_net_total" como fallback`)
  }

  if (result.net_total === null) {
    logger.error('No se encontró columna de ingresos netos. El total será 0.')
  } else {
    logger.info(`✅ Ingresos netos → col[${result.net_total}] "${rawHeaders[result.net_total]}"`)
  }

  // Log ALL detected columns for debug
  logger.info(`📋 Headers detectados: ${rawHeaders.slice(0, 30).map((h, i) => `[${i}]${h}`).join(' | ')}`)

  return result
}
