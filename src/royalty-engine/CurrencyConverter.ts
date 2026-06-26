/**
 * CurrencyConverter.ts — On-demand exchange rate client.
 * Uses open.er-api.com (free, no API key, CORS-enabled).
 * Never called during file parsing — only on explicit user action.
 * Requirements: 8.2, 8.5, 8.6, 8.7
 */

import type { CurrencyGroup } from './CurrencyGrouper'

export type TargetCurrency = 'USD' | 'EUR' | 'COP' | 'GBP' | 'MXN' | 'CAD' | 'JPY'

export interface ConversionResult {
  targetCurrency: TargetCurrency
  groups: Array<{
    currency:       string
    originalTotal:  number
    convertedTotal: number
    rate:           number
  }>
}

const ENDPOINT = 'https://open.er-api.com/v6/latest/USD'
const TIMEOUT_MS = 10_000

/**
 * Fetches USD-based rates once, derives all cross-rates client-side,
 * and returns converted totals for every CurrencyGroup.
 */
export async function convertCurrencies(
  groups: CurrencyGroup[],
  targetCurrency: TargetCurrency,
  signal?: AbortSignal,
): Promise<ConversionResult> {
  // Combine caller signal with timeout signal
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), TIMEOUT_MS)

  const combinedSignal = signal
    ? AbortSignal.any
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal   // fallback: only timeout
    : timeoutController.signal

  let res: Response
  try {
    res = await fetch(ENDPOINT, { signal: combinedSignal })
  } catch (err: unknown) {
    clearTimeout(timer)
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'La solicitud de tasas de cambio excedió el tiempo límite (10 s).'
      : 'Error de red al obtener tasas de cambio. Verifica tu conexión.'
    throw new Error(msg)
  }
  clearTimeout(timer)

  if (!res.ok) {
    throw new Error(`Error al obtener tasas de cambio (HTTP ${res.status}). Intenta de nuevo.`)
  }

  const json = await res.json() as { rates?: Record<string, number> }
  const rates = json.rates
  if (!rates || typeof rates[targetCurrency] !== 'number') {
    throw new Error('Respuesta de tasas de cambio inválida. Intenta de nuevo.')
  }

  const targetRate = rates[targetCurrency] // rate vs USD

  const result: ConversionResult = {
    targetCurrency,
    groups: groups.map(g => {
      if (g.currency === targetCurrency) {
        return { currency: g.currency, originalTotal: g.total, convertedTotal: g.total, rate: 1 }
      }
      const sourceRate = rates[g.currency]
      if (!sourceRate) {
        // Unknown source currency — pass through as-is
        return { currency: g.currency, originalTotal: g.total, convertedTotal: g.total, rate: 1 }
      }
      // Cross-rate: convert source → USD → target
      const rate = targetRate / sourceRate
      const convertedTotal = Math.round(g.total * rate * 100) / 100
      return { currency: g.currency, originalTotal: g.total, convertedTotal, rate }
    }),
  }

  return result
}
