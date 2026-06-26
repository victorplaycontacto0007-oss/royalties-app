/**
 * AuditReport.ts
 *
 * Defines the AuditReport and DebugSnapshot interfaces and their builder functions.
 *
 * - buildAuditReport(): cross-checks the accumulated net total against a fresh
 *   re-sum of the earnings column values to produce a 'valid' or 'discrepancy'
 *   status (Requirement 10.2, 10.3, Property 6).
 * - buildDebugSnapshot(): captures the column map, raw row samples, and
 *   validation errors needed for the Debug Mode view (Requirement 11).
 *
 * Requirements: 10, 11
 */

import { DecimalAccumulator } from './DecimalAccumulator'
import type { ColumnIndex } from './ColumnMapper'
import type { ValidationIssue } from './RowValidator'

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AuditReport {
  // Metadata
  provider:         string
  fileName:         string
  reportedMonth:    string   // YYYY-MM of the most frequent sale_period
  reportedYear:     string
  currency:         string
  // Counts
  totalRows:        number
  totalColumns:     number
  errorRows:        number
  // Financials (Decimal(20,8) stored as strings)
  grossTotal:       string
  taxes:            string
  channelCosts:     string
  otherCosts:       string
  netTotal:         string
  // Status
  status:           'valid' | 'discrepancy' | 'error'
  discrepancyNote:  string | null
  // Timing
  processingTimeMs: number
  createdAt:        string   // ISO UTC
}

export interface DebugSnapshot {
  provider:         string
  columnMap:        Record<string, { colIdx: number; header: string }>
  earningsColUsed:  string
  earningsColIdx:   number
  first20Rows:      string[][]
  last20Rows:       string[][]
  accumulatedNet:   string
  validationErrors: ValidationIssue[]
}

// ─── Builder params ───────────────────────────────────────────────────────────

export interface BuildAuditReportParams {
  provider:                  string
  fileName:                  string
  currency:                  string
  totalRows:                 number
  totalColumns:              number
  errorRows:                 number
  grossAccumulator:          DecimalAccumulator
  taxesAccumulator:          DecimalAccumulator
  channelCostsAccumulator:   DecimalAccumulator
  otherCostsAccumulator:     DecimalAccumulator
  netAccumulator:            DecimalAccumulator
  /** Individual row earnings values used to verify the accumulated total. */
  earningsColumnValues:      number[]
  /** sale_period value from every data row (used to compute reportedMonth). */
  salePeriods:               string[]
  processingTimeMs:          number
}

export interface BuildDebugSnapshotParams {
  provider:         string
  columnMap:        ColumnIndex
  rawHeaders:       string[]
  earningsColUsed:  string
  earningsColIdx:   number
  first20Rows:      string[][]
  last20Rows:       string[][]
  netAccumulator:   DecimalAccumulator
  validationErrors: ValidationIssue[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the YYYY-MM string that appears most frequently in `salePeriods`.
 * Falls back to the raw string when no YYYY-MM pattern is found.
 * Returns '' when the array is empty.
 */
function mostFrequentPeriod(salePeriods: string[]): string {
  if (salePeriods.length === 0) return ''

  const freq = new Map<string, number>()
  for (const raw of salePeriods) {
    const trimmed = raw.trim()
    if (trimmed === '') continue

    // Normalise to YYYY-MM when possible
    const yyyyMM = /^(\d{4})-(\d{2})/.exec(trimmed)
    const key = yyyyMM ? `${yyyyMM[1]}-${yyyyMM[2]}` : trimmed

    freq.set(key, (freq.get(key) ?? 0) + 1)
  }

  if (freq.size === 0) return ''

  let best = ''
  let bestCount = 0
  for (const [key, count] of freq) {
    if (count > bestCount) {
      bestCount = count
      best = key
    }
  }
  return best
}

/**
 * Re-sums `values` using a fresh DecimalAccumulator so the comparison uses
 * the same integer-BigInt arithmetic as the main accumulation pass.
 */
function resumEarnings(values: number[]): DecimalAccumulator {
  const acc = new DecimalAccumulator()
  for (const v of values) {
    acc.add(v)
  }
  return acc
}

/**
 * Returns true when two toFixed8() strings differ by more than 1e-8
 * (i.e. when they are not identical strings, which is the strict form).
 *
 * Because both sides are produced by the same BigInt-backed fixed-8
 * formatter, a string inequality is sufficient to detect any discrepancy.
 */
function hasDiscrepancy(accumulatedFixed8: string, resumFixed8: string): boolean {
  if (accumulatedFixed8 === resumFixed8) return false

  // Extra numeric guard: parse both as floats and check |delta| > 1e-8
  const a = parseFloat(accumulatedFixed8)
  const b = parseFloat(resumFixed8)
  if (!isFinite(a) || !isFinite(b)) return true
  return Math.abs(a - b) > 1e-8
}

// ─── Builders ─────────────────────────────────────────────────────────────────

/**
 * Builds a complete AuditReport from the accumulators and metadata
 * gathered during a single parse run.
 *
 * Status logic (Requirement 10.2, 10.3, Property 6):
 *   - Re-sum earningsColumnValues with a fresh DecimalAccumulator
 *   - If |accumulated - resum| > 1e-8 → status = 'discrepancy'
 *   - Otherwise → status = 'valid'
 */
export function buildAuditReport(params: BuildAuditReportParams): AuditReport {
  const {
    provider,
    fileName,
    currency,
    totalRows,
    totalColumns,
    errorRows,
    grossAccumulator,
    taxesAccumulator,
    channelCostsAccumulator,
    otherCostsAccumulator,
    netAccumulator,
    earningsColumnValues,
    salePeriods,
    processingTimeMs,
  } = params

  // Determine status by comparing accumulated net vs. fresh re-sum
  const accFixed8 = netAccumulator.toFixed8()
  const resum     = resumEarnings(earningsColumnValues)
  const resumFixed8 = resum.toFixed8()

  let status: AuditReport['status']
  let discrepancyNote: string | null

  if (hasDiscrepancy(accFixed8, resumFixed8)) {
    status = 'discrepancy'
    discrepancyNote =
      `Total acumulado (${accFixed8}) difiere de la re-suma de la columna ` +
      `de earnings (${resumFixed8}). Diferencia: ` +
      `${(parseFloat(accFixed8) - parseFloat(resumFixed8)).toFixed(8)}.`
  } else {
    status = 'valid'
    discrepancyNote = null
  }

  // Compute reportedMonth from the most frequent sale_period
  const reportedMonth = mostFrequentPeriod(salePeriods)

  // Derive reportedYear from reportedMonth when it has YYYY-MM shape
  const yearMatch = /^(\d{4})-/.exec(reportedMonth)
  const reportedYear = yearMatch ? yearMatch[1] : reportedMonth.slice(0, 4) || ''

  return {
    provider,
    fileName,
    reportedMonth,
    reportedYear,
    currency,
    totalRows,
    totalColumns,
    errorRows,
    grossTotal:   grossAccumulator.toFixed8(),
    taxes:        taxesAccumulator.toFixed8(),
    channelCosts: channelCostsAccumulator.toFixed8(),
    otherCosts:   otherCostsAccumulator.toFixed8(),
    netTotal:     accFixed8,
    status,
    discrepancyNote,
    processingTimeMs,
    createdAt:    new Date().toISOString(),
  }
}

/**
 * Builds a DebugSnapshot that captures the column-detection context and raw
 * row samples needed for the "Ver Auditoría" debug view (Requirement 11).
 */
export function buildDebugSnapshot(params: BuildDebugSnapshotParams): DebugSnapshot {
  const {
    provider,
    columnMap,
    rawHeaders,
    earningsColUsed,
    earningsColIdx,
    first20Rows,
    last20Rows,
    netAccumulator,
    validationErrors,
  } = params

  // Convert ColumnIndex (canonical → number|null) to the snapshot shape
  // (canonical → { colIdx, header }).  Skip null entries.
  const columnMapSnapshot: Record<string, { colIdx: number; header: string }> = {}
  for (const [field, idx] of Object.entries(columnMap)) {
    if (idx !== null && idx >= 0) {
      columnMapSnapshot[field] = {
        colIdx: idx,
        header: rawHeaders[idx] ?? '',
      }
    }
  }

  return {
    provider,
    columnMap:       columnMapSnapshot,
    earningsColUsed,
    earningsColIdx,
    first20Rows,
    last20Rows,
    accumulatedNet:  netAccumulator.toFixed8(),
    validationErrors,
  }
}
