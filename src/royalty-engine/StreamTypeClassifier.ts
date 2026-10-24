/**
 * StreamTypeClassifier.ts
 *
 * Pure TypeScript module — NO React, NO Supabase, NO UI imports.
 *
 * Responsibilities:
 *  - Define StreamCategory union type and OrchardRecord interface
 *  - classify(raw): StreamCategory  — pure, deterministic, no side effects
 *  - toOrchardRecords()             — maps RUPEResult + rawRows → OrchardRecord[]
 *  - parseOrchardFile()             — async entry point: File → { records, unmappedColumns, importLog }
 *
 * Requirements: 1.1, 1.2, 1.3, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 16.1, 16.2, 16.3
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { parseFile, type RUPEResult, type ParsedRow } from './UniversalParser'
import { mapColumns } from './ColumnMapper'
import { Logger } from './Logger'
import { findHeaderRow } from './HeaderFinder'
import { detectSeparator } from './SeparatorDetector'

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * The seven normalized stream categories.
 * Classification is ALWAYS based solely on transaction_type field — never on
 * revenue, country, platform, or any other field (Requirements 3.9, 16.1).
 */
export type StreamCategory =
  | 'FULL_PAY'
  | 'FREE_AD_SUPPORTED'
  | 'FREE_TRIAL'
  | 'UNQUALIFIED'
  | 'FRAUDULENT'
  | 'OTHER'
  | 'UNKNOWN'

/**
 * Immutable record extending ParsedRow with Orchard-specific audit fields.
 * rawStreamType is NEVER modified — it preserves the literal value from the report.
 * Requirements: 1.1, 1.5, 18.1
 */
export interface OrchardRecord {
  // ── Inherited from ParsedRow ──────────────────────────────────────────────
  net_total:      number
  gross_total:    number
  taxes:          number
  channel_costs:  number
  other_costs:    number
  currency:       string
  artist:         string
  track:          string
  album:          string
  upc:            string
  isrc:           string
  platform:       string
  country:        string
  quantity:       number
  sale_period:    string
  artist_name:    string
  song_title:     string
  album_name:     string
  store:          string
  earnings_usd:   number

  // ── Orchard-specific fields ───────────────────────────────────────────────
  /** Literal value from report — never modified (Requirements 1.5, 16.3) */
  rawStreamType:          string
  /** Normalized category assigned by classifier (Requirements 3.1–3.8) */
  normalizedStreamType:   StreamCategory
  /** 1-based row index in source file, accounting for header row (Requirement 1.2) */
  rowIndex:               number
  /** Original filename for traceability (Requirements 1.1, 17.5, 18.1) */
  sourceFile:             string
}

// ─── Classification Patterns ──────────────────────────────────────────────────

/**
 * Patterns for each category.
 * ORDER IS CRITICAL — more specific / higher-priority categories first.
 * Matching: normalized.includes(pattern) after lowercasing both sides.
 */

/** Requirement 3.6 */
const FRAUDULENT_PATTERNS: string[] = [
  'fraudulent stream',
  'fraud',
  'artificial stream',
  'invalid stream',
  'fraudulent',
]

/** Requirement 3.5 */
const UNQUALIFIED_PATTERNS: string[] = [
  'unqualified audio stream',
  'unqualified stream',
  'non-qualified',
  'no qualifying stream',
  'unqualified',
]

/** Requirement 3.3 — checked BEFORE FREE_AD to prevent "free trial" → FREE_AD_SUPPORTED */
const FREE_TRIAL_PATTERNS: string[] = [
  'free trial',
  'trial',
  'trial subscription',
  'promotional trial',
]

/** Requirement 3.2 */
const FREE_AD_PATTERNS: string[] = [
  'ad-supported audio stream',
  'ad supported audio stream',
  'ad supported audio streams from art track',
  'ad supported audio streams from ugc',
  'ad supported streams',
  'ad-supported audio streams',
  'ad supported',
  'short-form video user generated',
  'short form video user generated',
  'free',
  'avod',
  'ad-supported',
]

/** Requirement 3.1 */
const FULL_PAY_PATTERNS: string[] = [
  'subscription audio stream',
  'subscription audio streams from art track',
  'subscription streams from art track',
  'subscription audio streams from ugc',
  'subscription streams from audio ugc',
  'subscription streams from ugc',
  'premium',
  'paid subscription',
  'full pay',
  'paid',
  'subscription',
]

// ─── classify() ──────────────────────────────────────────────────────────────

/**
 * Pure classification function.
 *
 * - null / undefined / empty / whitespace-only → UNKNOWN  (Requirements 16.2, 3.7)
 * - Matched by pattern list in priority order:
 *   FRAUDULENT → UNQUALIFIED → FREE_TRIAL → FREE_AD_SUPPORTED → FULL_PAY → OTHER
 * - Never reads any field other than the raw string (Requirements 3.9, 16.1)
 * - Never throws (design safety rule)
 *
 * Requirements: 3.1–3.9, 16.1, 16.2, 16.3
 */
export function classify(raw: string | null | undefined): StreamCategory {
  // Guard: empty / null / undefined → UNKNOWN
  if (raw == null) return 'UNKNOWN'
  const trimmed = raw.trim()
  if (trimmed === '') return 'UNKNOWN'

  const normalized = trimmed.toLowerCase()

  // Priority 1: FRAUDULENT (before UNQUALIFIED to prevent overlap — Requirement 3.6)
  for (const pattern of FRAUDULENT_PATTERNS) {
    if (normalized.includes(pattern)) return 'FRAUDULENT'
  }

  // Priority 2: UNQUALIFIED
  for (const pattern of UNQUALIFIED_PATTERNS) {
    if (normalized.includes(pattern)) return 'UNQUALIFIED'
  }

  // Priority 3: FREE_TRIAL (before FREE_AD_SUPPORTED — Requirement 3.4)
  for (const pattern of FREE_TRIAL_PATTERNS) {
    if (normalized.includes(pattern)) return 'FREE_TRIAL'
  }

  // Priority 4: FREE_AD_SUPPORTED
  for (const pattern of FREE_AD_PATTERNS) {
    if (normalized.includes(pattern)) return 'FREE_AD_SUPPORTED'
  }

  // Priority 5: FULL_PAY
  for (const pattern of FULL_PAY_PATTERNS) {
    if (normalized.includes(pattern)) return 'FULL_PAY'
  }

  // Known value but no category match → OTHER (Requirement 3.8, 16.3)
  return 'OTHER'
}

// ─── toOrchardRecords() ───────────────────────────────────────────────────────

/**
 * Converts a RUPEResult + raw file rows into OrchardRecord[].
 *
 * For each ParsedRow at index i:
 *   - rowIndex = i + 2  (1-based, +1 for header row, +1 for 1-based index)
 *   - sourceFile = fileName
 *   - rawStreamType = raw cell from rawRows[i][transactionTypeColIdx], or "" if absent
 *   - normalizedStreamType = classify(rawStreamType)
 *   - All other fields copied from ParsedRow
 *
 * Requirements: 1.1, 1.2, 1.5, 3.1–3.9
 */
export function toOrchardRecords(
  result: RUPEResult,
  rawRows: string[][],
  transactionTypeColIdx: number | null,
  fileName: string,
): OrchardRecord[] {
  return result.rows.map((row: ParsedRow, i: number): OrchardRecord => {
    // Extract raw stream type from original row (before any parsing/transformation)
    const rawStreamType =
      transactionTypeColIdx !== null && rawRows[i] != null
        ? (rawRows[i][transactionTypeColIdx] ?? '').toString().trim()
        : ''

    return {
      // Copy all ParsedRow fields
      net_total:     row.net_total,
      gross_total:   row.gross_total,
      taxes:         row.taxes,
      channel_costs: row.channel_costs,
      other_costs:   row.other_costs,
      currency:      row.currency,
      artist:        row.artist,
      track:         row.track,
      album:         row.album,
      upc:           row.upc,
      isrc:          row.isrc,
      platform:      row.platform,
      country:       row.country,
      quantity:      row.quantity,
      sale_period:   row.sale_period,
      artist_name:   row.artist_name,
      song_title:    row.song_title,
      album_name:    row.album_name,
      store:         row.store,
      earnings_usd:  row.earnings_usd,

      // Orchard-specific fields
      rawStreamType,
      normalizedStreamType: classify(rawStreamType),
      rowIndex:  i + 2,   // 1-based, header row is row 1
      sourceFile: fileName,
    }
  })
}

// ─── Encoding Detection (local helper) ────────────────────────────────────────

function detectEncodingFromBOM(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le'
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be'
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8'
  return 'utf-8'
}

// ─── parseOrchardFile() ───────────────────────────────────────────────────────

/**
 * Async entry point for Orchard file processing.
 *
 * Algorithm:
 * 1. Read raw rows from the file (PapaParse for CSV/TSV, XLSX for Excel)
 * 2. Call parseFile() to get structured RUPEResult
 * 3. Find the transaction_type column index from raw headers using mapColumns()
 * 4. Call toOrchardRecords() to build OrchardRecord[]
 * 5. Return records + unmapped column names + import log strings
 *
 * On any failure, returns { records: [], unmappedColumns: [], importLog: ["Error: <message>"] }
 *
 * Requirements: 1.1, 1.2, 1.3, 2.3, 16.2
 */
export async function parseOrchardFile(file: File): Promise<{
  records: OrchardRecord[]
  unmappedColumns: string[]
  importLog: string[]
}> {
  const logger = new Logger()

  try {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    // ── Step 1: Read raw rows from file ────────────────────────────────────
    let rawTextRows: string[][] = []

    if (['xlsx', 'xls', 'ods'].includes(ext)) {
      const buf = await file.arrayBuffer()
      const wb  = XLSX.read(buf, { type: 'array', cellDates: true })

      for (const sn of wb.SheetNames) {
        const ws = wb.Sheets[sn]
        const t  = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
        if (t.length > rawTextRows.length) rawTextRows = t
      }
    } else {
      // CSV / TSV / TXT
      const rawBuf   = await file.arrayBuffer()
      const bytes    = new Uint8Array(rawBuf)
      const encoding = detectEncodingFromBOM(bytes)
      const text     = new TextDecoder(encoding).decode(rawBuf)
      const sep      = detectSeparator(text.slice(0, 4000))

      await new Promise<void>((resolve, reject) => {
        Papa.parse<string[]>(text, {
          delimiter: sep,
          skipEmptyLines: true,
          chunk: (results: Papa.ParseResult<string[]>) => {
            for (const row of results.data) rawTextRows.push(row)
          },
          complete: () => resolve(),
          error: (err: Error) => reject(err),
        })
      })
    }

    if (rawTextRows.length < 2) {
      logger.warn('Archivo vacío o sin filas de datos')
      return { records: [], unmappedColumns: [], importLog: logger.toStrings() }
    }

    // ── Step 2: Find header row and extract raw headers ────────────────────
    const headerIdx  = findHeaderRow(rawTextRows, logger)
    const rawHeaders = rawTextRows[headerIdx].map(h => (h ?? '').toString())

    // Data rows aligned to how UniversalParser will emit them (after header row)
    const dataRows   = rawTextRows.slice(headerIdx + 1)

    // ── Step 3: Map columns and find transaction_type index ────────────────
    const colMap                   = mapColumns(rawHeaders, logger)
    const transactionTypeColIdx    = colMap.transaction_type ?? null

    if (transactionTypeColIdx === null) {
      logger.warn('Columna de tipo de stream no encontrada — todos los registros tendrán normalizedStreamType: UNKNOWN')
    } else {
      logger.info(`transaction_type detectado en col[${transactionTypeColIdx}] "${rawHeaders[transactionTypeColIdx]}"`)
    }

    // ── Detect unmapped columns (Requirement 2.3) ──────────────────────────
    const normalizedMappedSet = new Set<string>()
    for (const idx of Object.values(colMap)) {
      if (idx !== null) normalizedMappedSet.add(String(idx))
    }

    const unmappedColumns: string[] = []
    rawHeaders.forEach((h, i) => {
      const label = h.trim()
      if (label && !normalizedMappedSet.has(String(i))) {
        unmappedColumns.push(label)
      }
    })

    if (unmappedColumns.length > 0) {
      logger.warn(`Columnas no mapeadas: ${unmappedColumns.join(', ')}`)
    }

    // ── Step 4: Call parseFile() to get structured RUPEResult ─────────────
    const result = await parseFile(file)

    // ── Step 5: Build OrchardRecord[] ─────────────────────────────────────
    // dataRows are aligned to result.rows: result.rows[i] corresponds to dataRows[i]
    const records = toOrchardRecords(result, dataRows, transactionTypeColIdx, file.name)

    // Log unclassified records (Requirement 18.4)
    for (const rec of records) {
      if (rec.normalizedStreamType === 'UNKNOWN' && rec.rawStreamType === '') {
        logger.warn(`Fila ${rec.rowIndex}: tipo de stream vacío → UNKNOWN`)
      } else if (rec.normalizedStreamType === 'OTHER') {
        logger.info(`Fila ${rec.rowIndex}: tipo de stream no clasificado ("${rec.rawStreamType}") → OTHER`)
      }
    }

    logger.info(`Total registros OrchardRecord generados: ${records.length}`)

    return {
      records,
      unmappedColumns,
      importLog: logger.toStrings(),
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      records: [],
      unmappedColumns: [],
      importLog: [`Error: ${message}`],
    }
  }
}
