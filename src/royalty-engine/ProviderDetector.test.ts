/**
 * ProviderDetector.test.ts
 *
 * Unit tests for detectProvider().
 * Covers: Requirement 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectProvider } from './ProviderDetector'
import { Logger } from './Logger'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Logger and capture calls for assertion. */
function makeLogger() {
  const logger = new Logger()
  vi.spyOn(logger, 'info')
  vi.spyOn(logger, 'warn')
  return logger
}

// ---------------------------------------------------------------------------
// Detection from file name (Req 3.1)
// ---------------------------------------------------------------------------

describe('detectProvider — file name signals', () => {
  it('detects Ditto from file name', () => {
    expect(detectProvider('ditto_report_2024.csv', [])).toBe('Ditto')
  })

  it('detects DistroKid from file name', () => {
    expect(detectProvider('distrokid_earnings_march.tsv', [])).toBe('DistroKid')
  })

  it('detects TuneCore from file name', () => {
    expect(detectProvider('TuneCore_royalties.xlsx', [])).toBe('TuneCore')
  })

  it('detects CD Baby from file name', () => {
    expect(detectProvider('cdbaby_report.csv', [])).toBe('CD Baby')
  })

  it('detects Believe from file name', () => {
    expect(detectProvider('believe_statement.xlsx', [])).toBe('Believe')
  })

  it('detects FUGA from file name', () => {
    expect(detectProvider('FUGA_export_q1.csv', [])).toBe('FUGA')
  })

  it('detects Symphonic from file name', () => {
    expect(detectProvider('Symphonic_2024.csv', [])).toBe('Symphonic')
  })

  it('detects ONErpm from file name', () => {
    expect(detectProvider('onerpm_statement.csv', [])).toBe('ONErpm')
  })

  it('detects Too Lost from file name (normalized: toolost)', () => {
    expect(detectProvider('toolost_report.csv', [])).toBe('Too Lost')
  })

  it('detects Amuse from file name', () => {
    expect(detectProvider('amuse_royalties.csv', [])).toBe('Amuse')
  })

  it('detects RouteNote from file name', () => {
    expect(detectProvider('routenote_earnings.xlsx', [])).toBe('RouteNote')
  })

  it('detects UnitedMasters from file name', () => {
    expect(detectProvider('unitedmasters_report.csv', [])).toBe('UnitedMasters')
  })

  it('detects Spotify from file name', () => {
    expect(detectProvider('spotify_royalty_statement.csv', [])).toBe('Spotify')
  })

  it('detects Apple Music from file name (applemusic)', () => {
    expect(detectProvider('applemusic_report.csv', [])).toBe('Apple Music')
  })

  it('detects Amazon Music from file name (amazonmusic)', () => {
    expect(detectProvider('amazonmusic_earnings.csv', [])).toBe('Amazon Music')
  })

  it('detects Tidal from file name', () => {
    expect(detectProvider('tidal_statement_2024.csv', [])).toBe('Tidal')
  })

  it('detects YouTube from file name', () => {
    expect(detectProvider('youtube_content_id.csv', [])).toBe('YouTube')
  })

  it('detects TikTok from file name', () => {
    expect(detectProvider('tiktok_earnings.csv', [])).toBe('TikTok')
  })

  it('detects Meta from file name (meta)', () => {
    expect(detectProvider('meta_royalties.csv', [])).toBe('Meta')
  })

  it('detects Meta from file name (facebook)', () => {
    expect(detectProvider('facebook_music_report.csv', [])).toBe('Meta')
  })
})

// ---------------------------------------------------------------------------
// Detection from normalized column headers (Req 3.1)
// ---------------------------------------------------------------------------

describe('detectProvider — normalized header signals', () => {
  it('detects Ditto from headers (tenantid)', () => {
    expect(detectProvider('report.csv', ['tenantid', 'nettotal', 'artist'])).toBe('Ditto')
  })

  it('detects DistroKid from headers (youearned)', () => {
    expect(detectProvider('data.csv', ['youearned', 'isrc', 'country'])).toBe('DistroKid')
  })

  it('detects FUGA from headers (fugamusic)', () => {
    expect(detectProvider('export.csv', ['fugamusic', 'royaltyamount'])).toBe('FUGA')
  })

  it('detects YouTube from headers (partnerrevenue)', () => {
    expect(detectProvider('report.csv', ['partnerrevenue', 'contentid', 'country'])).toBe('YouTube')
  })

  it('detects TikTok from headers (tiktok)', () => {
    expect(detectProvider('report.csv', ['tiktok', 'royalty', 'artist'])).toBe('TikTok')
  })

  it('detects TikTok from headers (bytedance)', () => {
    expect(detectProvider('report.csv', ['bytedance', 'royalty'])).toBe('TikTok')
  })

  it('detects Meta from headers (instagram)', () => {
    expect(detectProvider('report.csv', ['instagram', 'royalty'])).toBe('Meta')
  })

  it('detects RouteNote from headers (routenote)', () => {
    expect(detectProvider('report.xlsx', ['routenote', 'netamount'])).toBe('RouteNote')
  })

  it('detects UnitedMasters from headers (unitedmasters)', () => {
    expect(detectProvider('report.xlsx', ['unitedmasters', 'royaltyamount'])).toBe('UnitedMasters')
  })
})

// ---------------------------------------------------------------------------
// UNKNOWN fallback (Req 3.3)
// ---------------------------------------------------------------------------

describe('detectProvider — UNKNOWN fallback', () => {
  it('returns UNKNOWN when no signals match', () => {
    expect(detectProvider('report.csv', ['col1', 'col2', 'col3'])).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for an empty file name and empty headers', () => {
    expect(detectProvider('', [])).toBe('UNKNOWN')
  })

  it('returns UNKNOWN for a generic filename with no matching headers', () => {
    expect(detectProvider('royalties_2024.csv', ['artist', 'track', 'amount'])).toBe('UNKNOWN')
  })
})

// ---------------------------------------------------------------------------
// Logging (Req 3.4, 3.5)
// ---------------------------------------------------------------------------

describe('detectProvider — logging', () => {
  it('logs [INFO] with detected provider name (Req 3.4)', () => {
    const logger = makeLogger()
    detectProvider('ditto_report.csv', [], logger)
    expect(logger.info).toHaveBeenCalledWith('Proveedor detectado: Ditto')
  })

  it('logs [INFO] for each of the new providers: UnitedMasters', () => {
    const logger = makeLogger()
    detectProvider('unitedmasters_report.csv', [], logger)
    expect(logger.info).toHaveBeenCalledWith('Proveedor detectado: UnitedMasters')
  })

  it('logs [INFO] for FUGA', () => {
    const logger = makeLogger()
    detectProvider('fuga_export.csv', [], logger)
    expect(logger.info).toHaveBeenCalledWith('Proveedor detectado: FUGA')
  })

  it('logs [INFO] for RouteNote', () => {
    const logger = makeLogger()
    detectProvider('routenote.csv', [], logger)
    expect(logger.info).toHaveBeenCalledWith('Proveedor detectado: RouteNote')
  })

  it('logs [INFO] for Too Lost', () => {
    const logger = makeLogger()
    detectProvider('toolost_report.csv', [], logger)
    expect(logger.info).toHaveBeenCalledWith('Proveedor detectado: Too Lost')
  })

  it('logs [INFO] for TikTok', () => {
    const logger = makeLogger()
    detectProvider('tiktok_earnings.csv', [], logger)
    expect(logger.info).toHaveBeenCalledWith('Proveedor detectado: TikTok')
  })

  it('logs [INFO] for Meta', () => {
    const logger = makeLogger()
    detectProvider('meta_report.csv', [], logger)
    expect(logger.info).toHaveBeenCalledWith('Proveedor detectado: Meta')
  })

  it('logs [INFO] "Proveedor detectado: UNKNOWN" when no match (Req 3.4)', () => {
    const logger = makeLogger()
    detectProvider('unknown_report.csv', [], logger)
    expect(logger.info).toHaveBeenCalledWith('Proveedor detectado: UNKNOWN')
  })

  it('logs [WARN] "estrategia genérica en uso" when UNKNOWN (Req 3.5)', () => {
    const logger = makeLogger()
    detectProvider('unknown_report.csv', [], logger)
    expect(logger.warn).toHaveBeenCalledWith('estrategia genérica en uso')
  })

  it('does NOT log [WARN] when a provider is successfully detected', () => {
    const logger = makeLogger()
    detectProvider('ditto_report.csv', [], logger)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('works without a logger (no error thrown)', () => {
    expect(() => detectProvider('report.csv', [])).not.toThrow()
    expect(() => detectProvider('unknown.csv', [])).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tiebreak rule — first in list wins (Req 3 — design tiebreak)
// ---------------------------------------------------------------------------

describe('detectProvider — tiebreak: first in list wins', () => {
  it('Ditto wins over DistroKid when both appear in file name', () => {
    // 'ditto' appears before 'distrokid' in PROVIDERS, so Ditto wins
    const result = detectProvider('ditto_distrokid_combined.csv', [])
    expect(result).toBe('Ditto')
  })

  it('first header signal match wins over a later provider', () => {
    // tunecore appears before cdbaby in the list
    const result = detectProvider('report.csv', ['tunecore', 'cdbaby'])
    expect(result).toBe('TuneCore')
  })

  it('file name signal takes priority over header when file name matches first provider', () => {
    // File name has 'ditto', headers have 'youearned' (DistroKid)
    // Ditto is earlier in the list AND the file name match fires first in combined
    const result = detectProvider('ditto_report.csv', ['youearned', 'bankname'])
    expect(result).toBe('Ditto')
  })
})

// ---------------------------------------------------------------------------
// Normalization — signals work regardless of casing in file name (Req 3.1)
// ---------------------------------------------------------------------------

describe('detectProvider — file name normalization', () => {
  it('detects DistroKid from mixed-case file name', () => {
    expect(detectProvider('DistroKid_Report_2024.TSV', [])).toBe('DistroKid')
  })

  it('detects TuneCore from uppercase file name', () => {
    expect(detectProvider('TUNECORE_MARCH.CSV', [])).toBe('TuneCore')
  })

  it('detects FUGA from file name with hyphens and underscores', () => {
    expect(detectProvider('FUGA-Music_Export_2024.csv', [])).toBe('FUGA')
  })

  it('detects UnitedMasters from file name with spaces replaced by underscores', () => {
    expect(detectProvider('United_Masters_report.csv', [])).toBe('UnitedMasters')
  })

  it('detects Too Lost from file name written as "Too-Lost"', () => {
    expect(detectProvider('Too-Lost-statement.csv', [])).toBe('Too Lost')
  })
})
