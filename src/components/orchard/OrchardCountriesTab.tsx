/**
 * OrchardCountriesTab.tsx
 *
 * Sortable platform × country matrix table with drill-down support.
 *
 * Columns: Plataforma, País, Total Streams, FULL_PAY, FREE_AD_SUPPORTED,
 *          FREE_TRIAL (shows "N/I" when no dataset row has FREE_TRIAL),
 *          UNQUALIFIED, FRAUDULENT, Revenue
 *
 * - Clicking a column header sorts the table by that column (toggle asc/desc).
 * - Pinned totals row at the bottom.
 * - All numeric cells are clickable — calls onDrillDown with the matching records.
 * - FREE_TRIAL column header shows "(N/I)" suffix when no record has FREE_TRIAL.
 *
 * Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4
 */

import { useState, useMemo } from 'react'
import type { MatrixRow } from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

// ─── Props ────────────────────────────────────────────────────────────────────

interface OrchardCountriesTabProps {
  matrix: MatrixRow[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

// ─── Column definitions ───────────────────────────────────────────────────────

type ColKey =
  | 'platform'
  | 'country'
  | 'totalStreams'
  | 'fullPay'
  | 'freeAd'
  | 'freeTrial'
  | 'unqualified'
  | 'fraudulent'
  | 'revenue'

interface ColDef {
  key: ColKey
  label: string
  numeric: boolean
}

const COLUMNS: ColDef[] = [
  { key: 'platform',    label: 'Plataforma',       numeric: false },
  { key: 'country',     label: 'País',              numeric: false },
  { key: 'totalStreams',label: 'Total Streams',      numeric: true  },
  { key: 'fullPay',     label: 'FULL_PAY',           numeric: true  },
  { key: 'freeAd',      label: 'FREE_AD_SUPPORTED',  numeric: true  },
  { key: 'freeTrial',   label: 'FREE_TRIAL',         numeric: true  },
  { key: 'unqualified', label: 'UNQUALIFIED',        numeric: true  },
  { key: 'fraudulent',  label: 'FRAUDULENT',         numeric: true  },
  { key: 'revenue',     label: 'Revenue',            numeric: true  },
]

// ─── Row value extractor ──────────────────────────────────────────────────────

function getRowValue(row: MatrixRow, key: ColKey): string | number {
  switch (key) {
    case 'platform':    return row.platform
    case 'country':     return row.country
    case 'totalStreams': return row.breakdown.total.streams
    case 'fullPay':     return row.breakdown.FULL_PAY.streams
    case 'freeAd':      return row.breakdown.FREE_AD_SUPPORTED.streams
    case 'freeTrial':   return row.breakdown.FREE_TRIAL?.streams ?? 0
    case 'unqualified': return row.breakdown.UNQUALIFIED.streams
    case 'fraudulent':  return row.breakdown.FRAUDULENT.streams
    case 'revenue':     return row.breakdown.total.revenue
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtStreams(n: number): string {
  return n.toLocaleString()
}

function fmtRevenue(n: number): string {
  return `$${n.toFixed(4)}`
}

function fmtNumericCell(key: ColKey, value: number): string {
  if (key === 'revenue') return fmtRevenue(value)
  return fmtStreams(value)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrchardCountriesTab({
  matrix,
  allRecords,
  onDrillDown,
}: OrchardCountriesTabProps) {
  // ── Sort state ─────────────────────────────────────────────────────────────
  const [sort, setSort] = useState<{ col: ColKey; dir: 'asc' | 'desc' }>({
    col: 'revenue',
    dir: 'desc',
  })

  // ── Detect whether ANY record has FREE_TRIAL ───────────────────────────────
  // The column shows "N/I" and header gets "(N/I)" suffix when the entire dataset
  // has no FREE_TRIAL — i.e. ALL rows have breakdown.FREE_TRIAL === null.
  const noFreeTrial = useMemo(
    () => matrix.every(row => row.breakdown.FREE_TRIAL === null),
    [matrix],
  )

  // ── Sorted rows ────────────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    return [...matrix].sort((a, b) => {
      const av = getRowValue(a, sort.col)
      const bv = getRowValue(b, sort.col)
      let cmp: number
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv
      } else {
        cmp = String(av).localeCompare(String(bv))
      }
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [matrix, sort])

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    return matrix.reduce(
      (acc, row) => ({
        totalStreams: acc.totalStreams + row.breakdown.total.streams,
        fullPay:      acc.fullPay      + row.breakdown.FULL_PAY.streams,
        freeAd:       acc.freeAd       + row.breakdown.FREE_AD_SUPPORTED.streams,
        freeTrial:    acc.freeTrial    + (row.breakdown.FREE_TRIAL?.streams ?? 0),
        unqualified:  acc.unqualified  + row.breakdown.UNQUALIFIED.streams,
        fraudulent:   acc.fraudulent   + row.breakdown.FRAUDULENT.streams,
        revenue:      acc.revenue      + row.breakdown.total.revenue,
      }),
      { totalStreams: 0, fullPay: 0, freeAd: 0, freeTrial: 0, unqualified: 0, fraudulent: 0, revenue: 0 },
    )
  }, [matrix])

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSortClick(col: ColKey) {
    setSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'revenue' ? 'desc' : 'asc' },
    )
  }

  function handleCellClick(row: MatrixRow, key: ColKey) {
    const matching = allRecords.filter(
      r => r.platform === row.platform && r.country === row.country,
    )
    const colLabel = COLUMNS.find(c => c.key === key)?.label ?? key
    onDrillDown(matching, `${row.platform} · ${row.country} — ${colLabel}`)
  }

  function handleTotalCellClick(key: ColKey) {
    const colLabel = COLUMNS.find(c => c.key === key)?.label ?? key
    onDrillDown(allRecords, `Totales — ${colLabel}`)
  }

  // ── Sort indicator ─────────────────────────────────────────────────────────
  function sortIndicator(col: ColKey) {
    if (sort.col !== col) return <span className="opacity-20 ml-0.5">▲</span>
    return (
      <span className="ml-0.5 text-primary">
        {sort.dir === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  // ── Column header label (adds "(N/I)" to FREE_TRIAL when applicable) ───────
  function colHeaderLabel(col: ColDef) {
    if (col.key === 'freeTrial' && noFreeTrial) {
      return `${col.label} (N/I)`
    }
    return col.label
  }

  // ── Render numeric cell value (shows "N/I" for freeTrial when none exist) ──
  function renderNumericValue(row: MatrixRow, key: ColKey): string {
    if (key === 'freeTrial' && noFreeTrial) return 'N/I'
    const value = getRowValue(row, key) as number
    return fmtNumericCell(key, value)
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (matrix.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-text-muted text-sm">
        Sin datos de plataforma × país.
      </div>
    )
  }

  // ── Table ──────────────────────────────────────────────────────────────────
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-max">
        {/* ── Head ─────────────────────────────────────────────────────── */}
        <thead className="sticky top-0 z-10 bg-surface border-b border-border">
          <tr>
            {COLUMNS.map(col => (
              <th
                key={col.key}
                onClick={() => handleSortClick(col.key)}
                className={[
                  'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide',
                  'whitespace-nowrap cursor-pointer select-none transition-colors',
                  'text-text-muted hover:text-text-primary hover:bg-surface-2',
                  col.numeric ? 'text-right' : 'text-left',
                  sort.col === col.key ? 'text-primary bg-primary-light' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {colHeaderLabel(col)}
                {sortIndicator(col.key)}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <tbody>
          {sortedRows.map((row, idx) => (
            <tr
              key={`${row.platform}|||${row.country}`}
              className={[
                'border-b border-border transition-colors hover:bg-surface-2',
                idx % 2 === 0 ? '' : 'bg-surface/40',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {COLUMNS.map(col => {
                if (!col.numeric) {
                  // String columns — not clickable
                  const value = getRowValue(row, col.key) as string
                  return (
                    <td
                      key={col.key}
                      className="px-3 py-1.5 text-left text-text-primary whitespace-nowrap"
                    >
                      {value}
                    </td>
                  )
                }

                // Numeric columns — clickable
                const isNI = col.key === 'freeTrial' && noFreeTrial
                return (
                  <td
                    key={col.key}
                    className={[
                      'px-3 py-1.5 text-right whitespace-nowrap font-mono',
                      isNI
                        ? 'text-text-muted cursor-default'
                        : 'text-text-primary cursor-pointer hover:text-primary hover:bg-primary-light/60 transition-colors rounded',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={isNI ? undefined : () => handleCellClick(row, col.key)}
                    title={isNI ? undefined : 'Ver registros detallados'}
                  >
                    {renderNumericValue(row, col.key)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>

        {/* ── Totals row (pinned at bottom) ─────────────────────────────── */}
        <tfoot>
          <tr
            className="sticky bottom-0 z-10 bg-surface-2 border-t-2 border-border font-bold"
            style={{ position: 'sticky', bottom: 0 }}
          >
            {COLUMNS.map(col => {
              if (col.key === 'platform') {
                return (
                  <td key={col.key} className="px-3 py-2 text-left text-text-primary text-[11px] uppercase tracking-wide">
                    Total
                  </td>
                )
              }

              if (col.key === 'country') {
                return (
                  <td key={col.key} className="px-3 py-2 text-left text-text-muted text-xs">
                    {matrix.length} combinaciones
                  </td>
                )
              }

              // Numeric totals
              const isNI = col.key === 'freeTrial' && noFreeTrial

              const totalValue = (() => {
                switch (col.key) {
                  case 'totalStreams': return totals.totalStreams
                  case 'fullPay':     return totals.fullPay
                  case 'freeAd':      return totals.freeAd
                  case 'freeTrial':   return totals.freeTrial
                  case 'unqualified': return totals.unqualified
                  case 'fraudulent':  return totals.fraudulent
                  case 'revenue':     return totals.revenue
                  default:            return 0
                }
              })()

              return (
                <td
                  key={col.key}
                  className={[
                    'px-3 py-2 text-right whitespace-nowrap font-mono',
                    isNI
                      ? 'text-text-muted cursor-default'
                      : 'text-text-primary cursor-pointer hover:text-primary hover:bg-primary-light/60 transition-colors rounded',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={isNI ? undefined : () => handleTotalCellClick(col.key)}
                  title={isNI ? undefined : 'Ver todos los registros'}
                >
                  {isNI ? 'N/I' : fmtNumericCell(col.key, totalValue)}
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
