/**
 * OrchardCountriesTab.tsx
 *
 * Sortable platform × country matrix table with drill-down support.
 * FREE_TRIAL column is hidden entirely when no row in the dataset has it.
 *
 * Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4
 */

import { useState, useMemo } from 'react'
import type { MatrixRow } from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

interface OrchardCountriesTabProps {
  matrix: MatrixRow[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

type SortCol = 'platform' | 'country' | 'totalStreams' | 'fullPay' | 'freeAd' | 'freeTrial' | 'unqualified' | 'fraudulent' | 'revenue'

function fmtN(n: number) { return n.toLocaleString() }
function fmtR(n: number) { return `$${n.toFixed(4)}` }

function getVal(row: MatrixRow, col: SortCol): string | number {
  switch (col) {
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

export default function OrchardCountriesTab({ matrix, allRecords, onDrillDown }: OrchardCountriesTabProps) {
  const [sort, setSort] = useState<{ col: SortCol; dir: 'asc' | 'desc' }>({ col: 'revenue', dir: 'desc' })

  // Hide FREE_TRIAL column when no row has it
  const showFreeTrial = useMemo(() => matrix.some(r => r.breakdown.FREE_TRIAL !== null), [matrix])

  const sorted = useMemo(() => [...matrix].sort((a, b) => {
    const av = getVal(a, sort.col), bv = getVal(b, sort.col)
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return sort.dir === 'asc' ? cmp : -cmp
  }), [matrix, sort])

  const totals = useMemo(() => matrix.reduce((acc, r) => ({
    totalStreams: acc.totalStreams + r.breakdown.total.streams,
    fullPay:      acc.fullPay      + r.breakdown.FULL_PAY.streams,
    freeAd:       acc.freeAd       + r.breakdown.FREE_AD_SUPPORTED.streams,
    freeTrial:    acc.freeTrial    + (r.breakdown.FREE_TRIAL?.streams ?? 0),
    unqualified:  acc.unqualified  + r.breakdown.UNQUALIFIED.streams,
    fraudulent:   acc.fraudulent   + r.breakdown.FRAUDULENT.streams,
    revenue:      acc.revenue      + r.breakdown.total.revenue,
  }), { totalStreams: 0, fullPay: 0, freeAd: 0, freeTrial: 0, unqualified: 0, fraudulent: 0, revenue: 0 }), [matrix])

  function toggleSort(col: SortCol) {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'revenue' ? 'desc' : 'asc' })
  }

  function indicator(col: SortCol) {
    if (sort.col !== col) return <span className="opacity-20 ml-0.5 text-[9px]">▲</span>
    return <span className="ml-0.5 text-primary text-[9px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>
  }

  function Th({ col, label, className = '' }: { col: SortCol; label: string; className?: string }) {
    return (
      <th
        onClick={() => toggleSort(col)}
        className={`px-2 py-2 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap cursor-pointer select-none transition-colors text-text-muted hover:text-text-primary hover:bg-surface-2 ${sort.col === col ? 'text-primary bg-primary-light' : ''} ${className}`}
      >
        {label}{indicator(col)}
      </th>
    )
  }

  if (matrix.length === 0) {
    return <div className="flex items-center justify-center py-16 text-text-muted text-sm">Sin datos de plataforma × país.</div>
  }

  return (
    <div className="overflow-auto -mx-4 px-0">
      <table className="w-full text-xs border-collapse" style={{ minWidth: showFreeTrial ? '700px' : '620px' }}>
        <thead className="sticky top-0 z-10 bg-surface border-b border-border">
          <tr>
            <Th col="platform"    label="Plataforma"  className="text-left" />
            <Th col="country"     label="País"         className="text-left" />
            <Th col="totalStreams" label="Streams"      className="text-right" />
            <Th col="fullPay"     label="Full Pay"      className="text-right" />
            <Th col="freeAd"      label="Free Ad"       className="text-right" />
            {showFreeTrial && <Th col="freeTrial" label="Free Trial" className="text-right" />}
            <Th col="unqualified" label="Unqual."       className="text-right" />
            <Th col="fraudulent"  label="Fraud."        className="text-right" />
            <Th col="revenue"     label="Revenue"       className="text-right" />
          </tr>
        </thead>

        <tbody>
          {sorted.map((row, idx) => {
            const match = (col?: string) => allRecords.filter(r => r.platform === row.platform && r.country === row.country && (!col || r.normalizedStreamType === col))
            return (
              <tr key={`${row.platform}|||${row.country}`} className={`border-b border-border transition-colors hover:bg-surface-2 ${idx % 2 ? 'bg-surface/40' : ''}`}>
                <td className="px-2 py-1.5 text-left text-text-primary whitespace-nowrap">{row.platform}</td>
                <td className="px-2 py-1.5 text-left text-text-primary whitespace-nowrap">{row.country}</td>
                {([ 
                  { val: row.breakdown.total.streams,             fmt: fmtN, cat: undefined },
                  { val: row.breakdown.FULL_PAY.streams,          fmt: fmtN, cat: 'FULL_PAY' },
                  { val: row.breakdown.FREE_AD_SUPPORTED.streams, fmt: fmtN, cat: 'FREE_AD_SUPPORTED' },
                ] as const).map(({ val, fmt, cat }, ci) => (
                  <td key={ci} className="px-2 py-1.5 text-right font-mono whitespace-nowrap cursor-pointer hover:text-primary hover:bg-primary-light/60 transition-colors"
                    onClick={() => onDrillDown(match(cat), `${row.platform} · ${row.country}${cat ? ' — ' + cat : ''}`)}>
                    {fmt(val)}
                  </td>
                ))}
                {showFreeTrial && (
                  row.breakdown.FREE_TRIAL === null
                    ? <td className="px-2 py-1.5 text-right text-gray-300">—</td>
                    : <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap cursor-pointer hover:text-primary hover:bg-primary-light/60 transition-colors"
                        onClick={() => onDrillDown(match('FREE_TRIAL'), `${row.platform} · ${row.country} — FREE_TRIAL`)}>
                        {fmtN(row.breakdown.FREE_TRIAL.streams)}
                      </td>
                )}
                <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap cursor-pointer hover:text-primary hover:bg-primary-light/60 transition-colors"
                  onClick={() => onDrillDown(match('UNQUALIFIED'), `${row.platform} · ${row.country} — UNQUALIFIED`)}>
                  {fmtN(row.breakdown.UNQUALIFIED.streams)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap cursor-pointer hover:text-primary hover:bg-primary-light/60 transition-colors"
                  onClick={() => onDrillDown(match('FRAUDULENT'), `${row.platform} · ${row.country} — FRAUDULENT`)}>
                  {fmtN(row.breakdown.FRAUDULENT.streams)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono whitespace-nowrap cursor-pointer hover:text-primary hover:bg-primary-light/60 transition-colors"
                  onClick={() => onDrillDown(match(), `${row.platform} · ${row.country} — Revenue`)}>
                  {fmtR(row.breakdown.total.revenue)}
                </td>
              </tr>
            )
          })}
        </tbody>

        <tfoot>
          <tr className="sticky bottom-0 z-10 bg-surface-2 border-t-2 border-border font-bold text-xs">
            <td className="px-2 py-2 text-left text-text-primary uppercase tracking-wide text-[10px]">Total</td>
            <td className="px-2 py-2 text-left text-text-muted">{matrix.length} filas</td>
            <td className="px-2 py-2 text-right font-mono cursor-pointer hover:text-primary" onClick={() => onDrillDown(allRecords, 'Total Streams')}>{fmtN(totals.totalStreams)}</td>
            <td className="px-2 py-2 text-right font-mono cursor-pointer hover:text-primary" onClick={() => onDrillDown(allRecords, 'Full Pay')}>{fmtN(totals.fullPay)}</td>
            <td className="px-2 py-2 text-right font-mono cursor-pointer hover:text-primary" onClick={() => onDrillDown(allRecords, 'Free Ad')}>{fmtN(totals.freeAd)}</td>
            {showFreeTrial && <td className="px-2 py-2 text-right font-mono cursor-pointer hover:text-primary" onClick={() => onDrillDown(allRecords, 'Free Trial')}>{fmtN(totals.freeTrial)}</td>}
            <td className="px-2 py-2 text-right font-mono cursor-pointer hover:text-primary" onClick={() => onDrillDown(allRecords, 'Unqualified')}>{fmtN(totals.unqualified)}</td>
            <td className="px-2 py-2 text-right font-mono cursor-pointer hover:text-primary" onClick={() => onDrillDown(allRecords, 'Fraudulent')}>{fmtN(totals.fraudulent)}</td>
            <td className="px-2 py-2 text-right font-mono cursor-pointer hover:text-primary" onClick={() => onDrillDown(allRecords, 'Revenue')}>{fmtR(totals.revenue)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
