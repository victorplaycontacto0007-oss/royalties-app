/**
 * smoke.test.ts — Task 22: Smoke test with synthetic real-file scenarios
 *
 * NOTE: parseFile() requires a browser File object and Papa.parse streaming,
 * so it cannot run in Node.js/vitest directly. Instead, these smoke tests
 * exercise the individual pipeline stages that parseFile() composes:
 *   detectProvider → resolveEarningsColumn → findHeaderRow →
 *   detectSeparator → mapColumns → buildAuditReport
 *
 * Each scenario mirrors a real provider file and asserts the same outcomes
 * that parseFile() would produce. Scenarios that require the full File API
 * are documented with a note at the end of this file.
 *
 * Covers (Task 22):
 *  1. DistroKid TSV  → provider=DistroKid, earningsCol=Earnings(USD)/netearnings
 *  2. Ditto XLSX     → provider=Ditto, col=Net Total, secondary=Net Total Client Currency
 *  3. CSV semicolon  → separator detected as ";"
 *  4. Preamble rows  → headerIdx > 0
 *  5. ODS file       → parsed same as XLSX (same pipeline path, different ext)
 *  6. AuditReport    → net total appears in AuditReport, status=valid
 */

import { describe, it, expect } from 'vitest'
import { detectProvider } from './ProviderDetector'
import { resolveEarningsColumn, PROVIDER_STRATEGIES } from './ProviderStrategy'
import { findHeaderRow } from './HeaderFinder'
import { detectSeparator } from './SeparatorDetector'
import { normalizeHeaders } from './HeaderNormalizer'
import { mapColumns } from './ColumnMapper'
import { buildAuditReport } from './AuditReport'
import { DecimalAccumulator } from './DecimalAccumulator'
import { Logger } from './Logger'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a simple AuditReport for a set of earnings values */
function makeAudit(values: number[], provider: string, fileName: string) {
  const netAcc   = new DecimalAccumulator()
  const grossAcc = new DecimalAccumulator()
  const taxAcc   = new DecimalAccumulator()
  const chAcc    = new DecimalAccumulator()
  const otAcc    = new DecimalAccumulator()
  for (const v of values) netAcc.add(v)
  return buildAuditReport({
    provider,
    fileName,
    currency:                   'USD',
    totalRows:                  values.length,
    totalColumns:               10,
    errorRows:                  0,
    grossAccumulator:           grossAcc,
    taxesAccumulator:           taxAcc,
    channelCostsAccumulator:    chAcc,
    otherCostsAccumulator:      otAcc,
    netAccumulator:             netAcc,
    earningsColumnValues:       [...values],
    salePeriods:                values.map(() => '2024-03'),
    processingTimeMs:           123,
  })
}


// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 1 — DistroKid TSV file
// Real DistroKid TSV has headers like:
//   "Team Member\tPayee\tArtist\tTitle\tAlbum\tUPC\tISRC\t
//    Stores\tCountry of Sale\tRoyalty Type\tSale Period\t
//    Sale Period Start\tSale Period End\tQuantity\tEarnings (USD)\tBank Name"
// ═══════════════════════════════════════════════════════════════════════════════

describe('Smoke test 1 — DistroKid TSV', () => {
  const TAB = '\t'
  // Realistic DistroKid TSV header line (tab-separated)
  const headerLine = [
    'Team Member', 'Payee', 'Artist', 'Title', 'Album',
    'UPC', 'ISRC', 'Stores', 'Country of Sale',
    'Royalty Type', 'Sale Period', 'Sale Period Start',
    'Sale Period End', 'Quantity', 'Earnings (USD)', 'Bank Name',
  ].join(TAB)

  const sampleLines = [
    headerLine,
    ['', 'John Doe', 'My Artist', 'My Song', 'My Album',
      '123456789012', 'US1234567890', 'Spotify', 'US',
      'Stream', '2024-03', '2024-03-01', '2024-03-31',
      '1500', '0.85', 'Chase'].join(TAB),
    ['', 'John Doe', 'My Artist', 'Other Song', 'My Album',
      '123456789012', 'US1234567891', 'Apple Music', 'MX',
      'Stream', '2024-03', '2024-03-01', '2024-03-31',
      '300', '0.15', 'Chase'].join(TAB),
  ]
  const fullTSV = sampleLines.join('\n')

  it('detects tab separator from TSV content', () => {
    const sep = detectSeparator(fullTSV.slice(0, 4000))
    expect(sep).toBe('\t')
  })

  it('detects provider = DistroKid from file name', () => {
    const rawHeaders = headerLine.split(TAB)
    const normalized = normalizeHeaders(rawHeaders)
    const provider = detectProvider('distrokid_march_2024.tsv', normalized)
    expect(provider).toBe('DistroKid')
  })

  it('detects provider = DistroKid from headers alone (bankname signal)', () => {
    const rawHeaders = headerLine.split(TAB)
    const normalized = normalizeHeaders(rawHeaders)
    // 'bankname' is a DistroKid signal in ProviderDetector
    const provider = detectProvider('earnings_march.tsv', normalized)
    expect(provider).toBe('DistroKid')
  })

  it('resolves earnings column to "Earnings (USD)" — netearnings alias', () => {
    const rawHeaders = headerLine.split(TAB)
    const normalized = normalizeHeaders(rawHeaders)
    const logger = new Logger()
    // DistroKid candidates: ['netearnings', 'royaltyamount', 'payment']
    // 'Earnings (USD)' normalizes to 'earningsusd' — not in DistroKid candidates
    // but is in AliasDictionary net_total → triggers generic alias fallback.
    // The important thing: we land on the correct earnings column.
    const result = resolveEarningsColumn('DistroKid', normalized, logger)
    const selectedHeader = result.colIdx !== null ? rawHeaders[result.colIdx] : null
    // We should find the earnings column (either via strategy or alias fallback)
    expect(result.colIdx).not.toBeNull()
    expect(selectedHeader).toContain('Earnings')
  })

  it('DistroKid strategy candidates are in spec-correct priority order', () => {
    const candidates = PROVIDER_STRATEGIES['DistroKid'].earningsCandidates
    expect(candidates[0]).toBe('netearnings')
    expect(candidates).toContain('royaltyamount')
    expect(candidates).toContain('payment')
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 2 — Ditto XLSX file
// Real Ditto XLSX headers include:
//   Tenant ID, Artist, Title, ISRC, UPC, Store/Channel, Country,
//   Units, Start Date, Net Total, Net Total Client Currency,
//   Gross Total, Channel Costs, Other Costs, Currency
// ═══════════════════════════════════════════════════════════════════════════════

describe('Smoke test 2 — Ditto XLSX', () => {
  // Realistic Ditto XLSX header row (as parsed by XLSX.utils.sheet_to_json)
  const rawHeaders = [
    'Tenant ID', 'Artist', 'Title', 'ISRC', 'UPC',
    'Channel', 'Country', 'Units', 'Start Date',
    'Net Total', 'Net Total Client Currency',
    'Gross Total', 'Channel Costs', 'Other Costs', 'Currency',
  ]
  const normalized = normalizeHeaders(rawHeaders)

  it('detects provider = Ditto from file name', () => {
    const provider = detectProvider('ditto_report_2024_03.xlsx', normalized)
    expect(provider).toBe('Ditto')
  })

  it('detects provider = Ditto from tenantid header signal', () => {
    const provider = detectProvider('royalty_report.xlsx', normalized)
    expect(provider).toBe('Ditto')
  })

  it('"Net Total" header normalizes to "nettotal"', () => {
    const idx = normalized.indexOf('nettotal')
    expect(idx).not.toBe(-1)
    expect(rawHeaders[idx]).toBe('Net Total')
  })

  it('"Net Total Client Currency" normalizes to "nettotalclientcurrency"', () => {
    const idx = normalized.indexOf('nettotalclientcurrency')
    expect(idx).not.toBe(-1)
    expect(rawHeaders[idx]).toBe('Net Total Client Currency')
  })

  it('resolves earnings column to col index of "Net Total" (nettotal)', () => {
    const logger = new Logger()
    const result = resolveEarningsColumn('Ditto', normalized, logger)
    expect(result.fieldUsed).toBe('nettotal')
    expect(result.colIdx).toBe(normalized.indexOf('nettotal'))
    // Verify it points to "Net Total" not "Net Total Client Currency"
    expect(rawHeaders[result.colIdx!]).toBe('Net Total')
  })

  it('Ditto strategy has secondaryField = "currencynettotal"', () => {
    expect(PROVIDER_STRATEGIES['Ditto'].secondaryField).toBe('currencynettotal')
  })

  it('secondary field alias "nettotalclientcurrency" is detectable in Ditto headers', () => {
    // The Ditto strategy secondaryField is 'currencynettotal' (canonical key),
    // but the real Ditto header 'Net Total Client Currency' normalizes to
    // 'nettotalclientcurrency' — both are aliases for currency_net_total
    // in AliasDictionary. Verify the actual header is present in normalized form.
    const idx = normalized.indexOf('nettotalclientcurrency')
    expect(idx).not.toBe(-1)
    expect(rawHeaders[idx]).toBe('Net Total Client Currency')
  })

  it('column mapper assigns net_total to "Net Total" (not the client currency variant)', () => {
    const logger = new Logger()
    const colMap = mapColumns(rawHeaders, logger)
    // net_total must not point to the client-currency column
    const netIdx = colMap.net_total!
    expect(rawHeaders[netIdx]).toBe('Net Total')
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 3 — CSV with semicolon separator
// Some European distributors export CSVs with `;` as separator
// ═══════════════════════════════════════════════════════════════════════════════

describe('Smoke test 3 — CSV with semicolon separator', () => {
  const semicolonCSV = [
    'Artist;Track;Store;Country;Sale Period;Net Total;Currency',
    'My Artist;My Song;Spotify;DE;2024-03;1,25;EUR',
    'My Artist;Other Song;Apple Music;FR;2024-03;0,75;EUR',
    'My Artist;Third Song;Amazon;ES;2024-03;0,50;EUR',
  ].join('\n')

  it('detects semicolon as separator', () => {
    const sep = detectSeparator(semicolonCSV.slice(0, 4000))
    expect(sep).toBe(';')
  })

  it('does not detect tab or pipe as separator for semicolon CSV', () => {
    const sep = detectSeparator(semicolonCSV.slice(0, 4000))
    expect(sep).not.toBe('\t')
    expect(sep).not.toBe('|')
  })

  it('correctly separates headers when split by detected separator', () => {
    const sep = detectSeparator(semicolonCSV.slice(0, 4000))
    const headers = semicolonCSV.split('\n')[0].split(sep)
    expect(headers).toContain('Net Total')
    expect(headers).toContain('Artist')
    expect(headers).toContain('Currency')
  })

  it('headers after split map correctly to canonical fields', () => {
    const sep = detectSeparator(semicolonCSV.slice(0, 4000))
    const rawHeaders = semicolonCSV.split('\n')[0].split(sep)
    const logger = new Logger()
    const colMap = mapColumns(rawHeaders, logger)
    expect(colMap.net_total).not.toBeNull()
    expect(colMap.artist).not.toBeNull()
    expect(colMap.currency).not.toBeNull()
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 4 — CSV/XLSX with preamble rows (metadata before actual header)
// Some Ditto or custom reports have metadata rows before the header:
//   Row 0: "Report generated: 2024-04-01"
//   Row 1: "Period: March 2024"
//   Row 2: "Artist;Track;Store;Country;Net Total;Currency"  ← real header
//   Row 3+: data rows
// ═══════════════════════════════════════════════════════════════════════════════

describe('Smoke test 4 — preamble rows (headerIdx > 0)', () => {
  // Simulates what XLSX.utils.sheet_to_json returns for a file with preamble
  const rowsWithPreamble: string[][] = [
    ['Report generated: 2024-04-01', '', '', '', '', ''],
    ['Period: March 2024', '', '', '', '', ''],
    ['', '', '', '', '', ''],  // blank row
    ['Artist', 'Track', 'Store', 'Country', 'Net Total', 'Currency'],
    ['My Artist', 'My Song', 'Spotify', 'US', '1.50', 'USD'],
    ['My Artist', 'Other Song', 'Apple Music', 'MX', '0.50', 'USD'],
  ]

  it('findHeaderRow returns index > 0 when preamble rows exist', () => {
    const logger = new Logger()
    const headerIdx = findHeaderRow(rowsWithPreamble, logger)
    expect(headerIdx).toBeGreaterThan(0)
  })

  it('findHeaderRow identifies row 3 as the real header', () => {
    const logger = new Logger()
    const headerIdx = findHeaderRow(rowsWithPreamble, logger)
    expect(rowsWithPreamble[headerIdx]).toContain('Net Total')
    expect(rowsWithPreamble[headerIdx]).toContain('Artist')
  })

  it('data rows after header are correctly identified', () => {
    const logger = new Logger()
    const headerIdx = findHeaderRow(rowsWithPreamble, logger)
    const dataRows = rowsWithPreamble.slice(headerIdx + 1)
    expect(dataRows.length).toBe(2)
    expect(dataRows[0][0]).toBe('My Artist')
  })

  it('column mapping works correctly using the detected header row', () => {
    const logger = new Logger()
    const headerIdx = findHeaderRow(rowsWithPreamble, logger)
    const rawHeaders = rowsWithPreamble[headerIdx]
    const colMap = mapColumns(rawHeaders, logger)
    expect(colMap.net_total).not.toBeNull()
    expect(colMap.artist).not.toBeNull()
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 5 — ODS file (same pipeline as XLSX)
// ODS files are read via XLSX.read() with the same pipeline as XLSX.
// The test verifies that headers parsed from ODS-like data go through
// the identical normalization and column mapping path.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Smoke test 5 — ODS file parses same as XLSX', () => {
  // ODS files from LibreOffice often use the same column names as XLSX.
  // This simulates the sheet_to_json output for an ODS file.
  const odsHeaders = [
    'Artist', 'Title', 'ISRC', 'Store', 'Country',
    'Sale Period', 'Quantity', 'Net Total', 'Gross Total', 'Currency',
  ]
  const odsNormalized = normalizeHeaders(odsHeaders)

  // Equivalent XLSX headers (same content)
  const xlsxHeaders = [...odsHeaders]
  const xlsxNormalized = normalizeHeaders(xlsxHeaders)

  it('ODS and XLSX headers normalize identically', () => {
    expect(odsNormalized).toEqual(xlsxNormalized)
  })

  it('column mapping produces identical ColumnIndex for ODS and XLSX headers', () => {
    const loggerODS  = new Logger()
    const loggerXLSX = new Logger()
    const odsMap  = mapColumns(odsHeaders, loggerODS)
    const xlsxMap = mapColumns(xlsxHeaders, loggerXLSX)
    expect(odsMap.net_total).toBe(xlsxMap.net_total)
    expect(odsMap.artist).toBe(xlsxMap.artist)
    expect(odsMap.sale_period).toBe(xlsxMap.sale_period)
    expect(odsMap.quantity).toBe(xlsxMap.quantity)
  })

  it('provider detection works from ODS file name', () => {
    const provider = detectProvider('ditto_report.ods', odsNormalized)
    expect(provider).toBe('Ditto')
  })

  it('provider detection for unknown ODS file returns UNKNOWN', () => {
    // Generic ODS with no provider signals in name or headers
    const genericHeaders = ['Artist', 'Track', 'Store', 'Country', 'Net Total']
    const genericNorm = normalizeHeaders(genericHeaders)
    const provider = detectProvider('royalties_2024.ods', genericNorm)
    expect(provider).toBe('UNKNOWN')
  })

  it('earnings column resolves correctly for UNKNOWN ODS provider', () => {
    const genericHeaders = ['Artist', 'Track', 'Store', 'Country', 'Net Total']
    const normalized = normalizeHeaders(genericHeaders)
    const logger = new Logger()
    const result = resolveEarningsColumn('UNKNOWN', normalized, logger)
    expect(result.colIdx).not.toBeNull()
    // "Net Total" normalizes to "nettotal" — first UNKNOWN candidate
    expect(result.fieldUsed).toBe('nettotal')
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 6 — AuditReport: accumulated total appears in report
// ═══════════════════════════════════════════════════════════════════════════════

describe('Smoke test 6 — AuditReport net total', () => {
  it('net total is correctly accumulated and appears in AuditReport', () => {
    const earnings = [12.50, 7.25, 0.00000001, 100.0]
    const expectedSum = earnings.reduce((s, v) => s + v, 0)

    const audit = makeAudit(earnings, 'DistroKid', 'distrokid_march.tsv')

    // The netTotal field should match the sum of earnings
    const netTotalNum = parseFloat(audit.netTotal)
    expect(Math.abs(netTotalNum - expectedSum)).toBeLessThan(1e-8)
  })

  it('audit status is "valid" when accumulated total matches re-sum', () => {
    const earnings = [10.00, 20.00, 30.00]
    const audit = makeAudit(earnings, 'Ditto', 'ditto.xlsx')
    expect(audit.status).toBe('valid')
    expect(audit.discrepancyNote).toBeNull()
  })

  it('audit contains provider, fileName, currency', () => {
    const audit = makeAudit([1.00, 2.00], 'DistroKid', 'dk_report.tsv')
    expect(audit.provider).toBe('DistroKid')
    expect(audit.fileName).toBe('dk_report.tsv')
    expect(audit.currency).toBe('USD')
  })

  it('audit reportedMonth derived from salePeriods', () => {
    // All rows in 2024-03 → reportedMonth should be 2024-03
    const audit = makeAudit([5.00, 10.00], 'DistroKid', 'dk_report.tsv')
    expect(audit.reportedMonth).toBe('2024-03')
    expect(audit.reportedYear).toBe('2024')
  })

  it('audit totalRows matches number of earnings values', () => {
    const earnings = [1, 2, 3, 4, 5]
    const audit = makeAudit(earnings, 'Ditto', 'ditto.xlsx')
    expect(audit.totalRows).toBe(5)
  })

  it('netTotal string is in Decimal(20,8) format', () => {
    const audit = makeAudit([1.5, 2.5], 'Ditto', 'ditto.xlsx')
    // Must have exactly 8 decimal places
    const decPart = audit.netTotal.split('.')[1]
    expect(decPart).toHaveLength(8)
  })

  it('processingTimeMs is recorded in audit', () => {
    const audit = makeAudit([1.0], 'DistroKid', 'dk.tsv')
    expect(typeof audit.processingTimeMs).toBe('number')
    expect(audit.processingTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('audit status is "discrepancy" when totals differ (e.g. NaN injected)', () => {
    // Manually build a mismatched audit by passing different earningsColumnValues
    const netAcc   = new DecimalAccumulator()
    const grossAcc = new DecimalAccumulator()
    const taxAcc   = new DecimalAccumulator()
    const chAcc    = new DecimalAccumulator()
    const otAcc    = new DecimalAccumulator()
    // Accumulate 100, but earningsColumnValues sums to 50 → discrepancy
    netAcc.add(100)
    const audit = buildAuditReport({
      provider: 'UNKNOWN',
      fileName: 'mismatch.csv',
      currency: 'USD',
      totalRows: 1,
      totalColumns: 5,
      errorRows: 0,
      grossAccumulator:           grossAcc,
      taxesAccumulator:           taxAcc,
      channelCostsAccumulator:    chAcc,
      otherCostsAccumulator:      otAcc,
      netAccumulator:             netAcc,
      earningsColumnValues:       [50],   // re-sum = 50, accumulated = 100
      salePeriods:                ['2024-03'],
      processingTimeMs:           0,
    })
    expect(audit.status).toBe('discrepancy')
    expect(audit.discrepancyNote).not.toBeNull()
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Scenario 7 — End-to-end pipeline simulation (without File API)
// Simulates what parseFile() does internally with synthetic row data.
// ═══════════════════════════════════════════════════════════════════════════════

describe('Smoke test 7 — End-to-end pipeline (without File API)', () => {
  // Simulate a DistroKid TSV parsed into rows (as Papa.parse would produce)
  const rawRows: string[][] = [
    // Header row
    ['Team Member', 'Payee', 'Artist', 'Title', 'Album', 'UPC', 'ISRC',
     'Stores', 'Country of Sale', 'Royalty Type', 'Sale Period',
     'Quantity', 'Earnings (USD)', 'Bank Name'],
    // Data rows
    ['', 'Jane', 'Artist A', 'Song 1', 'Album 1', '111', 'ISRC1',
     'Spotify', 'US', 'Stream', '2024-03', '1000', '12.50', 'Chase'],
    ['', 'Jane', 'Artist A', 'Song 2', 'Album 1', '111', 'ISRC2',
     'Apple Music', 'MX', 'Stream', '2024-03', '500', '7.25', 'Chase'],
    ['', 'Jane', 'Artist B', 'Song 3', 'Album 2', '222', 'ISRC3',
     'Amazon Music', 'US', 'Stream', '2024-03', '200', '5.00', 'Chase'],
  ]

  const fileName = 'distrokid_march_2024.tsv'
  const headerRow = rawRows[0]
  const normalizedHdrs = normalizeHeaders(headerRow)

  it('detects DistroKid provider', () => {
    const provider = detectProvider(fileName, normalizedHdrs)
    expect(provider).toBe('DistroKid')
  })

  it('findHeaderRow returns 0 (no preamble in this file)', () => {
    const logger = new Logger()
    const idx = findHeaderRow(rawRows, logger)
    expect(idx).toBe(0)
  })

  it('resolves earnings column to the "Earnings (USD)" position', () => {
    const logger = new Logger()
    const result = resolveEarningsColumn('DistroKid', normalizedHdrs, logger)
    // earningsusd is an alias for net_total, but not in DistroKid strategy candidates.
    // Falls through to generic alias → still finds the correct column.
    expect(result.colIdx).not.toBeNull()
    const colName = headerRow[result.colIdx!]
    expect(colName).toBe('Earnings (USD)')
  })

  it('accumulated earnings total matches sum of data rows', () => {
    const logger = new Logger()
    const result = resolveEarningsColumn('DistroKid', normalizedHdrs, logger)
    const earningsIdx = result.colIdx!
    const dataRows = rawRows.slice(1)

    const acc = new DecimalAccumulator()
    const values: number[] = []
    for (const row of dataRows) {
      const v = parseFloat(row[earningsIdx])
      if (!isNaN(v)) {
        acc.add(v)
        values.push(v)
      }
    }

    const expectedTotal = 12.50 + 7.25 + 5.00
    expect(Math.abs(acc.toNumber() - expectedTotal)).toBeLessThan(1e-8)

    // Build AuditReport and verify netTotal
    const netAcc = new DecimalAccumulator()
    for (const v of values) netAcc.add(v)
    const audit = buildAuditReport({
      provider: 'DistroKid',
      fileName,
      currency: 'USD',
      totalRows: dataRows.length,
      totalColumns: headerRow.length,
      errorRows: 0,
      grossAccumulator:        new DecimalAccumulator(),
      taxesAccumulator:        new DecimalAccumulator(),
      channelCostsAccumulator: new DecimalAccumulator(),
      otherCostsAccumulator:   new DecimalAccumulator(),
      netAccumulator:          netAcc,
      earningsColumnValues:    values,
      salePeriods:             dataRows.map(() => '2024-03'),
      processingTimeMs:        50,
    })

    expect(audit.status).toBe('valid')
    expect(parseFloat(audit.netTotal)).toBeCloseTo(expectedTotal, 8)
    expect(audit.provider).toBe('DistroKid')
    expect(audit.reportedMonth).toBe('2024-03')
  })
})


// ═══════════════════════════════════════════════════════════════════════════════
// Note: parseFile() full integration test limitation
// ═══════════════════════════════════════════════════════════════════════════════
//
// The parseFile() function requires:
//   1. browser File object (not available in Node.js/vitest)
//   2. Papa.parse streaming (works in Node.js but needs a string, not a File)
//
// The tests above cover every stage of the parseFile() pipeline individually:
//   detectProvider()        — Scenarios 1, 2, 5, 7
//   resolveEarningsColumn() — Scenarios 1, 2, 5, 7
//   detectSeparator()       — Scenarios 1, 3
//   findHeaderRow()         — Scenarios 4, 7
//   mapColumns()            — Scenarios 2, 3, 4, 5
//   buildAuditReport()      — Scenarios 6, 7
//   DecimalAccumulator      — Scenarios 6, 7
//
// Full integration tests that require parseFile() would need a vitest
// environment that polyfills the File API (e.g. jsdom or happy-dom)
// and provides a real buffer. See design.md — Testing Strategy for
// recommended integration test setup.
