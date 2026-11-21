/**
 * symphonic-parser.ts
 *
 * Detects Symphonic revenue-detail CSV files and normalises their rows into
 * the same shape that the RUPE engine expects.
 *
 * Symphonic CSV columns (in order, as found in the reference file):
 *   STATEMENT PERIOD, TRANSACTION DATE, SALE COUNTRY, STORE,
 *   SERVICE DETAIL, LABEL IMPRINT, PRODUCT ARTIST, PRODUCT,
 *   PRODUCT VERSION, PRODUCT CODE, DISPLAY UPC, MANUFACTURER UPC,
 *   TRACK ARTIST, TRACK, TRACK VERSION, ISRC, YOUTUBE VIDEO ID,
 *   TRANSACTION TYPE, TRANSACTION SUBTYPE, QUANTITY, ACCOUNT CURRENCY,
 *   ROYALTY TYPE, ORIGINAL STATEMENT PERIOD, REVENUE
 *
 * Detection heuristic: a file is Symphonic when its normalised headers
 * include at least 4 of the following distinctive column names:
 *   - statementperiod / statement period
 *   - labelimprint / label imprint
 *   - servicedetail / service detail
 *   - originalstatementperiod / original statement period
 *   - royaltytype / royalty type
 *   - youtubevideoid / youtube video id
 *   - accountcurrency / account currency
 *
 * This module is intentionally framework-free (no React, no Supabase).
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'

// ─── Public types ─────────────────────────────────────────────────────────────

/** A Symphonic row normalised to canonical column names. */
export interface SymphonicRow {
  statement_period:          string
  transaction_date:          string
  sale_country:              string
  store:                     string
  service_detail:            string
  label_imprint:             string
  product_artist:            string
  product:                   string
  product_version:           string
  product_code:              string
  display_upc:               string
  manufacturer_upc:          string
  track_artist:              string
  track:                     string
  track_version:             string
  isrc:                      string
  youtube_video_id:          string
  transaction_type:          string
  transaction_subtype:       string
  quantity:                  number
  account_currency:          string
  royalty_type:              string
  original_statement_period: string
  /** Revenue as a high-precision string (preserves original decimal places). */
  revenue_raw:               string
  /** Revenue parsed to float for computation. */
  revenue:                   number
}

/** Summary statistics for a parsed Symphonic file. */
export interface SymphonicParseResult {
  rows:            SymphonicRow[]
  totalRevenue:    number
  totalQuantity:   number
  currency:        string
  statementPeriod: string
  rowErrors:       number
  log:             string[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise a header string: lowercase, remove spaces/accents/special chars. */
function normaliseHeader(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** Parse a revenue string to float with high fidelity. */
function parseRevenue(raw: string): number {
  if (!raw || raw.trim() === '') return 0
  const cleaned = raw.trim().replace(/,/g, '')
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : val
}

/** Parse an integer quantity. */
function parseQuantity(raw: string): number {
  if (!raw || raw.trim() === '') return 0
  const val = parseInt(raw.trim().replace(/,/g, ''), 10)
  return isNaN(val) ? 0 : val
}

// ─── DISTINCTIVE_SIGNALS ─────────────────────────────────────────────────────

/**
 * Headers present in Symphonic but absent (or extremely rare) in other formats.
 * isSymphonicFile() requires at least REQUIRED_SIGNAL_COUNT of these.
 */
const SYMPHONIC_SIGNALS = new Set([
  'statementperiod',
  'labelimprint',
  'servicedetail',
  'originalstatementperiod',
  'royaltytype',
  'youtubevideoid',
  'accountcurrency',
  'productartist',
  'transactionsubtype',
])

const REQUIRED_SIGNAL_COUNT = 4

// ─── isSymphonicFile() ────────────────────────────────────────────────────────

/**
 * Returns true if the given header array looks like a Symphonic CSV.
 * Checks normalised header values against the signal set.
 */
export function isSymphonicFile(headers: string[]): boolean {
  const normed = headers.map(normaliseHeader)
  let hits = 0
  for (const h of normed) {
    if (SYMPHONIC_SIGNALS.has(h)) hits++
  }
  return hits >= REQUIRED_SIGNAL_COUNT
}

// ─── COLUMN_MAP ──────────────────────────────────────────────────────────────

/**
 * Maps normalised header strings to SymphonicRow field names.
 * Multiple aliases per field to handle minor variations.
 */
const COLUMN_MAP: Record<string, keyof SymphonicRow | '__skip'> = {
  statementperiod:          'statement_period',
  transactiondate:          'transaction_date',
  salecountry:              'sale_country',
  store:                    'store',
  servicedetail:            'service_detail',
  labelimprint:             'label_imprint',
  productartist:            'product_artist',
  product:                  'product',
  productversion:           'product_version',
  productcode:              'product_code',
  displayupc:               'display_upc',
  manufacturerupc:          'manufacturer_upc',
  trackartist:              'track_artist',
  track:                    'track',
  trackversion:             'track_version',
  isrc:                     'isrc',
  youtubevideoid:           'youtube_video_id',
  transactiontype:          'transaction_type',
  transactionsubtype:       'transaction_subtype',
  quantity:                 'quantity',
  accountcurrency:          'account_currency',
  royaltytype:              'royalty_type',
  originalstatementperiod:  'original_statement_period',
  revenue:                  'revenue_raw',
}

// ─── parseSymphonicRows() ─────────────────────────────────────────────────────

function buildColumnIndex(headers: string[]): Record<keyof SymphonicRow | '__skip', number> {
  const idx: Partial<Record<string, number>> = {}
  for (let i = 0; i < headers.length; i++) {
    const norm = normaliseHeader(headers[i])
    const field = COLUMN_MAP[norm]
    if (field) idx[field] = i
  }
  return idx as Record<keyof SymphonicRow | '__skip', number>
}

function str(row: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0 || idx >= row.length) return ''
  return (row[idx] ?? '').toString().trim()
}

function parseSymphonicRows(
  rawRows: string[][],
  headerIdx: number,
  log: string[],
): { rows: SymphonicRow[]; errors: number } {
  const headers = rawRows[headerIdx]
  const colIdx  = buildColumnIndex(headers)
  const rows: SymphonicRow[] = []
  let errors = 0

  for (let i = headerIdx + 1; i < rawRows.length; i++) {
    const raw = rawRows[i]
    if (!raw || raw.every(c => !c || !c.toString().trim())) continue

    const revenueRaw = str(raw, colIdx['revenue_raw' as keyof SymphonicRow])
    const revenue    = parseRevenue(revenueRaw)
    const quantity   = parseQuantity(str(raw, colIdx['quantity' as keyof SymphonicRow]))

    if (revenueRaw === '' && quantity === 0) {
      errors++
      continue
    }

    rows.push({
      statement_period:          str(raw, colIdx['statement_period' as keyof SymphonicRow]),
      transaction_date:          str(raw, colIdx['transaction_date' as keyof SymphonicRow]),
      sale_country:              str(raw, colIdx['sale_country' as keyof SymphonicRow]),
      store:                     str(raw, colIdx['store' as keyof SymphonicRow]),
      service_detail:            str(raw, colIdx['service_detail' as keyof SymphonicRow]),
      label_imprint:             str(raw, colIdx['label_imprint' as keyof SymphonicRow]),
      product_artist:            str(raw, colIdx['product_artist' as keyof SymphonicRow]),
      product:                   str(raw, colIdx['product' as keyof SymphonicRow]),
      product_version:           str(raw, colIdx['product_version' as keyof SymphonicRow]),
      product_code:              str(raw, colIdx['product_code' as keyof SymphonicRow]),
      display_upc:               str(raw, colIdx['display_upc' as keyof SymphonicRow]),
      manufacturer_upc:          str(raw, colIdx['manufacturer_upc' as keyof SymphonicRow]),
      track_artist:              str(raw, colIdx['track_artist' as keyof SymphonicRow]),
      track:                     str(raw, colIdx['track' as keyof SymphonicRow]),
      track_version:             str(raw, colIdx['track_version' as keyof SymphonicRow]),
      isrc:                      str(raw, colIdx['isrc' as keyof SymphonicRow]),
      youtube_video_id:          str(raw, colIdx['youtube_video_id' as keyof SymphonicRow]),
      transaction_type:          str(raw, colIdx['transaction_type' as keyof SymphonicRow]),
      transaction_subtype:       str(raw, colIdx['transaction_subtype' as keyof SymphonicRow]),
      quantity,
      account_currency:          str(raw, colIdx['account_currency' as keyof SymphonicRow]),
      royalty_type:              str(raw, colIdx['royalty_type' as keyof SymphonicRow]),
      original_statement_period: str(raw, colIdx['original_statement_period' as keyof SymphonicRow]),
      revenue_raw:               revenueRaw,
      revenue,
    })
  }

  log.push(`[INFO] Symphonic: ${rows.length} filas procesadas, ${errors} omitidas`)
  return { rows, errors }
}

// ─── findHeaderRow() (simple) ─────────────────────────────────────────────────

function findSymphonicHeaderRow(rawRows: string[][]): number {
  for (let i = 0; i < Math.min(10, rawRows.length); i++) {
    const row = rawRows[i]
    if (!row) continue
    const normed = row.map(normaliseHeader)
    let hits = 0
    for (const h of normed) {
      if (SYMPHONIC_SIGNALS.has(h)) hits++
    }
    if (hits >= REQUIRED_SIGNAL_COUNT) return i
  }
  return 0
}

// ─── detectEncodingFromBOM() ─────────────────────────────────────────────────

function detectEncodingFromBOM(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le'
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be'
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8'
  return 'utf-8'
}

// ─── parseSymphonicFile() ─────────────────────────────────────────────────────

/**
 * Parses a Symphonic revenue-detail CSV/XLSX file.
 *
 * Returns null if the file does not appear to be Symphonic format,
 * allowing callers to fall back to the generic RUPE engine.
 */
export async function parseSymphonicFile(file: File): Promise<SymphonicParseResult | null> {
  const log: string[] = []
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  let rawRows: string[][] = []

  try {
    if (['xlsx', 'xls', 'ods'].includes(ext)) {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array', cellDates: true })
      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn]
        const t  = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
        if (t.length > rawRows.length) rawRows = t
      }
    } else {
      const rawBuf   = await file.arrayBuffer()
      const bytes    = new Uint8Array(rawBuf)
      const encoding = detectEncodingFromBOM(bytes)
      const text     = new TextDecoder(encoding).decode(rawBuf)

      // Detect delimiter
      const firstLine = text.slice(0, 2000)
      const sep = firstLine.includes('\t') ? '\t' : ','

      await new Promise<void>((resolve, reject) => {
        Papa.parse<string[]>(text, {
          delimiter: sep,
          skipEmptyLines: true,
          chunk: (results: Papa.ParseResult<string[]>) => {
            for (const row of results.data) rawRows.push(row)
          },
          complete: () => resolve(),
          error: (err: Error) => reject(err),
        })
      })
    }

    if (rawRows.length < 2) {
      log.push('[WARN] Archivo vacío o sin datos suficientes')
      return null
    }

    const headerIdx = findSymphonicHeaderRow(rawRows)
    const headers   = rawRows[headerIdx]

    if (!isSymphonicFile(headers)) {
      return null
    }

    log.push(`[INFO] Formato Symphonic detectado (fila de encabezado: ${headerIdx + 1})`)
    log.push(`[INFO] Archivo: ${file.name}`)

    const { rows, errors } = parseSymphonicRows(rawRows, headerIdx, log)

    // Derive summary stats
    let totalRevenue  = 0
    let totalQuantity = 0
    const currencies  = new Map<string, number>()

    for (const row of rows) {
      // Use high-precision addition (accumulate as strings via parseFloat to avoid IEEE 754 drift)
      totalRevenue  += row.revenue
      totalQuantity += row.quantity
      const cur = row.account_currency || 'USD'
      currencies.set(cur, (currencies.get(cur) ?? 0) + 1)
    }

    // Pick dominant currency
    let dominantCurrency = 'USD'
    let maxCount = 0
    for (const [cur, count] of currencies) {
      if (count > maxCount) { dominantCurrency = cur; maxCount = count }
    }

    // Derive statement period from rows
    const periods = new Set(rows.map(r => r.statement_period).filter(Boolean))
    const statementPeriod = periods.size === 1
      ? [...periods][0]
      : [...periods].join(', ')

    log.push(`[INFO] Período: ${statementPeriod || 'N/A'}`)
    log.push(`[INFO] Moneda dominante: ${dominantCurrency}`)
    log.push(`[INFO] Revenue total: ${totalRevenue.toFixed(8)}`)
    log.push(`[INFO] Cantidad total: ${totalQuantity}`)

    return {
      rows,
      totalRevenue,
      totalQuantity,
      currency:        dominantCurrency,
      statementPeriod,
      rowErrors:       errors,
      log,
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`[ERROR] ${msg}`)
    return { rows: [], totalRevenue: 0, totalQuantity: 0, currency: 'USD', statementPeriod: '', rowErrors: 0, log }
  }
}

// ─── symphonicToRoyaltyRecords() ──────────────────────────────────────────────

/**
 * Converts SymphonicRow[] to the shape expected by the `royalty_records`
 * Supabase table (same shape used by UploadPage's batch insert).
 */
export function symphonicToRoyaltyRecords(
  rows: SymphonicRow[],
  reportId: string,
  userId: string,
): object[] {
  // Only include columns that exist in the royalty_records table
  return rows.map(r => ({
    report_id:   reportId,
    user_id:     userId,
    sale_period: normaliseSymphonicPeriod(r.statement_period),
    store:       r.store,
    country:     r.sale_country,
    artist_name: r.track_artist || r.product_artist,
    song_title:  r.track,
    album_name:  r.product,
    quantity:    r.quantity,
    earnings_usd: r.revenue,
  }))
}

/**
 * Normalises Symphonic period strings like "August 2026" or "2026-08" to "2026-08".
 */
export function normaliseSymphonicPeriod(raw: string): string {
  if (!raw) return ''

  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(raw.trim())) return raw.trim()

  // "Month YYYY" — e.g. "August 2026"
  const MONTHS: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  }
  const m = raw.trim().toLowerCase().match(/^(\w+)\s+(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[1]]
    if (mon) return `${m[2]}-${mon}`
  }

  // "MM/YYYY" or "YYYY/MM"
  const slash = raw.trim().match(/^(\d{1,2})\/(\d{4})$/)
  if (slash) return `${slash[2]}-${slash[1].padStart(2, '0')}`

  return raw.trim()
}
