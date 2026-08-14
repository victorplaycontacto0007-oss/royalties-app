/**
 * OrchardDrillDownDrawer.tsx
 *
 * Slide-over panel that shows the raw OrchardRecord rows behind any clickable
 * metric in the Orchard analytics UI.
 *
 * Features:
 *  - Fixed right-side slide-over (w-full max-w-3xl) with a semi-transparent backdrop
 *  - Metric label + total row count badge in the header
 *  - Scrollable table with 10 auditable columns
 *  - Export CSV button in header
 *  - Close (×) button
 *  - Framer-motion slide-in/out animation
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 18.3
 */

import { X, Download } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OrchardDrillDownDrawerProps {
  records: OrchardRecord[]
  label: string
  isOpen: boolean
  onClose: () => void
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

/**
 * Generates and triggers download of a CSV file for the given records.
 * Requirements: 15.4, 18.3
 */
function exportToCsv(records: OrchardRecord[], label: string): void {
  const headers = ['rowIndex','sourceFile','platform','country','artist','track','rawStreamType','normalizedStreamType','quantity','net_total']
  const rows = records.map(r => [
    r.rowIndex, `"${r.sourceFile}"`, `"${r.platform}"`, `"${r.country}"`,
    `"${r.artist}"`, `"${r.track}"`, `"${r.rawStreamType}"`,
    r.normalizedStreamType, r.quantity, r.net_total
  ])
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orchard-drill-${label.replace(/[^a-z0-9]/gi,'-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrchardDrillDownDrawer({
  records,
  label,
  isOpen,
  onClose,
}: OrchardDrillDownDrawerProps) {
  // AnimatePresence handles mount/unmount; returning null when closed skips
  // the drawer entirely (no DOM nodes, no portal) as required.
  if (!isOpen) return null

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <>
          {/* Semi-transparent backdrop overlay (Requirement 15.5) */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Slide-over panel — fixed right side (Requirements 15.1, 15.2) */}
          <motion.div
            className="fixed right-0 top-0 h-full z-50 bg-white shadow-xl overflow-hidden flex flex-col w-full max-w-3xl"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeInOut' }}
          >
            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {/* Metric label (Requirement 15.2) */}
                <h2 className="font-semibold text-gray-900 text-sm truncate">{label}</h2>

                {/* Row count badge (Requirement 15.2) */}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 flex-shrink-0">
                  {records.length} {records.length === 1 ? 'fila' : 'filas'}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Export CSV button (Requirements 15.4, 18.3) */}
                <button
                  onClick={() => exportToCsv(records, label)}
                  disabled={records.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar CSV
                </button>

                {/* Close button (Requirement 15.3) */}
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded-lg hover:bg-gray-100"
                  aria-label="Cerrar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── Scrollable Table (Requirement 15.2) ─────────────────── */}
            <div className="flex-1 overflow-auto">
              {records.length === 0 ? (
                <div className="flex items-center justify-center h-full py-16">
                  <p className="text-gray-400 text-sm">Sin registros para mostrar.</p>
                </div>
              ) : (
                <table className="w-full text-xs border-collapse min-w-max">
                  <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
                    <tr>
                      {[
                        'Row#',
                        'Archivo',
                        'Plataforma',
                        'País',
                        'Artista',
                        'Canción',
                        'Tipo original',
                        'Tipo normalizado',
                        'Streams',
                        'Revenue',
                      ].map(col => (
                        <th
                          key={col}
                          className="text-left px-3 py-2 text-gray-500 font-semibold whitespace-nowrap text-[11px] uppercase tracking-wide"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, idx) => (
                      <tr
                        key={`${r.rowIndex}-${r.sourceFile}-${idx}`}
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        {/* Row# */}
                        <td className="px-3 py-1.5 text-gray-400 font-mono whitespace-nowrap">
                          {r.rowIndex}
                        </td>
                        {/* Archivo */}
                        <td className="px-3 py-1.5 text-gray-500 max-w-[160px] truncate" title={r.sourceFile}>
                          {r.sourceFile || <span className="text-gray-300">—</span>}
                        </td>
                        {/* Plataforma */}
                        <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                          {r.platform || <span className="text-gray-300">—</span>}
                        </td>
                        {/* País */}
                        <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                          {r.country || <span className="text-gray-300">—</span>}
                        </td>
                        {/* Artista */}
                        <td className="px-3 py-1.5 text-gray-700 max-w-[140px] truncate" title={r.artist}>
                          {r.artist || <span className="text-gray-300">—</span>}
                        </td>
                        {/* Canción */}
                        <td className="px-3 py-1.5 text-gray-600 max-w-[160px] truncate" title={r.track}>
                          {r.track || <span className="text-gray-300">—</span>}
                        </td>
                        {/* Tipo original */}
                        <td className="px-3 py-1.5 text-gray-500 max-w-[160px] truncate" title={r.rawStreamType}>
                          {r.rawStreamType || <span className="text-gray-300">—</span>}
                        </td>
                        {/* Tipo normalizado */}
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          <StreamTypeBadge category={r.normalizedStreamType} />
                        </td>
                        {/* Streams */}
                        <td className="px-3 py-1.5 text-right text-gray-700 font-mono whitespace-nowrap">
                          {r.quantity.toLocaleString()}
                        </td>
                        {/* Revenue */}
                        <td className={`px-3 py-1.5 text-right font-mono whitespace-nowrap ${r.net_total < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                          ${r.net_total.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── Stream Type Badge ────────────────────────────────────────────────────────

/**
 * Small coloured badge for each StreamCategory value.
 */
function StreamTypeBadge({ category }: { category: string }) {
  const styles: Record<string, string> = {
    FULL_PAY:          'bg-green-50 text-green-700',
    FREE_AD_SUPPORTED: 'bg-blue-50 text-blue-700',
    FREE_TRIAL:        'bg-yellow-50 text-yellow-700',
    UNQUALIFIED:       'bg-red-50 text-red-600',
    FRAUDULENT:        'bg-red-100 text-red-700 font-semibold',
    OTHER:             'bg-gray-100 text-gray-500',
    UNKNOWN:           'bg-gray-50 text-gray-400',
  }

  const labels: Record<string, string> = {
    FULL_PAY:          'FULL_PAY',
    FREE_AD_SUPPORTED: 'AD_SUPPORTED',
    FREE_TRIAL:        'FREE_TRIAL',
    UNQUALIFIED:       'UNQUALIFIED',
    FRAUDULENT:        'FRAUDULENT',
    OTHER:             'OTHER',
    UNKNOWN:           'UNKNOWN',
  }

  const cls = styles[category] ?? 'bg-gray-50 text-gray-400'
  const lbl = labels[category] ?? category

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {lbl}
    </span>
  )
}
