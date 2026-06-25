/**
 * ColumnMapper.ts
 * Maps raw header row to canonical field indices using AliasDictionary.
 * Never uses fixed positions. Always looks up by name.
 */
import { ALIAS_DICTIONARY, EXCLUDED_COLUMNS, type CanonicalField } from './AliasDictionary'
import { normalizeHeader, normalizeHeaders } from './HeaderNormalizer'
import type { Logger } from './Logger'

export type ColumnIndex = Record<CanonicalField, number | null>

export function mapColumns(rawHeaders: string[], logger: Logger): ColumnIndex {
  const normalized = normalizeHeaders(rawHeaders)
  const result = {} as ColumnIndex

  for (const field of Object.keys(ALIAS_DICTIONARY) as CanonicalField[]) {
    result[field] = null
    const aliases = ALIAS_DICTIONARY[field]

    // Pass 1: exact match (after normalization)
    for (const alias of aliases) {
      const normAlias = normalizeHeader(alias)
      // Never map excluded columns as earnings
      if (EXCLUDED_COLUMNS.has(normAlias)) continue
      const idx = normalized.findIndex(h => h === normAlias)
      if (idx !== -1) {
        result[field] = idx
        logger.info(`"${field}" → col[${idx}] "${rawHeaders[idx]}" (exact)`)
        break
      }
    }

    if (result[field] !== null) continue

    // Pass 2: alias starts-with or equals (no partial contain to avoid false matches)
    for (const alias of aliases) {
      const normAlias = normalizeHeader(alias)
      if (EXCLUDED_COLUMNS.has(normAlias)) continue
      const idx = normalized.findIndex(h => {
        if (EXCLUDED_COLUMNS.has(h)) return false
        // Only match if header starts with alias (avoids nettotalclientcurrency matching nettotal)
        return h === normAlias || h.startsWith(normAlias + '_') || h.startsWith(normAlias + 'cl')
      })
      if (idx !== -1) {
        result[field] = idx
        logger.info(`"${field}" → col[${idx}] "${rawHeaders[idx]}" (prefix)`)
        break
      }
    }
  }

  // Special: net_total must NOT map to net_total_client_currency
  // Enforce strict exact match for net_total
  if (result.net_total !== null) {
    const colName = normalizeHeader(rawHeaders[result.net_total] ?? '')
    if (colName !== 'nettotal' && colName !== 'net_total'.replace('_','')) {
      // Check if there's an exact 'nettotal' column elsewhere
      const exactIdx = normalized.findIndex(h => h === 'nettotal')
      if (exactIdx !== -1 && exactIdx !== result.net_total) {
        result.net_total = exactIdx
        logger.info(`"net_total" corrected → col[${exactIdx}] "${rawHeaders[exactIdx]}" (strict)`)
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

  return result
}
