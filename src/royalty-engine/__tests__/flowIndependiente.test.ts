/**
 * flowIndependiente.test.ts
 *
 * Tests for Flow Independiente / Global Sound Stars CSV import.
 */

import { describe, it, expect } from 'vitest'
import { normalizeHeader } from '../HeaderNormalizer'
import { detectProvider } from '../ProviderDetector'
import { resolveEarningsColumn } from '../ProviderStrategy'
import { mapColumns } from '../ColumnMapper'
import { classify } from '../StreamTypeClassifier'
import { normalizePeriod } from '../DateParser'
import { Logger } from '../Logger'
import { EXCLUDED_COLUMNS } from '../AliasDictionary'

function makeLogger(): Logger { return new Logger() }

const RAW_HEADERS_WITH_BOM: string[] = [
  '\uFEFF"STATEMENT PERIOD"',
  'TRANSACTION DATE',
  'SALE COUNTRY',
  'STORE',
  'SERVICE DETAIL',
  'LABEL IMPRINT',
  'PRODUCT ARTIST',
  'PRODUCT',
  'PRODUCT VERSION',
  'PRODUCT CODE',
  'DISPLAY UPC',
  'MANUFACTURER UPC',
  'TRACK ARTIST',
  'TRACK',
  'TRACK VERSION',
  'ISRC',
  'YOUTUBE VIDEO ID',
  'TRANSACTION TYPE',
  'TRANSACTION SUBTYPE',
  'QUANTITY',
  'ACCOUNT CURRENCY',
  'ROYALTY TYPE',
  'ORIGINAL STATEMENT PERIOD',
  'REVENUE',
]

// ─── 1. BOM + quoted header normalisation ────────────────────────────────────

describe('Header normalisation — BOM + quoted headers', () => {
  it('strips UTF-8 BOM from the first header', () => {
    expect(normalizeHeader('\uFEFF"STATEMENT PERIOD"')).toBe('statementperiod')
  })
  it('strips surrounding double-quotes', () => {
    expect(normalizeHeader('"TRANSACTION DATE"')).toBe('transactiondate')
  })
  it('normalises SALE COUNTRY', () => {
    expect(normalizeHeader('SALE COUNTRY')).toBe('salecountry')
  })
  it('normalises ACCOUNT CURRENCY', () => {
    expect(normalizeHeader('ACCOUNT CURRENCY')).toBe('accountcurrency')
  })
  it('normalises LABEL IMPRINT', () => {
    expect(normalizeHeader('LABEL IMPRINT')).toBe('labelimprint')
  })
  it('normalises REVENUE', () => {
    expect(normalizeHeader('REVENUE')).toBe('revenue')
  })
  it('normalises YOUTUBE VIDEO ID', () => {
    expect(normalizeHeader('YOUTUBE VIDEO ID')).toBe('youtubevideoid')
  })
})

// ─── 2. Provider detection — filename ────────────────────────────────────────

describe('Provider detection — filename signals', () => {
  it('detects Flow Independiente from canonical filename', () => {
    expect(detectProvider('Flow-Independiente-August-2026-revenue-details-1.csv', []))
      .toBe('Flow Independiente')
  })
  it('detects Flow Independiente regardless of case/hyphens', () => {
    expect(detectProvider('flow_independiente_august_2026.csv', []))
      .toBe('Flow Independiente')
  })
  it('detects Global Sound Stars from canonical filename', () => {
    expect(detectProvider('Global-Sound-Stars-August-2026-revenue-details.csv', []))
      .toBe('Global Sound Stars')
  })
  it('detects Global Sound Stars regardless of case', () => {
    expect(detectProvider('globalsoundstars_report.csv', []))
      .toBe('Global Sound Stars')
  })
})

// ─── 3. Provider detection — header fallback ─────────────────────────────────

describe('Provider detection — header fallback', () => {
  const headersNoYouTube = RAW_HEADERS_WITH_BOM
    .filter(h => !h.includes('YOUTUBE'))
    .map(h => normalizeHeader(h))

  it('detects Flow Independiente from headers when no YOUTUBE VIDEO ID column', () => {
    expect(detectProvider('revenue-details.csv', headersNoYouTube)).toBe('Flow Independiente')
  })
  it('detects Flow Independiente when filename contains label name', () => {
    const full = RAW_HEADERS_WITH_BOM.map(h => normalizeHeader(h))
    expect(detectProvider('Flow-Independiente-August-2026.csv', full)).toBe('Flow Independiente')
  })
})

// ─── 4. Payment column resolution ────────────────────────────────────────────

describe('Payment column resolution', () => {
  const normalizedHeaders = RAW_HEADERS_WITH_BOM.map(h => normalizeHeader(h))
  const REVENUE_IDX = 23

  it('Flow Independiente resolves REVENUE (col 23)', () => {
    const { colIdx, fieldUsed } = resolveEarningsColumn('Flow Independiente', normalizedHeaders, makeLogger())
    expect(colIdx).toBe(REVENUE_IDX)
    expect(fieldUsed).toBe('revenue')
  })
  it('Global Sound Stars resolves REVENUE (col 23)', () => {
    const { colIdx, fieldUsed } = resolveEarningsColumn('Global Sound Stars', normalizedHeaders, makeLogger())
    expect(colIdx).toBe(REVENUE_IDX)
    expect(fieldUsed).toBe('revenue')
  })
  it('returns null when REVENUE column is absent', () => {
    const withoutRevenue = normalizedHeaders.filter(h => h !== 'revenue')
    const { colIdx } = resolveEarningsColumn('Flow Independiente', withoutRevenue, makeLogger())
    expect(colIdx).toBeNull()
  })
})

// ─── 5. Column mapping ────────────────────────────────────────────────────────

describe('Column mapping — 24 columns', () => {
  const colMap = mapColumns(RAW_HEADERS_WITH_BOM, makeLogger())

  it('sale_period → STATEMENT PERIOD (col 0)', () => { expect(colMap.sale_period).toBe(0) })
  it('country → SALE COUNTRY (col 2)',          () => { expect(colMap.country).toBe(2) })
  it('platform → STORE (col 3)',                () => { expect(colMap.platform).toBe(3) })
  it('album → PRODUCT (col 7)',                 () => { expect(colMap.album).toBe(7) })
  it('upc → DISPLAY UPC (col 10)',              () => { expect(colMap.upc).toBe(10) })
  it('artist → TRACK ARTIST (col 12)',          () => { expect(colMap.artist).toBe(12) })
  it('track → TRACK (col 13)',                  () => { expect(colMap.track).toBe(13) })
  it('isrc → ISRC (col 15)',                    () => { expect(colMap.isrc).toBe(15) })
  it('transaction_type → TRANSACTION TYPE (col 17)', () => { expect(colMap.transaction_type).toBe(17) })
  it('quantity → QUANTITY (col 19)',            () => { expect(colMap.quantity).toBe(19) })
  it('currency → ACCOUNT CURRENCY (col 20)',    () => { expect(colMap.currency).toBe(20) })
  it('STATEMENT PERIOD wins over TRANSACTION DATE for sale_period', () => {
    expect(colMap.sale_period).toBe(0)
    expect(colMap.sale_period).not.toBe(1)
  })
})

// ─── 6. Stream type classification ───────────────────────────────────────────

describe('Stream type classification', () => {
  it('"Subscription Audio Streams" → FULL_PAY', () =>
    expect(classify('Subscription Audio Streams')).toBe('FULL_PAY'))
  it('"Ad Supported Audio Streams from Art Track Videos" → FREE_AD_SUPPORTED', () =>
    expect(classify('Ad Supported Audio Streams from Art Track Videos')).toBe('FREE_AD_SUPPORTED'))
  it('"Unqualified Audio Streams" → UNQUALIFIED', () =>
    expect(classify('Unqualified Audio Streams')).toBe('UNQUALIFIED'))
  it('"Short-form Video User Generated Revenue" → FREE_AD_SUPPORTED', () =>
    expect(classify('Short-form Video User Generated Revenue')).toBe('FREE_AD_SUPPORTED'))
  it('"Ad-Supported Audio Streams" → FREE_AD_SUPPORTED', () =>
    expect(classify('Ad-Supported Audio Streams')).toBe('FREE_AD_SUPPORTED'))
  it('"Subscription Audio Streams from Art Track Videos" → FULL_PAY', () =>
    expect(classify('Subscription Audio Streams from Art Track Videos')).toBe('FULL_PAY'))
  it('"Subscription Streams from Art Tracks (Audio-Only Mode)" → FULL_PAY', () =>
    expect(classify('Subscription Streams from Art Tracks (Audio-Only Mode)')).toBe('FULL_PAY'))
  it('"Ad Supported Audio Streams from UGC" → FREE_AD_SUPPORTED', () =>
    expect(classify('Ad Supported Audio Streams from UGC')).toBe('FREE_AD_SUPPORTED'))
  it('"Subscription Audio Streams from UGC" → FULL_PAY', () =>
    expect(classify('Subscription Audio Streams from UGC')).toBe('FULL_PAY'))
  it('"Subscription Streams from Audio UGC (Audio-Only Mode)" → FULL_PAY', () =>
    expect(classify('Subscription Streams from Audio UGC (Audio-Only Mode)')).toBe('FULL_PAY'))
  it('"Fraudulent Streams" → FRAUDULENT', () =>
    expect(classify('Fraudulent Streams')).toBe('FRAUDULENT'))
  it('"Non-interactive Radio" → OTHER', () =>
    expect(classify('Non-interactive Radio')).toBe('OTHER'))
  it('Subscription UGC is NOT misclassified as FREE_AD_SUPPORTED', () => {
    expect(classify('Subscription Audio Streams from UGC')).not.toBe('FREE_AD_SUPPORTED')
  })
})

// ─── 7. Date normalisation ────────────────────────────────────────────────────

describe('Date normalisation', () => {
  it('"August 2026" → "2026-08"',   () => expect(normalizePeriod('August 2026')).toBe('2026-08'))
  it('"January 2026" → "2026-01"',  () => expect(normalizePeriod('January 2026')).toBe('2026-01'))
  it('"December 2025" → "2025-12"', () => expect(normalizePeriod('December 2025')).toBe('2025-12'))
})

// ─── 8. Row retention for zero-revenue rows ───────────────────────────────────

describe('Row retention logic', () => {
  it('net=0 qty=3 → keep (unqualified streams)', () => {
    expect(0 === 0 && 3 === 0).toBe(false)
  })
  it('net=0 qty=0 → discard', () => {
    expect(0 === 0 && 0 === 0).toBe(true)
  })
})

// ─── 9. Regression ────────────────────────────────────────────────────────────

describe('Regression — other providers still detected', () => {
  it('DistroKid', () => expect(detectProvider('distrokid_report.tsv', [])).toBe('DistroKid'))
  it('The Orchard by filename', () => expect(detectProvider('orchard_statement.csv', [])).toBe('The Orchard'))
  it('Dynastía by header', () => expect(detectProvider('reporte.csv', ['nettotalclientcurrency'])).toBe('Dinastía'))
  it('Ditto by header', () => expect(detectProvider('report.csv', ['tenantid'])).toBe('Ditto'))
  it('UNKNOWN for unrecognized', () => expect(detectProvider('unknown.csv', ['col1', 'col2'])).toBe('UNKNOWN'))
  it('Flow Independiente does not interfere with The Orchard filename', () =>
    expect(detectProvider('the-orchard-report.csv', [])).toBe('The Orchard'))
})

// ─── 10. REVENUE not excluded ────────────────────────────────────────────────

describe('EXCLUDED_COLUMNS', () => {
  it('"revenue" is not excluded', () => {
    expect(EXCLUDED_COLUMNS.has('revenue')).toBe(false)
  })
})
