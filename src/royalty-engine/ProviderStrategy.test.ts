/**
 * ProviderStrategy.test.ts
 *
 * Unit tests for ProviderStrategy module.
 * Covers: Requirement 4.1, 4.6, 4.7
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  PROVIDER_STRATEGIES,
  resolveEarningsColumn,
  type ProviderName,
} from './ProviderStrategy'
import { Logger } from './Logger'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return new Logger()
}

function logLines(logger: Logger): string[] {
  return logger.toStrings()
}

// ---------------------------------------------------------------------------
// PROVIDER_STRATEGIES shape
// ---------------------------------------------------------------------------

describe('PROVIDER_STRATEGIES', () => {
  const allProviders: ProviderName[] = [
    'Ditto', 'DistroKid', 'TuneCore', 'ONErpm', 'Believe',
    'CD Baby', 'Symphonic', 'UnitedMasters', 'FUGA', 'RouteNote',
    'Too Lost', 'Amuse', 'Spotify', 'Apple Music', 'Amazon Music',
    'Tidal', 'YouTube', 'TikTok', 'Meta', 'UNKNOWN',
  ]

  it('has an entry for every ProviderName (20 total)', () => {
    expect(Object.keys(PROVIDER_STRATEGIES)).toHaveLength(20)
    for (const p of allProviders) {
      expect(PROVIDER_STRATEGIES[p]).toBeDefined()
    }
  })

  it('every entry has at least one earningsCandidate', () => {
    for (const p of allProviders) {
      expect(PROVIDER_STRATEGIES[p].earningsCandidates.length).toBeGreaterThan(0)
    }
  })

  it('Ditto has secondaryField = "currencynettotal"', () => {
    expect(PROVIDER_STRATEGIES['Ditto'].secondaryField).toBe('currencynettotal')
  })

  it('Ditto primary candidate is "nettotal"', () => {
    expect(PROVIDER_STRATEGIES['Ditto'].earningsCandidates[0]).toBe('nettotal')
  })

  it('DistroKid candidates are in correct priority order', () => {
    expect(PROVIDER_STRATEGIES['DistroKid'].earningsCandidates).toEqual([
      'netearnings', 'royaltyamount', 'payment',
    ])
  })

  it('YouTube first candidate is "partnerrevenue"', () => {
    expect(PROVIDER_STRATEGIES['YouTube'].earningsCandidates[0]).toBe('partnerrevenue')
  })
})

// ---------------------------------------------------------------------------
// resolveEarningsColumn — primary candidate match (no fallback)
// ---------------------------------------------------------------------------

describe('resolveEarningsColumn — primary match', () => {
  it('returns colIdx when primary candidate is present', () => {
    const logger = makeLogger()
    const headers = ['artist', 'nettotal', 'currency']
    const result = resolveEarningsColumn('Ditto', headers, logger)

    expect(result.colIdx).toBe(1)
    expect(result.fieldUsed).toBe('nettotal')
  })

  it('logs [INFO] with correct message on primary match', () => {
    const logger = makeLogger()
    const headers = ['artist', 'nettotal', 'currency']
    resolveEarningsColumn('Ditto', headers, logger)

    const lines = logLines(logger)
    const infoLine = lines.find(l => l.startsWith('[INFO]'))
    expect(infoLine).toContain('nettotal')
    expect(infoLine).toContain('Ditto')
    expect(infoLine).not.toMatch(/\[WARN\]/)
  })

  it('does NOT log [WARN] when primary candidate is matched', () => {
    const logger = makeLogger()
    const headers = ['netearnings', 'artist']
    resolveEarningsColumn('DistroKid', headers, logger)

    const warnLines = logLines(logger).filter(l => l.startsWith('[WARN]'))
    expect(warnLines).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// resolveEarningsColumn — fallback (second or later candidate)
// ---------------------------------------------------------------------------

describe('resolveEarningsColumn — fallback candidate', () => {
  it('falls back to second candidate when primary is absent', () => {
    const logger = makeLogger()
    // DistroKid: ['netearnings', 'royaltyamount', 'payment']
    // Only 'royaltyamount' present
    const headers = ['artist', 'royaltyamount', 'country']
    const result = resolveEarningsColumn('DistroKid', headers, logger)

    expect(result.colIdx).toBe(1)
    expect(result.fieldUsed).toBe('royaltyamount')
  })

  it('logs [WARN] when using a fallback candidate', () => {
    const logger = makeLogger()
    const headers = ['artist', 'royaltyamount', 'country']
    resolveEarningsColumn('DistroKid', headers, logger)

    const warnLines = logLines(logger).filter(l => l.startsWith('[WARN]'))
    expect(warnLines.length).toBeGreaterThan(0)
    expect(warnLines[0]).toContain('royaltyamount')
  })

  it('still logs [INFO] for the selected column even on fallback', () => {
    const logger = makeLogger()
    const headers = ['payment']
    resolveEarningsColumn('DistroKid', headers, logger)

    const infoLines = logLines(logger).filter(l => l.startsWith('[INFO]'))
    expect(infoLines.length).toBeGreaterThan(0)
    expect(infoLines[0]).toContain('payment')
  })

  it('uses last candidate when earlier ones are absent', () => {
    const logger = makeLogger()
    // TuneCore: ['netrevenue', 'royaltyamount', 'netamount']
    const headers = ['netamount', 'artist']
    const result = resolveEarningsColumn('TuneCore', headers, logger)

    expect(result.colIdx).toBe(0)
    expect(result.fieldUsed).toBe('netamount')
  })

  // Property 4: first-match wins when multiple candidates present
  it('selects the earliest-priority candidate when multiple are in headers', () => {
    const logger = makeLogger()
    // ONErpm: ['netrevenue', 'amount', 'royalty']
    // All three present — must pick netrevenue (index 0 in candidates)
    const headers = ['royalty', 'amount', 'netrevenue']
    const result = resolveEarningsColumn('ONErpm', headers, logger)

    expect(result.fieldUsed).toBe('netrevenue')
    expect(result.colIdx).toBe(2) // position in normalizedHeaders array
  })
})

// ---------------------------------------------------------------------------
// resolveEarningsColumn — generic alias fallback (no strategy candidate found)
// ---------------------------------------------------------------------------

describe('resolveEarningsColumn — generic alias fallback', () => {
  it('returns colIdx from AliasDictionary net_total when no strategy candidate present', () => {
    const logger = makeLogger()
    // Ditto expects 'nettotal'; provide a known alias instead
    const headers = ['artist', 'earnings', 'country'] // 'earnings' is in ALIAS_DICTIONARY net_total
    const result = resolveEarningsColumn('Ditto', headers, logger)

    // 'earnings' is an alias for net_total in the dictionary
    expect(result.colIdx).not.toBeNull()
    expect(result.fieldUsed).toBe('earnings')
  })

  it('logs [ERROR] when no strategy candidate is found', () => {
    const logger = makeLogger()
    const headers = ['artist', 'earnings', 'country']
    resolveEarningsColumn('Ditto', headers, logger)

    const errorLines = logLines(logger).filter(l => l.startsWith('[ERROR]'))
    expect(errorLines.length).toBeGreaterThan(0)
    expect(errorLines[0]).toContain('net_total')
  })

  it('returns { colIdx: null, fieldUsed: null } when nothing matches at all', () => {
    const logger = makeLogger()
    // Provide headers with no known earnings-related column
    const headers = ['artistname', 'isrc', 'upc', 'country']
    const result = resolveEarningsColumn('Ditto', headers, logger)

    expect(result.colIdx).toBeNull()
    expect(result.fieldUsed).toBeNull()
  })

  it('logs [ERROR] even when ultimate fallback produces null', () => {
    const logger = makeLogger()
    const headers = ['artistname', 'isrc', 'upc']
    resolveEarningsColumn('Symphonic', headers, logger)

    const errorLines = logLines(logger).filter(l => l.startsWith('[ERROR]'))
    expect(errorLines.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// resolveEarningsColumn — UNKNOWN provider
// ---------------------------------------------------------------------------

describe('resolveEarningsColumn — UNKNOWN provider', () => {
  it('finds nettotal for UNKNOWN if present', () => {
    const logger = makeLogger()
    const headers = ['nettotal', 'artist']
    const result = resolveEarningsColumn('UNKNOWN', headers, logger)

    expect(result.colIdx).toBe(0)
    expect(result.fieldUsed).toBe('nettotal')
  })

  it('falls back through UNKNOWN candidates in order', () => {
    const logger = makeLogger()
    // UNKNOWN: ['nettotal', 'royalty', 'netrevenue', 'netearnings', 'netamount']
    // Only 'netearnings' present
    const headers = ['artist', 'netearnings', 'country']
    const result = resolveEarningsColumn('UNKNOWN', headers, logger)

    expect(result.fieldUsed).toBe('netearnings')
    expect(result.colIdx).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// resolveEarningsColumn — exact match only (no partial matching)
// ---------------------------------------------------------------------------

describe('resolveEarningsColumn — exact normalized match', () => {
  it('does not match partial strings', () => {
    const logger = makeLogger()
    // 'royaltyamounteur' should NOT match 'royaltyamount'
    const headers = ['royaltyamounteur', 'artist']
    const result = resolveEarningsColumn('UnitedMasters', headers, logger)

    // Should NOT pick 'royaltyamounteur' as 'royaltyamount' match
    expect(result.fieldUsed).not.toBe('royaltyamount')
  })
})
