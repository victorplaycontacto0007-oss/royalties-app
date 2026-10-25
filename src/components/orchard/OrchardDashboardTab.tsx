/**
 * OrchardDashboardTab.tsx — Rediseño profesional estilo ReportDetailPage.
 */

import { useState, useCallback, useMemo } from 'react'
import { TrendingUp, Music, DollarSign, Star, AlertTriangle, ShieldOff, Zap } from 'lucide-react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type {
  StreamCategoryBreakdown,
  PlatformSummary,
  CountrySummary,
  ArtistSummary,
  TrackSummary,
} from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

export interface OrchardDashboardTabProps {
  breakdown:  StreamCategoryBreakdown
  rankings: {
    platforms: PlatformSummary[]
    countries: CountrySummary[]
    artists:   ArtistSummary[]
    tracks:    TrackSummary[]
  }
  dateRange:  { min: string; max: string } | null
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt  = (n: number) => n.toLocaleString('en-US')
const fmtR = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const per1k = (rev: number, str: number) => str > 0 ? `$${(rev / str * 1000).toFixed(4)}/1k` : null

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color, onClick,
}: {
  label: string; value: string; sub?: string | null
  icon: React.ElementType; color: string; onClick?: () => void
}) {
  return (
    <div
      className={`card-sm flex items-center gap-4 ${onClick ? 'cursor-pointer hover:shadow-card-hover transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-text-muted text-xs">{label}</p>
        <p className="text-text-primary font-semibold text-sm mt-0.5 truncate">{value}</p>
        {sub && <p className="text-text-muted text-[11px] mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── View toggle ──────────────────────────────────────────────────────────────

type ViewBy = 'track' | 'artist' | 'platform' | 'country'

const VIEW_OPTIONS: { id: ViewBy; label: string }[] = [
  { id: 'track',    label: 'Canción'     },
  { id: 'artist',   label: 'Artista'     },
  { id: 'platform', label: 'Plataforma'  },
  { id: 'country',  label: 'País'        },
]

// ─── Ranking table ────────────────────────────────────────────────────────────

type SortKey = 'name' | 'streams' | 'revenue' | 'per1k'
type SortDir = 'asc' | 'desc'

interface RankRow {
  name:     string
  streams:  number
  revenue:  number
  per1k:    number | null
  country?: string
  platform?: string
  filter:   (r: OrchardRecord) => boolean
}

function buildTrackRows(rankings: PlatformSummary[], tracks: TrackSummary[]): RankRow[] {
  return tracks.map(t => ({
    name:    t.track,
    streams: t.breakdown.total.streams,
    revenue: t.breakdown.total.revenue,
    per1k:   t.breakdown.total.streams > 0
      ? t.breakdown.total.revenue / t.breakdown.total.streams * 1000
      : null,
    filter: (r: OrchardRecord) => r.track === t.track && r.artist === t.artist,
  }))
}

function sortRows(rows: RankRow[], key: SortKey, dir: SortDir): RankRow[] {
  return [...rows].sort((a, b) => {
    let av: number | string, bv: number | string
    if (key === 'name')    { av = a.name;    bv = b.name }
    else if (key === 'streams') { av = a.streams; bv = b.streams }
    else if (key === 'revenue') { av = a.revenue; bv = b.revenue }
    else { av = a.per1k ?? -Infinity; bv = b.per1k ?? -Infinity }
    const f = dir === 'asc' ? 1 : -1
    return typeof av === 'string' ? av.localeCompare(bv as string) * f : ((av as number) - (bv as number)) * f
  })
}

function ThSort({ k, cur, dir, onSort, children }: {
  k: SortKey; cur: SortKey; dir: SortDir; onSort: (k: SortKey) => void; children: React.ReactNode
}) {
  const active = cur === k
  return (
    <th
      onClick={() => onSort(k)}
      className={`py-2 pr-4 text-left text-text-muted font-medium text-xs cursor-pointer select-none whitespace-nowrap hover:text-text-primary transition-colors ${active ? 'text-primary' : ''}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        {active
          ? (dir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />)
          : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
      </span>
    </th>
  )
}

function RankingTable({
  rows, allRecords, onDrillDown, showCountry, showPlatform,
}: {
  rows: RankRow[]
  allRecords: OrchardRecord[]
  onDrillDown: (r: OrchardRecord[], l: string) => void
  showCountry?: boolean
  showPlatform?: boolean
}) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const sorted = sortRows(rows, sortKey, sortDir)
  const total  = rows.reduce((s, r) => ({ streams: s.streams + r.streams, revenue: s.revenue + r.revenue }), { streams: 0, revenue: 0 })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <ThSort k="name" cur={sortKey} dir={sortDir} onSort={handleSort}>
              {showCountry ? 'País' : showPlatform ? 'Plataforma' : 'Canción'}
            </ThSort>
            {showCountry  && <th className="py-2 pr-4 text-left text-text-muted font-medium text-xs">País</th>}
            {showPlatform && <th className="py-2 pr-4 text-left text-text-muted font-medium text-xs">Plataforma</th>}
            <ThSort k="streams" cur={sortKey} dir={sortDir} onSort={handleSort}>Streams</ThSort>
            <th className="py-2 pr-4 text-left text-text-muted font-medium text-xs">🔥 Regalías</th>
            <th className="py-2 pr-4 text-left text-text-muted font-medium text-xs">$/100</th>
            <th className="py-2 pr-4 text-left text-text-muted font-medium text-xs">$/1000</th>
            <th className="py-2 text-left text-text-muted font-medium text-xs">% del total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const pct   = total.revenue > 0 ? row.revenue / total.revenue * 100 : 0
            const p100  = row.streams > 0 ? row.revenue / row.streams * 100 : null
            const p1000 = row.streams > 0 ? row.revenue / row.streams * 1000 : null
            const DOT_COLORS = [
              'bg-violet-500','bg-purple-400','bg-cyan-400','bg-emerald-400',
              'bg-amber-400', 'bg-red-400',  'bg-orange-400','bg-green-500',
              'bg-blue-400',  'bg-pink-400', 'bg-teal-400', 'bg-yellow-400',
              'bg-indigo-400','bg-rose-400', 'bg-lime-400', 'bg-sky-400',
            ]
            return (
              <tr
                key={i}
                className="border-b border-border/50 hover:bg-surface-2 transition-colors cursor-pointer"
                onClick={() => onDrillDown(allRecords.filter(row.filter), row.name)}
              >
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[i % DOT_COLORS.length]}`} />
                    <span className="text-text-primary font-medium text-xs truncate max-w-[200px]" title={row.name}>
                      {row.name}
                    </span>
                  </div>
                </td>
                {showPlatform && (
                  <td className="py-2.5 pr-4 text-text-secondary text-xs">{row.platform ?? '—'}</td>
                )}
                {showCountry && (
                  <td className="py-2.5 pr-4 text-text-secondary text-xs">{row.country ?? '—'}</td>
                )}
                <td className="py-2.5 pr-4 text-text-secondary text-xs tabular-nums">{fmt(row.streams)}</td>
                <td className="py-2.5 pr-4 text-text-primary font-semibold text-xs tabular-nums">{fmtR(row.revenue)}</td>
                <td className="py-2.5 pr-4 text-primary text-xs tabular-nums">
                  {p100 !== null ? `$${p100.toFixed(4)}` : '—'}
                </td>
                <td className="py-2.5 pr-4 text-primary text-xs tabular-nums">
                  {p1000 !== null ? `$${p1000.toFixed(4)}` : '—'}
                </td>
                <td className="py-2.5 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="text-text-muted tabular-nums">{pct.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="text-center text-text-muted text-xs py-8">Sin datos</p>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrchardDashboardTab({
  breakdown, rankings, dateRange, allRecords, onDrillDown,
}: OrchardDashboardTabProps) {
  const [viewBy, setViewBy] = useState<ViewBy>('track')

  const freeTrialNull = breakdown.FREE_TRIAL === null

  const topPlatform = rankings.platforms[0]?.platform ?? '—'
  const topTrack    = rankings.tracks[0]?.track ?? '—'
  const topCountry  = rankings.countries[0]?.country ?? '—'

  const rpmGlobal = breakdown.total.streams > 0
    ? breakdown.total.revenue / breakdown.total.streams * 1000
    : null

  // Build rows for each view
  const rows: RankRow[] = useMemo(() => {
    switch (viewBy) {
      case 'track':
        return rankings.tracks.map(t => ({
          name:    t.track,
          streams: t.breakdown.total.streams,
          revenue: t.breakdown.total.revenue,
          per1k:   t.breakdown.total.streams > 0 ? t.breakdown.total.revenue / t.breakdown.total.streams * 1000 : null,
          filter:  (r: OrchardRecord) => r.track === t.track && r.artist === t.artist,
        }))
      case 'artist':
        return rankings.artists.map(a => ({
          name:    a.artist,
          streams: a.breakdown.total.streams,
          revenue: a.breakdown.total.revenue,
          per1k:   a.breakdown.total.streams > 0 ? a.breakdown.total.revenue / a.breakdown.total.streams * 1000 : null,
          filter:  (r: OrchardRecord) => r.artist === a.artist,
        }))
      case 'platform':
        return rankings.platforms.map(p => ({
          name:     p.platform,
          streams:  p.breakdown.total.streams,
          revenue:  p.breakdown.total.revenue,
          per1k:    p.breakdown.total.streams > 0 ? p.breakdown.total.revenue / p.breakdown.total.streams * 1000 : null,
          platform: p.platform,
          filter:   (r: OrchardRecord) => r.platform === p.platform,
        }))
      case 'country':
        return rankings.countries.map(c => ({
          name:    c.country,
          streams: c.breakdown.total.streams,
          revenue: c.breakdown.total.revenue,
          per1k:   c.breakdown.total.streams > 0 ? c.breakdown.total.revenue / c.breakdown.total.streams * 1000 : null,
          country: c.country,
          filter:  (r: OrchardRecord) => r.country === c.country && r.platform === c.platform,
        }))
    }
  }, [viewBy, rankings])

  const dateLabel = dateRange
    ? (dateRange.min === dateRange.max ? dateRange.min : `${dateRange.min} – ${dateRange.max}`)
    : null

  return (
    <div className="flex flex-col gap-6">

      {/* ── Top 4 stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Ingresos totales"
          value={fmtR(breakdown.total.revenue)}
          icon={DollarSign}
          color="bg-primary/10 text-primary"
          onClick={() => onDrillDown(allRecords, 'Total ingresos')}
        />
        <StatCard
          label="Total streams"
          value={fmt(breakdown.total.streams)}
          icon={TrendingUp}
          color="bg-success/10 text-success"
          onClick={() => onDrillDown(allRecords, 'Total streams')}
        />
        <StatCard
          label="Top plataforma"
          value={topPlatform}
          icon={Zap}
          color="bg-warning/10 text-warning"
          onClick={() => onDrillDown(allRecords.filter(r => r.platform === topPlatform), `Plataforma: ${topPlatform}`)}
        />
        <StatCard
          label="Top canción"
          value={topTrack}
          icon={Music}
          color="bg-accent/10 text-accent"
          onClick={() => {
            const t = rankings.tracks[0]
            if (t) onDrillDown(allRecords.filter(r => r.track === t.track && r.artist === t.artist), `Canción: ${topTrack}`)
          }}
        />
      </div>

      {/* ── 3 rate cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-sm flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Star style={{ width: 18, height: 18 }} className="text-primary" />
          </div>
          <div>
            <p className="text-text-muted text-xs">Pago por 100 streams</p>
            <p className="text-text-primary font-semibold text-sm">
              {rpmGlobal !== null ? `$${(rpmGlobal / 10).toFixed(4)}` : '—'}
            </p>
            <p className="text-text-muted text-[11px]">promedio global</p>
          </div>
        </div>
        <div className="card-sm flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
            <TrendingUp style={{ width: 18, height: 18 }} className="text-success" />
          </div>
          <div>
            <p className="text-text-muted text-xs">Pago por 1,000 streams</p>
            <p className="text-text-primary font-semibold text-sm">
              {rpmGlobal !== null ? `$${rpmGlobal.toFixed(4)}` : '—'}
            </p>
            <p className="text-text-muted text-[11px]">RPM promedio global</p>
          </div>
        </div>
        <div className="card-sm flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
            <Zap style={{ width: 18, height: 18 }} className="text-warning" />
          </div>
          <div>
            <p className="text-text-muted text-xs">Top país</p>
            <p className="text-text-primary font-semibold text-sm truncate max-w-[140px]">{topCountry}</p>
            <p className="text-text-muted text-[11px]">mayor ingreso</p>
          </div>
        </div>
      </div>

      {/* ── Fraud alert / clear banner ── */}
      {breakdown.FRAUDULENT.streams > 0 ? (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-error/30 bg-error/5">
          <ShieldOff className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-error text-sm font-semibold">
              {fmt(breakdown.FRAUDULENT.streams)} streams fraudulentos detectados
            </p>
            <p className="text-text-muted text-xs mt-0.5">
              Se encontraron filas con "Fraudulent Streams" en este reporte.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-success/30 bg-success/5">
          <div className="w-4 h-4 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <div className="w-2 h-2 rounded-full bg-success" />
          </div>
          <div>
            <p className="text-success text-sm font-semibold">Sin streams fraudulentos detectados</p>
            <p className="text-text-muted text-xs mt-0.5">
              No se encontraron filas con "Fraudulent Streams" en este reporte.
            </p>
          </div>
        </div>
      )}

      {/* ── Stream categories summary ── */}
      {!freeTrialNull && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pagos (FULL_PAY)',       val: breakdown.FULL_PAY,          color: 'bg-success/10 text-success' },
            { label: 'Ad-Supported',           val: breakdown.FREE_AD_SUPPORTED, color: 'bg-primary/10 text-primary' },
            { label: 'Sin royalty (UNQUALIFIED)', val: breakdown.UNQUALIFIED,    color: 'bg-warning/10 text-warning' },
            { label: 'Fraudulentos',           val: breakdown.FRAUDULENT,        color: 'bg-error/10 text-error' },
          ].map(({ label, val, color }) => (
            <div key={label} className="card-sm">
              <p className="text-text-muted text-xs">{label}</p>
              <p className="text-text-primary font-semibold text-sm mt-0.5">{fmt(val.streams)}</p>
              <p className="text-text-muted text-[11px] mt-0.5">{fmtR(val.revenue)}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Ranking table with view toggle ── */}
      <div className="card">
        {/* Header + date badge */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">Ver por</span>
            {dateLabel && (
              <span className="badge badge-primary">{dateLabel}</span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {VIEW_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setViewBy(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  viewBy === id
                    ? 'bg-primary text-white'
                    : 'bg-surface-2 text-text-secondary hover:text-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <RankingTable
          rows={rows}
          allRecords={allRecords}
          onDrillDown={onDrillDown}
          showPlatform={viewBy === 'country'}
          showCountry={false}
        />
      </div>
    </div>
  )
}
