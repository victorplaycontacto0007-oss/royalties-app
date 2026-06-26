/**
 * CurrencyDetector.ts
 * Scans ALL rows in a report to detect the file-level currency using frequency-wins strategy.
 *
 * Requirement 13:
 *   13.1 — Scan file content and headers for currency code
 *   13.2 — Recognize: USD, EUR, GBP, CAD, AUD, JPY, MXN, COP, BRL, CHF, SEK, NOK, DKK
 *   13.3 — Detect from symbols: $ → USD, € → EUR, £ → GBP
 *   13.4 — Multiple currencies detected → use most frequent; log [WARN]
 *   13.5 — No currency detected → default to USD; log [WARN]
 */
import { Logger } from './Logger'

/** Known ISO currency codes (Requirement 13.2) */
const KNOWN_CODES = new Set([
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'MXN',
  'COP', 'BRL', 'CHF', 'SEK', 'NOK', 'DKK',
])

/** Symbol → currency code mappings (Requirement 13.3) */
const SYMBOL_MAP: Record<string, string> = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
}

/**
 * Resolve a single cell value to a currency code, or null if unrecognized.
 * Checks:
 *   1. Exact match against known ISO codes (trimmed + uppercased)
 *   2. Exact match against currency symbols
 */
function resolveCell(cell: string): string | null {
  const trimmed = cell.trim()
  if (!trimmed) return null

  // Check symbol first (exact match)
  if (SYMBOL_MAP[trimmed]) return SYMBOL_MAP[trimmed]

  // Check known currency codes (case-insensitive exact match)
  const upper = trimmed.toUpperCase()
  if (KNOWN_CODES.has(upper)) return upper

  return null
}

/**
 * Build a frequency map of all currency codes detected across ALL rows and headers.
 * Used by RowValidator for currency_mismatch checks.
 *
 * @param rows      All data rows (string[][])
 * @param headerRow The header row (string[])
 * @returns         Map from currency code → occurrence count
 */
export function detectCurrencyMap(rows: string[][], headerRow: string[]): Map<string, number> {
  const freq = new Map<string, number>()

  // Scan header row once
  for (const cell of headerRow) {
    const code = resolveCell((cell ?? '').toString())
    if (code) freq.set(code, (freq.get(code) ?? 0) + 1)
  }

  // Scan ALL data rows (no slice limit — Requirement 13.1)
  for (const row of rows) {
    for (const cell of row) {
      const code = resolveCell((cell ?? '').toString())
      if (code) freq.set(code, (freq.get(code) ?? 0) + 1)
    }
  }

  return freq
}

/**
 * Detect the file-level currency using frequency-wins strategy.
 *
 * Scans ALL rows (not just first 30). Counts every occurrence of each
 * recognized currency code/symbol across all cells. Returns the most
 * frequent one. If multiple distinct currencies are found, logs a [WARN].
 * If none found, defaults to 'USD' and logs a [WARN].
 *
 * @param rows      All data rows (string[][])
 * @param headerRow The header row (string[])
 * @param logger    Optional Logger instance for [WARN] messages
 * @returns         ISO currency code string (e.g. 'USD')
 */
export function detectCurrency(rows: string[][], headerRow: string[], logger?: Logger): string {
  const freq = detectCurrencyMap(rows, headerRow)

  if (freq.size === 0) {
    // Requirement 13.5 — no currency detected
    logger?.warn('Moneda no detectada, usando USD por defecto')
    return 'USD'
  }

  // Find the currency with the highest count (frequency-wins)
  let winner = 'USD'
  let maxCount = 0
  for (const [code, count] of freq) {
    if (count > maxCount) {
      maxCount = count
      winner = code
    }
  }

  // Requirement 13.4 — multiple distinct currencies detected
  if (freq.size > 1) {
    const list = [...freq.keys()].join(', ')
    logger?.warn(`Múltiples monedas detectadas: ${list}. Usando la más frecuente: ${winner}`)
  }

  return winner
}
