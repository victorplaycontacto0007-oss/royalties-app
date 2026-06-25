/**
 * Finds the real header row in files that have preamble/metadata rows.
 * Scores each row by counting how many cells match known aliases.
 */
import { ALIAS_DICTIONARY } from './AliasDictionary'
import { normalizeHeader } from './HeaderNormalizer'

// All known normalized aliases flattened into a set for fast lookup
const ALL_ALIASES = new Set<string>()
for (const aliases of Object.values(ALIAS_DICTIONARY)) {
  for (const a of aliases) ALL_ALIASES.add(normalizeHeader(a))
}

// Strong markers that unambiguously identify a header row
const STRONG_MARKERS = new Set([
  'nettotal', 'grosstotal', 'isrc', 'upc', 'trackartists',
  'collaboratorshare', 'earningsusd', 'finalroyalty',
  'startdate', 'tenantid', 'channelcosts',
])

function scoreRow(row: string[]): number {
  let score = 0
  for (const cell of row) {
    const n = normalizeHeader((cell ?? '').toString())
    if (!n) continue
    if (STRONG_MARKERS.has(n)) score += 3
    else if (ALL_ALIASES.has(n)) score += 1
  }
  return score
}

export function findHeaderRow(rows: string[][]): number {
  // First: look for 2+ strong markers
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i]
    if (!row || row.length < 3) continue
    const strongHits = row.filter(c => STRONG_MARKERS.has(normalizeHeader((c ?? '').toString()))).length
    if (strongHits >= 2) return i
  }
  // Fallback: highest score
  let bestIdx = 0, bestScore = 0
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i]
    if (!row || row.length < 2) continue
    const s = scoreRow(row)
    if (s > bestScore) { bestScore = s; bestIdx = i }
  }
  return bestIdx
}
