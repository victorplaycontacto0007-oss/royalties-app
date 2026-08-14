/**
 * OrchardReconciliationTab.tsx
 *
 * Reconciliation view for Orchard reports — shows stream and revenue balance
 * checks, per-platform deltas, and highlights any discrepancies.
 *
 * Features:
 *  - "Sin problemas detectados" success state when isClean === true
 *  - Stream reconciliation panel: total, categorized sum, delta (red when ≠ 0)
 *    + alert banner when uncategorizedStreams > 0
 *  - Revenue reconciliation panel: total, categorized sum, discrepancy
 *    + warning banner when revenueDiscrepancy > 0.01
 *  - Per-platform table with streamDelta and revenueDelta columns (red when ≠ 0)
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3, 12.4
 */

import { CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import type { ReconciliationResult } from '../../lib/orchard-analytics'

// ─── Props ────────────────────────────────────────────────────────────────────

interface OrchardReconciliationTabProps {
  reconciliation: ReconciliationResult
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('es-MX')
}

function fmtRev(n: number): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

// ─── Metric Row ───────────────────────────────────────────────────────────────

interface MetricRowProps {
  label:   string
  value:   string
  isRed?:  boolean
  isBold?: boolean
}

function MetricRow({ label, value, isRed, isBold }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className={`text-sm ${isBold ? 'font-semibold text-text-primary' : 'text-text-muted'}`}>
        {label}
      </span>
      <span
        className={`text-sm font-mono ${
          isRed
            ? 'text-red-600 font-bold'
            : isBold
              ? 'font-semibold text-text-primary'
              : 'text-text-primary'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────

interface PanelProps {
  title:    string
  children: React.ReactNode
}

function Panel({ title, children }: PanelProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {children}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrchardReconciliationTab({ reconciliation }: OrchardReconciliationTabProps) {
  const {
    totalStreams,
    categorizedStreams,
    uncategorizedStreams,
    totalRevenue,
    categorizedRevenue,
    revenueDiscrepancy,
    byPlatform,
    isClean,
  } = reconciliation

  const streamDelta = totalStreams - categorizedStreams

  // ── Clean success state ───────────────────────────────────────────────────
  if (isClean) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <CheckCircle className="w-14 h-14 text-green-500" />
        <p className="text-lg font-semibold text-green-700">Sin problemas detectados</p>
        <p className="text-sm text-text-muted">
          Todos los streams y revenues coinciden correctamente.
        </p>
      </div>
    )
  }

  // ── Problem state ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">

      {/* ── Stream Reconciliation ────────────────────────────────────────── */}
      <Panel title="Reconciliación de Streams">
        {/* Metrics */}
        <div className="flex flex-col">
          <MetricRow
            label="Total Streams importados"
            value={fmtNum(totalStreams)}
            isBold
          />
          <MetricRow
            label="Suma de streams categorizados"
            value={fmtNum(categorizedStreams)}
          />
          <MetricRow
            label="Delta"
            value={fmtNum(streamDelta)}
            isRed={streamDelta !== 0}
            isBold
          />
        </div>

        {/* Alert banner — streams not categorized */}
        {uncategorizedStreams > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700 font-medium">
              Existen {fmtNum(uncategorizedStreams)} streams no clasificados
            </p>
          </div>
        )}
      </Panel>

      {/* ── Revenue Reconciliation ───────────────────────────────────────── */}
      <Panel title="Reconciliación de Revenue">
        {/* Metrics */}
        <div className="flex flex-col">
          <MetricRow
            label="Total Revenue importado"
            value={fmtRev(totalRevenue)}
            isBold
          />
          <MetricRow
            label="Revenue categorizado"
            value={fmtRev(categorizedRevenue)}
          />
          <MetricRow
            label="Discrepancia"
            value={fmtRev(revenueDiscrepancy)}
            isRed={revenueDiscrepancy > 0.01}
            isBold
          />
        </div>

        {/* Warning banner — revenue discrepancy */}
        {revenueDiscrepancy > 0.01 && (
          <div className="flex items-start gap-2.5 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-700 font-medium">
              Se detectó una discrepancia de {fmtRev(revenueDiscrepancy)} en el revenue
            </p>
          </div>
        )}
      </Panel>

      {/* ── Per-Platform Reconciliation Table ───────────────────────────── */}
      {byPlatform.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text-primary px-1">
            Reconciliación por plataforma
          </h3>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-surface border-b border-border">
                <tr>
                  {['Plataforma', 'Delta Streams', 'Delta Revenue'].map(col => (
                    <th
                      key={col}
                      className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byPlatform.map((row, idx) => {
                  const streamNonZero  = row.streamDelta  !== 0
                  const revenueNonZero = row.revenueDelta !== 0

                  return (
                    <tr
                      key={`${row.platform}-${idx}`}
                      className={`border-b border-gray-100 last:border-0 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                      }`}
                    >
                      {/* Plataforma */}
                      <td className="px-3 py-1.5 text-gray-700 font-medium whitespace-nowrap">
                        {row.platform || <span className="text-gray-300">—</span>}
                      </td>

                      {/* Delta Streams */}
                      <td
                        className={`px-3 py-1.5 font-mono whitespace-nowrap ${
                          streamNonZero ? 'text-red-600 font-bold' : 'text-gray-500'
                        }`}
                      >
                        {fmtNum(row.streamDelta)}
                      </td>

                      {/* Delta Revenue */}
                      <td
                        className={`px-3 py-1.5 font-mono whitespace-nowrap ${
                          revenueNonZero ? 'text-red-600 font-bold' : 'text-gray-500'
                        }`}
                      >
                        {fmtRev(row.revenueDelta)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
