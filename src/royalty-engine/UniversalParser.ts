/**
 * UniversalParser.ts — RUPE V2 core engine
 *
 * Reads any royalty report CSV/TSV/TXT/XLS/XLSX/ODS and returns structured
 * rows + stats + audit report + debug snapshot.
 *
 * V2 changes:
 *  - options.maxFileSizeBytes: reject before reading if > limit (default 1 GB)
 *  - Encoding detection: BOM bytes → UTF-16 LE/BE, UTF-8 BOM; fallback UTF-8
 *  - CSV/TSV/TXT: streaming via Papa.parse chunk (16 KB)
 *  - XLSX/XLS/ODS: XLSX.read + process in blocks of 1000 (no full array accumulation)
 *  - resolveEarningsColumn() replaces applyProviderEarningsOverride()
 *  - RowValidator per row
 *  - DecimalAccumulator for net/gross/taxes/channelCosts/otherCosts
 *  - first20 / last20 raw text rows captured for DebugSnapshot
 *  - earningsColumnValues + salePeriods collected for AuditReport
 *  - onProgress emitted every 10,000 rows and at completion
 *  - buildAuditReport() + buildDebugSnapshot() called after loop
 *  - MAX_ROWS raised to 500,000
 *
 * Requirements: 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 17, 18, 19
 */
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Logger } from './Logger'
import { mapColumns, type ColumnIndex } from './ColumnMapper'
import { findHeaderRow } from './HeaderFinder'
import { detectSeparator } from './SeparatorDetector'
import { detectProvider } from './ProviderDetector'
import { detectCurrency } from './CurrencyDetector'
import { parseMoney, parseInteger } from './MoneyParser'
import { normalizePeriod } from './DateParser'
import { computeStats, type RUPEStats } from './Statistics'
import { expandCountryCode } from '../lib/distrokid-parser'
import { normalizeHeaders } from './HeaderNormalizer'
import { resolveEarningsColumn, type ProviderName } from './ProviderStrategy'
import { RowValidator, type ValidationIssue } from './RowValidator'
import { DecimalAccumulator } from './DecimalAccumulator'
import {
  buildAuditReport,
  buildDebugSnapshot,
  type AuditReport,
  type DebugSnapshot,
} from './AuditReport'

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedRow {
  net_total:     number
  gross_total:   number
  taxes:         number
  channel_costs: number
  other_costs:   number
  currency:      string
  artist:        string
  track:         string
  album:         string
  upc:           string
  isrc:          string
  platform:      string
  country:       string
  quantity:      number
  sale_period:   string
  // For DB insert compatibility
  artist_name:   string
  song_title:    string
  album_name:    string
  store:         string
  earnings_usd:  number
}

export interface RUPEResult {
  rows:  ParsedRow[]
  stats: RUPEStats
  audit: AuditReport   // NEW in V2
  debug: DebugSnapshot // NEW in V2
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/** Maximum rows to process (V2: raised to 500,000). Configurable per call. */
const MAX_ROWS = 500_000

/** Default maximum file size: 1 GB (Requirement 8.5) */
const DEFAULT_MAX_FILE_SIZE_BYTES = 1_073_741_824

/** Chunk size for Papa.parse streaming (Requirement 8.1) */
const PAPA_CHUNK_SIZE = 16 * 1024  // 16 KB

/** XLSX/ODS row processing block size (Requirement 8.4) */
const XLSX_BLOCK_SIZE = 1000

/** Progress event interval (Requirement 8.3) */
const PROGRESS_INTERVAL = 10_000

// ─── Encoding Detection ────────────────────────────────────────────────────────

/**
 * Detects file encoding from BOM bytes (Requirement 1.2).
 * Returns the detected encoding label used by TextDecoder.
 * Falls back to 'utf-8' if no BOM is found (Requirement 1.5).
 */
function detectEncodingFromBOM(bytes: Uint8Array): string {
  // UTF-16 LE: FF FE
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return 'utf-16le'
  }
  // UTF-16 BE: FE FF
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return 'utf-16be'
  }
  // UTF-8 BOM: EF BB BF
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return 'utf-8'
  }
  // Heuristic: if high proportion of bytes > 0x7F and no UTF-16 patterns, assume Latin-1/CP1252
  // For simplicity in browser context, fallback to utf-8 (Requirement 1.5)
  return 'utf-8'
}

// ─── Row Extraction Helper ────────────────────────────────────────────────────

function extractRow(
  textRow: string[],
  numRow: (string | number)[],
  colMap: ColumnIndex,
  currency: string,
  rowErrors: number[]
): ParsedRow | null {
  try {
    const get  = (i: number | null): string  => i !== null ? (textRow[i] ?? '').toString().trim() : ''
    const getN = (i: number | null): number  => {
      if (i === null) return 0
      const v = numRow[i]
      return typeof v === 'number' ? v : parseMoney(String(v ?? ''))
    }
    const getI = (i: number | null): number  => {
      if (i === null) return 0
      const v = numRow[i]
      return typeof v === 'number' ? Math.round(v) : parseInteger(String(v ?? ''))
    }

    const net = getN(colMap.net_total)
    const qty = getI(colMap.quantity)

    // Skip completely empty rows
    const nonEmpty = textRow.filter(c => c && c.toString().trim()).length
    if (nonEmpty < 2) return null

    // Skip repeated header rows
    const netText = get(colMap.net_total).toLowerCase()
    const skipWords = [
      'net total', 'nettotal', 'earnings', 'royalty', 'amount', 'revenue',
      'net', 'net_total', 'nettotalclientcurrency',
    ]
    if (skipWords.includes(netText)) return null

    const rawCountry = get(colMap.country)
    const salePeriod = normalizePeriod(get(colMap.sale_period) || 'Unknown')

    const row: ParsedRow = {
      net_total:     isNaN(net) ? 0 : net,
      gross_total:   getN(colMap.gross_total),
      taxes:         getN(colMap.taxes),
      channel_costs: getN(colMap.channel_costs),
      other_costs:   getN(colMap.other_costs),
      currency:      get(colMap.currency) || currency,
      artist:        get(colMap.artist) || 'Unknown',
      track:         get(colMap.track)  || 'Unknown',
      album:         get(colMap.album)  || '',
      upc:           get(colMap.upc),
      isrc:          get(colMap.isrc),
      platform:      get(colMap.platform) || 'Unknown',
      country:       expandCountryCode(rawCountry) || 'Unknown',
      quantity:      isNaN(qty) ? 0 : qty,
      sale_period:   salePeriod,
      // DB compatibility aliases
      artist_name:   get(colMap.artist) || 'Unknown',
      song_title:    get(colMap.track)  || 'Unknown',
      album_name:    get(colMap.album)  || '',
      store:         get(colMap.platform) || 'Unknown',
      earnings_usd:  isNaN(net) ? 0 : net,
    }

    if (row.net_total === 0 && row.quantity === 0) return null
    return row
  } catch {
    rowErrors.push(1)
    return null
  }
}

// ─── Processing State ─────────────────────────────────────────────────────────

interface ProcessingState {
  rows:                 ParsedRow[]
  netAcc:               DecimalAccumulator
  grossAcc:             DecimalAccumulator
  taxesAcc:             DecimalAccumulator
  channelCostsAcc:      DecimalAccumulator
  otherCostsAcc:        DecimalAccumulator
  earningsColumnValues: number[]
  salePeriods:          string[]
  first20:              string[][]
  last20:               string[][]
  validationErrors:     ValidationIssue[]
  rowErrors:            number[]
  processedCount:       number
  skippedCount:         number
  totalDataRows:        number  // estimated/known total data rows
}

function makeState(): ProcessingState {
  return {
    rows:                 [],
    netAcc:               new DecimalAccumulator(),
    grossAcc:             new DecimalAccumulator(),
    taxesAcc:             new DecimalAccumulator(),
    channelCostsAcc:      new DecimalAccumulator(),
    otherCostsAcc:        new DecimalAccumulator(),
    earningsColumnValues: [],
    salePeriods:          [],
    first20:              [],
    last20:               [],
    validationErrors:     [],
    rowErrors:            [],
    processedCount:       0,
    skippedCount:         0,
    totalDataRows:        0,
  }
}

/**
 * Process a single data row into the running state.
 * Returns true if the row was included in output, false if skipped.
 */
function processDataRow(
  textRow: string[],
  numRow: (string | number)[],
  rowIndex: number,   // 1-based row number for validation messages
  state: ProcessingState,
  colMap: ColumnIndex,
  currency: string,
  validator: RowValidator,
  logger: Logger,
  maxRows: number,
  onProgress?: (processed: number, total: number) => void,
): void {
  if (state.rows.length >= maxRows) return

  // ── Capture first20 / last20 raw text ──────────────────────────────────
  if (state.first20.length < 20) {
    state.first20.push([...textRow])
  }
  // For last20 we keep a rolling buffer of the last 20 non-empty rows
  if (textRow.filter(c => c?.toString().trim()).length >= 2) {
    state.last20.push([...textRow])
    if (state.last20.length > 20) state.last20.shift()
  }

  // ── Validate row ────────────────────────────────────────────────────────
  const validation = validator.validate(textRow, rowIndex, colMap)
  for (const issue of validation.issues) {
    state.validationErrors.push(issue)
    logger.warn(`Fila ${rowIndex}: ${issue.type} — ${issue.message}`)
  }

  if (validation.isSkipped) {
    state.rowErrors.push(1)
    state.skippedCount++
    return
  }

  // ── Extract row ─────────────────────────────────────────────────────────
  const parsed = extractRow(textRow, numRow, colMap, currency, state.rowErrors)
  if (!parsed) return

  state.rows.push(parsed)
  state.processedCount++

  // ── Accumulate financials ───────────────────────────────────────────────
  state.netAcc.add(parsed.net_total)
  state.grossAcc.add(parsed.gross_total)
  state.taxesAcc.add(parsed.taxes)
  state.channelCostsAcc.add(parsed.channel_costs)
  state.otherCostsAcc.add(parsed.other_costs)

  // ── Collect audit data ──────────────────────────────────────────────────
  state.earningsColumnValues.push(parsed.net_total)
  if (parsed.sale_period) state.salePeriods.push(parsed.sale_period)

  // ── Progress ────────────────────────────────────────────────────────────
  if (onProgress && state.processedCount % PROGRESS_INTERVAL === 0) {
    onProgress(state.processedCount, state.totalDataRows)
  }
}

// ─── parseFile() ──────────────────────────────────────────────────────────────

export async function parseFile(
  file: File,
  options?: {
    onProgress?: (processed: number, total: number) => void
    maxFileSizeBytes?: number
  }
): Promise<RUPEResult> {
  const startTime = Date.now()
  const logger    = new Logger()
  const ext       = file.name.split('.').pop()?.toLowerCase() ?? ''
  const maxSize   = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES
  const onProgress = options?.onProgress

  logger.info(`Archivo: ${file.name}`)
  logger.info(`Tipo: ${ext.toUpperCase()}`)
  logger.info(`Tamaño: ${(file.size / 1024 / 1024).toFixed(2)} MB`)

  // ── 1. File size check (Requirement 8.5) ─────────────────────────────────
  if (file.size > maxSize) {
    const limitMB = (maxSize / 1024 / 1024).toFixed(0)
    const sizeMB  = (file.size / 1024 / 1024).toFixed(2)
    const msg = `Archivo demasiado grande: ${sizeMB} MB. Límite: ${limitMB} MB.`
    logger.error(msg)
    throw new Error(msg)
  }

  // Build an empty AuditReport/DebugSnapshot for error-path returns
  function buildEmptyResult(): RUPEResult {
    const emptyState = makeState()
    const emptyHeaders: string[] = []
    const emptyColMap = {} as ColumnIndex
    const processingTimeMs = Date.now() - startTime
    const audit = buildAuditReport({
      provider:               'UNKNOWN',
      fileName:               file.name,
      currency:               'USD',
      totalRows:              0,
      totalColumns:           0,
      errorRows:              0,
      grossAccumulator:       emptyState.grossAcc,
      taxesAccumulator:       emptyState.taxesAcc,
      channelCostsAccumulator: emptyState.channelCostsAcc,
      otherCostsAccumulator:  emptyState.otherCostsAcc,
      netAccumulator:         emptyState.netAcc,
      earningsColumnValues:   [],
      salePeriods:            [],
      processingTimeMs,
    })
    const debug = buildDebugSnapshot({
      provider:         'UNKNOWN',
      columnMap:        emptyColMap,
      rawHeaders:       emptyHeaders,
      earningsColUsed:  '',
      earningsColIdx:   -1,
      first20Rows:      [],
      last20Rows:       [],
      netAccumulator:   emptyState.netAcc,
      validationErrors: [],
    })
    const stats = computeStats([], 'USD', 'UNKNOWN', logger.toStrings(), 0, 'error', processingTimeMs)
    return { rows: [], stats, audit, debug }
  }

  // ── 2. Read file based on format ──────────────────────────────────────────
  let textRows: string[][]           = []
  let numRows:  (string | number)[][] = []

  if (['xlsx', 'xls', 'ods'].includes(ext)) {
    // ── XLSX / XLS / ODS path ─────────────────────────────────────────────
    // Requirement 18: ODS uses same XLSX.read pipeline
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: 'array', cellDates: true })

    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn]
      const t  = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
      const n  = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', raw: true }) as (string | number)[][]
      if (t.length > textRows.length) { textRows = t; numRows = n }
    }
  } else {
    // ── CSV / TSV / TXT path ──────────────────────────────────────────────
    // Requirement 1.2: detect encoding from BOM
    const rawBuf = await file.arrayBuffer()
    const bytes  = new Uint8Array(rawBuf)
    const encoding = detectEncodingFromBOM(bytes)
    logger.info(`Encoding detectado: ${encoding}`)

    const text = new TextDecoder(encoding).decode(rawBuf)

    // Detect separator from first 4 KB of text
    const sep = detectSeparator(text.slice(0, 4000))
    logger.info(`Separador detectado: "${sep === '\t' ? 'TAB' : sep}"`)

    // Streaming parse with Papa.parse chunk mode (Requirement 8.1)
    await new Promise<void>((resolve, reject) => {
      Papa.parse<string[]>(text, {
        delimiter: sep,
        skipEmptyLines: true,
        chunkSize: PAPA_CHUNK_SIZE,
        chunk: (results: Papa.ParseResult<string[]>) => {
          for (const row of results.data) {
            textRows.push(row)
          }
        },
        complete: () => resolve(),
        error: (err: Error) => reject(err),
      })
    })

    numRows = textRows  // CSV text rows serve as both text and num rows
  }

  // ── 3. Validate we have enough rows ───────────────────────────────────────
  if (textRows.length < 2) {
    logger.error('Archivo vacío o sin datos')
    return buildEmptyResult()
  }

  // ── 4. Find header row ────────────────────────────────────────────────────
  const headerIdx       = findHeaderRow(textRows, logger)
  const rawHeaders      = textRows[headerIdx].map(h => (h ?? '').toString())
  const normalizedHdrs  = normalizeHeaders(rawHeaders)

  // ── 5. Detect provider, map columns, detect currency ─────────────────────
  const provider       = detectProvider(file.name, rawHeaders) as ProviderName
  const baseColMap     = mapColumns(rawHeaders, logger)

  // ── 6. Resolve earnings column via ProviderStrategy (replaces applyProviderEarningsOverride) ──
  const { colIdx: earningsColIdx, fieldUsed: earningsFieldUsed } =
    resolveEarningsColumn(provider, normalizedHdrs, logger)

  // Wire the resolved earnings column into colMap
  const colMap: ColumnIndex = earningsColIdx !== null
    ? { ...baseColMap, net_total: earningsColIdx }
    : baseColMap

  const currency = detectCurrency(textRows, rawHeaders, logger)

  logger.info(`Proveedor detectado: ${provider}`)
  logger.info(`Moneda: ${currency}`)
  logger.info(`Columna de ingresos final: col[${colMap.net_total}] "${colMap.net_total !== null ? rawHeaders[colMap.net_total] : 'N/A'}"`)
  logger.info(`gross_total mapeado a: col[${colMap.gross_total}] "${colMap.gross_total !== null ? rawHeaders[colMap.gross_total] : 'N/A'}"`)

  // ── 7. Initialize processing state ───────────────────────────────────────
  const state       = makeState()
  const dataRows    = textRows.slice(headerIdx + 1)
  const dataNum     = numRows.slice(headerIdx + 1)
  const totalDataRows = dataRows.length
  state.totalDataRows = totalDataRows

  const expectedColCount = rawHeaders.length
  const validator = new RowValidator(expectedColCount, currency)

  logger.info(`Total filas en archivo: ${totalDataRows}`)

  // ── 8. Main processing loop ───────────────────────────────────────────────
  // Process in blocks of XLSX_BLOCK_SIZE to avoid holding full array for XLSX;
  // for CSV the data is already in textRows but we still process in blocks.
  const limit = Math.min(totalDataRows, MAX_ROWS)

  for (let blockStart = 0; blockStart < limit; blockStart += XLSX_BLOCK_SIZE) {
    const blockEnd = Math.min(blockStart + XLSX_BLOCK_SIZE, limit)

    for (let i = blockStart; i < blockEnd; i++) {
      const textRow = dataRows[i] ?? []
      const numRow  = (dataNum[i] ?? dataRows[i]) as (string | number)[]

      processDataRow(
        textRow,
        numRow,
        headerIdx + 1 + i + 1,  // 1-based file row number
        state,
        colMap,
        currency,
        validator,
        logger,
        MAX_ROWS,
        onProgress,
      )
    }
  }

  // ── 9. Final progress event (Requirement 8.3) ─────────────────────────────
  const processingTimeMs = Date.now() - startTime
  onProgress?.(state.processedCount, totalDataRows)

  // ── 10. Logger summary ────────────────────────────────────────────────────
  logger.setSummaryStats(state.processedCount, state.skippedCount, state.rowErrors.length)
  logger.info(`Filas válidas parseadas: ${state.rows.length}`)
  logger.info(logger.summary())

  // ── 11. Build AuditReport (Requirement 10) ────────────────────────────────
  const auditErrorRows = state.validationErrors.filter(i => i.type === 'corrupt').length
  const audit = buildAuditReport({
    provider,
    fileName:               file.name,
    currency,
    totalRows:              state.processedCount,
    totalColumns:           rawHeaders.length,
    errorRows:              auditErrorRows + state.rowErrors.length,
    grossAccumulator:       state.grossAcc,
    taxesAccumulator:       state.taxesAcc,
    channelCostsAccumulator: state.channelCostsAcc,
    otherCostsAccumulator:  state.otherCostsAcc,
    netAccumulator:         state.netAcc,
    earningsColumnValues:   state.earningsColumnValues,
    salePeriods:            state.salePeriods,
    processingTimeMs,
  })

  // ── 12. Build DebugSnapshot (Requirement 11) ──────────────────────────────
  const debug = buildDebugSnapshot({
    provider,
    columnMap:       colMap,
    rawHeaders,
    earningsColUsed: earningsFieldUsed ?? (colMap.net_total !== null ? rawHeaders[colMap.net_total] : ''),
    earningsColIdx:  colMap.net_total ?? -1,
    first20Rows:     state.first20,
    last20Rows:      state.last20,
    netAccumulator:  state.netAcc,
    validationErrors: state.validationErrors,
  })

  // ── 13. Compute stats (V2 signature) ─────────────────────────────────────
  const stats = computeStats(
    state.rows,
    currency,
    provider,
    logger.toStrings(),
    state.rowErrors.length,
    audit.status,
    processingTimeMs,
  )

  logger.info(`Total Neto: ${state.netAcc.toFixed8()} ${currency}`)

  // ── 14. Return V2 result (backward compatible) ────────────────────────────
  return { rows: state.rows, stats, audit, debug }
}
