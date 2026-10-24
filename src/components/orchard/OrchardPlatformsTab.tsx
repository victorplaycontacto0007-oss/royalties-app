/**
 * OrchardPlatformsTab.tsx
 *
 * Renders a sticky-header table of platform summaries with accordion expansion.
 *
 * Features:
 *  - One row per platform: Platform, Total Streams, FULL_PAY, FREE_AD_SUPPORTED,
 *    FREE_TRIAL ("N/I" when null), UNQUALIFIED, FRAUDULENT, Revenue,
 *    "Promedio efectivo según este reporte" ("N/A" when null)
 *  - Clicking a platform row expands an accordion showing country breakdown
 *    filtered to that platform only
 *  - All numeric cells are clickable and call onDrillDown with matching records
 *  - Shows only platforms present in platformSummaries — no fabricated rows
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.4
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { PlatformSummary, CountrySummary } from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OrchardPlatformsTabProps {
  platformSummaries: PlatformSummary[]
  countrySummaries: CountrySummary[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString()
}

function fmtRevenue(n: number): string {
  return `$${n.toFixed(4)}`
}

// ─── Clickable numeric cell ───────────────────────────────────────────────────

interface NumCellProps {
  value: number
  label: string
  records: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
  className?: string
  formatter?: (n: number) => string
}

function NumCell({ value, label, records, onDrillDown, className = '', formatter = fmtNum }: NumCellProps) {
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors rounded ${className}`}
      onClick={() => onDrillDown(records, label)}
      title={`Ver ${label}`}
    >
      {formatter(value)}
    </td>
  )
}

// ─── Country sub-row ──────────────────────────────────────────────────────────

interface CountryRowProps {
  cs: CountrySummary
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

function CountryRow({ cs, allRecords, onDrillDown }: CountryRowProps) {
  const { platform, country, breakdown: bd } = cs

  const baseRecords = allRecords.filter(r => r.platform === platform && r.country === country)
  const countryLabel = `${platform} › ${country}`

  function drillCategory(cat: string, catRecords: OrchardRecord[]) {
    onDrillDown(catRecords, `${countryLabel} › ${cat}`)
  }

  const fpRecords   = baseRecords.filter(r => r.normalizedStreamType === 'FULL_PAY')
  const fasRecords  = baseRecords.filter(r => r.normalizedStreamType === 'FREE_AD_SUPPORTED')
  const ftRecords   = baseRecords.filter(r => r.normalizedStreamType === 'FREE_TRIAL')
  const uqRecords   = baseRecords.filter(r => r.normalizedStreamType === 'UNQUALIFIED')
  const frRecords   = baseRecords.filter(r => r.normalizedStreamType === 'FRAUDULENT')

  return (
    <tr className="bg-surface-2 border-b border-border hover:bg-primary/5 transition-colors text-xs">
      {/* Country label with indent */}
      <td className="pl-10 pr-3 py-1.5 text-gray-600 font-medium whitespace-nowrap">
        <span className="text-gray-400 mr-1">↳</span>
        {country}
      </td>

      {/* Total Streams */}
      <NumCell
        value={bd.total.streams}
        label={countryLabel}
        records={baseRecords}
        onDrillDown={onDrillDown}
        className="text-gray-700"
      />

      {/* FULL_PAY */}
      <NumCell
        value={bd.FULL_PAY.streams}
        label={`${countryLabel} › FULL_PAY`}
        records={fpRecords}
        onDrillDown={drillCategory.bind(null, 'FULL_PAY')}
        className="text-green-700"
      />

      {/* FREE_AD_SUPPORTED */}
      <NumCell
        value={bd.FREE_AD_SUPPORTED.streams}
        label={`${countryLabel} › FREE_AD_SUPPORTED`}
        records={fasRecords}
        onDrillDown={drillCategory.bind(null, 'FREE_AD_SUPPORTED')}
        className="text-blue-700"
      />

      {/* FREE_TRIAL */}
      {bd.FREE_TRIAL === null ? (
        <td className="px-3 py-1.5 text-right text-gray-400 italic text-xs">N/I</td>
      ) : (
        <NumCell
          value={bd.FREE_TRIAL.streams}
          label={`${countryLabel} › FREE_TRIAL`}
          records={ftRecords}
          onDrillDown={drillCategory.bind(null, 'FREE_TRIAL')}
          className="text-yellow-700"
        />
      )}

      {/* UNQUALIFIED */}
      <NumCell
        value={bd.UNQUALIFIED.streams}
        label={`${countryLabel} › UNQUALIFIED`}
        records={uqRecords}
        onDrillDown={drillCategory.bind(null, 'UNQUALIFIED')}
        className="text-red-600"
      />

      {/* FRAUDULENT */}
      <NumCell
        value={bd.FRAUDULENT.streams}
        label={`${countryLabel} › FRAUDULENT`}
        records={frRecords}
        onDrillDown={drillCategory.bind(null, 'FRAUDULENT')}
        className="text-red-700 font-semibold"
      />

      {/* Revenue */}
      <NumCell
        value={bd.total.revenue}
        label={`${countryLabel} › Revenue`}
        records={baseRecords}
        onDrillDown={onDrillDown}
        formatter={fmtRevenue}
        className="text-gray-700 font-mono"
      />

      {/* Promedio efectivo — not computed per country, show dash */}
      <td className="px-3 py-1.5 text-right text-gray-400 italic text-xs">—</td>
    </tr>
  )
}

// ─── Platform row ─────────────────────────────────────────────────────────────

interface PlatformRowProps {
  ps: PlatformSummary
  isExpanded: boolean
  onToggle: () => void
  countrySummaries: CountrySummary[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

function PlatformRow({
  ps,
  isExpanded,
  onToggle,
  countrySummaries,
  allRecords,
  onDrillDown,
}: PlatformRowProps) {
  const { platform, breakdown: bd, effectivePer1000 } = ps

  // Filter country summaries to this platform only (Requirement 6.4)
  const platformCountries = countrySummaries.filter(cs => cs.platform === platform)

  const baseRecords = allRecords.filter(r => r.platform === platform)

  function drillCategory(cat: string) {
    const catRecords = allRecords.filter(
      r => r.platform === platform && r.normalizedStreamType === cat
    )
    onDrillDown(catRecords, `${platform} › ${cat}`)
  }

  const fpRecords  = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'FULL_PAY')
  const fasRecords = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'FREE_AD_SUPPORTED')
  const ftRecords  = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'FREE_TRIAL')
  const uqRecords  = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'UNQUALIFIED')
  const frRecords  = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'FRAUDULENT')

  return (
    <>
      <tr className="border-b border-border hover:bg-surface-2 transition-colors text-sm font-medium">
        {/* Platform name + expand toggle */}
        <td className="px-3 py-2.5 whitespace-nowrap">
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 text-gray-800 hover:text-blue-700 transition-colors font-semibold"
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Colapsar' : 'Expandir'} ${platform}`}
          >
            {isExpanded
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            }
            {platform}
          </button>
        </td>

        {/* Total Streams */}
        <NumCell
          value={bd.total.streams}
          label={platform}
          records={baseRecords}
          onDrillDown={onDrillDown}
          className="text-gray-800 font-semibold"
        />

        {/* FULL_PAY */}
        <NumCell
          value={bd.FULL_PAY.streams}
          label={`${platform} › FULL_PAY`}
          records={fpRecords}
          onDrillDown={() => drillCategory('FULL_PAY')}
          className="text-green-700"
        />

        {/* FREE_AD_SUPPORTED */}
        <NumCell
          value={bd.FREE_AD_SUPPORTED.streams}
          label={`${platform} › FREE_AD_SUPPORTED`}
          records={fasRecords}
          onDrillDown={() => drillCategory('FREE_AD_SUPPORTED')}
          className="text-blue-700"
        />

        {/* FREE_TRIAL — "N/I" when null */}
        {bd.FREE_TRIAL === null ? (
          <td className="px-3 py-2.5 text-right text-gray-400 italic text-xs">N/I</td>
        ) : (
          <NumCell
            value={bd.FREE_TRIAL.streams}
            label={`${platform} › FREE_TRIAL`}
            records={ftRecords}
            onDrillDown={() => drillCategory('FREE_TRIAL')}
            className="text-yellow-700"
          />
        )}

        {/* UNQUALIFIED */}
        <NumCell
          value={bd.UNQUALIFIED.streams}
          label={`${platform} › UNQUALIFIED`}
          records={uqRecords}
          onDrillDown={() => drillCategory('UNQUALIFIED')}
          className="text-red-600"
        />

        {/* FRAUDULENT */}
        <NumCell
          value={bd.FRAUDULENT.streams}
          label={`${platform} › FRAUDULENT`}
          records={frRecords}
          onDrillDown={() => drillCategory('FRAUDULENT')}
          className="text-red-700 font-semibold"
        />

        {/* Revenue */}
        <NumCell
          value={bd.total.revenue}
          label={`${platform} › Revenue`}
          records={baseRecords}
          onDrillDown={onDrillDown}
          formatter={fmtRevenue}
          className="text-gray-800 font-mono font-semibold"
        />

        {/* Promedio efectivo según este reporte */}
        <td className="px-3 py-2.5 text-right text-gray-700 font-mono text-xs whitespace-nowrap">
          {effectivePer1000 === null ? (
            <span className="text-gray-400 italic">N/A</span>
          ) : (
            `$${effectivePer1000.toFixed(4)}`
          )}
        </td>
      </tr>

      {/* Expanded country rows */}
      {isExpanded && platformCountries.map(cs => (
        <CountryRow
          key={`${cs.platform}|||${cs.country}`}
          cs={cs}
          allRecords={allRecords}
          onDrillDown={onDrillDown}
        />
      ))}
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * OrchardPlatformsTab
 *
 * Renders the full platform summary table. Shows only platforms present in
 * platformSummaries — no fabricated rows (Requirement 5.1).
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.4
 */
export default function OrchardPlatformsTab({
  platformSummaries,
  countrySummaries,
  allRecords,
  onDrillDown,
}: OrchardPlatformsTabProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set())

  function togglePlatform(platform: string) {
    setExpandedPlatforms(prev => {
      const next = new Set(prev)
      if (next.has(platform)) {
        next.delete(platform)
      } else {
        next.add(platform)
      }
      return next
    })
  }

  if (platformSummaries.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-text-muted text-sm">
        No hay plataformas para mostrar.
      </div>
    )
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-auto">
        <table className="w-full text-xs border-collapse min-w-max">
        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <thead className="sticky top-0 z-10 bg-surface-2 border-b border-border">
          <tr>
            <th className="px-3 py-2.5 text-left text-text-muted font-semibold uppercase tracking-wide text-[11px] whitespace-nowrap">
              Plataforma
            </th>
            <th className="px-3 py-2.5 text-right text-text-muted font-semibold uppercase tracking-wide text-[11px] whitespace-nowrap">
              Total Streams
            </th>
            <th className="px-3 py-2.5 text-right text-success font-semibold uppercase tracking-wide text-[11px] whitespace-nowrap">
              FULL_PAY
            </th>
            <th className="px-3 py-2.5 text-right text-primary font-semibold uppercase tracking-wide text-[11px] whitespace-nowrap">
              FREE_AD
            </th>
            <th className="px-3 py-2.5 text-right text-warning font-semibold uppercase tracking-wide text-[11px] whitespace-nowrap">
              FREE_TRIAL
            </th>
            <th className="px-3 py-2.5 text-right text-error font-semibold uppercase tracking-wide text-[11px] whitespace-nowrap">
              UNQUALIFIED
            </th>
            <th className="px-3 py-2.5 text-right text-error font-semibold uppercase tracking-wide text-[11px] whitespace-nowrap">
              FRAUDULENT
            </th>
            <th className="px-3 py-2.5 text-right text-text-muted font-semibold uppercase tracking-wide text-[11px] whitespace-nowrap">
              Revenue
            </th>
            <th className="px-3 py-2.5 text-right text-text-muted font-semibold text-[11px] whitespace-nowrap max-w-[140px]">
              Efect./1000
            </th>
          </tr>
        </thead>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <tbody>
          {platformSummaries.map(ps => (
            <PlatformRow
              key={ps.platform}
              ps={ps}
              isExpanded={expandedPlatforms.has(ps.platform)}
              onToggle={() => togglePlatform(ps.platform)}
              countrySummaries={countrySummaries}
              allRecords={allRecords}
              onDrillDown={onDrillDown}
            />
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
