/**
 * OrchardDashboardTab.tsx
 *
 * Main dashboard tab for the Orchard analytics UI.
 *
 * Features:
 *  - Summary cards: Total Streams, Total Revenue, FULL_PAY, FREE_AD_SUPPORTED,
 *    FREE_TRIAL (shows "No identificado en el reporte" when null), UNQUALIFIED, FRAUDULENT
 *  - Date range badge: "min – max" | "Múltiples períodos" | nothing
 *  - Four sortable ranking tables (default: revenue desc):
 *    platforms, countries, artists, tracks
 *  - ALL numeric cells are clickable → onDrillDown with filtered OrchardRecord[]
 *
 * Requirements: 4.1, 13.1, 13.2, 13.3, 13.4, 13.5, 15.1
 */

import { useState, useCallback } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type {
  StreamCategoryBreakdown,
  PlatformSummary,
  CountrySummary,
  ArtistSummary,
  TrackSummary,
} from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'
import OrchardDrillDownDrawer from './OrchardDrillDownDrawer'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OrchardDashboardTabProps {
  breakdown: StreamCategoryBreakdown
  rankings: {
    platforms: PlatformSummary[]
    countries: CountrySummary[]
    artists:   ArtistSummary[]
    tracks:    TrackSummary[]
  }
  dateRange: { min: string; max: string } | null
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

// ─── Sort state ───────────────────────────────────────────────────────────────

type SortKey = 'name' | 'totalStreams' | 'fullPay' | 'freeAd' | 'freeTrial' | 'unqualified' | 'fraudulent' | 'revenue'
type SortDir = 'asc' | 'desc'

interface SortState {
  key: SortKey
  dir: SortDir
}

// ─── Table row shape (unified) ────────────────────────────────────────────────

interface RankRow {
  /** Display name (platform / country / artist / track) */
  name:        string
  totalStreams: number
  fullPay:     number | null
  freeAd:      number | null
  freeTrial:   number | null    // null = category not in report
  unqualified: number | null
  fraudulent:  number | null
  revenue:     number
  /** Filter function to extract matching OrchardRecord[] from allRecords */
  filter:      (r: OrchardRecord) => boolean
}

// ─── Helpers: build RankRow arrays ───────────────────────────────────────────

function platformToRow(p: PlatformSummary): RankRow {
  const bd = p.breakdown
  return {
    name:        p.platform,
    totalStreams: bd.total.streams,
    fullPay:     bd.FULL_PAY.streams,
    freeAd:      bd.FREE_AD_SUPPORTED.streams,
    freeTrial:   bd.FREE_TRIAL?.streams ?? null,
    unqualified: bd.UNQUALIFIED.streams,
    fraudulent:  bd.FRAUDULENT.streams,
    revenue:     bd.total.revenue,
    filter:      r => r.platform === p.platform,
  }
}

function countryToRow(c: CountrySummary): RankRow {
  const bd = c.breakdown
  return {
    name:        `${c.country} (${c.platform})`,
    totalStreams: bd.total.streams,
    fullPay:     bd.FULL_PAY.streams,
    freeAd:      bd.FREE_AD_SUPPORTED.streams,
    freeTrial:   bd.FREE_TRIAL?.streams ?? null,
    unqualified: bd.UNQUALIFIED.streams,
    fraudulent:  bd.FRAUDULENT.streams,
    revenue:     bd.total.revenue,
    filter:      r => r.country === c.country && r.platform === c.platform,
  }
}

function artistToRow(a: ArtistSummary): RankRow {
  const bd = a.breakdown
  return {
    name:        a.artist,
    totalStreams: bd.total.streams,
    fullPay:     bd.FULL_PAY.streams,
    freeAd:      bd.FREE_AD_SUPPORTED.streams,
    freeTrial:   bd.FREE_TRIAL?.streams ?? null,
    unqualified: bd.UNQUALIFIED.streams,
    fraudulent:  bd.FRAUDULENT.streams,
    revenue:     bd.total.revenue,
    filter:      r => r.artist === a.artist,
  }
}

function trackToRow(t: TrackSummary): RankRow {
  const bd = t.breakdown
  return {
    name:        `${t.track} – ${t.artist}`,
    totalStreams: bd.total.streams,
    fullPay:     bd.FULL_PAY.streams,
    freeAd:      bd.FREE_AD_SUPPORTED.streams,
    freeTrial:   bd.FREE_TRIAL?.streams ?? null,
    unqualified: bd.UNQUALIFIED.streams,
    fraudulent:  bd.FRAUDULENT.streams,
    revenue:     bd.total.revenue,
    filter:      r => r.track === t.track && r.artist === t.artist,
  }
}

// ─── Sort helper ──────────────────────────────────────────────────────────────

function sortRows(rows: RankRow[], sort: SortState): RankRow[] {
  const { key, dir } = sort
  const factor = dir === 'asc' ? 1 : -1

  return [...rows].sort((a, b) => {
    let av: number | string
    let bv: number | string

    switch (key) {
      case 'name':        av = a.name;        bv = b.name;        break
      case 'totalStreams': av = a.totalStreams; bv = b.totalStreams; break
      case 'fullPay':     av = a.fullPay ?? -Infinity; bv = b.fullPay ?? -Infinity; break
      case 'freeAd':      av = a.freeAd ?? -Infinity;  bv = b.freeAd ?? -Infinity;  break
      case 'freeTrial':   av = a.freeTrial ?? -Infinity; bv = b.freeTrial ?? -Infinity; break
      case 'unqualified': av = a.unqualified ?? -Infinity; bv = b.unqualified ?? -Infinity; break
      case 'fraudulent':  av = a.fraudulent ?? -Infinity; bv = b.fraudulent ?? -Infinity; break
      case 'revenue':     av = a.revenue; bv = b.revenue; break
      default:            av = 0; bv = 0
    }

    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * factor
    }
    return ((av as number) - (bv as number)) * factor
  })
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString('es-MX')
}

function fmtRev(n: number): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label:      string
  value:      string
  subLabel?:  string
  dimmed?:    boolean
  clickable?: boolean
  onClick?:   () => void
  accent?:    'green' | 'blue' | 'yellow' | 'red' | 'orange' | 'gray' | 'default'
}

function SummaryCard({ label, value, subLabel, dimmed, clickable, onClick, accent = 'default' }: SummaryCardProps) {
  const accentBorder: Record<string, string> = {
    green:   'border-green-200',
    blue:    'border-blue-200',
    yellow:  'border-yellow-200',
    red:     'border-red-200',
    orange:  'border-orange-200',
    gray:    'border-gray-200',
    default: 'border-border',
  }
  const accentText: Record<string, string> = {
    green:   'text-green-700',
    blue:    'text-blue-700',
    yellow:  'text-yellow-700',
    red:     'text-red-600',
    orange:  'text-orange-600',
    gray:    'text-gray-400',
    default: 'text-text-primary',
  }

  return (
    <div
      className={`
        flex flex-col gap-1 px-4 py-3 bg-surface rounded-xl border
        ${accentBorder[accent]}
        ${clickable ? 'cursor-pointer hover:shadow-sm hover:border-primary/40 transition-all' : ''}
        ${dimmed ? 'opacity-50' : ''}
      `}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable && onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
    >
      <p className="text-xs text-text-muted font-medium">{label}</p>
      <p className={`text-lg font-bold leading-tight ${accentText[accent]}`}>{value}</p>
      {subLabel && <p className="text-[10px] text-text-muted">{subLabel}</p>}
    </div>
  )
}

// ─── Sort header cell ─────────────────────────────────────────────────────────

interface ThSortProps {
  sortKey:  SortKey
  current:  SortState
  onSort:   (k: SortKey) => void
  children: React.ReactNode
  className?: string
}

function ThSort({ sortKey, current, onSort, children, className = '' }: ThSortProps) {
  const isActive = current.key === sortKey
  return (
    <th
      className={`px-2 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap cursor-pointer select-none hover:text-primary transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        {isActive ? (
          current.dir === 'asc'
            ? <ChevronUp className="w-3 h-3 text-primary" />
            : <ChevronDown className="w-3 h-3 text-primary" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  )
}

// ─── Ranking Table ────────────────────────────────────────────────────────────

interface RankingTableProps {
  title:      string
  rows:       RankRow[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
  /** true when breakdown.FREE_TRIAL is null across the global breakdown */
  freeTrialNull: boolean
}

function RankingTable({ title, rows, allRecords, onDrillDown, freeTrialNull }: RankingTableProps) {
  const [sort, setSort] = useState<SortState>({ key: 'revenue', dir: 'desc' })

  const handleSort = useCallback((k: SortKey) => {
    setSort(prev =>
      prev.key === k
        ? { key: k, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: k, dir: 'desc' }
    )
  }, [])

  const sorted = sortRows(rows, sort)

  // Clickable cell builder
  function clickCell(
    value: number | null,
    displayValue: string,
    filterFn: (r: OrchardRecord) => boolean,
    extraFilter?: (r: OrchardRecord) => boolean,
    label?: string,
    rowName?: string,
  ) {
    if (value === null) {
      return (
        <td className="px-2 py-1.5 text-right text-gray-400 text-xs font-mono whitespace-nowrap">
          N/I
        </td>
      )
    }
    const drillLabel = label ? `${rowName} – ${label}` : rowName ?? ''
    return (
      <td
        className="px-2 py-1.5 text-right text-xs font-mono whitespace-nowrap cursor-pointer hover:underline text-primary"
        onClick={() => {
          const filtered = allRecords.filter(r => filterFn(r) && (extraFilter ? extraFilter(r) : true))
          onDrillDown(filtered, drillLabel)
        }}
      >
        {displayValue}
      </td>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-text-primary px-1">{title}</h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-xs border-collapse min-w-max">
          <thead className="bg-surface border-b border-border">
            <tr>
              <ThSort sortKey="name"        current={sort} onSort={handleSort} className="pl-3">Nombre</ThSort>
              <ThSort sortKey="totalStreams" current={sort} onSort={handleSort}>Total Streams</ThSort>
              <ThSort sortKey="fullPay"     current={sort} onSort={handleSort}>FULL_PAY</ThSort>
              <ThSort sortKey="freeAd"      current={sort} onSort={handleSort}>FREE_AD</ThSort>
              <ThSort sortKey="freeTrial"   current={sort} onSort={handleSort}>
                {freeTrialNull ? 'FREE_TRIAL (N/I)' : 'FREE_TRIAL'}
              </ThSort>
              <ThSort sortKey="unqualified" current={sort} onSort={handleSort}>UNQUALIFIED</ThSort>
              <ThSort sortKey="fraudulent"  current={sort} onSort={handleSort}>FRAUDULENT</ThSort>
              <ThSort sortKey="revenue"     current={sort} onSort={handleSort}>Revenue</ThSort>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={`${row.name}-${i}`}
                className={`border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'} hover:bg-primary/5 transition-colors`}
              >
                {/* Name — not clickable as a whole cell; click goes on metrics */}
                <td className="px-3 py-1.5 text-gray-700 font-medium max-w-[220px] truncate" title={row.name}>
                  {row.name}
                </td>

                {/* Total Streams */}
                {clickCell(
                  row.totalStreams,
                  fmtNum(row.totalStreams),
                  row.filter,
                  undefined,
                  'Total Streams',
                  row.name,
                )}

                {/* FULL_PAY streams */}
                {clickCell(
                  row.fullPay,
                  row.fullPay !== null ? fmtNum(row.fullPay) : 'N/I',
                  row.filter,
                  r => r.normalizedStreamType === 'FULL_PAY',
                  'FULL_PAY',
                  row.name,
                )}

                {/* FREE_AD_SUPPORTED streams */}
                {clickCell(
                  row.freeAd,
                  row.freeAd !== null ? fmtNum(row.freeAd) : 'N/I',
                  row.filter,
                  r => r.normalizedStreamType === 'FREE_AD_SUPPORTED',
                  'FREE_AD_SUPPORTED',
                  row.name,
                )}

                {/* FREE_TRIAL streams */}
                {freeTrialNull ? (
                  <td className="px-2 py-1.5 text-right text-gray-400 text-xs font-mono whitespace-nowrap">
                    N/I
                  </td>
                ) : clickCell(
                  row.freeTrial,
                  row.freeTrial !== null ? fmtNum(row.freeTrial) : 'N/I',
                  row.filter,
                  r => r.normalizedStreamType === 'FREE_TRIAL',
                  'FREE_TRIAL',
                  row.name,
                )}

                {/* UNQUALIFIED streams */}
                {clickCell(
                  row.unqualified,
                  row.unqualified !== null ? fmtNum(row.unqualified) : 'N/I',
                  row.filter,
                  r => r.normalizedStreamType === 'UNQUALIFIED',
                  'UNQUALIFIED',
                  row.name,
                )}

                {/* FRAUDULENT streams */}
                {clickCell(
                  row.fraudulent,
                  row.fraudulent !== null ? fmtNum(row.fraudulent) : 'N/I',
                  row.filter,
                  r => r.normalizedStreamType === 'FRAUDULENT',
                  'FRAUDULENT',
                  row.name,
                )}

                {/* Revenue */}
                {clickCell(
                  row.revenue,
                  fmtRev(row.revenue),
                  row.filter,
                  undefined,
                  'Revenue',
                  row.name,
                )}
              </tr>
            ))}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-gray-400 text-xs">
                  Sin datos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrchardDashboardTab({
  breakdown,
  rankings,
  dateRange,
  allRecords,
  onDrillDown,
}: OrchardDashboardTabProps) {
  // Internal drill-down drawer state (drawer can also be triggered from parent via onDrillDown)
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [drawerRecords, setDrawerRecords] = useState<OrchardRecord[]>([])
  const [drawerLabel,   setDrawerLabel]   = useState('')

  // Forward drill-down: call parent first, then open internal drawer
  const handleDrillDown = useCallback((records: OrchardRecord[], label: string) => {
    onDrillDown(records, label)
    setDrawerRecords(records)
    setDrawerLabel(label)
    setDrawerOpen(true)
  }, [onDrillDown])

  const freeTrialNull = breakdown.FREE_TRIAL === null

  // ── Date range badge label ─────────────────────────────────────────────────
  let dateLabel: string | null = null
  if (dateRange) {
    dateLabel = dateRange.min === dateRange.max
      ? dateRange.min
      : `${dateRange.min} – ${dateRange.max}`
    // When min ≠ max we have multiple periods
    if (dateRange.min !== dateRange.max) {
      dateLabel = `Múltiples períodos (${dateRange.min} – ${dateRange.max})`
    }
  }

  // ── Summary card drill-down helpers ───────────────────────────────────────
  function drillCategory(cat: string, label: string) {
    const filtered = allRecords.filter(r => r.normalizedStreamType === cat)
    handleDrillDown(filtered, label)
  }

  function drillAll(label: string) {
    handleDrillDown([...allRecords], label)
  }

  // ── Ranking rows ───────────────────────────────────────────────────────────
  const platformRows = rankings.platforms.map(platformToRow)
  const countryRows  = rankings.countries.map(countryToRow)
  const artistRows   = rankings.artists.map(artistToRow)
  const trackRows    = rankings.tracks.map(trackToRow)

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-bold text-text-primary">Resumen del reporte</h2>
        {dateLabel && (
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
            {dateLabel}
          </span>
        )}
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {/* Total Streams */}
        <SummaryCard
          label="Total Streams"
          value={fmtNum(breakdown.total.streams)}
          accent="default"
          clickable
          onClick={() => drillAll('Total Streams')}
        />

        {/* Total Revenue */}
        <SummaryCard
          label="Total Revenue"
          value={fmtRev(breakdown.total.revenue)}
          accent="default"
          clickable
          onClick={() => drillAll('Total Revenue')}
        />

        {/* FULL_PAY */}
        <SummaryCard
          label="FULL_PAY"
          value={fmtNum(breakdown.FULL_PAY.streams)}
          subLabel={fmtRev(breakdown.FULL_PAY.revenue)}
          accent="green"
          clickable
          onClick={() => drillCategory('FULL_PAY', 'FULL_PAY Streams')}
        />

        {/* FREE_AD_SUPPORTED */}
        <SummaryCard
          label="FREE_AD_SUPPORTED"
          value={fmtNum(breakdown.FREE_AD_SUPPORTED.streams)}
          subLabel={fmtRev(breakdown.FREE_AD_SUPPORTED.revenue)}
          accent="blue"
          clickable
          onClick={() => drillCategory('FREE_AD_SUPPORTED', 'FREE_AD_SUPPORTED Streams')}
        />

        {/* FREE_TRIAL */}
        {freeTrialNull ? (
          <SummaryCard
            label="FREE_TRIAL"
            value="No identificado en el reporte"
            accent="gray"
            dimmed
          />
        ) : (
          <SummaryCard
            label="FREE_TRIAL"
            value={fmtNum(breakdown.FREE_TRIAL!.streams)}
            subLabel={fmtRev(breakdown.FREE_TRIAL!.revenue)}
            accent="yellow"
            clickable
            onClick={() => drillCategory('FREE_TRIAL', 'FREE_TRIAL Streams')}
          />
        )}

        {/* UNQUALIFIED */}
        <SummaryCard
          label="UNQUALIFIED"
          value={fmtNum(breakdown.UNQUALIFIED.streams)}
          subLabel={fmtRev(breakdown.UNQUALIFIED.revenue)}
          accent="orange"
          clickable
          onClick={() => drillCategory('UNQUALIFIED', 'UNQUALIFIED Streams')}
        />

        {/* FRAUDULENT */}
        <SummaryCard
          label="FRAUDULENT"
          value={fmtNum(breakdown.FRAUDULENT.streams)}
          subLabel={fmtRev(breakdown.FRAUDULENT.revenue)}
          accent="red"
          clickable
          onClick={() => drillCategory('FRAUDULENT', 'FRAUDULENT Streams')}
        />
      </div>

      {/* ── Ranking Tables ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-8">
        <RankingTable
          title="Plataformas"
          rows={platformRows}
          allRecords={allRecords}
          onDrillDown={handleDrillDown}
          freeTrialNull={freeTrialNull}
        />
        <RankingTable
          title="Países"
          rows={countryRows}
          allRecords={allRecords}
          onDrillDown={handleDrillDown}
          freeTrialNull={freeTrialNull}
        />
        <RankingTable
          title="Artistas"
          rows={artistRows}
          allRecords={allRecords}
          onDrillDown={handleDrillDown}
          freeTrialNull={freeTrialNull}
        />
        <RankingTable
          title="Canciones"
          rows={trackRows}
          allRecords={allRecords}
          onDrillDown={handleDrillDown}
          freeTrialNull={freeTrialNull}
        />
      </div>

      {/* ── Internal Drill-Down Drawer ──────────────────────────────────────── */}
      <OrchardDrillDownDrawer
        isOpen={drawerOpen}
        records={drawerRecords}
        label={drawerLabel}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  )
}
