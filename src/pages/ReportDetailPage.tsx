import { useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, formatNumber, formatDate, ratePerK, ratePer100, formatRate } from '../lib/utils'
import { exportSplitsExcel, exportConsolidatedExcel, exportSplitsPdf } from '../lib/splits-export'
import {
  ArrowLeft, Download, Loader2, DollarSign, TrendingUp, Globe,
  Music, Star, Radio, Users, ChevronDown, FileSpreadsheet,
  FileText as FilePdf, FileType2, Zap, Percent
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import type { RoyaltyRecord, Report, Contract } from '../types/database'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#f97316','#84cc16','#14b8a6']

type FilterKey = 'all' | string
type GroupBy = 'artist' | 'song' | 'album' | 'store' | 'country'

// ── Aggregate ──────────────────────────────────────────────
function aggregate(rows: RoyaltyRecord[], field: keyof RoyaltyRecord) {
  const map: Record<string, { earnings: number; streams: number }> = {}
  rows.forEach(r => {
    const key = String(r[field] || 'Unknown')
    if (!map[key]) map[key] = { earnings: 0, streams: 0 }
    map[key].earnings += r.earnings_usd
    map[key].streams  += r.quantity
  })
  return Object.entries(map)
    .map(([name, v]) => ({
      name,
      earnings: v.earnings,
      streams:  v.streams,
      rateK:    ratePerK(v.earnings, v.streams),
      rate100:  ratePer100(v.earnings, v.streams),
    }))
    .sort((a, b) => b.earnings - a.earnings)
}

export default function ReportDetailPage() {
  const { id }  = useParams<{ id: string }>()
  const { user } = useAuth()

  // filters
  const [artistFilter,   setArtistFilter]   = useState<FilterKey>('all')
  const [platformFilter, setPlatformFilter] = useState<FilterKey>('all')
  const [songFilter,     setSongFilter]     = useState<FilterKey>('all')
  const [countryFilter,  setCountryFilter]  = useState<FilterKey>('all')

  // groupBy view
  const [groupBy, setGroupBy] = useState<GroupBy>('song')

  // ui
  const [showExportMenu, setShowExportMenu] = useState(false)

  const { data: report } = useQuery<Report>({
    queryKey: ['report', id],
    queryFn: async () => {
      const { data, error } = await db.from('reports').select('*').eq('id', id!).eq('user_id', user!.id).single()
      if (error) throw error
      return data as Report
    },
    enabled: !!id && !!user,
  })

  const { data: records, isLoading } = useQuery<RoyaltyRecord[]>({
    queryKey: ['royalty-records', id],
    queryFn: async () => {
      const { data, error } = await db.from('royalty_records').select('*').eq('report_id', id!).eq('user_id', user!.id)
      if (error) throw error
      return data as RoyaltyRecord[]
    },
    enabled: !!id && !!user,
  })

  const { data: contracts } = useQuery<Contract[]>({
    queryKey: ['contracts', user?.id],
    queryFn: async () => {
      const { data } = await db.from('contracts').select('*, splits:contract_splits(*)')
        .eq('user_id', user!.id).eq('is_active', true)
      return (data ?? []) as Contract[]
    },
    enabled: !!user,
  })

  const artists   = useMemo(() => [...new Set((records ?? []).map(r => r.artist_name))].sort(), [records])  const platforms = useMemo(() => [...new Set((records ?? []).map(r => r.store))].sort(), [records])
  const songs     = useMemo(() => [...new Set((records ?? []).map(r => r.song_title))].sort(), [records])
  const countries = useMemo(() => [...new Set((records ?? []).map(r => r.country))].sort(), [records])

  const artistBreakdown = useMemo(() => aggregate(records ?? [], 'artist_name'), [records])
  const totalAll        = useMemo(() => (records ?? []).reduce((a, r) => a + r.earnings_usd, 0), [records])
  const streamsAll      = useMemo(() => (records ?? []).reduce((a, r) => a + r.quantity, 0), [records])

  const filtered = useMemo(() => (records ?? []).filter(r =>
    (artistFilter   === 'all' || r.artist_name === artistFilter) &&
    (platformFilter === 'all' || r.store === platformFilter) &&
    (songFilter     === 'all' || r.song_title === songFilter) &&
    (countryFilter  === 'all' || r.country === countryFilter)
  ), [records, artistFilter, platformFilter, songFilter, countryFilter])

  const totalEarnings = useMemo(() => filtered.reduce((a, r) => a + r.earnings_usd, 0), [filtered])
  const totalStreams   = useMemo(() => filtered.reduce((a, r) => a + r.quantity, 0), [filtered])
  const globalRateK   = ratePerK(totalEarnings, totalStreams)

  // groupBy aggregation
  const groupByField: keyof RoyaltyRecord =
    groupBy === 'artist'  ? 'artist_name' :
    groupBy === 'song'    ? 'song_title'  :
    groupBy === 'album'   ? 'album_name'  :
    groupBy === 'store'   ? 'store'       : 'country'

  const groupedData = useMemo(() => aggregate(filtered, groupByField), [filtered, groupByField])

  const byPlatform = useMemo(() => aggregate(filtered, 'store'),      [filtered])
  const byCountry  = useMemo(() => aggregate(filtered, 'country'),    [filtered])
  const bySong     = useMemo(() => aggregate(filtered, 'song_title'), [filtered])
  const byArtist   = useMemo(() => aggregate(filtered, 'artist_name'),[filtered])

  const byMonth = useMemo(() => Object.entries(
    filtered.reduce<Record<string,number>>((acc, r) => {
      const m = (r.sale_period ?? '').slice(0,7) || 'Unknown'
      acc[m] = (acc[m] ?? 0) + r.earnings_usd
      return acc
    }, {})
  ).map(([month, earnings]) => ({ month, earnings }))
   .sort((a, b) => a.month.localeCompare(b.month)), [filtered])

  const topPlatform = byPlatform[0]?.name ?? '—'
  const topCountry  = byCountry[0]?.name  ?? '—'
  const topSong     = bySong[0]?.name     ?? '—'
  const multiArtist = artists.length > 1

  // ── Exports ────────────────────────────────────────────────
  const exportExcel = (rows: RoyaltyRecord[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => {
      const rK   = ratePerK(r.earnings_usd, r.quantity)
      const r100 = ratePer100(r.earnings_usd, r.quantity)
      return {
        Período: r.sale_period, Artista: r.artist_name, Plataforma: r.store,
        País: r.country, Álbum: r.album_name, Canción: r.song_title,
        Streams: r.quantity, 'Ingresos USD': r.earnings_usd,
        '$/100 Streams': r100.toFixed(4), '$/1,000 Streams': rK.toFixed(4),
      }
    }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Regalías')
    XLSX.writeFile(wb, `${filename}.xlsx`)
  }

  const exportCsv = (rows: RoyaltyRecord[], filename: string) => {
    const headers = ['Período','Artista','Plataforma','País','Álbum','Canción','Streams','Ingresos USD','$/100','$/1000']
    const body = rows.map(r => {
      const rK   = ratePerK(r.earnings_usd, r.quantity)
      const r100 = ratePer100(r.earnings_usd, r.quantity)
      return [r.sale_period, r.artist_name, r.store, r.country, r.album_name, r.song_title,
              r.quantity, r.earnings_usd, r100.toFixed(4), rK.toFixed(4)]
        .map(v => `"${String(v ?? '').replace(/"/g,'""')}"`)
        .join(',')
    })
    const blob = new Blob([[headers.join(','), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = (rows: RoyaltyRecord[], filename: string, artistName?: string) => {
    const doc   = new jsPDF()
    const total   = rows.reduce((a, r) => a + r.earnings_usd, 0)
    const streams = rows.reduce((a, r) => a + r.quantity, 0)
    const rK      = ratePerK(total, streams)

    // header bar
    doc.setFillColor(99,102,241)
    doc.rect(0,0,220,38,'F')
    doc.setTextColor(255,255,255)
    doc.setFontSize(18); doc.setFont('helvetica','bold')
    doc.text('Royalties', 14, 16)
    doc.setFontSize(9); doc.setFont('helvetica','normal')
    doc.text('Music Analytics Platform', 14, 24)
    doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, 14, 31)

    doc.setTextColor(0,0,0)
    doc.setFontSize(15); doc.setFont('helvetica','bold')
    doc.text(artistName ? `Reporte: ${artistName}` : 'Reporte de Regalías', 14, 50)

    // executive summary
    doc.setFontSize(11); doc.setFont('helvetica','bold')
    doc.text('Resumen ejecutivo', 14, 63)
    autoTable(doc, {
      startY: 67,
      body: [
        ['Ingresos totales',       formatCurrency(total)],
        ['Total streams',          formatNumber(streams)],
        ['$/1,000 streams (RPMY)', `$${rK.toFixed(4)}`],
        ['Top plataforma',         aggregate(rows,'store')[0]?.name ?? '—'],
        ['Top canción',            aggregate(rows,'song_title')[0]?.name ?? '—'],
        ['Top país',               aggregate(rows,'country')[0]?.name ?? '—'],
      ],
      styles: { fontSize: 10 },
      columnStyles: { 0: { fontStyle:'bold', cellWidth:60 }, 1: { cellWidth:80 } },
      theme: 'plain',
    })

    const y1 = (doc as any).lastAutoTable.finalY + 8

    // top songs with rates
    doc.setFont('helvetica','bold'); doc.setFontSize(11)
    doc.text('Top canciones', 14, y1)
    autoTable(doc, {
      startY: y1 + 4,
      head: [['Canción','Streams','Ingresos','$/100','$/1,000']],
      body: aggregate(rows,'song_title').slice(0,15).map(s => [
        s.name, formatNumber(s.streams), formatCurrency(s.earnings),
        `$${s.rate100.toFixed(4)}`, `$${s.rateK.toFixed(4)}`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor:[99,102,241] },
    })

    const y2 = (doc as any).lastAutoTable.finalY + 8

    // platforms with rates
    doc.setFont('helvetica','bold')
    doc.text('Por plataforma', 14, y2)
    autoTable(doc, {
      startY: y2 + 4,
      head: [['Plataforma','Streams','Ingresos','$/1,000 streams']],
      body: aggregate(rows,'store').map(p => [
        p.name, formatNumber(p.streams), formatCurrency(p.earnings), `$${p.rateK.toFixed(4)}`,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor:[99,102,241] },
    })

    // detail
    doc.addPage()
    doc.setFont('helvetica','bold'); doc.setFontSize(11)
    doc.text('Detalle de regalías', 14, 20)
    autoTable(doc, {
      startY: 26,
      head: [['Período','Artista','Plataforma','País','Canción','Streams','USD','$/1,000']],
      body: rows.slice(0,1000).map(r => [
        r.sale_period, r.artist_name, r.store, r.country, r.song_title,
        formatNumber(r.quantity), formatCurrency(r.earnings_usd),
        `$${ratePerK(r.earnings_usd, r.quantity).toFixed(4)}`,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor:[99,102,241] },
    })

    doc.save(`${filename}.pdf`)
  }

  const handleExport = (format: 'excel'|'csv'|'pdf', scope: 'filtered'|'all') => {
    setShowExportMenu(false)
    const rows = scope === 'all' ? (records ?? []) : filtered
    const label = artistFilter !== 'all' ? artistFilter : 'completo'
    const base  = `royalties-${label}-${id?.slice(0,8)}`
    if (format === 'excel') exportExcel(rows, base)
    else if (format === 'csv') exportCsv(rows, base)
    else exportPdf(rows, base, artistFilter !== 'all' ? artistFilter : undefined)
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  )

  return (
    <div className="p-8">
      {/* Header */}
      <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }}
        className="flex items-center gap-4 mb-6">
        <Link to="/reports" className="btn-ghost p-2"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-text-primary truncate">{report?.file_name}</h1>
          <p className="text-text-muted text-sm">
            {report ? formatDate(report.created_at) : ''} · {(records ?? []).length.toLocaleString()} registros
            {multiArtist && ` · ${artists.length} artistas`}
          </p>
        </div>

        {/* Export dropdown */}
        <div className="relative">
          <button onClick={() => setShowExportMenu(!showExportMenu)}
            className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" /> Exportar <ChevronDown className="w-3 h-3" />
          </button>
          <AnimatePresence>
            {showExportMenu && (
              <motion.div initial={{ opacity:0, y:-4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-4 }}
                className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-xl shadow-xl z-20 w-56 py-2">
                <p className="text-text-muted text-xs px-3 py-1 font-medium">Vista actual</p>
                <button onClick={() => handleExport('excel','filtered')} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 text-text-secondary hover:text-text-primary text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-green-400" /> Excel (con $/stream)
                </button>
                <button onClick={() => handleExport('csv','filtered')} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 text-text-secondary hover:text-text-primary text-sm">
                  <FileType2 className="w-4 h-4 text-blue-400" /> CSV
                </button>
                <button onClick={() => handleExport('pdf','filtered')} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 text-text-secondary hover:text-text-primary text-sm">
                  <FilePdf className="w-4 h-4 text-red-400" /> PDF profesional
                </button>
                <div className="border-t border-border my-1" />
                <p className="text-text-muted text-xs px-3 py-1 font-medium">Reporte completo</p>
                <button onClick={() => handleExport('excel','all')} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 text-text-secondary hover:text-text-primary text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-green-400" /> Excel completo
                </button>
                <button onClick={() => handleExport('pdf','all')} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2 text-text-secondary hover:text-text-primary text-sm">
                  <FilePdf className="w-4 h-4 text-red-400" /> PDF completo
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Artist cards — multi-artist reports */}
      {multiArtist && (
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="card mb-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-accent/10 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{artists.length} artistas detectados</h3>
              <p className="text-xs text-text-muted">Selecciona uno para ver sus estadísticas</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {artistBreakdown.map((a, i) => {
              const pct    = totalAll > 0 ? (a.earnings / totalAll * 100).toFixed(1) : '0'
              const isSelected = artistFilter === a.name
              return (
                <button key={a.name}
                  onClick={() => setArtistFilter(isSelected ? 'all' : a.name)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    isSelected ? 'border-primary bg-primary/10' : 'border-border hover:border-border-light bg-surface-2'
                  }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ background: COLORS[i % COLORS.length] }}>
                      {a.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-text-primary text-xs font-medium truncate flex-1">{a.name}</span>
                  </div>
                  <p className="text-text-primary text-sm font-semibold">{formatCurrency(a.earnings)}</p>
                  <p className="text-text-muted text-xs">{formatNumber(a.streams)} streams</p>
                  <p className="text-accent text-xs font-medium">${a.rateK.toFixed(3)}/1K</p>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width:`${pct}%`, background:COLORS[i%COLORS.length] }} />
                    </div>
                    <span className="text-text-muted text-xs">{pct}%</span>
                  </div>
                </button>
              )
            })}
          </div>

          {artistFilter !== 'all' && (
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <p className="text-text-secondary text-sm">
                Viendo: <span className="text-primary font-medium">{artistFilter}</span>
                <button onClick={() => setArtistFilter('all')} className="ml-2 text-text-muted hover:text-text-primary text-xs underline">
                  Ver todos
                </button>
              </p>
              <div className="flex gap-2">
                <button onClick={() => exportExcel(filtered, `royalties-${artistFilter}`)}
                  className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-green-400" /> Excel
                </button>
                <button onClick={() => exportPdf(filtered, `royalties-${artistFilter}`, artistFilter)}
                  className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
                  <FilePdf className="w-3.5 h-3.5 text-red-400" /> PDF
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {!multiArtist && (
          <select value={artistFilter} onChange={e => setArtistFilter(e.target.value)}
            className="input w-auto text-sm py-2 min-w-[160px]">
            <option value="all">Todos los artistas</option>
            {artists.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
          className="input w-auto text-sm py-2 min-w-[180px]">
          <option value="all">Todas las plataformas ({platforms.length})</option>
          {platforms.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={songFilter} onChange={e => setSongFilter(e.target.value)}
          className="input w-auto text-sm py-2 min-w-[200px]">
          <option value="all">Todas las canciones ({songs.length})</option>
          {songs.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
          className="input w-auto text-sm py-2 min-w-[160px]">
          <option value="all">Todos los países ({countries.length})</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(artistFilter!=='all'||platformFilter!=='all'||songFilter!=='all'||countryFilter!=='all') && (
          <button onClick={() => { setArtistFilter('all'); setPlatformFilter('all'); setSongFilter('all'); setCountryFilter('all') }}
            className="btn-ghost text-sm py-2 text-error">Limpiar filtros</button>
        )}
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label:'Ingresos totales', value:formatCurrency(totalEarnings), icon:DollarSign, color:'text-primary',  bg:'bg-primary/10' },
          { label:'Total streams',    value:formatNumber(totalStreams),     icon:TrendingUp, color:'text-success',  bg:'bg-success/10' },
          { label:'Top plataforma',   value:topPlatform,                   icon:Radio,      color:'text-accent',   bg:'bg-accent/10'  },
          { label:'Top canción',      value:topSong,                       icon:Star,       color:'text-pink-400', bg:'bg-pink-400/10'},
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
            transition={{ delay:i*0.05 }} className="card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-text-muted text-xs">{s.label}</p>
                <p className="text-text-primary font-semibold mt-1 text-sm truncate">{s.value}</p>
              </div>
              <div className={`w-9 h-9 ${s.bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Rate cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label:'Pago por 100 streams',   value:formatRate(ratePer100(totalEarnings, totalStreams)),  sub:'promedio global' },
          { label:'Pago por 1,000 streams', value:formatRate(globalRateK),                             sub:'RPMY promedio global' },
          { label:'Top país',               value:topCountry,                                          sub:'mayor ingreso' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
            transition={{ delay:0.2+i*0.05 }} className="card-sm flex items-center gap-4">
            <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0">
              <p className="text-text-muted text-xs">{s.label}</p>
              <p className="text-text-primary font-semibold truncate">{s.value}</p>
              <p className="text-text-muted text-xs">{s.sub}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* GroupBy selector */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Ver por</h3>
          <div className="flex gap-1 flex-wrap">
            {([
              { k:'song',    label:'Canción'    },
              { k:'artist',  label:'Artista'    },
              { k:'album',   label:'Álbum'      },
              { k:'store',   label:'Plataforma' },
              { k:'country', label:'País'       },
            ] as { k: GroupBy; label: string }[]).map(opt => (
              <button key={opt.k} onClick={() => setGroupBy(opt.k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  groupBy === opt.k ? 'bg-primary text-white' : 'bg-surface-2 text-text-secondary hover:text-text-primary'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Detailed table with $/stream metrics */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-text-muted font-medium text-xs">
                  {groupBy === 'song' ? 'Canción' : groupBy === 'artist' ? 'Artista' :
                   groupBy === 'album' ? 'Álbum' : groupBy === 'store' ? 'Plataforma' : 'País'}
                </th>
                <th className="text-right py-2 px-3 text-text-muted font-medium text-xs">🎧 Streams</th>
                <th className="text-right py-2 px-3 text-text-muted font-medium text-xs">💰 Regalías</th>
                <th className="text-right py-2 px-3 text-text-muted font-medium text-xs">📈 $/100</th>
                <th className="text-right py-2 px-3 text-text-muted font-medium text-xs">📈 $/1,000</th>
                <th className="text-right py-2 pl-3 text-text-muted font-medium text-xs">% del total</th>
              </tr>
            </thead>
            <tbody>
              {groupedData.map((row, i) => {
                const pct = totalEarnings > 0 ? (row.earnings / totalEarnings * 100).toFixed(1) : '0'
                return (
                  <tr key={row.name} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-text-primary truncate max-w-[200px]" title={row.name}>{row.name}</span>
                      </div>
                    </td>
                    <td className="text-right py-2.5 px-3 text-text-secondary tabular-nums">{formatNumber(row.streams)}</td>
                    <td className="text-right py-2.5 px-3 text-text-primary font-medium tabular-nums">{formatCurrency(row.earnings)}</td>
                    <td className="text-right py-2.5 px-3 text-accent tabular-nums text-xs">{formatRate(row.rate100)}</td>
                    <td className="text-right py-2.5 px-3 text-accent tabular-nums font-medium text-xs">{formatRate(row.rateK)}</td>
                    <td className="text-right py-2.5 pl-3">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width:`${pct}%`, background:COLORS[i%COLORS.length] }} />
                        </div>
                        <span className="text-text-muted text-xs w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform comparison — $/1K */}
      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-text-primary mb-1">Pago por 1,000 streams por plataforma</h3>
        <p className="text-text-muted text-xs mb-4">Cuánto te paga realmente cada plataforma por reproducción</p>
        <div className="space-y-3">
          {byPlatform.map((p, i) => (
            <div key={p.name} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background:COLORS[i%COLORS.length] }} />
              <span className="text-text-secondary text-sm w-36 truncate">{p.name}</span>
              <div className="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
                <div className="h-full rounded-full"
                  style={{ width:`${Math.min((p.rateK / (Math.max(...byPlatform.map(x=>x.rateK))||1))*100, 100)}%`,
                           background:COLORS[i%COLORS.length] }} />
              </div>
              <span className="text-accent text-sm font-medium w-20 text-right tabular-nums">${p.rateK.toFixed(4)}/1K</span>
              <span className="text-text-muted text-xs w-24 text-right tabular-nums">{formatCurrency(p.earnings)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Evolución mensual</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={byMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="month" tick={{ fill:'#6b7280', fontSize:10 }} />
              <YAxis tick={{ fill:'#6b7280', fontSize:10 }} tickFormatter={v=>`$${v}`} />
              <Tooltip contentStyle={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:'8px' }}
                formatter={(v:number) => [formatCurrency(v),'Ingresos']} />
              <Line type="monotone" dataKey="earnings" stroke="#6366f1" strokeWidth={2} dot={{ fill:'#6366f1', r:3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {multiArtist && artistFilter === 'all' ? (
          <div className="card">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Comparación de artistas</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byArtist.map(a=>({ artist:a.name, earnings:a.earnings, rateK:a.rateK }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
                <XAxis type="number" tick={{ fill:'#6b7280', fontSize:9 }} tickFormatter={v=>`$${v}`} />
                <YAxis type="category" dataKey="artist" tick={{ fill:'#9ca3af', fontSize:9 }} width={100} />
                <Tooltip contentStyle={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:'8px' }}
                  formatter={(v:number) => [formatCurrency(v),'Ingresos']} />
                <Bar dataKey="earnings" radius={[0,4,4,0]}>
                  {byArtist.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="card">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Distribución por plataforma</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byPlatform.map(p=>({ name:p.name, value:p.earnings }))}
                  cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={2}>
                  {byPlatform.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background:'#111', border:'1px solid #2a2a2a', borderRadius:'8px' }}
                  formatter={(v:number)=>[formatCurrency(v)]} />
                <Legend formatter={v=><span style={{ color:'#9ca3af', fontSize:10 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Countries */}
      <div className="card">
        <h3 className="text-sm font-semibold text-text-primary mb-4">
          Ingresos por país <span className="text-text-muted font-normal">({byCountry.length})</span>
        </h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {byCountry.map((c, i) => (
            <div key={c.name} className="flex items-center gap-3">
              <span className="text-text-muted text-xs w-5 text-right flex-shrink-0">{i+1}</span>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between mb-1">
                  <span className="text-text-secondary text-sm truncate">{c.name}</span>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                    <span className="text-accent text-xs">${c.rateK.toFixed(3)}/1K</span>
                    <span className="text-text-primary text-sm font-medium">{formatCurrency(c.earnings)}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full"
                    style={{ width:`${(c.earnings/(byCountry[0]?.earnings||1))*100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Splits liquidation panel */}
      {contracts && contracts.length > 0 && (
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-success/10 rounded-lg flex items-center justify-center">
                <Percent className="w-4 h-4 text-success" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Liquidación de regalías</h3>
                <p className="text-xs text-text-muted">Basado en tus contratos activos</p>
              </div>
            </div>
            <button
              onClick={() => exportConsolidatedExcel(filtered, contracts, `liquidacion-${id?.slice(0,8)}`)}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-400" /> Excel consolidado
            </button>
          </div>

          <div className="space-y-6">
            {contracts.map((contract, ci) => {
              const artistRows = filtered.filter(r => r.artist_name === contract.artist_name)
              if (artistRows.length === 0 && artists.length > 1) return null
              const gross   = (artistFilter === 'all' || artistFilter === contract.artist_name)
                ? (artists.length > 1 ? artistRows : filtered).reduce((a,r) => a + r.earnings_usd, 0)
                : 0
              const streams = (artistFilter === 'all' || artistFilter === contract.artist_name)
                ? (artists.length > 1 ? artistRows : filtered).reduce((a,r) => a + r.quantity, 0)
                : 0
              const splits  = contract.splits ?? []

              return (
                <div key={contract.id} className="border border-border rounded-xl overflow-hidden">
                  {/* Contract header */}
                  <div className="bg-surface-2 px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-text-primary font-medium text-sm">{contract.artist_name}</p>
                      <p className="text-text-muted text-xs">{contract.label} · {streams.toLocaleString()} streams</p>
                    </div>
                    <div className="text-right">
                      <p className="text-text-muted text-xs">💰 Ingresos brutos</p>
                      <p className="text-text-primary font-semibold">{formatCurrency(gross)}</p>
                    </div>
                  </div>

                  {/* Split rows */}
                  <div className="divide-y divide-border">
                    {splits.map((s, si) => {
                      const amount = gross * (Number(s.percentage) / 100)
                      return (
                        <div key={si} className="flex items-center gap-4 px-4 py-3">
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-lg">
                              {s.role === 'label' ? '🏢' : s.role === 'artist' ? '🎤' : s.role === 'producer' ? '🎵' : '💼'}
                            </span>
                            <div>
                              <p className="text-text-primary text-sm font-medium">{s.participant}</p>
                              <p className="text-text-muted text-xs capitalize">{s.role}</p>
                            </div>
                          </div>
                          <div className="text-center w-20">
                            <p className="text-text-secondary text-sm font-semibold">{s.percentage}%</p>
                            <div className="w-full h-1.5 bg-surface-3 rounded-full mt-1 overflow-hidden">
                              <div className="h-full bg-primary rounded-full"
                                style={{ width:`${s.percentage}%` }} />
                            </div>
                          </div>
                          <div className="text-right w-28">
                            <p className="text-primary font-bold">{formatCurrency(amount)}</p>
                            <p className="text-text-muted text-xs">{formatRate(ratePerK(amount, streams))}/1K</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Per-contract export */}
                  <div className="bg-surface-2 px-4 py-2 flex justify-end gap-3">
                    <button
                      onClick={() => exportSplitsExcel(
                        artists.length > 1 ? artistRows : filtered,
                        contract,
                        `liquidacion-${contract.artist_name}`
                      )}
                      className="text-xs text-green-400 hover:underline flex items-center gap-1">
                      <FileSpreadsheet className="w-3 h-3" /> Excel (5 hojas)
                    </button>
                    <button
                      onClick={() => exportSplitsPdf(
                        artists.length > 1 ? artistRows : filtered,
                        contract,
                        `liquidacion-${contract.artist_name}`
                      )}
                      className="text-xs text-red-400 hover:underline flex items-center gap-1">
                      <FilePdf className="w-3 h-3" /> PDF profesional
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* No contracts CTA */}
      {(!contracts || contracts.length === 0) && (
        <div className="card mt-6 flex items-center gap-4">
          <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Percent className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1">
            <p className="text-text-primary font-medium text-sm">Configura splits de regalías</p>
            <p className="text-text-muted text-xs mt-0.5">Crea contratos para calcular automáticamente la distribución entre artista, sello y productor.</p>
          </div>
          <Link to="/contracts" className="btn-secondary text-sm flex-shrink-0">
            Ir a Contratos
          </Link>
        </div>
      )}
    </div>
  )
}
