/**
 * RowValidator.ts
 * Validates individual data rows, detecting corrupt, empty, non-numeric,
 * negative, duplicate, and currency-mismatch issues.
 *
 * - Issues are generated ONLY when a problem is found (no log for clean rows).
 * - Only `corrupt` rows are skipped; all other issues are recoverable.
 */

import { parseMoney } from './MoneyParser'
import type { ColumnIndex } from './ColumnMapper'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  rowIndex: number
  type: 'empty_field' | 'non_numeric' | 'negative' | 'duplicate' | 'currency_mismatch' | 'corrupt'
  field: string
  message: string
}

export interface ValidationResult {
  issues: ValidationIssue[]
  /** true only when the row has wrong column count (corrupt). All other issues leave this false. */
  isSkipped: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Required fields that must not be empty. */
const REQUIRED_FIELDS: ReadonlyArray<keyof ColumnIndex> = [
  'artist',
  'track',
  'platform',
  'country',
  'sale_period',
]

/** Monetary fields that must contain a parseable number. */
const MONETARY_FIELDS: ReadonlyArray<keyof ColumnIndex> = [
  'net_total',
  'gross_total',
  'taxes',
  'channel_costs',
  'other_costs',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strips the same currency/symbol prefixes that MoneyParser strips, then checks
 * whether what remains is a recognisable numeric string (digits, separators,
 * optional leading minus / parentheses accounting format).
 *
 * Returns true when `raw` is non-empty and clearly cannot represent a number.
 * An empty string is not considered an error here (treated as 0 by the engine).
 */
function isNonNumeric(raw: string): boolean {
  if (raw.trim() === '') return false

  // Strip the same tokens as MoneyParser (currency codes + symbols + spaces)
  let s = raw.trim()
  s = s.replace(/[$€£¥₩₹USDEURCOP GBP]/g, '').trim()
  // Also strip MXN and other codes that may be added in V2
  s = s.replace(/\b(MXN|BRL|CHF|SEK|NOK|DKK|CAD|AUD|JPY)\b/gi, '').trim()
  // Unwrap accounting parens: (123.45) → -123.45
  s = s.replace(/^\(([^)]+)\)$/, '-$1')

  if (s === '' || s === '-') return false  // was only a symbol — treat as 0

  // A valid monetary string contains at least one digit after stripping
  // Allow: digits, comma, dot, minus, spaces (thousands separator)
  const numericPattern = /^-?\d[\d\s.,]*$/
  return !numericPattern.test(s)
}

/** Safe cell read — returns '' if the column index is null or out of bounds. */
function cell(row: string[], idx: number | null): string {
  if (idx === null || idx < 0 || idx >= row.length) return ''
  return (row[idx] ?? '').trim()
}

// ─── RowValidator ─────────────────────────────────────────────────────────────

export class RowValidator {
  private readonly seen = new Set<string>()
  private readonly expectedColCount: number
  private readonly fileCurrency: string

  constructor(expectedColCount: number, fileCurrency: string) {
    this.expectedColCount = expectedColCount
    this.fileCurrency = fileCurrency.trim().toUpperCase()
  }

  /**
   * Validates a single data row.
   *
   * @param row       Raw string cells from the CSV/XLSX row.
   * @param rowIndex  1-based (or 0-based) row index for issue reporting.
   * @param colMap    Column index map produced by ColumnMapper.
   * @returns         ValidationResult with issues list and isSkipped flag.
   */
  validate(row: string[], rowIndex: number, colMap: ColumnIndex): ValidationResult {
    const issues: ValidationIssue[] = []

    // ── Check 1: corrupt (wrong column count) ─────────────────────────────
    if (row.length !== this.expectedColCount) {
      issues.push({
        rowIndex,
        type: 'corrupt',
        field: 'row',
        message: `Fila corrupta: se esperaban ${this.expectedColCount} columnas, se encontraron ${row.length}`,
      })
      return { issues, isSkipped: true }
    }

    // ── Check 2: empty_field ──────────────────────────────────────────────
    for (const field of REQUIRED_FIELDS) {
      const value = cell(row, colMap[field])
      if (value === '') {
        issues.push({
          rowIndex,
          type: 'empty_field',
          field,
          message: `Campo requerido "${field}" vacío`,
        })
      }
    }

    // ── Check 3: non_numeric (monetary columns) ───────────────────────────
    for (const field of MONETARY_FIELDS) {
      const idx = colMap[field]
      if (idx === null) continue  // column not present in file — skip
      const raw = cell(row, idx)
      if (raw !== '' && isNonNumeric(raw)) {
        issues.push({
          rowIndex,
          type: 'non_numeric',
          field,
          message: `Columna monetaria "${field}" contiene valor no numérico: "${raw}"`,
        })
      }
    }

    // ── Check 4: negative net_total ────────────────────────────────────────
    const netRaw = cell(row, colMap.net_total)
    if (netRaw !== '') {
      const netValue = parseMoney(netRaw)
      if (isFinite(netValue) && netValue < 0) {
        issues.push({
          rowIndex,
          type: 'negative',
          field: 'net_total',
          message: `net_total negativo: ${netValue}`,
        })
      }
    }

    // ── Check 5: duplicate ────────────────────────────────────────────────
    const artist = cell(row, colMap.artist)
    const track  = cell(row, colMap.track)
    const platform = cell(row, colMap.platform)
    const country  = cell(row, colMap.country)
    const period   = cell(row, colMap.sale_period)
    const net      = cell(row, colMap.net_total)

    const dupKey = `${artist}|${track}|${platform}|${country}|${period}|${net}`
    if (this.seen.has(dupKey)) {
      issues.push({
        rowIndex,
        type: 'duplicate',
        field: 'row',
        message: `Fila duplicada: clave "${dupKey}"`,
      })
    } else {
      this.seen.add(dupKey)
    }

    // ── Check 6: currency_mismatch ────────────────────────────────────────
    const currencyRaw = cell(row, colMap.currency)
    if (currencyRaw !== '') {
      const rowCurrency = currencyRaw.trim().toUpperCase()
      if (rowCurrency !== this.fileCurrency) {
        issues.push({
          rowIndex,
          type: 'currency_mismatch',
          field: 'currency',
          message: `Moneda de fila "${rowCurrency}" difiere de la moneda del archivo "${this.fileCurrency}"`,
        })
      }
    }

    return { issues, isSkipped: false }
  }
}
