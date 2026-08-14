/**
 * orchard-analytics.ts
 *
 * Pure TypeScript module — NO React imports, NO Supabase imports, NO side effects.
 *
 * Responsibilities:
 *  - FilterState interface for all combinable filter dimensions
 *  - StreamCategoryBreakdown interface for per-category streams + revenue totals
 *  - applyFilters()     — AND-filter over OrchardRecord[]
 *  - computeBreakdown() — single-pass breakdown accumulation
 *
 * Requirements: 4.1, 4.2, 4.3, 14.1, 14.2, 14.3
 */

import type { OrchardRecord, StreamCategory } from '../royalty-engine/StreamTypeClassifier'

// ─── FilterState ──────────────────────────────────────────────────────────────

/**
 * All combinable filter dimensions for Orchard records.
 * A null value on any field means "no filter on this dimension".
 * All non-null fields are combined with AND logic.
 * Requirements: 14.1, 14.2, 14.3
 */
export interface FilterState {
  period:               string | null   // matches sale_period (exact, case-insensitive)
  platform:             string | null   // exact, case-insensitive
  country:              string | null   // exact, case-insensitive
  artist:               string | null   // exact, case-insensitive
  track:                string | null   // exact, case-insensitive
  release:              string | null   // album name — exact, case-insensitive
  isrc:                 string | null   // exact, case-insensitive
  upc:                  string | null   // exact, case-insensitive
  normalizedStreamType: StreamCategory | null  // exact match
  rawStreamType:        string | null   // contains match, case-insensitive
}

// ─── StreamCategoryBreakdown ──────────────────────────────────────────────────

/**
 * Per-category streams and revenue breakdown.
 * FREE_TRIAL is null when no record in the dataset has normalizedStreamType === 'FREE_TRIAL'.
 * monetizable = FULL_PAY + FREE_AD_SUPPORTED where net_total > 0 (records, not just categories).
 * Requirements: 4.2, 4.3
 */
export interface StreamCategoryBreakdown {
  FULL_PAY:          { streams: number; revenue: number }
  FREE_AD_SUPPORTED: { streams: number; revenue: number }
  FREE_TRIAL:        { streams: number; revenue: number } | null  // null = not in report
  UNQUALIFIED:       { streams: number; revenue: number }
  FRAUDULENT:        { streams: number; revenue: number }
  OTHER:             { streams: number; revenue: number }
  UNKNOWN:           { streams: number; revenue: number }
  total:             { streams: number; revenue: number }
  monetizable:       { streams: number; revenue: number }  // FULL_PAY + FREE_AD_SUPPORTED where revenue > 0
}

// ─── applyFilters() ───────────────────────────────────────────────────────────

/**
 * Filters an array of OrchardRecord using AND logic across all non-null FilterState fields.
 *
 * Matching rules:
 *  - period → r.sale_period  (exact, case-insensitive)
 *  - platform                (exact, case-insensitive)
 *  - country                 (exact, case-insensitive)
 *  - artist                  (exact, case-insensitive)
 *  - track                   (exact, case-insensitive)
 *  - release → r.album       (exact, case-insensitive)
 *  - isrc                    (exact, case-insensitive)
 *  - upc                     (exact, case-insensitive)
 *  - normalizedStreamType    (exact string equality)
 *  - rawStreamType            (contains, case-insensitive)
 *
 * Requirements: 14.1, 14.2, 14.3
 */
export function applyFilters(records: OrchardRecord[], filters: FilterState): OrchardRecord[] {
  return records.filter(r => {
    if (filters.period !== null) {
      if (r.sale_period.toLowerCase() !== filters.period.toLowerCase()) return false
    }
    if (filters.platform !== null) {
      if (r.platform.toLowerCase() !== filters.platform.toLowerCase()) return false
    }
    if (filters.country !== null) {
      if (r.country.toLowerCase() !== filters.country.toLowerCase()) return false
    }
    if (filters.artist !== null) {
      if (r.artist.toLowerCase() !== filters.artist.toLowerCase()) return false
    }
    if (filters.track !== null) {
      if (r.track.toLowerCase() !== filters.track.toLowerCase()) return false
    }
    if (filters.release !== null) {
      if (r.album.toLowerCase() !== filters.release.toLowerCase()) return false
    }
    if (filters.isrc !== null) {
      if (r.isrc.toLowerCase() !== filters.isrc.toLowerCase()) return false
    }
    if (filters.upc !== null) {
      if (r.upc.toLowerCase() !== filters.upc.toLowerCase()) return false
    }
    if (filters.normalizedStreamType !== null) {
      if (r.normalizedStreamType !== filters.normalizedStreamType) return false
    }
    if (filters.rawStreamType !== null) {
      if (!r.rawStreamType.toLowerCase().includes(filters.rawStreamType.toLowerCase())) return false
    }
    return true
  })
}

// ─── computeBreakdown() ───────────────────────────────────────────────────────

/**
 * Computes a StreamCategoryBreakdown from a set of records in a single pass.
 *
 * - Accumulates streams (quantity) and revenue (net_total) per category.
 * - FREE_TRIAL is set to null when NO record has normalizedStreamType === 'FREE_TRIAL'.
 * - monetizable.streams = sum of quantity for records where category is FULL_PAY or
 *   FREE_AD_SUPPORTED AND net_total > 0.
 * - monetizable.revenue = sum of net_total for those same records.
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export function computeBreakdown(records: OrchardRecord[]): StreamCategoryBreakdown {
  // Accumulators
  let fullPayStreams = 0;          let fullPayRevenue = 0
  let freeAdStreams = 0;           let freeAdRevenue = 0
  let freeTrialStreams = 0;        let freeTrialRevenue = 0
  let unqualifiedStreams = 0;      let unqualifiedRevenue = 0
  let fraudulentStreams = 0;       let fraudulentRevenue = 0
  let otherStreams = 0;            let otherRevenue = 0
  let unknownStreams = 0;          let unknownRevenue = 0
  let hasFreeTrialRecord = false

  // Monetizable: FULL_PAY or FREE_AD_SUPPORTED AND net_total > 0
  let monetizableStreams = 0;      let monetizableRevenue = 0

  for (const r of records) {
    const streams = r.quantity
    const revenue = r.net_total

    switch (r.normalizedStreamType) {
      case 'FULL_PAY':
        fullPayStreams += streams
        fullPayRevenue += revenue
        if (revenue > 0) {
          monetizableStreams += streams
          monetizableRevenue += revenue
        }
        break
      case 'FREE_AD_SUPPORTED':
        freeAdStreams += streams
        freeAdRevenue += revenue
        if (revenue > 0) {
          monetizableStreams += streams
          monetizableRevenue += revenue
        }
        break
      case 'FREE_TRIAL':
        hasFreeTrialRecord = true
        freeTrialStreams += streams
        freeTrialRevenue += revenue
        break
      case 'UNQUALIFIED':
        unqualifiedStreams += streams
        unqualifiedRevenue += revenue
        break
      case 'FRAUDULENT':
        fraudulentStreams += streams
        fraudulentRevenue += revenue
        break
      case 'OTHER':
        otherStreams += streams
        otherRevenue += revenue
        break
      case 'UNKNOWN':
        unknownStreams += streams
        unknownRevenue += revenue
        break
    }
  }

  const totalStreams =
    fullPayStreams + freeAdStreams + freeTrialStreams +
    unqualifiedStreams + fraudulentStreams + otherStreams + unknownStreams

  const totalRevenue =
    fullPayRevenue + freeAdRevenue + freeTrialRevenue +
    unqualifiedRevenue + fraudulentRevenue + otherRevenue + unknownRevenue

  return {
    FULL_PAY:          { streams: fullPayStreams,     revenue: fullPayRevenue },
    FREE_AD_SUPPORTED: { streams: freeAdStreams,      revenue: freeAdRevenue },
    FREE_TRIAL:        hasFreeTrialRecord
                         ? { streams: freeTrialStreams, revenue: freeTrialRevenue }
                         : null,
    UNQUALIFIED:       { streams: unqualifiedStreams, revenue: unqualifiedRevenue },
    FRAUDULENT:        { streams: fraudulentStreams,  revenue: fraudulentRevenue },
    OTHER:             { streams: otherStreams,       revenue: otherRevenue },
    UNKNOWN:           { streams: unknownStreams,     revenue: unknownRevenue },
    total:             { streams: totalStreams,       revenue: totalRevenue },
    monetizable:       { streams: monetizableStreams, revenue: monetizableRevenue },
  }
}

// ─── PlatformSummary ─────────────────────────────────────────────────────────

/**
 * Per-DSP breakdown with effective rate per 1000 streams.
 * effectivePer1000: label "Promedio efectivo según este reporte"
 * Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 8.2, 8.3
 */
export interface PlatformSummary {
  platform: string
  breakdown: StreamCategoryBreakdown
  /** null when total streams = 0; label: "Promedio efectivo según este reporte" */
  effectivePer1000: number | null
}

// ─── CountrySummary ───────────────────────────────────────────────────────────

/**
 * Per (platform, country) breakdown.
 * Requirements: 6.1, 6.2, 6.3
 */
export interface CountrySummary {
  platform: string
  country: string
  breakdown: StreamCategoryBreakdown
}

// ─── MatrixRow ────────────────────────────────────────────────────────────────

/**
 * Flat entry for the platform × country matrix table.
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export interface MatrixRow {
  platform: string
  country:  string
  breakdown: StreamCategoryBreakdown
}

// ─── computePlatformSummaries() ───────────────────────────────────────────────

/**
 * Groups records by platform, computes a StreamCategoryBreakdown per group,
 * and calculates effectivePer1000 = (total revenue / total streams) * 1000.
 * effectivePer1000 is null when total streams = 0.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
export function computePlatformSummaries(records: OrchardRecord[]): PlatformSummary[] {
  // Group records by platform
  const groups = new Map<string, OrchardRecord[]>()

  for (const r of records) {
    const key = r.platform
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(r)
  }

  const summaries: PlatformSummary[] = []

  for (const [platform, group] of groups) {
    const breakdown = computeBreakdown(group)
    const totalStreams = breakdown.total.streams
    const totalRevenue = breakdown.total.revenue

    const effectivePer1000: number | null =
      totalStreams > 0 ? (totalRevenue / totalStreams) * 1000 : null

    summaries.push({ platform, breakdown, effectivePer1000 })
  }

  return summaries
}

// ─── computeCountrySummaries() ────────────────────────────────────────────────

/**
 * Groups records by (platform, country) composite key and computes a
 * StreamCategoryBreakdown per group.
 *
 * Requirements: 6.1, 6.2, 6.3
 */
export function computeCountrySummaries(records: OrchardRecord[]): CountrySummary[] {
  // Group records by composite key "platform|||country"
  const groups = new Map<string, OrchardRecord[]>()

  for (const r of records) {
    const key = `${r.platform}|||${r.country}`
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(r)
  }

  const summaries: CountrySummary[] = []

  for (const [compositeKey, group] of groups) {
    const separatorIdx = compositeKey.indexOf('|||')
    const platform = compositeKey.slice(0, separatorIdx)
    const country  = compositeKey.slice(separatorIdx + 3)
    const breakdown = computeBreakdown(group)
    summaries.push({ platform, country, breakdown })
  }

  return summaries
}

// ─── computeMatrix() ─────────────────────────────────────────────────────────

/**
 * Returns a flat list of MatrixRow — one entry per unique (platform, country) pair.
 * Uses the same grouping logic as computeCountrySummaries but returns MatrixRow[].
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export function computeMatrix(records: OrchardRecord[]): MatrixRow[] {
  // Group records by composite key "platform|||country"
  const groups = new Map<string, OrchardRecord[]>()

  for (const r of records) {
    const key = `${r.platform}|||${r.country}`
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(r)
  }

  const rows: MatrixRow[] = []

  for (const [compositeKey, group] of groups) {
    const separatorIdx = compositeKey.indexOf('|||')
    const platform = compositeKey.slice(0, separatorIdx)
    const country  = compositeKey.slice(separatorIdx + 3)
    const breakdown = computeBreakdown(group)
    rows.push({ platform, country, breakdown })
  }

  return rows
}

// ─── ArtistSummary ────────────────────────────────────────────────────────────

/**
 * Per-artist breakdown with per-platform detail.
 * Requirements: 9.1, 9.2, 9.3
 */
export interface ArtistSummary {
  artist: string
  breakdown: StreamCategoryBreakdown
  platforms: PlatformSummary[]
}

// ─── TrackSummary ─────────────────────────────────────────────────────────────

/**
 * Per-track breakdown with ISRC and per-platform detail.
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
export interface TrackSummary {
  track: string
  artist: string
  isrc: string
  breakdown: StreamCategoryBreakdown
  platforms: PlatformSummary[]
}

// ─── ReleaseSummary ───────────────────────────────────────────────────────────

/**
 * Per-release (album) breakdown with UPC.
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */
export interface ReleaseSummary {
  release: string
  artist: string
  upc: string
  breakdown: StreamCategoryBreakdown
}

// ─── NoRoyaltyEntry ───────────────────────────────────────────────────────────

/**
 * Grouped zero/negative revenue entry with cause classification.
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
export interface NoRoyaltyEntry {
  normalizedStreamType: StreamCategory
  streams: number
  platform: string
  country: string
  cause: 'UNQUALIFIED' | 'FRAUDULENT' | 'FREE_AD_ZERO' | 'FREE_TRIAL_ZERO' | 'OTHER_ZERO' | 'UNKNOWN_ZERO'
  rowIndexes: number[]
}

// ─── ReconciliationResult ─────────────────────────────────────────────────────

/**
 * Stream and revenue reconciliation across all categories.
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */
export interface ReconciliationResult {
  totalStreams:         number
  categorizedStreams:   number
  uncategorizedStreams: number   // should be 0
  totalRevenue:        number
  categorizedRevenue:  number
  revenueDiscrepancy:  number   // abs difference; alert when > 0.01
  byPlatform: Array<{
    platform: string
    streamDelta: number
    revenueDelta: number
  }>
  isClean: boolean  // true only when uncategorizedStreams === 0 && revenueDiscrepancy <= 0.01
}

// ─── computeArtistSummaries() ─────────────────────────────────────────────────

/**
 * Groups records by artist, computes a StreamCategoryBreakdown per group,
 * and includes per-platform breakdown for each artist.
 *
 * Requirements: 9.1, 9.2, 9.3
 */
export function computeArtistSummaries(records: OrchardRecord[]): ArtistSummary[] {
  // Group by artist
  const groups = new Map<string, OrchardRecord[]>()

  for (const r of records) {
    const key = r.artist
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(r)
  }

  const summaries: ArtistSummary[] = []

  for (const [artist, group] of groups) {
    const breakdown = computeBreakdown(group)
    const platforms = computePlatformSummaries(group)
    summaries.push({ artist, breakdown, platforms })
  }

  return summaries
}

// ─── computeTrackSummaries() ─────────────────────────────────────────────────

/**
 * Groups records by (track, artist) composite key, computes a StreamCategoryBreakdown
 * per group, and includes ISRC from the first record of each group.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
export function computeTrackSummaries(records: OrchardRecord[]): TrackSummary[] {
  // Group by composite key "track|||artist"
  const groups = new Map<string, OrchardRecord[]>()

  for (const r of records) {
    const key = `${r.track}|||${r.artist}`
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(r)
  }

  const summaries: TrackSummary[] = []

  for (const [compositeKey, group] of groups) {
    const separatorIdx = compositeKey.indexOf('|||')
    const track  = compositeKey.slice(0, separatorIdx)
    const artist = compositeKey.slice(separatorIdx + 3)
    const isrc = group[0].isrc
    const breakdown = computeBreakdown(group)
    const platforms = computePlatformSummaries(group)
    summaries.push({ track, artist, isrc, breakdown, platforms })
  }

  return summaries
}

// ─── computeReleaseSummaries() ────────────────────────────────────────────────

/**
 * Groups records by (album, artist) composite key, computes a StreamCategoryBreakdown
 * per group, and includes UPC from the first record of each group.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */
export function computeReleaseSummaries(records: OrchardRecord[]): ReleaseSummary[] {
  // Group by composite key "album|||artist"
  const groups = new Map<string, OrchardRecord[]>()

  for (const r of records) {
    const key = `${r.album}|||${r.artist}`
    let group = groups.get(key)
    if (!group) {
      group = []
      groups.set(key, group)
    }
    group.push(r)
  }

  const summaries: ReleaseSummary[] = []

  for (const [compositeKey, group] of groups) {
    const separatorIdx = compositeKey.indexOf('|||')
    const release = compositeKey.slice(0, separatorIdx)
    const artist  = compositeKey.slice(separatorIdx + 3)
    const upc = group[0].upc
    const breakdown = computeBreakdown(group)
    summaries.push({ release, artist, upc, breakdown })
  }

  return summaries
}

// ─── computeNoRoyaltyReport() ─────────────────────────────────────────────────

/**
 * Maps a StreamCategory to its NoRoyaltyEntry cause label.
 */
function toCause(cat: StreamCategory): NoRoyaltyEntry['cause'] {
  switch (cat) {
    case 'UNQUALIFIED':       return 'UNQUALIFIED'
    case 'FRAUDULENT':        return 'FRAUDULENT'
    case 'FREE_AD_SUPPORTED': return 'FREE_AD_ZERO'
    case 'FREE_TRIAL':        return 'FREE_TRIAL_ZERO'
    case 'OTHER':             return 'OTHER_ZERO'
    default:                  return 'UNKNOWN_ZERO'  // FULL_PAY, UNKNOWN, or anything else
  }
}

/**
 * Filters records where net_total <= 0 and groups them by
 * (normalizedStreamType, platform, country).
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
export function computeNoRoyaltyReport(records: OrchardRecord[]): NoRoyaltyEntry[] {
  // Key: "category|||platform|||country"
  const groups = new Map<string, {
    normalizedStreamType: StreamCategory
    platform: string
    country: string
    streams: number
    rowIndexes: number[]
  }>()

  for (const r of records) {
    if (r.net_total > 0) continue  // only zero/negative revenue

    const key = `${r.normalizedStreamType}|||${r.platform}|||${r.country}`
    let entry = groups.get(key)
    if (!entry) {
      entry = {
        normalizedStreamType: r.normalizedStreamType,
        platform: r.platform,
        country: r.country,
        streams: 0,
        rowIndexes: [],
      }
      groups.set(key, entry)
    }
    entry.streams += r.quantity
    entry.rowIndexes.push(r.rowIndex)
  }

  const result: NoRoyaltyEntry[] = []

  for (const entry of groups.values()) {
    result.push({
      normalizedStreamType: entry.normalizedStreamType,
      streams: entry.streams,
      platform: entry.platform,
      country: entry.country,
      cause: toCause(entry.normalizedStreamType),
      rowIndexes: entry.rowIndexes,
    })
  }

  return result
}

// ─── computeReconciliation() ─────────────────────────────────────────────────

/**
 * Computes stream and revenue reconciliation across all 7 categories.
 *
 * - totalStreams = sum of all quantity
 * - categorizedStreams = sum of quantity grouped by all 7 categories (should equal totalStreams)
 * - uncategorizedStreams = totalStreams - categorizedStreams (should always be 0)
 * - totalRevenue = sum of all net_total
 * - categorizedRevenue = sum of net_total grouped by all 7 categories
 * - revenueDiscrepancy = Math.abs(totalRevenue - categorizedRevenue)
 * - isClean = uncategorizedStreams === 0 && revenueDiscrepancy <= 0.01
 * - byPlatform: per-platform streamDelta and revenueDelta
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */
export function computeReconciliation(records: OrchardRecord[]): ReconciliationResult {
  let totalStreams    = 0
  let totalRevenue   = 0

  // Categorized sums (all 7 categories — these should equal totals)
  let catStreams  = 0
  let catRevenue = 0

  // Per-platform maps
  const platformTotalStreams  = new Map<string, number>()
  const platformTotalRevenue  = new Map<string, number>()
  const platformCatStreams    = new Map<string, number>()
  const platformCatRevenue    = new Map<string, number>()

  for (const r of records) {
    totalStreams  += r.quantity
    totalRevenue  += r.net_total

    // All 7 categories → all records are "categorized" by design
    catStreams  += r.quantity
    catRevenue += r.net_total

    // Per-platform totals
    const p = r.platform
    platformTotalStreams.set(p,  (platformTotalStreams.get(p)  ?? 0) + r.quantity)
    platformTotalRevenue.set(p,  (platformTotalRevenue.get(p)  ?? 0) + r.net_total)
    platformCatStreams.set(p,    (platformCatStreams.get(p)    ?? 0) + r.quantity)
    platformCatRevenue.set(p,   (platformCatRevenue.get(p)   ?? 0) + r.net_total)
  }

  const uncategorizedStreams = totalStreams - catStreams  // always 0 in this model
  const revenueDiscrepancy   = Math.abs(totalRevenue - catRevenue)

  // Build byPlatform list — streamDelta and revenueDelta (total - categorized, ideally 0)
  const allPlatforms = new Set<string>([
    ...platformTotalStreams.keys(),
    ...platformCatStreams.keys(),
  ])

  const byPlatform: Array<{ platform: string; streamDelta: number; revenueDelta: number }> = []

  for (const platform of allPlatforms) {
    const streamDelta  = (platformTotalStreams.get(platform)  ?? 0) - (platformCatStreams.get(platform)  ?? 0)
    const revenueDelta = (platformTotalRevenue.get(platform)  ?? 0) - (platformCatRevenue.get(platform)  ?? 0)
    byPlatform.push({ platform, streamDelta, revenueDelta })
  }

  return {
    totalStreams,
    categorizedStreams: catStreams,
    uncategorizedStreams,
    totalRevenue,
    categorizedRevenue: catRevenue,
    revenueDiscrepancy,
    byPlatform,
    isClean: uncategorizedStreams === 0 && revenueDiscrepancy <= 0.01,
  }
}

// ─── rankByRevenue() ─────────────────────────────────────────────────────────

/**
 * Sorts any array of items that have a breakdown field by total revenue, descending.
 * Returns a new array — original is not mutated.
 *
 * Requirements: 18.2
 */
export function rankByRevenue<T extends { breakdown: StreamCategoryBreakdown }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.breakdown.total.revenue - a.breakdown.total.revenue)
}

// ─── computeRankings() ───────────────────────────────────────────────────────

/**
 * Returns all summary collections sorted by revenue descending.
 *
 * Requirements: 18.2
 */
export function computeRankings(records: OrchardRecord[]): {
  platforms: PlatformSummary[]
  countries: CountrySummary[]
  artists:   ArtistSummary[]
  tracks:    TrackSummary[]
} {
  return {
    platforms: rankByRevenue(computePlatformSummaries(records)),
    countries: rankByRevenue(computeCountrySummaries(records)),
    artists:   rankByRevenue(computeArtistSummaries(records)),
    tracks:    rankByRevenue(computeTrackSummaries(records)),
  }
}

// ─── getDateRange() ──────────────────────────────────────────────────────────

/**
 * Returns the min and max sale_period strings across all records.
 * Returns null if records array is empty.
 *
 * Requirements: 18.2
 */
export function getDateRange(records: OrchardRecord[]): { min: string; max: string } | null {
  if (records.length === 0) return null

  let min = records[0].sale_period
  let max = records[0].sale_period

  for (let i = 1; i < records.length; i++) {
    const p = records[i].sale_period
    if (p < min) min = p
    if (p > max) max = p
  }

  return { min, max }
}
