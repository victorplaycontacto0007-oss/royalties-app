/**
 * OrchardNoRoyaltyTab.tsx
 *
 * Table view for streams that generated zero or negative royalties, grouped
 * by (normalizedStreamType, platform, country) with cause classification.
 *
 * Features:
 *  - Compact table with columns: Categoría, Causa, Plataforma, País, Streams, Revenue
 *  - Spanish cause labels
 *  - Color-coded cause column: FRAUDULENT → red, UNQUALIFIED → orange, others → gray
 *  - Clickable rows that invoke onDrillDown with the matching OrchardRecords
 *  - Empty state message when no entries
 *  - NEVER hides records with revenue = 0 or revenue < 0
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import type { NoRoyaltyEntry } from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OrchardNoRoyaltyTabProps {
  noRoyaltyEntries: NoRoyaltyEntry[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

// ─── Cause Labels (Spanish) ───────────────────────────────────────────────────

const CAUSE_LABELS: Record<NoRoyaltyEntry['cause'], string> = {
  UNQUALIFIED:      'No calificó',
  FRAUDULENT:       'Fraude detectado',
  FREE_AD_ZERO:     'Ad-Supported sin monetizar',
  FREE_TRIAL_ZERO:  'Prueba gratuita sin revenue',
  OTHER_ZERO:       'Categoría sin royalty',
  UNKNOWN_ZERO:     'Categoría sin royalty',
}

// ─── Cause Style Classes ─────────────────────────────────────────────────────

function getCauseBadgeClass(cause: NoRoyaltyEntry['cause']): string {
  switch (cause) {
    case 'FRAUDULENT':
      return 'bg-red-100 text-red-700 font-semibold'
    case 'UNQUALIFIED':
      return 'bg-orange-100 text-orange-700 font-semibold'
    default:
      return 'bg-gray-100 text-gray-500'
  }
}

function getCauseRowClass(cause: NoRoyaltyEntry['cause']): string {
  switch (cause) {
    case 'FRAUDULENT':
      return 'hover:bg-red-50'
    case 'UNQUALIFIED':
      return 'hover:bg-orange-50'
    default:
      return 'hover:bg-gray-50'
  }
}

// ─── Category Label ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  FULL_PAY:          'FULL_PAY',
  FREE_AD_SUPPORTED: 'AD_SUPPORTED',
  FREE_TRIAL:        'FREE_TRIAL',
  UNQUALIFIED:       'UNQUALIFIED',
  FRAUDULENT:        'FRAUDULENT',
  OTHER:             'OTHER',
  UNKNOWN:           'UNKNOWN',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrchardNoRoyaltyTab({
  noRoyaltyEntries,
  allRecords,
  onDrillDown,
}: OrchardNoRoyaltyTabProps) {
  // ── Empty state ──────────────────────────────────────────────────────────
  if (noRoyaltyEntries.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-gray-400 text-sm">No se detectaron streams sin royalty</p>
      </div>
    )
  }

  // ── Handle row click — drill into matching allRecords ────────────────────
  function handleRowClick(entry: NoRoyaltyEntry) {
    const rowIndexSet = new Set(entry.rowIndexes)
    const matchingRecords = allRecords.filter(r => rowIndexSet.has(r.rowIndex))
    const label = `${CAUSE_LABELS[entry.cause]} — ${entry.platform} / ${entry.country}`
    onDrillDown(matchingRecords, label)
  }

  // ── Totals ───────────────────────────────────────────────────────────────
  const totalStreams = noRoyaltyEntries.reduce((sum, e) => sum + e.streams, 0)
  const totalRows    = noRoyaltyEntries.reduce((sum, e) => sum + e.rowIndexes.length, 0)

  return (
    <div className="overflow-x-auto">
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
        <span>
          <span className="font-semibold text-gray-700">{noRoyaltyEntries.length}</span> grupos
        </span>
        <span>
          <span className="font-semibold text-gray-700">{totalRows.toLocaleString()}</span> registros
        </span>
        <span>
          <span className="font-semibold text-gray-700">{totalStreams.toLocaleString()}</span> streams sin royalty
        </span>
      </div>

      {/* Table */}
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
          <tr>
            {['Categoría', 'Causa', 'Plataforma', 'País', 'Streams', 'Registros'].map(col => (
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
          {noRoyaltyEntries.map((entry, idx) => {
            const causeLabel = CAUSE_LABELS[entry.cause]
            const categoryLabel = CATEGORY_LABELS[entry.normalizedStreamType] ?? entry.normalizedStreamType
            const rowClass = getCauseRowClass(entry.cause)
            const badgeClass = getCauseBadgeClass(entry.cause)

            return (
              <tr
                key={`${entry.normalizedStreamType}-${entry.platform}-${entry.country}-${idx}`}
                onClick={() => handleRowClick(entry)}
                className={`border-b border-gray-100 cursor-pointer transition-colors ${rowClass}`}
                title={`Ver ${entry.rowIndexes.length} registros`}
              >
                {/* Categoría */}
                <td className="px-3 py-1.5 text-gray-600 font-mono whitespace-nowrap">
                  {categoryLabel}
                </td>

                {/* Causa */}
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] ${badgeClass}`}>
                    {causeLabel}
                  </span>
                </td>

                {/* Plataforma */}
                <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                  {entry.platform || <span className="text-gray-300">—</span>}
                </td>

                {/* País */}
                <td className="px-3 py-1.5 text-gray-700 whitespace-nowrap">
                  {entry.country || <span className="text-gray-300">—</span>}
                </td>

                {/* Streams */}
                <td className="px-3 py-1.5 text-right text-gray-700 font-mono whitespace-nowrap">
                  {entry.streams.toLocaleString()}
                </td>

                {/* Registros (row count) */}
                <td className="px-3 py-1.5 text-right text-gray-500 font-mono whitespace-nowrap">
                  {entry.rowIndexes.length.toLocaleString()}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
