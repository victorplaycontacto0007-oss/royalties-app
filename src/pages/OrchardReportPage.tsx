/**
 * OrchardReportPage.tsx — Con biblioteca de reportes guardados en localStorage.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  BarChart2, Globe, BookOpen, AlertTriangle, CheckSquare,
  LayoutDashboard, Upload, Trash2, Download, FolderOpen,
  FileText, Clock, ChevronRight, Plus, X, DollarSign, TrendingUp, Music,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import type { OrchardRecord } from '../royalty-engine/StreamTypeClassifier'
import type { FilterState } from '../lib/orchard-analytics'
import {
  applyFilters, computeBreakdown, computePlatformSummaries,
  computeCountrySummaries, computeMatrix, computeArtistSummaries,
  computeTrackSummaries, computeReleaseSummaries, computeNoRoyaltyReport,
  computeReconciliation, computeRankings, getDateRange,
} from '../lib/orchard-analytics'

import OrchardUploadPanel from '../components/orchard/OrchardUploadPanel'
import OrchardFilterBar from '../components/orchard/OrchardFilterBar'
import OrchardDrillDownDrawer from '../components/orchard/OrchardDrillDownDrawer'
import OrchardDashboardTab from '../components/orchard/OrchardDashboardTab'
import OrchardPlatformsTab from '../components/orchard/OrchardPlatformsTab'
import OrchardCountriesTab from '../components/orchard/OrchardCountriesTab'
import OrchardCatalogTab from '../components/orchard/OrchardCatalogTab'
import OrchardNoRoyaltyTab from '../components/orchard/OrchardNoRoyaltyTab'
import OrchardReconciliationTab from '../components/orchard/OrchardReconciliationTab'

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'dashboard' | 'platforms' | 'countries' | 'catalog' | 'noroyalty' | 'reconciliation'

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: 'dashboard',      label: 'Dashboard',      Icon: LayoutDashboard },
  { id: 'platforms',      label: 'Plataformas',    Icon: BarChart2       },
  { id: 'countries',      label: 'Países',         Icon: Globe           },
  { id: 'catalog',        label: 'Catálogo',       Icon: BookOpen        },
  { id: 'noroyalty',      label: 'Sin Royalty',    Icon: AlertTriangle   },
  { id: 'reconciliation', label: 'Reconciliación', Icon: CheckSquare     },
]

const EMPTY_FILTERS: FilterState = {
  period: null, platform: null, country: null, artist: null, track: null,
  release: null, isrc: null, upc: null, normalizedStreamType: null, rawStreamType: null,
}

// ─── Saved report type ────────────────────────────────────────────────────────

interface SavedReport {
  id:        string          // uuid-like key
  name:      string          // original filename
  savedAt:   string          // ISO date string
  records:   number          // count
  periods:   string[]        // unique sale_periods
  revenue:   number          // total revenue
  streams:   number          // total streams
  data:      OrchardRecord[] // actual records
}

// ─── Storage helpers — IndexedDB para los datos, localStorage para metadata ───

const DB_NAME    = 'orchard_reports_db'
const DB_VERSION = 1
const STORE_NAME = 'reports'
const LS_META_KEY = 'orchard_reports_meta_v1'

interface ReportMeta {
  id:      string
  name:    string
  savedAt: string
  records: number
  periods: string[]
  revenue: number
  streams: number
}

// Open IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

async function saveReportData(report: SavedReport): Promise<void> {
  try {
    const db    = await openDB()
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(report)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror    = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('[Orchard] IndexedDB save failed:', e)
  }
}

async function loadReportData(id: string): Promise<OrchardRecord[]> {
  try {
    const db    = await openDB()
    const tx    = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    return new Promise((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => resolve((req.result as SavedReport)?.data ?? [])
      req.onerror   = () => reject(req.error)
    })
  } catch { return [] }
}

async function deleteReportData(id: string): Promise<void> {
  try {
    const db    = await openDB()
    const tx    = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
  } catch { /* ignore */ }
}

async function loadAllReportMetas(): Promise<SavedReport[]> {
  try {
    const db    = await openDB()
    const tx    = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    return new Promise((resolve, reject) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result as SavedReport[] ?? [])
      req.onerror   = () => reject(req.error)
    })
  } catch { return [] }
}

// Synchronous meta list (just IDs + metadata, no data arrays) for the library view
function loadSavedMetas(): ReportMeta[] {
  try {
    const raw = localStorage.getItem(LS_META_KEY)
    return raw ? (JSON.parse(raw) as ReportMeta[]) : []
  } catch { return [] }
}

function saveMetas(reports: SavedReport[]) {
  try {
    const metas: ReportMeta[] = reports.map(r => ({
      id: r.id, name: r.name, savedAt: r.savedAt,
      records: r.records, periods: r.periods, revenue: r.revenue, streams: r.streams,
    }))
    localStorage.setItem(LS_META_KEY, JSON.stringify(metas))
  } catch { /* ignore */ }
}

function buildReport(records: OrchardRecord[], fileName: string): SavedReport {
  const periods = [...new Set(records.map(r => r.sale_period))].sort()
  const revenue = records.reduce((s, r) => s + r.net_total, 0)
  const streams = records.reduce((s, r) => s + r.quantity, 0)
  return {
    id:      `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name:    fileName,
    savedAt: new Date().toISOString(),
    records: records.length,
    periods,
    revenue,
    streams,
    data:    records,
  }
}

function exportCSV(records: OrchardRecord[]) {
  const cols = ['period','platform','country','artist','track','album','isrc','streamType','streams','revenue','currency']
  const rows = records.map(r => [
    r.sale_period, r.platform, r.country, r.artist, r.track, r.album,
    r.isrc, r.normalizedStreamType, r.quantity, r.net_total, r.currency,
  ])
  const csv = [cols, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `orchard-export-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
}

const fmtR  = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDt = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// ─── Library view (no report loaded) ─────────────────────────────────────────

function LibraryView({
  saved,
  onLoad,
  onDelete,
  onNew,
}: {
  saved: SavedReport[]
  onLoad: (r: SavedReport) => void
  onDelete: (id: string) => void
  onNew: () => void
}) {
  // ── Totales acumulados de todos los reportes guardados ───────────────────
  const totalRevenue = saved.reduce((s, r) => s + r.revenue, 0)
  const totalStreams  = saved.reduce((s, r) => s + r.streams, 0)
  const totalRecords = saved.reduce((s, r) => s + r.records, 0)

  return (
    <div className="min-h-full flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary leading-none">Orchard Analyzer</h1>
            <p className="text-text-muted text-xs mt-0.5">
              {saved.length > 0 ? `${saved.length} reporte${saved.length !== 1 ? 's' : ''} guardado${saved.length !== 1 ? 's' : ''}` : 'Sin reportes guardados'}
            </p>
          </div>
        </div>
        <button onClick={onNew} className="btn-primary text-sm gap-2">
          <Plus className="w-4 h-4" />
          Nuevo reporte
        </button>
      </div>

      <div className="flex-1 px-6 py-6">
        {saved.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center">
              <FolderOpen className="w-8 h-8 text-text-muted" />
            </div>
            <div className="text-center">
              <p className="text-text-primary font-semibold">Sin reportes guardados</p>
              <p className="text-text-muted text-sm mt-1">Sube un reporte de The Orchard para comenzar.</p>
            </div>
            <button onClick={onNew} className="btn-secondary gap-2 mt-2">
              <Upload className="w-4 h-4" />
              Subir reporte
            </button>
          </div>
        ) : (
          /* Report grid */
          <div className="flex flex-col gap-3">
            <p className="text-text-secondary text-sm font-medium mb-1">Mis reportes</p>
            {saved.map(report => (              <div
                key={report.id}
                className="card p-0 flex items-center hover:shadow-card-hover transition-shadow cursor-pointer group"
                onClick={() => onLoad(report)}
              >
                {/* Color bar */}
                <div className="w-1 self-stretch bg-primary rounded-l-2xl flex-shrink-0" />

                {/* Icon */}
                <div className="pl-4 pr-3 py-4 flex-shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 py-4 pr-4">
                  <p className="text-text-primary font-semibold text-sm truncate" title={report.name}>
                    {report.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-text-muted text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtDt(report.savedAt)}
                    </span>
                    <span className="text-text-muted text-xs">
                      {report.records.toLocaleString()} registros
                    </span>
                    {report.periods.length > 0 && (
                      <span className="badge badge-primary">
                        {report.periods.length === 1 ? report.periods[0] : `${report.periods[0]} – ${report.periods[report.periods.length - 1]}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-6 pr-4 text-right flex-shrink-0">
                  <div>
                    <p className="text-text-muted text-[11px]">Ingresos</p>
                    <p className="text-text-primary font-semibold text-sm">{fmtR(report.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-text-muted text-[11px]">Streams</p>
                    <p className="text-text-primary font-semibold text-sm">{report.streams.toLocaleString()}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 pr-4 flex-shrink-0">
                  <span className="text-primary text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity mr-1">
                    Ver
                  </span>
                  <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-primary transition-colors" />
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm(`¿Eliminar "${report.name}"?`)) onDelete(report.id) }}
                    className="ml-1 p-1.5 rounded-lg text-text-muted hover:text-error hover:bg-error/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tarjetas de totales acumulados ── */}
      {saved.length > 0 && (
        <div className="px-6 pb-8">
          <p className="text-text-muted text-xs font-semibold uppercase tracking-wide mb-3">
            Totales acumulados — {saved.length} reporte{saved.length !== 1 ? 's' : ''}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Ingresos totales */}
            <div className="card flex items-center justify-between gap-4">
              <div>
                <p className="text-text-muted text-sm mb-1">Ingresos totales</p>
                <p className="text-primary font-bold text-2xl">
                  {totalRevenue.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
            </div>

            {/* Total streams */}
            <div className="card flex items-center justify-between gap-4">
              <div>
                <p className="text-text-muted text-sm mb-1">Total streams</p>
                <p className="text-success font-bold text-2xl">
                  {totalStreams.toLocaleString('en-US')}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-success/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-success" />
              </div>
            </div>

            {/* Total registros */}
            <div className="card flex items-center justify-between gap-4">
              <div>
                <p className="text-text-muted text-sm mb-1">Registros totales</p>
                <p className="text-warning font-bold text-2xl">
                  {totalRecords.toLocaleString('en-US')}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-warning/10 flex items-center justify-center flex-shrink-0">
                <Music className="w-5 h-5 text-warning" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

function UploadModal({ onLoaded, onClose }: {
  onLoaded: (records: OrchardRecord[], name: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold text-text-primary">Subir reporte Orchard</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6">
          <OrchardUploadPanel onRecordsLoaded={(records, name) => { onLoaded(records, name ?? 'Reporte'); onClose() }} />
        </div>
      </motion.div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrchardReportPage() {
  const [saved,        setSaved]        = useState<SavedReport[]>([])
  const [activeReport, setActiveReport] = useState<SavedReport | null>(null)
  const [records,      setRecords]      = useState<OrchardRecord[]>([])
  const [filters,      setFilters]      = useState<FilterState>(EMPTY_FILTERS)
  const [activeTab,    setActiveTab]    = useState<TabId>('dashboard')
  const [drillDown,    setDrillDown]    = useState<{ records: OrchardRecord[]; label: string } | null>(null)
  const [showUpload,   setShowUpload]   = useState(false)
  const [showAddMore,  setShowAddMore]  = useState(false)

  // Load saved report metas from IndexedDB on mount
  useEffect(() => {
    loadAllReportMetas().then(all => {
      const sorted = [...all].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      setSaved(sorted)
    })
  }, [])

  // ── Load a saved report ──────────────────────────────────────────────────
  const handleLoad = useCallback(async (report: SavedReport) => {
    // Data may already be in the object (just loaded) or need fetching from IDB
    const data = report.data.length > 0
      ? report.data
      : await loadReportData(report.id)
    setActiveReport({ ...report, data })
    setRecords(data)
    setFilters(EMPTY_FILTERS)
    setActiveTab('dashboard')
  }, [])

  // ── Delete a saved report ────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    await deleteReportData(id)
    setSaved(prev => prev.filter(r => r.id !== id))
  }, [])

  // ── New file uploaded ────────────────────────────────────────────────────
  const handleNewRecords = useCallback(async (newRecords: OrchardRecord[], fileName?: string) => {
    const name = fileName ?? 'Reporte'

    if (activeReport) {
      // Append to current report
      const updatedRecords = [...records, ...newRecords]
      const updatedReport: SavedReport = {
        ...activeReport,
        records: updatedRecords.length,
        periods: [...new Set(updatedRecords.map(r => r.sale_period))].sort(),
        revenue: updatedRecords.reduce((s, r) => s + r.net_total, 0),
        streams: updatedRecords.reduce((s, r) => s + r.quantity, 0),
        data:    updatedRecords,
      }
      await saveReportData(updatedReport)
      setSaved(prev => prev.map(r => r.id === activeReport.id ? updatedReport : r))
      setActiveReport(updatedReport)
      setRecords(updatedRecords)
    } else {
      // Save as new report
      const report = buildReport(newRecords, name)
      await saveReportData(report)
      setSaved(prev => [report, ...prev])
      setActiveReport(report)
      setRecords(report.data)
      setFilters(EMPTY_FILTERS)
      setActiveTab('dashboard')
    }
    setShowUpload(false)
    setShowAddMore(false)
  }, [activeReport, records])

  // ── Back to library ──────────────────────────────────────────────────────
  const handleBackToLibrary = useCallback(() => {
    setActiveReport(null)
    setRecords([])
    setFilters(EMPTY_FILTERS)
    setDrillDown(null)
  }, [])

  // ── Persist current report changes ───────────────────────────────────────
  // NOTE: Persistence happens explicitly in handleNewRecords only.

  // ── Analytics ────────────────────────────────────────────────────────────
  const filteredRecords   = useMemo(() => applyFilters(records, filters), [records, filters])
  const breakdown         = useMemo(() => computeBreakdown(filteredRecords),          [filteredRecords])
  const platformSummaries = useMemo(() => computePlatformSummaries(filteredRecords),  [filteredRecords])
  const countrySummaries  = useMemo(() => computeCountrySummaries(filteredRecords),   [filteredRecords])
  const matrix            = useMemo(() => computeMatrix(filteredRecords),             [filteredRecords])
  const artistSummaries   = useMemo(() => computeArtistSummaries(filteredRecords),    [filteredRecords])
  const trackSummaries    = useMemo(() => computeTrackSummaries(filteredRecords),     [filteredRecords])
  const releaseSummaries  = useMemo(() => computeReleaseSummaries(filteredRecords),   [filteredRecords])
  const noRoyaltyEntries  = useMemo(() => computeNoRoyaltyReport(filteredRecords),    [filteredRecords])
  const reconciliation    = useMemo(() => computeReconciliation(filteredRecords),     [filteredRecords])
  const rankings          = useMemo(() => computeRankings(filteredRecords),           [filteredRecords])
  const dateRange         = useMemo(() => getDateRange(filteredRecords),              [filteredRecords])

  // ── Library view (no report open) ───────────────────────────────────────
  if (!activeReport) {
    return (
      <>
        <LibraryView
          saved={saved}
          onLoad={handleLoad}
          onDelete={handleDelete}
          onNew={() => setShowUpload(true)}
        />
        <AnimatePresence>
          {showUpload && (
            <UploadModal
              onLoaded={handleNewRecords}
              onClose={() => setShowUpload(false)}
            />
          )}
        </AnimatePresence>
      </>
    )
  }

  // ── Report view ──────────────────────────────────────────────────────────
  const totalRevenue = breakdown.total.revenue
  const totalStreams  = breakdown.total.streams

  return (
    <div className="min-h-full flex flex-col bg-white">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4 border-b border-border bg-white flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button */}
          <button
            onClick={handleBackToLibrary}
            className="w-9 h-9 rounded-xl bg-surface-2 hover:bg-surface-3 flex items-center justify-center transition-colors flex-shrink-0"
            title="Volver a la biblioteca"
          >
            <FolderOpen className="w-4 h-4 text-text-secondary" />
          </button>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-text-primary leading-none truncate max-w-[320px]" title={activeReport.name}>
              {activeReport.name}
            </h1>
            <p className="text-text-muted text-xs mt-0.5">
              {records.length.toLocaleString()} registros
              {dateRange && (
                <span className="ml-1.5">
                  · {dateRange.min}{dateRange.min !== dateRange.max ? ` – ${dateRange.max}` : ''}
                </span>
              )}
              {filteredRecords.length !== records.length && (
                <span className="ml-1.5 text-primary font-medium">
                  · {filteredRecords.length.toLocaleString()} tras filtros
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Revenue + streams pill */}
          <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-surface-2 border border-border text-xs">
            <span className="text-text-muted">Ingresos</span>
            <span className="font-semibold text-text-primary">
              {fmtR(totalRevenue)}
            </span>
            <span className="w-px h-3 bg-border" />
            <span className="text-text-muted">Streams</span>
            <span className="font-semibold text-text-primary">{totalStreams.toLocaleString()}</span>
          </div>

          <button onClick={() => exportCSV(filteredRecords)} className="btn-secondary text-xs py-2 px-3 gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>

          <button onClick={() => setShowAddMore(true)} className="btn-secondary text-xs py-2 px-3 gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <OrchardFilterBar filters={filters} records={records} onFiltersChange={setFilters} />

      {/* ── Tab bar ── */}
      <div className="flex items-center px-6 border-b border-border overflow-x-auto flex-shrink-0 bg-white">
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={[
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap',
                'border-b-2 transition-colors -mb-px',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border',
              ].join(' ')}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'dashboard'      && <OrchardDashboardTab     breakdown={breakdown} rankings={rankings} dateRange={dateRange} allRecords={filteredRecords} onDrillDown={(r,l) => setDrillDown({records:r,label:l})} />}
              {activeTab === 'platforms'      && <OrchardPlatformsTab     platformSummaries={platformSummaries} countrySummaries={countrySummaries} allRecords={filteredRecords} onDrillDown={(r,l) => setDrillDown({records:r,label:l})} />}
              {activeTab === 'countries'      && <OrchardCountriesTab     matrix={matrix} allRecords={filteredRecords} onDrillDown={(r,l) => setDrillDown({records:r,label:l})} />}
              {activeTab === 'catalog'        && <OrchardCatalogTab       artistSummaries={artistSummaries} trackSummaries={trackSummaries} releaseSummaries={releaseSummaries} allRecords={filteredRecords} onDrillDown={(r,l) => setDrillDown({records:r,label:l})} />}
              {activeTab === 'noroyalty'      && <OrchardNoRoyaltyTab     noRoyaltyEntries={noRoyaltyEntries} allRecords={filteredRecords} onDrillDown={(r,l) => setDrillDown({records:r,label:l})} />}
              {activeTab === 'reconciliation' && <OrchardReconciliationTab reconciliation={reconciliation} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Add more files modal ── */}
      <AnimatePresence>
        {showAddMore && (
          <UploadModal
            onLoaded={handleNewRecords}
            onClose={() => setShowAddMore(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Drill-down drawer ── */}
      {drillDown && (
        <OrchardDrillDownDrawer
          isOpen={true}
          records={drillDown.records}
          label={drillDown.label}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  )
}
