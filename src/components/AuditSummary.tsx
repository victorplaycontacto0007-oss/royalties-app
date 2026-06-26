/**
 * AuditSummary.tsx
 *
 * Post-import audit summary card. Displays provider metadata, file info,
 * financial totals, and status badge from an AuditReport + RUPEStats pair.
 *
 * Requirements: 10, 15
 */

import type { AuditReport } from '../royalty-engine/AuditReport'
import type { RUPEStats } from '../royalty-engine/Statistics'
import { CheckCircle, AlertTriangle, Search, BarChart2 } from 'lucide-react'

// ─── Props ────────────────────────────────────────────────────────────────────

interface AuditSummaryProps {
  audit: AuditReport
  stats: RUPEStats
  onViewAudit?: () => void
  onViewAnalysis?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses a Decimal(20,8) string (e.g. "12450.30000000") and formats it as
 * a currency string with 2 decimal places using the provided currency code.
 */
function fmtCurrency(raw: string, currency: string): string {
  const n = parseFloat(raw)
  if (!isFinite(n)) return raw
  try {
    return n.toLocaleString('en-US', {
      style:                 'currency',
      currency:              currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  } catch {
    // Fallback if currency code is unrecognised
    return `${currency} ${n.toFixed(2)}`
  }
}

/** Sum two Decimal(20,8) strings and return a formatted currency string. */
function sumAndFormat(a: string, b: string, currency: string): string {
  const sum = parseFloat(a) + parseFloat(b)
  if (!isFinite(sum)) return fmtCurrency(a, currency)
  try {
    return sum.toLocaleString('en-US', {
      style:                 'currency',
      currency:              currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  } catch {
    return `${currency} ${sum.toFixed(2)}`
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditSummary({ audit, stats, onViewAudit, onViewAnalysis }: AuditSummaryProps) {
  const isValid      = audit.status === 'valid'
  const isDiscrepancy = audit.status === 'discrepancy'

  // ── Header ──────────────────────────────────────────────────────────────────
  const statusIcon = isValid
    ? <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
    : <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />

  const statusLabel = isValid ? 'VÁLIDO' : isDiscrepancy ? 'DISCREPANCIA' : 'ERROR'

  const statusBadgeClass = isValid
    ? 'badge-success'
    : isDiscrepancy
    ? 'badge-warning'
    : 'badge-error'

  const headerText = isValid
    ? 'Reporte importado correctamente'
    : isDiscrepancy
    ? 'Reporte importado con advertencia'
    : 'Error en la importación'

  // ── Costs = channelCosts + otherCosts ────────────────────────────────────────
  const costsFormatted = sumAndFormat(audit.channelCosts, audit.otherCosts, audit.currency)

  return (
    <div className="card space-y-0 overflow-hidden p-0">

      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between gap-3 px-6 py-4 border-b border-border
        ${isValid ? 'bg-success/5' : isDiscrepancy ? 'bg-warning/5' : 'bg-error/5'}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {statusIcon}
          <span className="text-text-primary font-semibold text-sm truncate">{headerText}</span>
        </div>
        <span className={`${statusBadgeClass} shrink-0`}>{statusLabel}</span>
      </div>

      {/* ── Discrepancy warning banner ─────────────────────────────────────── */}
      {isDiscrepancy && audit.discrepancyNote && (
        <div className="flex items-start gap-2 px-6 py-3 bg-warning/5 border-b border-warning/20 text-warning text-xs">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{audit.discrepancyNote}</span>
        </div>
      )}

      <div className="px-6 py-5 space-y-5">

        {/* ── Metadata grid ────────────────────────────────────────────────── */}
        <div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
            <MetaRow label="Proveedor"  value={audit.provider || stats.provider || '—'} />
            <MetaRow label="Archivo"    value={audit.fileName} />
            <MetaRow label="Período"    value={audit.reportedMonth || '—'} />
            <MetaRow label="Moneda"     value={audit.currency || stats.currency} />
            <MetaRow label="Filas"      value={audit.totalRows.toLocaleString()} />
            <MetaRow label="Columnas"   value={audit.totalColumns.toLocaleString()} />
          </div>
        </div>

        {/* ── Divider ──────────────────────────────────────────────────────── */}
        <hr className="border-border" />

        {/* ── Financials grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
          <MetaRow
            label="Total Bruto"
            value={fmtCurrency(audit.grossTotal, audit.currency)}
            valueClass="text-text-primary font-semibold"
          />
          <MetaRow
            label="Impuestos"
            value={fmtCurrency(audit.taxes, audit.currency)}
          />
          <MetaRow
            label="Costos"
            value={costsFormatted}
          />
          <MetaRow
            label="Total Neto"
            value={fmtCurrency(audit.netTotal, audit.currency)}
            valueClass="text-text-primary font-bold"
          />
        </div>

        {/* ── Divider ──────────────────────────────────────────────────────── */}
        <hr className="border-border" />

        {/* ── Footer row ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-x-6 text-sm">
          <MetaRow
            label="Errores"
            value={audit.errorRows > 0
              ? `${audit.errorRows.toLocaleString()} fila${audit.errorRows !== 1 ? 's' : ''}`
              : '—'
            }
            valueClass={audit.errorRows > 0 ? 'text-warning font-medium' : undefined}
          />
          <MetaRow
            label="Tiempo"
            value={`${audit.processingTimeMs.toLocaleString()} ms`}
          />
        </div>

        {/* ── Action buttons ───────────────────────────────────────────────── */}
        {(onViewAudit || onViewAnalysis) && (
          <div className="flex gap-3 pt-1">
            {onViewAudit && (
              <button
                onClick={onViewAudit}
                className="btn-secondary flex-1 gap-2"
              >
                <Search className="w-4 h-4" />
                Ver Auditoría
              </button>
            )}
            {onViewAnalysis && (
              <button
                onClick={onViewAnalysis}
                className="btn-primary flex-1 gap-2"
              >
                <BarChart2 className="w-4 h-4" />
                Ver Análisis
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Sub-component ────────────────────────────────────────────────────────────

interface MetaRowProps {
  label: string
  value: string
  valueClass?: string
}

function MetaRow({ label, value, valueClass }: MetaRowProps) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-text-muted text-xs shrink-0 w-24">{label}</span>
      <span className={`text-text-primary text-sm truncate ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
}
