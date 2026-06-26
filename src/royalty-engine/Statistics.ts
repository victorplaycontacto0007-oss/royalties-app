import type { ParsedRow } from './UniversalParser'

export interface RUPEStats {
  // ── V1 fields (unchanged) ────────────────────────────────────────────────
  totalRows:       number
  totalNet:        number
  totalGross:      number
  totalTaxes:      number
  totalCosts:      number
  totalStreams:     number
  currency:        string
  provider:        string
  uniqueSongs:     number
  uniqueAlbums:    number
  uniqueArtists:   number
  uniqueCountries: number
  uniquePlatforms: number
  uniqueISRC:      number
  uniqueUPC:       number
  topArtists:      Array<{ name: string; net: number; streams: number }>
  topTracks:       Array<{ name: string; net: number; streams: number }>
  topPlatforms:    Array<{ name: string; net: number; streams: number }>
  topCountries:    Array<{ name: string; net: number; streams: number }>
  byMonth:         Array<{ month: string; net: number }>
  errors:          number
  processingLog:   string[]
  // ── V2 additions ─────────────────────────────────────────────────────────
  /** Sum of quantity for rows where transaction_type === 'download' (case-insensitive). */
  totalDownloads:  number
  /** Top 20 albums ranked by net total descending. */
  byAlbum:         Array<{ name: string; net: number; streams: number }>
  /** Audit validation status from the AuditReport pipeline. */
  auditStatus:     'valid' | 'discrepancy' | 'error'
  /** Total wall-clock time in milliseconds spent processing the file. */
  processingTimeMs: number
}

type AggMap = Record<string, { net: number; streams: number }>

function agg(rows: ParsedRow[], key: keyof ParsedRow): AggMap {
  const map: AggMap = {}
  for (const r of rows) {
    const k = String(r[key] || 'Unknown')
    if (!map[k]) map[k] = { net: 0, streams: 0 }
    map[k].net     += r.net_total
    map[k].streams += r.quantity
  }
  return map
}

function top(map: AggMap, n = 20) {
  return Object.entries(map)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.net - a.net)
    .slice(0, n)
}

export function computeStats(
  rows: ParsedRow[],
  currency: string,
  provider: string,
  log: string[],
  errors: number,
  auditStatus: 'valid' | 'discrepancy' | 'error' = 'valid',
  processingTimeMs: number = 0,
): RUPEStats {
  let totalNet = 0, totalGross = 0, totalTaxes = 0, totalCosts = 0, totalStreams = 0, totalDownloads = 0

  for (const r of rows) {
    totalNet    += r.net_total
    totalGross  += r.gross_total
    totalTaxes  += r.taxes
    totalCosts  += r.channel_costs + r.other_costs
    totalStreams += r.quantity

    // Count downloads: rows whose transaction_type (if present) is 'download'
    const txType = ((r as unknown as Record<string, unknown>)['transaction_type'] as string | undefined) ?? ''
    if (txType.toLowerCase() === 'download') {
      totalDownloads += r.quantity
    }
  }

  const monthMap: Record<string, number> = {}
  for (const r of rows) {
    const m = (r.sale_period ?? '').slice(0, 7) || 'Unknown'
    monthMap[m] = (monthMap[m] ?? 0) + r.net_total
  }

  return {
    // ── V1 fields ──────────────────────────────────────────────────────────
    totalRows:       rows.length,
    totalNet:        Math.round(totalNet * 1e8) / 1e8,
    totalGross:      Math.round(totalGross * 1e8) / 1e8,
    totalTaxes:      Math.round(totalTaxes * 1e8) / 1e8,
    totalCosts:      Math.round(totalCosts * 1e8) / 1e8,
    totalStreams,
    currency,
    provider,
    uniqueSongs:     new Set(rows.map(r => r.track)).size,
    uniqueAlbums:    new Set(rows.map(r => r.album)).size,
    uniqueArtists:   new Set(rows.map(r => r.artist)).size,
    uniqueCountries: new Set(rows.map(r => r.country)).size,
    uniquePlatforms: new Set(rows.map(r => r.platform)).size,
    uniqueISRC:      new Set(rows.filter(r => r.isrc).map(r => r.isrc)).size,
    uniqueUPC:       new Set(rows.filter(r => r.upc).map(r => r.upc)).size,
    topArtists:      top(agg(rows, 'artist')),
    topTracks:       top(agg(rows, 'track')),
    topPlatforms:    top(agg(rows, 'platform')),
    topCountries:    top(agg(rows, 'country')),
    byMonth: Object.entries(monthMap).map(([month, net]) => ({ month, net })).sort((a, b) => a.month.localeCompare(b.month)),
    errors,
    processingLog:   log,
    // ── V2 fields ──────────────────────────────────────────────────────────
    totalDownloads,
    byAlbum:          top(agg(rows, 'album')),
    auditStatus,
    processingTimeMs,
  }
}
