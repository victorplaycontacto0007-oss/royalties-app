/**
 * OrchardReportPage.tsx
 *
 * Root page component for the Orchard Report Analyzer.
 *
 * This component is the SINGLE source of truth for:
 *  - records: OrchardRecord[]      — accumulated from one or more imported files
 *  - filters: FilterState           — all active filter dimensions
 *  - drillDown state               — currently open drill-down drawer
 *  - activeTab                      — selected analytics tab
 *
 * All analytics are pre-computed here via useMemo and passed as props to tab
 * components. Tab components do NOT call analytics functions directly.
 *
 * Layout:
 *  - When records.length === 0: shows OrchardUploadPanel only
 *  - When records.length > 0:   shows OrchardFilterBar + tab bar + active tab
 *                                + OrchardDrillDownDrawer (conditionally)
 *
 * Requirements: 1.3, 1.4, 13.1, 14.1, 14.4, 14.5, 17.4, 17.5
 */

import { useState, useMemo, useCallback } from 'react'
import { BarChart2, Globe, BookOpen, AlertTriangle, CheckSquare, LayoutDashboard } from 'lucide-react'

import type { OrchardRecord } from '../royalty-engine/StreamTypeClassifier'
import type { FilterState } from '../lib/orchard-analytics'
import {
  applyFilters,
  computeBreakdown,
  computePlatformSummaries,
  computeCountrySummaries,
  computeMatrix,
  computeArtistSummaries,
  computeTrackSummaries,
  computeReleaseSummaries,
  computeNoRoyaltyReport,
  computeReconciliation,
  computeRankings,
  getDateRange,
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

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = 'dashboard' | 'platforms' | 'countries' | 'catalog' | 'noroyalty' | 'reconciliation'

interface TabDef {
  id: TabId
  label: string
  Icon: React.ElementType
}

const TABS: TabDef[] = [
  { id: 'dashboard',      label: 'Dashboard',       Icon: LayoutDashboard },
  { id: 'platforms',      label: 'Plataformas',     Icon: BarChart2       },
  { id: 'countries',      label: 'Países',          Icon: Globe           },
  { id: 'catalog',        label: 'Catálogo',        Icon: BookOpen        },
  { id: 'noroyalty',      label: 'Sin Royalty',     Icon: AlertTriangle   },
  { id: 'reconciliation', label: 'Reconciliación',  Icon: CheckSquare     },
]

// ─── Empty filter state ───────────────────────────────────────────────────────

const EMPTY_FILTERS: FilterState = {
  period:               null,
  platform:             null,
  country:              null,
  artist:               null,
  track:                null,
  release:              null,
  isrc:                 null,
  upc:                  null,
  normalizedStreamType: null,
  rawStreamType:        null,
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrchardReportPage() {
  // ── Core state ─────────────────────────────────────────────────────────────
  const [records,   setRecords]   = useState<OrchardRecord[]>([])
  const [filters,   setFilters]   = useState<FilterState>(EMPTY_FILTERS)
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')
  const [drillDown, setDrillDown] = useState<{
    records: OrchardRecord[]
    label: string
  } | null>(null)

  // ── Upload handler — APPENDS records (design constraint 5) ────────────────
  const handleRecordsLoaded = useCallback((newRecords: OrchardRecord[]) => {
    setRecords(prev => [...prev, ...newRecords])
  }, [])

  // ── onMetricClick — passed to all tabs; opens the drill-down drawer ────────
  const handleMetricClick = useCallback((matchingRecords: OrchardRecord[], label: string) => {
    setDrillDown({ records: matchingRecords, label })
  }, [])

  // ── Close drill-down ────────────────────────────────────────────────────────
  const handleDrawerClose = useCallback(() => {
    setDrillDown(null)
  }, [])

  // ── Filtered records (useMemo) ─────────────────────────────────────────────
  const filteredRecords = useMemo(
    () => applyFilters(records, filters),
    [records, filters],
  )

  // ── Pre-computed analytics (all via useMemo from filteredRecords) ──────────
  // Tab components receive these as props and do NOT call analytics functions.

  const breakdown = useMemo(
    () => computeBreakdown(filteredRecords),
    [filteredRecords],
  )

  const platformSummaries = useMemo(
    () => computePlatformSummaries(filteredRecords),
    [filteredRecords],
  )

  const countrySummaries = useMemo(
    () => computeCountrySummaries(filteredRecords),
    [filteredRecords],
  )

  const matrix = useMemo(
    () => computeMatrix(filteredRecords),
    [filteredRecords],
  )

  const artistSummaries = useMemo(
    () => computeArtistSummaries(filteredRecords),
    [filteredRecords],
  )

  const trackSummaries = useMemo(
    () => computeTrackSummaries(filteredRecords),
    [filteredRecords],
  )

  const releaseSummaries = useMemo(
    () => computeReleaseSummaries(filteredRecords),
    [filteredRecords],
  )

  const noRoyaltyEntries = useMemo(
    () => computeNoRoyaltyReport(filteredRecords),
    [filteredRecords],
  )

  const reconciliation = useMemo(
    () => computeReconciliation(filteredRecords),
    [filteredRecords],
  )

  const rankings = useMemo(
    () => computeRankings(filteredRecords),
    [filteredRecords],
  )

  const dateRange = useMemo(
    () => getDateRange(filteredRecords),
    [filteredRecords],
  )

  // ── Upload-only view ──────────────────────────────────────────────────────
  if (records.length === 0) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-12 bg-white">
        <div className="w-full max-w-xl flex flex-col gap-6">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-text-primary">Orchard Report Analyzer</h1>
            <p className="text-text-muted text-sm mt-2">
              Importa un reporte de The Orchard (TSV, CSV o XLSX) para comenzar el análisis.
            </p>
          </div>

          {/* Upload panel */}
          <OrchardUploadPanel onRecordsLoaded={handleRecordsLoaded} />
        </div>
      </div>
    )
  }

  // ── Loaded view: filter bar + tab bar + tab content ───────────────────────
  return (
    <div className="min-h-full flex flex-col bg-white">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Orchard Report Analyzer</h1>
          <p className="text-text-muted text-xs mt-0.5">
            {records.length.toLocaleString()} registros importados
            {filteredRecords.length !== records.length && (
              <span className="ml-1 text-primary font-medium">
                · {filteredRecords.length.toLocaleString()} tras filtros
              </span>
            )}
          </p>
        </div>

        {/* "Add more files" — available even when loaded */}
        <OrchardUploadPanel onRecordsLoaded={handleRecordsLoaded} />
      </div>

      {/* ── Filter bar — only rendered when at least one filter is active ── */}
      <OrchardFilterBar
        filters={filters}
        records={records}
        onFiltersChange={setFilters}
      />

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-6 border-b border-border overflow-x-auto flex-shrink-0">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={[
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap',
                'border-b-2 transition-colors -mb-px',
                isActive
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

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6">
          {activeTab === 'dashboard' && (
            <OrchardDashboardTab
              breakdown={breakdown}
              rankings={rankings}
              dateRange={dateRange}
              allRecords={filteredRecords}
              onDrillDown={handleMetricClick}
            />
          )}

          {activeTab === 'platforms' && (
            <OrchardPlatformsTab
              platformSummaries={platformSummaries}
              countrySummaries={countrySummaries}
              allRecords={filteredRecords}
              onDrillDown={handleMetricClick}
            />
          )}

          {activeTab === 'countries' && (
            <OrchardCountriesTab
              matrix={matrix}
              allRecords={filteredRecords}
              onDrillDown={handleMetricClick}
            />
          )}

          {activeTab === 'catalog' && (
            <OrchardCatalogTab
              artistSummaries={artistSummaries}
              trackSummaries={trackSummaries}
              releaseSummaries={releaseSummaries}
              allRecords={filteredRecords}
              onDrillDown={handleMetricClick}
            />
          )}

          {activeTab === 'noroyalty' && (
            <OrchardNoRoyaltyTab
              noRoyaltyEntries={noRoyaltyEntries}
              allRecords={filteredRecords}
              onDrillDown={handleMetricClick}
            />
          )}

          {activeTab === 'reconciliation' && (
            <OrchardReconciliationTab
              reconciliation={reconciliation}
            />
          )}
        </div>
      </div>

      {/* ── Drill-down drawer (conditionally rendered) ─────────────────── */}
      {drillDown !== null && (
        <OrchardDrillDownDrawer
          isOpen={true}
          records={drillDown.records}
          label={drillDown.label}
          onClose={handleDrawerClose}
        />
      )}
    </div>
  )
}
