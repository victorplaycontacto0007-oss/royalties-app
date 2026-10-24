/**
 * OrchardCatalogTab.tsx — Rediseño profesional con filtros dropdown y tabla limpia.
 */

import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, FileSpreadsheet, X } from 'lucide-react'
import type { ArtistSummary, TrackSummary, ReleaseSummary } from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'
import { exportOrchardArtistReport } from '../../lib/splits-export'

interface OrchardCatalogTabProps {
  artistSummaries:  ArtistSummary[]
  trackSummaries:   TrackSummary[]
  releaseSummaries: ReleaseSummary[]
  allRecords:       OrchardRecord[]
  onDrillDown:      (records: OrchardRecord[], label: string) => void
}

type ViewBy = 'track' | 'artist' | 'album' | 'platform' | 'country'
type SortKey = 'name' | 'country' | 'platform' | 'streams' | 'revenue' | 'per100' | 'per1000' | 'pct'
type SortDir = 'asc' | 'desc'

interface Row {
  track:    string
  artist:   string
  country:  string
  platform: string
  isrc:     string
  streams:  number
  revenue:  number
  filter:   (r: OrchardRecord) => boolean
}

const fmtR = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`

export default function OrchardCatalogTab({
  artistSummaries, trackSummaries, releaseSummaries, allRecords, onDrillDown,
}: OrchardCatalogTabProps) {
  const [viewBy, setViewBy] = useState<ViewBy>('track')
  const [artistFilter,   setArtistFilter]   = useState('all')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [songFilter,     setSongFilter]     = useState('all')
  const [countryFilter,  setCountryFilter]  = useState('all')
  const [sortKey,  setSortKey]  = useState<SortKey>('revenue')
  const [sortDir,  setSortDir]  = useState<SortDir>('desc')

  // ── Reporte modal state ───────────────────────────────────────────────────
  const [reportModal, setReportModal] = useState(false)
  const [reportArtist, setReportArtist] = useState('')
  const [artistPct, setArtistPct] = useState(70)
  const [labelName, setLabelName] = useState('Sello')

  const VIEW_OPTIONS: { id: ViewBy; label: string }[] = [
    { id: 'track',    label: 'Canción'     },
    { id: 'artist',   label: 'Artista'     },
    { id: 'album',    label: 'Álbum'       },
    { id: 'platform', label: 'Plataforma'  },
    { id: 'country',  label: 'País'        },
  ]

  // ── Distinct filter options ───────────────────────────────────────────────
  const artists   = useMemo(() => [...new Set(allRecords.map(r => r.artist))].sort(), [allRecords])
  const platforms = useMemo(() => [...new Set(allRecords.map(r => r.platform))].sort(), [allRecords])
  const songs     = useMemo(() => [...new Set(allRecords.map(r => r.track))].sort(), [allRecords])
  const countries = useMemo(() => [...new Set(allRecords.map(r => r.country))].sort(), [allRecords])

  // ── Filtered base records ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allRecords.filter(r =>
      (artistFilter   === 'all' || r.artist   === artistFilter)   &&
      (platformFilter === 'all' || r.platform === platformFilter) &&
      (songFilter     === 'all' || r.track    === songFilter)     &&
      (countryFilter  === 'all' || r.country  === countryFilter)
    )
  }, [allRecords, artistFilter, platformFilter, songFilter, countryFilter])

  // ── Build rows by viewBy ──────────────────────────────────────────────────
  const rows: Row[] = useMemo(() => {
    const agg = new Map<string, Row>()

    for (const r of filtered) {
      let key = ''
      let name = ''
      switch (viewBy) {
        case 'track':    key = `${r.track}|||${r.artist}`;   name = r.track;    break
        case 'artist':   key = r.artist;                      name = r.artist;   break
        case 'album':    key = `${r.album}|||${r.artist}`;   name = r.album;    break
        case 'platform': key = r.platform;                    name = r.platform; break
        case 'country':  key = `${r.country}|||${r.platform}`; name = r.country; break
      }

      if (!agg.has(key)) {
        agg.set(key, {
          track:    viewBy === 'track'  ? r.track    : name,
          artist:   viewBy === 'artist' ? r.artist   : (viewBy === 'track' ? r.artist : ''),
          country:  viewBy === 'country'  ? r.country  : '',
          platform: viewBy === 'platform' ? r.platform : (viewBy === 'country' ? r.platform : ''),
          isrc:     viewBy === 'track' ? r.isrc : '',
          streams:  0,
          revenue:  0,
          filter:   (rec: OrchardRecord) => {
            switch (viewBy) {
              case 'track':    return rec.track === r.track && rec.artist === r.artist
              case 'artist':   return rec.artist === r.artist
              case 'album':    return rec.album === r.album && rec.artist === r.artist
              case 'platform': return rec.platform === r.platform
              case 'country':  return rec.country === r.country && rec.platform === r.platform
            }
          },
        })
      }
      const row = agg.get(key)!
      row.streams += r.quantity
      row.revenue += r.net_total
    }

    return [...agg.values()]
  }, [filtered, viewBy])

  // ── Sort ──────────────────────────────────────────────────────────────────
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)

  const sorted = useMemo(() => {
    const f = sortDir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'name':     return a.track.localeCompare(b.track) * f
        case 'country':  return a.country.localeCompare(b.country) * f
        case 'platform': return a.platform.localeCompare(b.platform) * f
        case 'streams':  return (a.streams - b.streams) * f
        case 'revenue':  return (a.revenue - b.revenue) * f
        case 'per100':   return ((a.streams > 0 ? a.revenue / a.streams * 100 : -Infinity) - (b.streams > 0 ? b.revenue / b.streams * 100 : -Infinity)) * f
        case 'per1000':  return ((a.streams > 0 ? a.revenue / a.streams * 1000 : -Infinity) - (b.streams > 0 ? b.revenue / b.streams * 1000 : -Infinity)) * f
        case 'pct':      return ((a.revenue / (totalRevenue || 1)) - (b.revenue / (totalRevenue || 1))) * f
        default:         return 0
      }
    })
  }, [rows, sortKey, sortDir, totalRevenue])

  const handleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }

  const clearFilters = () => {
    setArtistFilter('all'); setPlatformFilter('all')
    setSongFilter('all'); setCountryFilter('all')
  }

  const hasFilter = artistFilter !== 'all' || platformFilter !== 'all' || songFilter !== 'all' || countryFilter !== 'all'

  function Th({ k, children }: { k: SortKey; children: React.ReactNode }) {
    const active = sortKey === k
    return (
      <th
        onClick={() => handleSort(k)}
        className={`py-2 pr-4 text-left font-medium text-xs cursor-pointer select-none whitespace-nowrap hover:text-text-primary transition-colors ${active ? 'text-primary' : 'text-text-muted'}`}
      >
        <span className="inline-flex items-center gap-0.5">
          {children}
          {active
            ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />)
            : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
        </span>
      </th>
    )
  }

  return (
    <div className="card flex flex-col gap-4">
      {/* ── Filter row ── */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
          className="input w-auto text-sm py-2 min-w-[160px]"
        >
          <option value="all">Todas las plataformas ({platforms.length})</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={songFilter} onChange={e => setSongFilter(e.target.value)}
          className="input w-auto text-sm py-2 min-w-[160px]"
        >
          <option value="all">Todas las canciones ({songs.length})</option>
          {songs.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
          className="input w-auto text-sm py-2 min-w-[140px]"
        >
          <option value="all">Todos los países ({countries.length})</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {hasFilter && (
          <button onClick={clearFilters} className="btn-ghost text-sm py-2 text-error">
            Limpiar filtros
          </button>
        )}

        {/* ── Botón Generar Reporte ── */}
        <div className="ml-auto">
          <button
            onClick={() => {
              setReportArtist(artistFilter !== 'all' ? artistFilter : (artists[0] ?? ''))
              setReportModal(true)
            }}
            className="btn-primary text-xs py-2 px-3 gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Generar reporte
          </button>
        </div>
      </div>

      {/* ── View toggle ── */}
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

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th k="name">
                {viewBy === 'track' ? 'Canción' : viewBy === 'artist' ? 'Artista'
                  : viewBy === 'album' ? 'Álbum' : viewBy === 'platform' ? 'Plataforma' : 'País'}
              </Th>
              {viewBy === 'track'   && <th className="py-2 pr-4 text-left text-text-muted font-medium text-xs">Artista</th>}
              {viewBy === 'country' && <Th k="platform">Plataforma</Th>}
              <Th k="streams">Streams</Th>
              <th className="py-2 pr-4 text-left text-text-muted font-medium text-xs">🔥 Regalías</th>
              <Th k="per100">$/100</Th>
              <Th k="per1000">$/1,000</Th>
              <Th k="pct">% del total</Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const pct    = totalRevenue > 0 ? row.revenue / totalRevenue * 100 : 0
              const p100   = row.streams > 0 ? row.revenue / row.streams * 100 : null
              const p1000  = row.streams > 0 ? row.revenue / row.streams * 1000 : null
              const label  = viewBy === 'track'
                ? row.track
                : viewBy === 'country'
                  ? `${row.country} (${row.platform})`
                  : row.track

              return (
                <tr
                  key={i}
                  className="border-b border-border/50 hover:bg-surface-2 transition-colors cursor-pointer"
                  onClick={() => onDrillDown(filtered.filter(row.filter), label)}
                >
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary/60 flex-shrink-0" />
                      <span className="text-text-primary font-medium text-xs truncate max-w-[200px]" title={row.track}>
                        {row.track}
                      </span>
                    </div>
                  </td>
                  {viewBy === 'track' && (
                    <td className="py-2.5 pr-4 text-text-secondary text-xs truncate max-w-[140px]">{row.artist}</td>
                  )}
                  {viewBy === 'country' && (
                    <td className="py-2.5 pr-4 text-text-secondary text-xs">{row.platform}</td>
                  )}
                  <td className="py-2.5 pr-4 text-text-secondary text-xs tabular-nums">{row.streams.toLocaleString()}</td>
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
          <p className="text-center text-text-muted text-xs py-10">Sin datos para los filtros seleccionados.</p>
        )}
      </div>

      {/* ── Footer count ── */}
      {sorted.length > 0 && (
        <p className="text-text-muted text-xs pt-1">
          {sorted.length.toLocaleString()} {viewBy === 'track' ? 'canciones' : viewBy === 'artist' ? 'artistas' : 'entradas'}
          {hasFilter && <span className="ml-1">(filtradas)</span>}
        </p>
      )}

      {/* ── Modal de reporte por artista ── */}
      {reportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <h2 className="text-base font-bold text-text-primary">Generar reporte de artista</h2>
              </div>
              <button onClick={() => setReportModal(false)} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 flex flex-col gap-5">

              {/* Artista */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary">Artista</label>
                <select
                  value={reportArtist}
                  onChange={e => setReportArtist(e.target.value)}
                  className="input text-sm"
                >
                  {artists.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>

              {/* Split slider */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-text-secondary">Distribución de ingresos</label>

                {/* Visual split bar */}
                <div className="flex rounded-xl overflow-hidden h-8 text-xs font-semibold">
                  <div
                    className="flex items-center justify-center bg-primary text-white transition-all"
                    style={{ width: `${artistPct}%` }}
                  >
                    {artistPct > 15 ? `Artista ${artistPct}%` : `${artistPct}%`}
                  </div>
                  <div
                    className="flex items-center justify-center bg-surface-3 text-text-secondary transition-all"
                    style={{ width: `${100 - artistPct}%` }}
                  >
                    {(100 - artistPct) > 15 ? `Sello ${100 - artistPct}%` : `${100 - artistPct}%`}
                  </div>
                </div>

                <input
                  type="range" min={0} max={100} step={1}
                  value={artistPct}
                  onChange={e => setArtistPct(Number(e.target.value))}
                  className="w-full accent-primary"
                />

                <div className="flex justify-between text-xs text-text-muted">
                  <span>Artista: <strong className="text-text-primary">{artistPct}%</strong></span>
                  <span>Sello: <strong className="text-text-primary">{100 - artistPct}%</strong></span>
                </div>
              </div>

              {/* Label name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary">Nombre del sello</label>
                <input
                  type="text"
                  value={labelName}
                  onChange={e => setLabelName(e.target.value)}
                  placeholder="Ej: Flow Independiente"
                  className="input text-sm"
                />
              </div>

              {/* Preview */}
              {reportArtist && (() => {
                const recs = allRecords.filter(r => r.artist === reportArtist)
                const rev  = recs.reduce((s, r) => s + r.net_total, 0)
                const str  = recs.reduce((s, r) => s + r.quantity, 0)
                const artAmt = rev * artistPct / 100
                const lblAmt = rev * (100 - artistPct) / 100
                return (
                  <div className="bg-surface-2 rounded-xl p-4 flex flex-col gap-2 text-xs">
                    <p className="font-semibold text-text-primary">Vista previa — {reportArtist}</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="text-text-muted">Registros</span>
                      <span className="font-medium text-text-primary">{recs.length.toLocaleString()}</span>
                      <span className="text-text-muted">Streams</span>
                      <span className="font-medium text-text-primary">{str.toLocaleString()}</span>
                      <span className="text-text-muted">Ingresos brutos</span>
                      <span className="font-semibold text-text-primary">${rev.toFixed(4)}</span>
                      <span className="text-text-muted">Para artista ({artistPct}%)</span>
                      <span className="font-semibold text-primary">${artAmt.toFixed(4)}</span>
                      <span className="text-text-muted">Para sello ({100 - artistPct}%)</span>
                      <span className="font-semibold text-text-secondary">${lblAmt.toFixed(4)}</span>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
              <button onClick={() => setReportModal(false)} className="btn-secondary text-sm">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!reportArtist) return
                  exportOrchardArtistReport(reportArtist, allRecords, {
                    artistPct,
                    labelPct:  100 - artistPct,
                    labelName: labelName || 'Sello',
                  })
                  setReportModal(false)
                }}
                className="btn-primary text-sm gap-2"
                disabled={!reportArtist}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Descargar Excel (.xlsx)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
