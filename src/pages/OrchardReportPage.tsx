/**
 * OrchardReportPage.tsx — Rediseñado con estilo profesional.
 * Persistencia de records en localStorage para sobrevivir recargas.
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  BarChart2, Globe, BookOpen, AlertTriangle, CheckSquare,
  LayoutDashboard, Upload, Trash2, Download,
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

interface TabDef {
  id: TabId
  label: string
  Icon: React.ElementType
}

const TABS: TabDef[] = [
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

const LS_KEY = 'orchard_records_v1'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function saveToStorage(records: OrchardRecord[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(records)) } catch { /* ignore quota errors */ }
}

function loadFromStorage(): OrchardRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as OrchardRecord[]) : []
  } catch { return [] }
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrchardReportPage() {
  const [records,   setRecords]   = useState<OrchardRecord[]>(() => loadFromStorage())
  const [filters,   setFilters]   = useState<FilterState>(EMPTY_FILTERS)
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [drillDown, setDrillDown] = useState<{ records: OrchardRecord[]; label: string } | null>(null)
  const [showUpload, setShowUpload] = useState(false)

  // Persist to localStorage whenever records change
  useEffect(() => { saveToStorage(records) }, [records])

  const handleRecordsLoaded = useCallback((newRecords: OrchardRecord[]) => {
    setRecords(prev => [...prev, ...newRecords])
    setShowUpload(false)
  }, [])

  const handleClearAll = useCallback(() => {
    if (confirm('¿Eliminar todos los registros cargados?')) {
      setRecords([])
      setFilters(EMPTY_FILTERS)
      localStorage.removeItem(LS_KEY)
    }
  }, [])

  const handleMetricClick = useCallback((matchingRecords: OrchardRecord[], label: string) => {
    setDrillDown({ records: matchingRecords, label })
  }, [])

  const filteredRecords   = useMemo(() => applyFilters(records, filters), [records, filters])
  const breakdown         = useMemo(() => computeBreakdown(filteredRecords), [filteredRecords])
  const platformSummaries = useMemo(() => computePlatformSummaries(filteredRecords), [filteredRecords])
  const countrySummaries  = useMemo(() => computeCountrySummaries(filteredRecords), [filteredRecords])
  const matrix            = useMemo(() => computeMatrix(filteredRecords), [filteredRecords])
  const artistSummaries   = useMemo(() => computeArtistSummaries(filteredRecords), [filteredRecords])
  const trackSummaries    = useMemo(() => computeTrackSummaries(filteredRecords), [filteredRecords])
  const releaseSummaries  = useMemo(() => computeReleaseSummaries(filteredRecords), [filteredRecords])
  const noRoyaltyEntries  = useMemo(() => computeNoRoyaltyReport(filteredRecords), [filteredRecords])
  const reconciliation    = useMemo(() => computeReconciliation(filteredRecords), [filteredRecords])
  const rankings          = useMemo(() => computeRankings(filteredRecords), [filteredRecords])
  const dateRange         = useMemo(() => getDateRange(filteredRecords), [filteredRecords])

  const totalRevenue = breakdown.total.revenue
  const totalStreams  = breakdown.total.streams

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (records.length === 0) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-16 bg-white">
        <div className="w-full max-w-lg flex flex-col gap-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-primary/10 rounded-2xl mb-4">
              <BarChart2 className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary">Orchard Analyzer</h1>
            <p className="text-text-muted text-sm mt-2">
              Importa un reporte de The Orchard para comenzar el análisis.
            </p>
          </div>
          <OrchardUploadPanel onRecordsLoaded={handleRecordsLoaded} />
        </div>
      </div>
    )
  }

  // ── Loaded view ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full flex flex-col bg-white">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4 border-b border-border bg-white flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-text-primary leading-none">Orchard Analyzer</h1>
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
              ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="w-px h-3 bg-border" />
            <span className="text-text-muted">Streams</span>
            <span className="font-semibold text-text-primary">{totalStreams.toLocaleString()}</span>
          </div>

          <button
            onClick={() => exportCSV(filteredRecords)}
            className="btn-secondary text-xs py-2 px-3 gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>

          <button
            onClick={() => setShowUpload(v => !v)}
            className={showUpload ? 'btn-primary text-xs py-2 px-3 gap-1.5' : 'btn-secondary text-xs py-2 px-3 gap-1.5'}
          >
            <Upload className="w-3.5 h-3.5" />
            Agregar
          </button>

          <button
            onClick={handleClearAll}
            className="btn-ghost text-xs py-2 px-3 gap-1.5 text-error hover:bg-error/5"
            title="Borrar todo"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Upload panel (collapsible) ── */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-border"
          >
            <div className="px-6 py-4 bg-surface-2">
              <OrchardUploadPanel onRecordsLoaded={handleRecordsLoaded} compact />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              {activeTab === 'dashboard' && (
                <OrchardDashboardTab
                  breakdown={breakdown} rankings={rankings} dateRange={dateRange}
                  allRecords={filteredRecords} onDrillDown={handleMetricClick}
                />
              )}
              {activeTab === 'platforms' && (
                <OrchardPlatformsTab
                  platformSummaries={platformSummaries} countrySummaries={countrySummaries}
                  allRecords={filteredRecords} onDrillDown={handleMetricClick}
                />
              )}
              {activeTab === 'countries' && (
                <OrchardCountriesTab
                  matrix={matrix} allRecords={filteredRecords} onDrillDown={handleMetricClick}
                />
              )}
              {activeTab === 'catalog' && (
                <OrchardCatalogTab
                  artistSummaries={artistSummaries} trackSummaries={trackSummaries}
                  releaseSummaries={releaseSummaries} allRecords={filteredRecords} onDrillDown={handleMetricClick}
                />
              )}
              {activeTab === 'noroyalty' && (
                <OrchardNoRoyaltyTab
                  noRoyaltyEntries={noRoyaltyEntries} allRecords={filteredRecords} onDrillDown={handleMetricClick}
                />
              )}
              {activeTab === 'reconciliation' && (
                <OrchardReconciliationTab reconciliation={reconciliation} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

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
