/**
 * OrchardPlatformsTab.tsx
 *
 * Platform summary table with accordion country breakdown.
 * FREE_TRIAL column is hidden entirely when no platform in the dataset has it.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.4
 */

import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { PlatformSummary, CountrySummary } from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

export interface OrchardPlatformsTabProps {
  platformSummaries: PlatformSummary[]
  countrySummaries: CountrySummary[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

function fmtNum(n: number): string { return n.toLocaleString() }
function fmtRevenue(n: number): string { return `$${n.toFixed(4)}` }

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
      className={`px-2 py-1.5 text-right tabular-nums cursor-pointer hover:bg-blue-50 hover:text-blue-700 transition-colors ${className}`}
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
  showFreeTrial: boolean
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

function CountryRow({ cs, allRecords, showFreeTrial, onDrillDown }: CountryRowProps) {
  const { platform, country, breakdown: bd } = cs
  const baseRecords = allRecords.filter(r => r.platform === platform && r.country === country)
  const countryLabel = `${platform} › ${country}`

  const fpRecords  = baseRecords.filter(r => r.normalizedStreamType === 'FULL_PAY')
  const fasRecords = baseRecords.filter(r => r.normalizedStreamType === 'FREE_AD_SUPPORTED')
  const ftRecords  = baseRecords.filter(r => r.normalizedStreamType === 'FREE_TRIAL')
  const uqRecords  = baseRecords.filter(r => r.normalizedStreamType === 'UNQUALIFIED')
  const frRecords  = baseRecords.filter(r => r.normalizedStreamType === 'FRAUDULENT')

  return (
    <tr className="bg-gray-50 border-b border-gray-100 hover:bg-blue-50/30 transition-colors text-xs">
      <td className="pl-8 pr-2 py-1.5 text-gray-600 font-medium whitespace-nowrap">
        <span className="text-gray-400 mr-1">↳</span>{country}
      </td>
      <NumCell value={bd.total.streams}          label={countryLabel}                          records={baseRecords} onDrillDown={onDrillDown}                              className="text-gray-700" />
      <NumCell value={bd.FULL_PAY.streams}       label={`${countryLabel} › FULL_PAY`}          records={fpRecords}   onDrillDown={(r,l) => onDrillDown(r,l)}                className="text-green-700" />
      <NumCell value={bd.FREE_AD_SUPPORTED.streams} label={`${countryLabel} › FREE_AD`}        records={fasRecords}  onDrillDown={(r,l) => onDrillDown(r,l)}                className="text-blue-700" />
      {showFreeTrial && (
        bd.FREE_TRIAL === null
          ? <td className="px-2 py-1.5 text-right text-gray-300 text-xs">—</td>
          : <NumCell value={bd.FREE_TRIAL.streams} label={`${countryLabel} › FREE_TRIAL`}      records={ftRecords}   onDrillDown={(r,l) => onDrillDown(r,l)}                className="text-yellow-700" />
      )}
      <NumCell value={bd.UNQUALIFIED.streams}    label={`${countryLabel} › UNQUALIFIED`}       records={uqRecords}   onDrillDown={(r,l) => onDrillDown(r,l)}                className="text-red-600" />
      <NumCell value={bd.FRAUDULENT.streams}     label={`${countryLabel} › FRAUDULENT`}        records={frRecords}   onDrillDown={(r,l) => onDrillDown(r,l)}                className="text-red-700 font-semibold" />
      <NumCell value={bd.total.revenue}          label={`${countryLabel} › Revenue`}           records={baseRecords} onDrillDown={onDrillDown} formatter={fmtRevenue}       className="text-gray-700 font-mono" />
      <td className="px-2 py-1.5 text-right text-gray-300 text-xs">—</td>
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
  showFreeTrial: boolean
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

function PlatformRow({ ps, isExpanded, onToggle, countrySummaries, allRecords, showFreeTrial, onDrillDown }: PlatformRowProps) {
  const { platform, breakdown: bd, effectivePer1000 } = ps
  const platformCountries = countrySummaries.filter(cs => cs.platform === platform)
  const baseRecords = allRecords.filter(r => r.platform === platform)

  const drill = (cat: string) => {
    const recs = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === cat)
    onDrillDown(recs, `${platform} › ${cat}`)
  }

  const fpRecords  = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'FULL_PAY')
  const fasRecords = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'FREE_AD_SUPPORTED')
  const ftRecords  = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'FREE_TRIAL')
  const uqRecords  = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'UNQUALIFIED')
  const frRecords  = allRecords.filter(r => r.platform === platform && r.normalizedStreamType === 'FRAUDULENT')

  return (
    <>
      <tr className="border-b border-gray-200 hover:bg-gray-50 transition-colors text-xs font-medium">
        <td className="px-2 py-2 whitespace-nowrap">
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-gray-800 hover:text-blue-700 transition-colors font-semibold"
            aria-expanded={isExpanded}
          >
            {isExpanded
              ? <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
              : <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
            }
            {platform}
          </button>
        </td>
        <NumCell value={bd.total.streams}             label={platform}                      records={baseRecords} onDrillDown={onDrillDown}              className="text-gray-800 font-semibold" />
        <NumCell value={bd.FULL_PAY.streams}          label={`${platform} › FULL_PAY`}     records={fpRecords}   onDrillDown={() => drill('FULL_PAY')}  className="text-green-700" />
        <NumCell value={bd.FREE_AD_SUPPORTED.streams} label={`${platform} › FREE_AD`}      records={fasRecords}  onDrillDown={() => drill('FREE_AD_SUPPORTED')} className="text-blue-700" />
        {showFreeTrial && (
          bd.FREE_TRIAL === null
            ? <td className="px-2 py-2 text-right text-gray-300 text-xs">—</td>
            : <NumCell value={bd.FREE_TRIAL.streams}  label={`${platform} › FREE_TRIAL`}   records={ftRecords}   onDrillDown={() => drill('FREE_TRIAL')} className="text-yellow-700" />
        )}
        <NumCell value={bd.UNQUALIFIED.streams}       label={`${platform} › UNQUALIFIED`}  records={uqRecords}   onDrillDown={() => drill('UNQUALIFIED')} className="text-red-600" />
        <NumCell value={bd.FRAUDULENT.streams}        label={`${platform} › FRAUDULENT`}   records={frRecords}   onDrillDown={() => drill('FRAUDULENT')}  className="text-red-700 font-semibold" />
        <NumCell value={bd.total.revenue}             label={`${platform} › Revenue`}      records={baseRecords} onDrillDown={onDrillDown} formatter={fmtRevenue} className="text-gray-800 font-mono font-semibold" />
        <td className="px-2 py-2 text-right text-gray-600 font-mono text-xs whitespace-nowrap">
          {effectivePer1000 === null
            ? <span className="text-gray-300">—</span>
            : `$${effectivePer1000.toFixed(4)}`}
        </td>
      </tr>

      {isExpanded && platformCountries.map(cs => (
        <CountryRow
          key={`${cs.platform}|||${cs.country}`}
          cs={cs}
          allRecords={allRecords}
          showFreeTrial={showFreeTrial}
          onDrillDown={onDrillDown}
        />
      ))}
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrchardPlatformsTab({ platformSummaries, countrySummaries, allRecords, onDrillDown }: OrchardPlatformsTabProps) {
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set())

  // Only show FREE_TRIAL column when at least one platform actually has it
  const showFreeTrial = useMemo(
    () => platformSummaries.some(ps => ps.breakdown.FREE_TRIAL !== null),
    [platformSummaries],
  )

  function togglePlatform(platform: string) {
    setExpandedPlatforms(prev => {
      const next = new Set(prev)
      next.has(platform) ? next.delete(platform) : next.add(platform)
      return next
    })
  }

  if (platformSummaries.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        No hay plataformas para mostrar.
      </div>
    )
  }

  return (
    <div className="overflow-auto -mx-4 px-0">
      <table className="w-full text-xs border-collapse" style={{ minWidth: showFreeTrial ? '720px' : '640px' }}>
        <thead className="sticky top-0 z-10 bg-white border-b-2 border-gray-200">
          <tr>
            <th className="px-2 py-2 text-left   text-gray-500  font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Plataforma</th>
            <th className="px-2 py-2 text-right  text-gray-500  font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Streams</th>
            <th className="px-2 py-2 text-right  text-green-600 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Full Pay</th>
            <th className="px-2 py-2 text-right  text-blue-600  font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Free Ad</th>
            {showFreeTrial && (
              <th className="px-2 py-2 text-right text-yellow-600 font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Free Trial</th>
            )}
            <th className="px-2 py-2 text-right  text-red-500   font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Unqual.</th>
            <th className="px-2 py-2 text-right  text-red-700   font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Fraud.</th>
            <th className="px-2 py-2 text-right  text-gray-500  font-semibold uppercase tracking-wide text-[10px] whitespace-nowrap">Revenue</th>
            <th className="px-2 py-2 text-right  text-gray-500  font-semibold text-[10px] whitespace-nowrap">$/1000</th>
          </tr>
        </thead>
        <tbody>
          {platformSummaries.map(ps => (
            <PlatformRow
              key={ps.platform}
              ps={ps}
              isExpanded={expandedPlatforms.has(ps.platform)}
              onToggle={() => togglePlatform(ps.platform)}
              countrySummaries={countrySummaries}
              allRecords={allRecords}
              showFreeTrial={showFreeTrial}
              onDrillDown={onDrillDown}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
