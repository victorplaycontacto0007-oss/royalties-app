/**
 * OrchardFilterBar.tsx
 *
 * Renders active filter chips (one per non-null FilterState field) and
 * dropdown selectors for the five most common dimensions.
 *
 * - Returns null when all FilterState fields are null (nothing to show).
 * - Each chip shows "Label: Value ×"; clicking × clears that single field.
 * - "Limpiar filtros" button resets all fields to null.
 * - Dropdowns for period/platform/country/artist/normalizedStreamType are
 *   populated from distinct values in the current `records` prop.
 *
 * Requirements: 14.1, 14.4, 14.5
 */

import { useMemo } from 'react'
import { cn } from '../../lib/utils'
import type { FilterState } from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OrchardFilterBarProps {
  filters: FilterState
  /** Used to compute distinct values for each dropdown. */
  records: OrchardRecord[]
  onFiltersChange: (filters: FilterState) => void
}

// ─── Label mapping ────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<keyof FilterState, string> = {
  period:               'Período',
  platform:             'Plataforma',
  country:              'País',
  artist:               'Artista',
  track:                'Canción',
  release:              'Release',
  isrc:                 'ISRC',
  upc:                  'UPC',
  normalizedStreamType: 'Tipo normalizado',
  rawStreamType:        'Tipo original',
}

// All fields in display order
const ALL_FIELDS = Object.keys(FIELD_LABELS) as (keyof FilterState)[]

// Fields that get a dropdown selector (populated from distinct record values)
const DROPDOWN_FIELDS: (keyof FilterState)[] = [
  'period',
  'platform',
  'country',
  'artist',
  'normalizedStreamType',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAnyFilterActive(filters: FilterState): boolean {
  return ALL_FIELDS.some(f => filters[f] !== null)
}

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

export default function OrchardFilterBar({
  filters,
  records,
  onFiltersChange,
}: OrchardFilterBarProps) {
  // Compute distinct values per dropdown field from records
  const distinctValues = useMemo(() => {
    const sets: Partial<Record<keyof FilterState, Set<string>>> = {}
    for (const field of DROPDOWN_FIELDS) {
      sets[field] = new Set<string>()
    }

    for (const r of records) {
      sets.period?.add(r.sale_period)
      sets.platform?.add(r.platform)
      sets.country?.add(r.country)
      sets.artist?.add(r.artist)
      sets.normalizedStreamType?.add(r.normalizedStreamType)
    }

    const result: Partial<Record<keyof FilterState, string[]>> = {}
    for (const field of DROPDOWN_FIELDS) {
      result[field] = Array.from(sets[field] ?? []).sort()
    }
    return result
  }, [records])

  // Active filter chips: all non-null fields
  const activeChips = ALL_FIELDS.filter(f => filters[f] !== null)

  // Return nothing when no filters are active — removed: dropdowns should always be visible
  // so users can start filtering without first setting a filter elsewhere.
  // if (!isAnyFilterActive(filters)) return null

  // ── Handlers ────────────────────────────────────────────────────────────────

  function clearField(field: keyof FilterState) {
    onFiltersChange({ ...filters, [field]: null })
  }

  function clearAll() {
    onFiltersChange(EMPTY_FILTERS)
  }

  function handleDropdownChange(field: keyof FilterState, value: string) {
    onFiltersChange({
      ...filters,
      [field]: value === '' ? null : value,
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 px-4 py-3 bg-surface border-b border-border">
      {/* ── Active chips row ── */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map(field => (
            <span
              key={field}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
                'bg-primary-light text-primary text-xs font-medium',
              )}
            >
              <span>
                {FIELD_LABELS[field]}: <span className="font-semibold">{String(filters[field])}</span>
              </span>
              <button
                type="button"
                aria-label={`Quitar filtro ${FIELD_LABELS[field]}`}
                onClick={() => clearField(field)}
                className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-primary/20 transition-colors text-primary"
              >
                ×
              </button>
            </span>
          ))}

          {/* "Limpiar filtros" button — visible only when any filter is active */}
          <button
            type="button"
            onClick={clearAll}
            className={cn(
              'ml-1 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150',
              'bg-surface-2 text-text-secondary hover:text-error hover:bg-error/5 border border-border',
            )}
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* ── Dropdown selectors row ── */}
      <div className="flex flex-wrap items-center gap-2">
        {DROPDOWN_FIELDS.map(field => {
          const options = distinctValues[field] ?? []
          const currentValue = (filters[field] as string | null) ?? ''
          return (
            <select
              key={field}
              value={currentValue}
              onChange={e => handleDropdownChange(field, e.target.value)}
              aria-label={`Filtrar por ${FIELD_LABELS[field]}`}
              className={cn(
                'px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all duration-150',
                'bg-surface border-border text-text-secondary',
                'hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/30',
                currentValue !== ''
                  ? 'border-primary/50 text-primary bg-primary-light'
                  : '',
              )}
            >
              <option value="">{FIELD_LABELS[field]}</option>
              {options.map(opt => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          )
        })}
      </div>
    </div>
  )
}
