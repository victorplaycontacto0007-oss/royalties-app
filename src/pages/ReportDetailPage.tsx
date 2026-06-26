import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, formatNumber, formatDate, ratePerK, ratePer100, formatRate } from '../lib/utils'
import { exportSplitsExcel, exportConsolidatedExcel, exportSplitsPdf } from '../lib/splits-export'
import { parseDistroKidFileWithSummary, detectFraudulentStreams } from '../lib/distrokid-parser'
import type { FraudReport } from '../lib/distrokid-parser'
import {
  ArrowLeft, Download, Loader2, DollarSign, TrendingUp, Globe,
  Music, Star, Radio, Users, ChevronDown, FileSpreadsheet,
  FileText as FilePdf, FileType2, Zap, Percent, ShieldAlert, ShieldCheck, ChevronUp, RefreshCw, Wrench
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import type { RoyaltyRecord, Report, Contract } from '../types/database'
import type { CurrencyGroup } from '../royalty-engine/CurrencyGrouper'
import { convertCurrencies } from '../royalty-engine/CurrencyConverter'
import type { ConversionResult, TargetCurrency } from '../royalty-engine/CurrencyConverter'
import CurrencyTab from '../components/CurrencyTab'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#f97316','#84cc16','#14b8a6']

type FilterKey = 'all' | string
type GroupBy = 'artist' | 'song' | 'album' | 'store' | 'country'
type CoreRow = {
  store: string; country: string; song_title: string
  artist_name: string; sale_period: string
  earnings_usd: number; quantity: number
}

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

  // main tab selector
  type MainTab = 'resumen' | 'monedas'
  const [activeTab, setActiveTab] = useState<MainTab>('resumen')

  // ui
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [fraudReport, setFraudReport]       = useState<FraudReport | null>(null)
  const [fraudLoading, setFraudLoading]     = useState(false)
  const [showFraudDetail, setShowFraudDetail] = useState(false)
  const [repairing, setRepairing]           = useState(false)
  const [repairProgress, setRepairProgress] = useState('')
  const repairAttempted                     = useRef(false)

  const { data: report } = useQuery<Report>({
    queryKey: ['report', id],
    queryFn: async () => {
      const { data, error } = await db.from('reports').select('*').eq('id', id!).eq('user_id', user!.id).single()
      if (error) throw error
      return data as Report
    },
    enabled: !!id && !!user,
  })

  const queryClient = useQueryClient()

  const { data: contracts } = useQuery<Contract[]>({
    queryKey: ['contracts', user?.id],
    queryFn: async () => {
      const { data } = await db.from('contracts').select('*, splits:contract_splits(*)')
        .eq('user_id', user!.id).eq('is_active', true)
      return (data ?? []) as Contract[]
    },
    enabled: !!user,
  })

  // ── Fraud detection: download file from storage and analyse it ──
  useEffect(() => {
    if (!report?.file_path) return
    let cancelled = false
    const run = async () => {
      setFraudLoading(true)
      try {
        const { data, error } = await supabase.storage.from('reports').download(report.file_path)
        if (error || !data || cancelled) return
        const file = new File([data], report.file_name)
        const result = await detectFraudulentStreams(file)
        if (!cancelled) setFraudReport(result)
      } catch {
        // silently fail — fraud panel just won't show
      } finally {
        if (!cancelled) setFraudLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [report?.file_path, report?.file_name])

  // ── Aggregated data queries (no raw rows in memory) ─────────
  // Total count & sums
  const { data: recordCount, isLoading: countLoading } = useQuery<number>({
    queryKey: ['royalty-count', id],
    queryFn: async () => {
      const { count, error } = await db
        .from('royalty_records')
        .select('*', { count: 'exact', head: true })
        .eq('report_id', id!)
        .eq('user_id', user!.id)
      if (error) throw error
      return count ?? 0
    },
    enabled: !!id && !!user,
  })

  // ── Currency groups from currency_records table ──────────────────────────
  const { data: currencyGroups = [] } = useQuery<CurrencyGroup[]>({
    queryKey: ['currency-records', id],
    queryFn: async () => {
      const { data, error } = await db
        .from('currency_records')
        .select('*')
        .eq('report_id', id!)
        .eq('user_id', user!.id)
        .order('total', { ascending: false })
      if (error) throw error
      if (!data || data.length === 0) return []

      // Calculate global total to derive percentages client-side
      const globalTotal = data.reduce((sum: number, row: { total: unknown }) => sum + Number(row.total), 0)

      return data.map((row: {
        currency: string
        total: unknown
        record_count: number
      }) => {
        const total = Number(row.total)
        return {
          currency:    row.currency,
          total,
          totalFixed8: total.toFixed(8),
          recordCount: row.record_count,
          percentage:  globalTotal > 0 ? (total / globalTotal) * 100 : 0,
        } satisfies CurrencyGroup
      })
    },
    enabled: !!id && !!user,
  })

  // ── Currency conversion state ─────────────────────────────────────────────
  const [converting, setConverting]           = useState<boolean>(false)
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null)
  const [conversionError, setConversionError]   = useState<string | null>(null)

  const handleConvert = async (target: TargetCurrency): Promise<void> => {
    setConverting(true)
    setConversionResult(null)
    setConversionError(null)
    try {
      const result = await convertCurrencies(currencyGroups, target)
      setConversionResult(result)
    } catch (err) {
      setConversionError(err instanceof Error ? err.message : 'Error desconocido al convertir monedas.')
    } finally {
      setConverting(false)
    }
  }

  // ── Core data fetch: all rows for this report (paginated, robust) ────────
  // Fetches store, country, song_title, artist_name, sale_period, earnings_usd, quantity
  // in pages of 1000 and returns the full flat array. All aggregations are done in memory.

  async function fetchAllCoreRows(): Promise<CoreRow[]> {
    const PAGE = 1000
    const all: CoreRow[] = []
    let from = 0
    while (true) {
      const { data, error } = await db
        .from('royalty_records')
        .select('store, country, song_title, artist_name, sale_period, earnings_usd, quantity')
        .eq('report_id', id!)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) {
        console.error('[fetchAllCoreRows] Supabase error:', error)
        break
      }
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < PAGE) break
      from += PAGE
    }
    return all
  }

  // Single query that fetches ALL rows — used as the base for all aggregations
  const { data: allCoreRows } = useQuery<CoreRow[]>({
    queryKey: ['all-core-rows', id],
    queryFn: fetchAllCoreRows,
    enabled: !!id && !!user,
    staleTime: 30_000,
  })

  // ── Apply active filters to the core rows ────────────────
  const filteredRows = useMemo(() => {
    if (!allCoreRows) return []
    return allCoreRows.filter(r => {
      if (artistFilter   !== 'all' && r.artist_name !== artistFilter)   return false
      if (platformFilter !== 'all' && r.store        !== platformFilter) return false
      if (songFilter     !== 'all' && r.song_title   !== songFilter)     return false
      if (countryFilter  !== 'all' && r.country      !== countryFilter)  return false
      return true
    })
  }, [allCoreRows, artistFilter, platformFilter, songFilter, countryFilter])

  // ── Aggregations from filtered rows (all in memory) ──────
  function aggBy(field: keyof CoreRow) {
    const map: Record<string, { earnings: number; streams: number }> = {}
    for (const r of filteredRows) {
      const key = String(r[field] || 'Unknown')
      if (!map[key]) map[key] = { earnings: 0, streams: 0 }
      map[key].earnings += Number(r.earnings_usd) || 0
      map[key].streams  += Number(r.quantity)      || 0
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, earnings: v.earnings, streams: v.streams }))
      .sort((a, b) => b.earnings - a.earnings)
  }

  const aggStore   = useMemo(() => aggBy('store'),       [filteredRows])
  const aggCountry = useMemo(() => aggBy('country'),     [filteredRows])
  const aggSong    = useMemo(() => aggBy('song_title'),  [filteredRows])
  const aggArtist  = useMemo(() => aggBy('artist_name'), [filteredRows])

  const aggMonth = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of filteredRows) {
      const m = (r.sale_period ?? '').slice(0, 7) || 'Unknown'
      map[m] = (map[m] ?? 0) + (Number(r.earnings_usd) || 0)
    }
    return Object.entries(map)
      .map(([month, earnings]) => ({ month, earnings }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [filteredRows])

  // ── Distinct filter option lists ──────────────────────────
  const distinctArtists   = useMemo(() => [...new Set((allCoreRows ?? []).map(r => r.artist_name))].sort(),   [allCoreRows])
  const distinctPlatforms = useMemo(() => [...new Set((allCoreRows ?? []).map(r => r.store))].sort(),         [allCoreRows])
  const distinctSongs     = useMemo(() => [...new Set((allCoreRows ?? []).map(r => r.song_title))].sort(),    [allCoreRows])
  const distinctCountries = useMemo(() => [...new Set((allCoreRows ?? []).map(r => r.country))].sort(),       [allCoreRows])

  // ── Totals ────────────────────────────────────────────────
  const totalEarnings = useMemo(() => filteredRows.reduce((a, r) => a + (Number(r.earnings_usd) || 0), 0), [filteredRows])
  const totalStreams   = useMemo(() => filteredRows.reduce((a, r) => a + (Number(r.quantity)      || 0), 0), [filteredRows])
  const globalRateK   = ratePerK(totalEarnings, totalStreams)

  const artists   = distinctArtists
  const platforms = distinctPlatforms
  const songs     = distinctSongs
  const countries = distinctCountries

  const byPlatform = useMemo(() => aggStore.map(p   => ({ ...p, rateK: ratePerK(p.earnings, p.streams), rate100: ratePer100(p.earnings, p.streams) })), [aggStore])
  const byCountry  = useMemo(() => aggCountry.map(c => ({ ...c, rateK: ratePerK(c.earnings, c.streams), rate100: ratePer100(c.earnings, c.streams) })), [aggCountry])
  const bySong     = useMemo(() => aggSong.map(s    => ({ ...s, rateK: ratePerK(s.earnings, s.streams), rate100: ratePer100(s.earnings, s.streams) })), [aggSong])
  const byArtist   = useMemo(() => aggArtist.map(a  => ({ ...a, rateK: ratePerK(a.earnings, a.streams), rate100: ratePer100(a.earnings, a.streams) })), [aggArtist])
  const byMonth    = aggMonth

  // artistBreakdown — unfiltered, from all core rows
  const artistBreakdownRaw = useMemo(() => {
    const map: Record<string, { earnings: number; streams: number }> = {}
    for (const r of allCoreRows ?? []) {
      if (!map[r.artist_name]) map[r.artist_name] = { earnings: 0, streams: 0 }
      map[r.artist_name].earnings += Number(r.earnings_usd) || 0
      map[r.artist_name].streams  += Number(r.quantity)      || 0
    }
    return Object.entries(map)
      .map(([name, v]) => ({ name, earnings: v.earnings, streams: v.streams }))
      .sort((a, b) => b.earnings - a.earnings)
  }, [allCoreRows])

  // dbDirectSum — for debug panel, computed from allCoreRows
  const dbDirectSum = useMemo(() => {
    if (!allCoreRows) return undefined
    return {
      rows: allCoreRows.length,
      earnings: allCoreRows.reduce((s, r) => s + (Number(r.earnings_usd) || 0), 0),
    }
  }, [allCoreRows])

  const isLoading = countLoading || (allCoreRows === undefined)

  const artistBreakdown = useMemo(() =>
    artistBreakdownRaw.map(a => ({ ...a, rateK: ratePerK(a.earnings, a.streams), rate100: ratePer100(a.earnings, a.streams) })),
    [artistBreakdownRaw]
  )
  const totalAll = useMemo(() => artistBreakdown.reduce((s, a) => s + a.earnings, 0), [artistBreakdown])

  const topPlatform = byPlatform[0]?.name ?? '—'
  const topCountry  = byCountry[0]?.name  ?? '—'
  const topSong     = bySong[0]?.name     ?? '—'
  const multiArtist = artists.length > 1

  // groupedData — used by the detailed table, driven by the groupBy selector
  const groupedData = useMemo(() => {
    const source =
      groupBy === 'artist'  ? byArtist  :
      groupBy === 'song'    ? bySong    :
      groupBy === 'store'   ? byPlatform :
      groupBy === 'country' ? byCountry  : bySong
    return source
  }, [groupBy, byArtist, bySong, byPlatform, byCountry])

  // songMeta — top country and store per song, computed from filteredRows
  const songMeta = useMemo<Record<string, { country: string; store: string }>>(() => {
    if (groupBy !== 'song') return {}
    // For each song, find the country and store with the highest earnings
    const map: Record<string, {
      countries: Record<string, number>
      stores:    Record<string, number>
    }> = {}
    for (const r of filteredRows) {
      const song = r.song_title || 'Unknown'
      if (!map[song]) map[song] = { countries: {}, stores: {} }
      const earn = Number(r.earnings_usd) || 0
      map[song].countries[r.country] = (map[song].countries[r.country] ?? 0) + earn
      map[song].stores[r.store]      = (map[song].stores[r.store]      ?? 0) + earn
    }
    const result: Record<string, { country: string; store: string }> = {}
    for (const [song, data] of Object.entries(map)) {
      const topCountry = Object.entries(data.countries).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      const topStore   = Object.entries(data.stores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
      result[song] = { country: topCountry, store: topStore }
    }
    return result
  }, [groupBy, filteredRows])

  // ── Download raw rows for export only ────────────────────
  const fetchRawRows = async (filterByArtist?: string): Promise<RoyaltyRecord[]> => {
    const PAGE = 1000
    const all: RoyaltyRecord[] = []
    let from = 0
    while (true) {
      let q = db.from('royalty_records').select('*').eq('report_id', id!).eq('user_id', user!.id)
      if (filterByArtist)            q = q.eq('artist_name', filterByArtist)
      if (platformFilter !== 'all')  q = q.eq('store', platformFilter)
      if (songFilter !== 'all')      q = q.eq('song_title', songFilter)
      if (countryFilter !== 'all')   q = q.eq('country', countryFilter)
      q = q.order('created_at', { ascending: true }).range(from, from + PAGE - 1)
      const { data, error } = await q
      if (error || !data) break
      all.push(...(data as RoyaltyRecord[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    return all
  }

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

  const handleExport = async (format: 'excel'|'csv'|'pdf', scope: 'filtered'|'all') => {
    setShowExportMenu(false)
    const artist = scope === 'filtered' && artistFilter !== 'all' ? artistFilter : undefined
    const label  = artist ?? 'completo'
    const base   = `royalties-${label}-${id?.slice(0,8)}`
    const rows   = await fetchRawRows(scope === 'filtered' ? artist : undefined)
    if (format === 'excel') exportExcel(rows, base)
    else if (format === 'csv') exportCsv(rows, base)
    else exportPdf(rows, base, artist)
  }

  // ── Repair: re-parse from Storage and replace all royalty_records ──
  const handleRepair = async () => {
    if (!report || !user) return
    setRepairing(true)
    setRepairProgress('Descargando archivo original...')
    try {
      // 1. Download original file from Supabase Storage
      const { data: blob, error: dlErr } = await supabase.storage
        .from('reports')
        .download(report.file_path)
      if (dlErr || !blob) throw new Error(`No se pudo descargar el archivo: ${dlErr?.message ?? 'sin datos'}`)

      const file = new File([blob], report.file_name)

      // 2. Re-parse
      setRepairProgress('Analizando archivo con parser actualizado...')
      const { rows, summary } = await (await import('../lib/distrokid-parser')).parseDistroKidFileWithSummary(file)
      if (rows.length === 0) throw new Error('El parser no encontró filas válidas en el archivo.')

      setRepairProgress(`Borrando ${recordCount?.toLocaleString() ?? '?'} registros antiguos...`)

      // 3. Delete old records for this report
      const { error: delErr } = await db
        .from('royalty_records')
        .delete()
        .eq('report_id', id!)
        .eq('user_id', user.id)
      if (delErr) throw new Error(`Error borrando registros: ${delErr.message}`)

      // 4. Re-insert in batches
      const BATCH = 1000
      const CONCURRENCY = 5
      const batches: object[][] = []
      for (let i = 0; i < rows.length; i += BATCH) {
        batches.push(rows.slice(i, i + BATCH).map(r => ({ ...r, report_id: id!, user_id: user.id })))
      }

      let done = 0
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const chunk = batches.slice(i, i + CONCURRENCY)
        const results = await Promise.all(chunk.map(batch => db.from('royalty_records').insert(batch)))
        for (const { error: insErr } of results) {
          if (insErr) throw new Error(`Error insertando registros: ${insErr.message}`)
        }
        done += chunk.reduce((s, b) => s + b.length, 0)
        setRepairProgress(`Guardando registros... ${Math.min(done, rows.length).toLocaleString()}/${rows.length.toLocaleString()}`)
      }

      // 5. Invalidate all queries so the page refreshes
      await queryClient.invalidateQueries({ queryKey: ['royalty-count', id] })
      await queryClient.invalidateQueries({ queryKey: ['all-core-rows', id] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-totals', user.id] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-by-platform', user.id] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-by-month', user.id] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-by-song', user.id] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard-by-country', user.id] })

      setRepairProgress(`✓ Reparado: ${rows.length.toLocaleString()} filas · $${summary.detailRowsTotal.toFixed(2)} total`)
      alert(`✅ Reporte reparado correctamente.\n${rows.length.toLocaleString()} filas · $${summary.detailRowsTotal.toFixed(2)} total`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      alert(`❌ Error al reparar: ${msg}`)
    } finally {
      setRepairing(false)
      setRepairProgress('')
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  )

  if (repairing) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
      <p className="text-text-muted text-sm">{repairProgress || 'Reparando reporte...'}</p>
      <p className="text-text-muted text-xs opacity-60">Descargando archivo original y re-procesando con el parser actualizado.</p>
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
            {report ? formatDate(report.created_at) : ''} · {(recordCount ?? 0).toLocaleString()} registros
            {multiArtist && ` · ${artists.length} artistas`}
          </p>
        </div>

        {/* Repair button */}
        <button
          onClick={handleRepair}
          disabled={repairing || !report}
          title="Re-parsea el archivo original y reemplaza todos los registros en BD"
          className="btn-secondary flex items-center gap-2 text-sm text-warning border-warning/30 hover:bg-warning/10 disabled:opacity-50"
        >
          <Wrench className="w-4 h-4" /> Reparar
        </button>

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

      {/* ── Tab navigation ──────────────────────────────────── */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { k: 'resumen', label: 'Resumen' },
          { k: 'monedas', label: 'Monedas' },
        ] as { k: MainTab; label: string }[]).map(tab => (
          <button
            key={tab.k}
            onClick={() => setActiveTab(tab.k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.k
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Monedas tab ─────────────────────────────────────── */}
      {activeTab === 'monedas' && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {currencyGroups.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-12 h-12 bg-surface-2 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-text-muted" />
              </div>
              <p className="text-text-primary font-medium text-sm">Sin datos de monedas</p>
              <p className="text-text-muted text-xs max-w-xs">
                No se encontraron registros de monedas para este reporte. Los datos aparecerán aquí
                la próxima vez que se procese un archivo con información de monedas.
              </p>
            </div>
          ) : (
            <div className="card">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Totales por moneda</h3>
                  <p className="text-xs text-text-muted">{currencyGroups.length} moneda{currencyGroups.length !== 1 ? 's' : ''} detectada{currencyGroups.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <CurrencyTab
                groups={currencyGroups}
                onConvert={handleConvert}
                converting={converting}
                conversionResult={conversionResult}
                conversionError={conversionError}
              />
            </div>
          )}
        </motion.div>
      )}

      {/* ── Resumen tab ─────────────────────────────────────── */}
      {activeTab === 'resumen' && (<>

      {/* ── Debug panel ─────────────────────────────────────── */}
      {dbDirectSum && (
        <motion.div initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }}
          className="mb-4 rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs font-mono text-text-muted">
          <p className="font-semibold text-text-secondary mb-1 text-xs">🔍 Diagnóstico de datos</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <span className="opacity-60">Filas en BD (count)</span>
              <p className="text-text-primary font-bold">{(recordCount ?? 0).toLocaleString()}</p>
            </div>
            <div>
              <span className="opacity-60">Filas en BD (sum loop)</span>
              <p className="text-text-primary font-bold">{dbDirectSum.rows.toLocaleString()}</p>
            </div>
            <div>
              <span className="opacity-60">Total BD directo</span>
              <p className="text-text-primary font-bold">${dbDirectSum.earnings.toFixed(8)}</p>
            </div>
            <div>
              <span className="opacity-60">Total dashboard</span>
              <p className={`font-bold ${Math.abs(dbDirectSum.earnings - totalEarnings) > 0.01 ? 'text-error' : 'text-success'}`}>
                ${totalEarnings.toFixed(8)}
              </p>
            </div>
          </div>
          {Math.abs(dbDirectSum.rows - (recordCount ?? 0)) > 0 && (
            <p className="mt-1 text-warning">⚠ Count vs loop difieren — posible problema de paginación</p>
          )}
          {Math.abs(dbDirectSum.earnings - totalEarnings) > 0.01 && (
            <p className="mt-1 text-warning">⚠ Total BD ≠ Total dashboard — el groupBy puede estar omitiendo filas</p>
          )}
        </motion.div>
      )}

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
                <button onClick={() => fetchRawRows(artistFilter).then(rows => exportExcel(rows, `royalties-${artistFilter}`))}
                  className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-green-400" /> Excel
                </button>
                <button onClick={() => fetchRawRows(artistFilter).then(rows => exportPdf(rows, `royalties-${artistFilter}`, artistFilter))}
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

      {/* ── Fraud detection panel ──────────────────────────── */}
      {fraudLoading && (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
          className="card mb-6 flex items-center gap-3 text-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
          Analizando streams fraudulentos...
        </motion.div>
      )}

      {fraudReport && !fraudLoading && (
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} className="mb-6">
          {/* Alert / OK banner */}
          {fraudReport.fraudStreams === 0 ? (
            <div className="card flex items-center gap-3 border-success/30 bg-success/5">
              <div className="w-9 h-9 bg-success/10 rounded-xl flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-success font-semibold text-sm">Sin streams fraudulentos detectados</p>
                <p className="text-text-muted text-xs">No se encontraron filas con "Fraudulent Streams" en este reporte.</p>
              </div>
            </div>
          ) : (
            <div className={`card border ${fraudReport.isAlert ? 'border-error/40 bg-error/5' : 'border-warning/40 bg-warning/5'}`}>
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${fraudReport.isAlert ? 'bg-error/10' : 'bg-warning/10'}`}>
                    <ShieldAlert className={`w-5 h-5 ${fraudReport.isAlert ? 'text-error' : 'text-warning'}`} />
                  </div>
                  <div>
                    <p className={`font-semibold text-sm ${fraudReport.isAlert ? 'text-error' : 'text-warning'}`}>
                      {fraudReport.isAlert ? '⚠️ Alerta de fraude' : '⚠️ Streams fraudulentos detectados'}
                    </p>
                    <p className="text-text-muted text-xs">
                      {fraudReport.fraudStreams.toLocaleString()} streams fraudulentos — {fraudReport.fraudPct.toFixed(2)}% del total
                      {fraudReport.isAlert && ' · Supera el límite del 5%'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFraudDetail(v => !v)}
                  className="btn-ghost p-1.5 text-text-muted flex items-center gap-1 text-xs">
                  {showFraudDetail ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
                  {showFraudDetail ? 'Ocultar' : 'Ver detalle'}
                </button>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Streams fraudulentos', value: fraudReport.fraudStreams.toLocaleString(), color: 'text-error' },
                  { label: '% del total',           value: `${fraudReport.fraudPct.toFixed(2)}%`,   color: fraudReport.isAlert ? 'text-error' : 'text-warning' },
                  { label: 'Canciones afectadas',   value: fraudReport.bySong.length.toString(),    color: 'text-text-primary' },
                  { label: 'Países sospechosos',    value: fraudReport.byCountry.length.toString(), color: 'text-text-primary' },
                ].map(s => (
                  <div key={s.label} className="bg-surface-2 rounded-xl p-3">
                    <p className="text-text-muted text-xs mb-1">{s.label}</p>
                    <p className={`font-bold text-lg tabular-nums ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-text-muted mb-1">
                  <span>Streams legítimos ({(100 - fraudReport.fraudPct).toFixed(1)}%)</span>
                  <span>Fraudulentos ({fraudReport.fraudPct.toFixed(1)}%)</span>
                </div>
                <div className="h-2.5 bg-surface-3 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${fraudReport.isAlert ? 'bg-error' : 'bg-warning'}`}
                    style={{ width: `${Math.min(fraudReport.fraudPct, 100)}%` }} />
                </div>
              </div>

              {/* Detail tables */}
              <AnimatePresence>
                {showFraudDetail && (
                  <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }} className="overflow-hidden">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-border">
                      {/* By song */}
                      <div>
                        <p className="text-text-secondary text-xs font-semibold mb-2 flex items-center gap-1.5">
                          <Music className="w-3.5 h-3.5" /> Canciones afectadas
                        </p>
                        <div className="space-y-1.5">
                          {fraudReport.bySong.slice(0, 8).map(s => (
                            <div key={s.name} className="flex items-center gap-2">
                              <span className="text-text-secondary text-xs truncate flex-1" title={s.name}>{s.name}</span>
                              <span className={`text-xs font-medium tabular-nums flex-shrink-0 ${fraudReport.isAlert ? 'text-error' : 'text-warning'}`}>
                                {s.streams.toLocaleString()}
                              </span>
                            </div>
                          ))}
                          {fraudReport.bySong.length > 8 && (
                            <p className="text-text-muted text-xs">+{fraudReport.bySong.length - 8} más</p>
                          )}
                        </div>
                      </div>

                      {/* By country */}
                      <div>
                        <p className="text-text-secondary text-xs font-semibold mb-2 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5" /> Países sospechosos
                        </p>
                        <div className="space-y-1.5">
                          {fraudReport.byCountry.slice(0, 8).map(c => (
                            <div key={c.name} className="flex items-center gap-2">
                              <span className="text-text-secondary text-xs truncate flex-1">{c.name}</span>
                              <span className={`text-xs font-medium tabular-nums flex-shrink-0 ${fraudReport.isAlert ? 'text-error' : 'text-warning'}`}>
                                {c.streams.toLocaleString()}
                              </span>
                            </div>
                          ))}
                          {fraudReport.byCountry.length > 8 && (
                            <p className="text-text-muted text-xs">+{fraudReport.byCountry.length - 8} más</p>
                          )}
                        </div>
                      </div>

                      {/* By platform */}
                      <div>
                        <p className="text-text-secondary text-xs font-semibold mb-2 flex items-center gap-1.5">
                          <Radio className="w-3.5 h-3.5" /> Plataformas
                        </p>
                        <div className="space-y-1.5">
                          {fraudReport.byStore.slice(0, 8).map(s => (
                            <div key={s.name} className="flex items-center gap-2">
                              <span className="text-text-secondary text-xs truncate flex-1">{s.name}</span>
                              <span className={`text-xs font-medium tabular-nums flex-shrink-0 ${fraudReport.isAlert ? 'text-error' : 'text-warning'}`}>
                                {s.streams.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      )}

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
                {groupBy === 'song' && <>
                  <th className="text-left py-2 px-3 text-text-muted font-medium text-xs">País</th>
                  <th className="text-left py-2 px-3 text-text-muted font-medium text-xs">Plataforma</th>
                </>}
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
                    {groupBy === 'song' && <>
                      <td className="py-2.5 px-3 text-text-secondary text-xs">{songMeta[row.name]?.country ?? '—'}</td>
                      <td className="py-2.5 px-3 text-text-secondary text-xs truncate max-w-[120px]">{songMeta[row.name]?.store ?? '—'}</td>
                    </>}
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
              onClick={async () => {
                const rows = await fetchRawRows()
                exportConsolidatedExcel(rows, contracts, `liquidacion-${id?.slice(0,8)}`)
              }}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3">
              <FileSpreadsheet className="w-3.5 h-3.5 text-green-400" /> Excel consolidado
            </button>
          </div>

          <div className="space-y-6">
            {contracts.map((contract, ci) => {
              // Get gross/streams from aggregated artist data (no raw rows needed)
              const artistAgg = artistBreakdown.find(a => a.name === contract.artist_name)
              // If multi-artist report and this artist has no data, skip
              if (!artistAgg && artists.length > 1) return null
              const visible = artistFilter === 'all' || artistFilter === contract.artist_name
              // Use aggregated earnings — no raw rows required
              const gross   = visible ? (artistAgg?.earnings ?? totalEarnings) : 0
              const streams = visible ? (artistAgg?.streams  ?? 0) : 0
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

                  {/* Per-contract export — fetches raw rows on demand */}
                  <div className="bg-surface-2 px-4 py-2 flex justify-end gap-3">
                    <button
                      onClick={async () => {
                        const rows = await fetchRawRows(artists.length > 1 ? contract.artist_name : undefined)
                        exportSplitsExcel(rows, contract, `liquidacion-${contract.artist_name}`)
                      }}
                      className="text-xs text-green-400 hover:underline flex items-center gap-1">
                      <FileSpreadsheet className="w-3 h-3" /> Excel (5 hojas)
                    </button>
                    <button
                      onClick={async () => {
                        const rows = await fetchRawRows(artists.length > 1 ? contract.artist_name : undefined)
                        exportSplitsPdf(rows, contract, `liquidacion-${contract.artist_name}`)
                      }}
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
      </>)} {/* end activeTab === 'resumen' */}
    </div>
  )
}
