import { useState } from 'react'
import type { CurrencyGroup } from '../royalty-engine/CurrencyGrouper'
import type { TargetCurrency, ConversionResult } from '../royalty-engine/CurrencyConverter'
import { Loader2, RefreshCw } from 'lucide-react'

const TARGET_CURRENCIES: TargetCurrency[] = ['USD', 'EUR', 'COP', 'GBP', 'MXN', 'CAD', 'JPY']

interface CurrencyTabProps {
  groups: CurrencyGroup[]
  onConvert: (target: TargetCurrency) => Promise<void>
  converting: boolean
  conversionResult: ConversionResult | null
  conversionError: string | null
}

export default function CurrencyTab({
  groups,
  onConvert,
  converting,
  conversionResult,
  conversionError,
}: CurrencyTabProps) {
  const [target, setTarget] = useState<TargetCurrency>('USD')

  if (groups.length === 0) {
    return (
      <div className="text-center py-8 text-text-muted text-sm">
        No se encontraron datos de monedas para este reporte.
      </div>
    )
  }

  // Build a lookup from the conversion result
  const convMap = new Map(
    conversionResult?.groups.map(g => [g.currency, g]) ?? []
  )

  return (
    <div className="space-y-5">
      {/* Converter controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={target}
          onChange={e => setTarget(e.target.value as TargetCurrency)}
          disabled={converting}
          className="input text-sm max-w-[130px]"
        >
          {TARGET_CURRENCIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <button
          onClick={() => onConvert(target)}
          disabled={converting}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          {converting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Convirtiendo...</>
            : <><RefreshCw className="w-4 h-4" /> Convertir Totales</>
          }
        </button>

        {conversionResult && !converting && (
          <span className="text-text-muted text-xs">
            Convertido a <strong className="text-text-secondary">{conversionResult.targetCurrency}</strong>
          </span>
        )}
      </div>

      {/* Error */}
      {conversionError && (
        <p className="text-error text-xs bg-error/10 border border-error/20 rounded-lg px-3 py-2">
          {conversionError}
        </p>
      )}

      {/* Currency cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(g => {
          const conv = convMap.get(g.currency)
          return (
            <div key={g.currency} className="card-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="badge badge-primary text-xs font-bold">{g.currency}</span>
                <span className="text-text-muted text-xs">{g.percentage.toFixed(2)}%</span>
              </div>

              <p className="text-text-primary font-bold text-lg">
                {g.total.toFixed(2)}
              </p>

              <p className="text-text-muted text-xs">
                {g.recordCount.toLocaleString()} registros
              </p>

              {conv && conv.currency !== conversionResult?.targetCurrency && (
                <div className="pt-2 border-t border-border">
                  <p className="text-text-secondary text-xs">
                    <span className="text-text-muted">≈ </span>
                    <span className="font-semibold">{conv.convertedTotal.toFixed(2)}</span>
                    <span className="text-text-muted ml-1">{conversionResult?.targetCurrency}</span>
                    <span className="text-text-muted ml-1.5 text-[10px]">(×{conv.rate.toFixed(4)})</span>
                  </p>
                </div>
              )}
              {conv && conv.currency === conversionResult?.targetCurrency && (
                <div className="pt-2 border-t border-border">
                  <p className="text-text-muted text-xs">Moneda base — tasa 1.0</p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
