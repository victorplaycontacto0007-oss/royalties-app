# Implementation Plan: Orchard Report Analyzer

## Overview

Implement full support for The Orchard distributor reports in the royalties-app. The plan extends the `royalty-engine` pipeline with a `StreamTypeClassifier`, a pure analytics module, and a dedicated UI page with tabs, filters, drill-down, and reconciliation. Existing providers and `ParsedRow` consumers are unaffected.

## Tasks

- [x] 1. Extend royalty-engine for transaction_type and The Orchard provider
  - [x] 1.1 Add `transaction_type` to AliasDictionary and ColumnMapper
    - Add `transaction_type` to the `CanonicalField` union type in `AliasDictionary.ts`
    - Add the full alias list to `ALIAS_DICTIONARY`: "transaction type", "usage type", "stream type", "subscription type", "transaction type description", "play type", "stream category", and camelCase/concatenated variants
    - Remove `transactiontype` from `EXCLUDED_COLUMNS` if present
    - Add `transaction_type: number | null` to `ColumnIndex` in `ColumnMapper.ts`
    - _Requirements: 2.4, 2.5_
  - [x] 1.2 Add The Orchard to ProviderDetector and ProviderStrategy
    - Add `'The Orchard'` to the `ProviderName` union type in `ProviderStrategy.ts`
    - Add the strategy entry: `paymentColumn: 'net_revenue'`, `defaultCurrency: 'USD'`, `earningsCandidates: ['netrevenue', 'revenue', 'royalty', 'amount']`
    - Add detection logic to `ProviderDetector.ts`: filename contains "orchard" (case-insensitive) takes precedence; fallback to header-based detection when any `transaction_type` alias is present alongside a platform-like column
    - _Requirements: 2.1, 2.2_

- [x] 2. Implement StreamTypeClassifier module
  - [x] 2.1 Create StreamCategory type, OrchardRecord interface, and classify() function
    - Create `src/royalty-engine/StreamTypeClassifier.ts`
    - Export `StreamCategory` type union: `'FULL_PAY' | 'FREE_AD_SUPPORTED' | 'FREE_TRIAL' | 'UNQUALIFIED' | 'FRAUDULENT' | 'OTHER' | 'UNKNOWN'`
    - Export `OrchardRecord` interface with all `ParsedRow` fields plus `rawStreamType`, `normalizedStreamType`, `rowIndex`, `sourceFile`
    - Implement `classify(raw: string): StreamCategory` — pure function, pattern list checked in order: FRAUDULENT → UNQUALIFIED → FREE_TRIAL → FREE_AD_SUPPORTED → FULL_PAY → OTHER; null/empty/whitespace-only returns UNKNOWN
    - _Requirements: 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 16.1, 16.2, 16.3_
  - [x] 2.2 Implement toOrchardRecords() and parseOrchardFile()
    - Implement `toOrchardRecords(result, rawRows, transactionTypeColIdx, fileName): OrchardRecord[]` — maps each `ParsedRow` at index `i` to an `OrchardRecord` preserving all fields; sets `rowIndex = i + 2`, `sourceFile = fileName`, `rawStreamType` from `rawRows[i][transactionTypeColIdx]` (or `""` when column absent), `normalizedStreamType = classify(rawStreamType)`
    - Implement `parseOrchardFile(file: File): Promise<{ records, unmappedColumns, importLog }>` — calls `parseFile()`, extracts raw rows, detects `transaction_type` column index via `mapColumns`, calls `toOrchardRecords()`, returns import log entries for UNKNOWN/OTHER rows and missing column warning
    - _Requirements: 1.1, 1.2, 1.3, 16.2, 16.3, 18.1, 18.4_
  - [x] 2.3 Write unit tests for StreamTypeClassifier
    - Create `src/royalty-engine/__tests__/StreamTypeClassifier.test.ts`
    - Cover all 7 categories with canonical Orchard values (e.g. "Subscription Audio Streams", "Ad-Supported Audio Streams", "Unqualified Audio Streams", "Fraudulent Streams")
    - Cover case variants ("PREMIUM", "ad supported", "FREE TRIAL"), empty string, null, whitespace-only, and ambiguous strings ("free" → FREE_AD_SUPPORTED, "fraud unqualified" → FRAUDULENT)
    - Cover `toOrchardRecords()` with a fixture RUPEResult and raw rows: correct rowIndex, sourceFile, rawStreamType preservation
    - _Requirements: 3.1–3.9, 16.1–16.3_
  - [x] 2.4 Write property-based tests for StreamTypeClassifier
    - Create `src/royalty-engine/__tests__/StreamTypeClassifier.pbt.test.ts` using `fast-check`
    - **Property 1: Classification Exhaustiveness** — `∀ s: string → classify(s) ∈ StreamCategory` (never throws)
    - **Property 2: FREE_TRIAL / FREE_AD_SUPPORTED mutual exclusivity** — `∀ s → NOT (classify(s) === 'FREE_TRIAL' AND classify(s) === 'FREE_AD_SUPPORTED')`
    - **Property 3: FRAUDULENT / UNQUALIFIED mutual exclusivity** — `∀ s → NOT (classify(s) === 'FRAUDULENT' AND classify(s) === 'UNQUALIFIED')`
    - **Property 4: No side effects on input** — `∀ record: OrchardRecord → classify(rawStreamType) does not mutate record`
    - **Validates: Requirements 3.4, 3.6, 3.9, 16.1, 16.3**

- [x] 3. Checkpoint — ensure tasks 1–2 are complete and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement OrchardAnalytics pure functions module
  - [x] 4.1 Create FilterState, StreamCategoryBreakdown, and core aggregation functions
    - Create `src/lib/orchard-analytics.ts` with no React imports and no side effects
    - Export `FilterState` interface: `period`, `platform`, `country`, `artist`, `track`, `release`, `isrc`, `upc`, `normalizedStreamType`, `rawStreamType` — all nullable
    - Export `StreamCategoryBreakdown` interface with per-category `{ streams: number; revenue: number }` and `FREE_TRIAL: ... | null`, plus `total` and `monetizable` fields
    - Implement `applyFilters(records, filters): OrchardRecord[]` — AND logic, case-insensitive exact match per field, `rawStreamType` uses contains match
    - Implement `computeBreakdown(records): StreamCategoryBreakdown` — single-pass accumulation; `FREE_TRIAL` is `null` when no record has that category
    - _Requirements: 4.1, 4.2, 4.3, 14.1, 14.2, 14.3_
  - [x] 4.2 Implement platform, country, and matrix summaries
    - Export `PlatformSummary` interface and implement `computePlatformSummaries(records): PlatformSummary[]` — grouped by `platform`, includes `effectivePer1000: number | null` (null when streams = 0)
    - Export `CountrySummary` interface and implement `computeCountrySummaries(records): CountrySummary[]` — grouped by `(platform, country)` composite key
    - Export `MatrixRow` interface and implement `computeMatrix(records): MatrixRow[]` — flat list, one entry per unique `(platform, country)` pair
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3_
  - [x] 4.3 Implement catalog, no-royalty, reconciliation, rankings, and date range
    - Export and implement `computeArtistSummaries`, `computeTrackSummaries`, `computeReleaseSummaries`
    - Export `NoRoyaltyEntry` interface and implement `computeNoRoyaltyReport(records): NoRoyaltyEntry[]` — groups records with `net_total <= 0` by `(normalizedStreamType, platform, country)` with typed `cause` field
    - Export `ReconciliationResult` interface and implement `computeReconciliation(records): ReconciliationResult` — stream total vs category sum; revenue total vs category sum with $0.01 tolerance; per-platform `streamDelta` / `revenueDelta`; `isClean` boolean
    - Implement `rankByRevenue<T>(items: T[]): T[]` and `computeRankings(records)` returning `{ platforms, countries, artists, tracks }`
    - Implement `getDateRange(records)` returning `{ min, max } | null`
    - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 10.4, 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3, 12.4, 13.1, 13.2, 13.3, 13.4, 13.5, 18.2_
  - [x] 4.4 Write unit tests for OrchardAnalytics
    - Create `src/lib/__tests__/orchard-analytics.test.ts`
    - Test `applyFilters`: single filter, multi-filter AND logic, empty result, rawStreamType contains match
    - Test `computeBreakdown`: all categories present, FREE_TRIAL null when absent, monetizable calculation
    - Test `computeReconciliation`: clean state (isClean = true), dirty stream delta, revenue discrepancy > $0.01
    - Test `computeNoRoyaltyReport`: groups correctly, cause labels match specification
    - Test `getDateRange`: empty array returns null, multiple periods returns correct min/max
    - _Requirements: 11.1, 11.4, 12.1, 12.4, 14.2, 14.3_
  - [x] 4.5 Write property-based tests for OrchardAnalytics
    - Create `src/lib/__tests__/orchard-analytics.pbt.test.ts` using `fast-check`
    - **Property 5: Stream Reconciliation Invariant** — `∀ records → Σ(r.quantity) === sum of all category stream counts from computeBreakdown`
    - **Property 6: Revenue Reconciliation Invariant** — `∀ records → |Σ(r.net_total) − Σ(category revenues)| ≤ 0.01`
    - **Property 7: Filter Monotonicity** — adding an extra filter never increases result count
    - **Property 8: Platform Summary Completeness** — every platform in records appears in computePlatformSummaries output
    - **Property 9: Drill-Down Traceability** — rowIndexes from applyFilters result are always a subset of all rowIndexes in records
    - **Validates: Requirements 11.1, 11.4, 12.1, 12.4, 14.2, 14.3, 15.1, 18.2**

- [x] 5. Checkpoint — ensure analytics module and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Build upload, filter bar, and drill-down components
  - [x] 6.1 Implement OrchardUploadPanel
    - Create `src/components/orchard/OrchardUploadPanel.tsx`
    - File drop zone accepting TSV/CSV/XLSX; calls `parseOrchardFile()` on selection
    - Shows progress indicator during parsing; displays import log with unmapped columns warning after import
    - Shows error state in panel when `parseOrchardFile()` returns empty records with error in importLog
    - Supports adding a second file to accumulate records (each file's records keep their `sourceFile`)
    - _Requirements: 1.1, 2.3, 17.3, 17.4, 17.5_
  - [x] 6.2 Implement OrchardFilterBar
    - Create `src/components/orchard/OrchardFilterBar.tsx`
    - Renders one chip per active (non-null) `FilterState` field; each chip has an × button to clear that filter
    - Shows "Limpiar filtros" button when any filter is active; hidden when FilterState is all-null
    - Dropdowns for period, platform, country, artist, normalizedStreamType populated from distinct values in current records
    - _Requirements: 14.1, 14.4, 14.5_
  - [x] 6.3 Implement OrchardDrillDownDrawer
    - Create `src/components/orchard/OrchardDrillDownDrawer.tsx`
    - Slide-over panel; props: `records: OrchardRecord[]`, `label: string`, `isOpen: boolean`, `onClose: () => void`
    - Shows metric label + value, row count badge, and a table with columns: rowIndex, sourceFile, platform, country, artist, track, rawStreamType, normalizedStreamType, quantity, net_total
    - Export CSV button generates and downloads a CSV of the displayed records
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 18.3_

- [x] 7. Build analytics tab components
  - [x] 7.1 Implement OrchardDashboardTab
    - Create `src/components/orchard/OrchardDashboardTab.tsx`
    - Summary cards for global `StreamCategoryBreakdown`: Total Streams, Total Revenue, per-category stream counts; FREE_TRIAL shows "No identificado en el reporte" when null
    - Date range badge from `getDateRange()` result
    - Four sortable ranking tables (revenue desc): platforms, countries, artists, tracks — each with stream category columns
    - All metric values are clickable and open `OrchardDrillDownDrawer` with the matching `OrchardRecord[]` slice
    - _Requirements: 4.1, 13.1, 13.2, 13.3, 13.4, 13.5, 15.1_
  - [x] 7.2 Implement OrchardPlatformsTab
    - Create `src/components/orchard/OrchardPlatformsTab.tsx`
    - One row per platform: Platform, Total Streams, FULL_PAY, FREE_AD_SUPPORTED, FREE_TRIAL ("N/I" when null), UNQUALIFIED, FRAUDULENT, Revenue, "Promedio efectivo según este reporte"
    - Clicking a platform row expands it to show the country breakdown for that platform
    - All numeric cells clickable → `OrchardDrillDownDrawer` with matching records
    - Shows only platforms present in records; no fabricated rows
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.4_
  - [x] 7.3 Implement OrchardCountriesTab
    - Create `src/components/orchard/OrchardCountriesTab.tsx`
    - Platform × country matrix: Plataforma, País, Total Streams, FULL_PAY, FREE_AD_SUPPORTED, FREE_TRIAL (N/I), UNQUALIFIED, FRAUDULENT, Revenue
    - All numeric columns client-side sortable via column header click
    - Pinned totals row at the bottom
    - ISO-2 country codes expanded to full country names
    - Clicking any cell opens `OrchardDrillDownDrawer` with matching records
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4_
  - [x] 7.4 Implement OrchardCatalogTab
    - Create `src/components/orchard/OrchardCatalogTab.tsx`
    - Primary view: accordion hierarchy Artist → Release → Track, each level showing `StreamCategoryBreakdown` inline
    - ISRC shown next to track name when available; UPC shown next to release when available
    - Secondary view toggle: Platform → Country → Stream Type → Records (inverse hierarchy per requirements 9.5)
    - Clicking any breakdown value opens `OrchardDrillDownDrawer`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  - [x] 7.5 Implement OrchardNoRoyaltyTab
    - Create `src/components/orchard/OrchardNoRoyaltyTab.tsx`
    - Renders `computeNoRoyaltyReport()` output grouped by category
    - Columns: Categoría, Causa, Plataforma, País, Streams, Revenue
    - Cause labels in Spanish: UNQUALIFIED → "No calificó", FRAUDULENT → "Fraude detectado", FREE_AD_ZERO → "Ad-Supported sin monetizar", FREE_TRIAL_ZERO → "Prueba gratuita sin revenue", OTHER_ZERO/UNKNOWN_ZERO → "Categoría sin royalty"
    - Never hides records with revenue = 0 or revenue < 0
    - Clicking a row opens `OrchardDrillDownDrawer` with matching records
    - _Requirements: 10.1, 10.2, 10.3, 10.4_
  - [x] 7.6 Implement OrchardReconciliationTab
    - Create `src/components/orchard/OrchardReconciliationTab.tsx`
    - Stream reconciliation panel: total streams, sum of category streams, delta in red when ≠ 0; alert "Existen N streams no clasificados" when `uncategorizedStreams > 0`
    - Revenue reconciliation panel: total revenue, categorized sum, discrepancy — warning banner when delta > $0.01
    - Per-platform reconciliation table with `streamDelta` and `revenueDelta` columns
    - "Sin problemas detectados" success state when `isClean = true`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 12.1, 12.2, 12.3, 12.4_

- [x] 8. Build OrchardReportPage and wire routing
  - [x] 8.1 Create OrchardReportPage root component
    - Create `src/pages/OrchardReportPage.tsx`
    - Owns state: `records: OrchardRecord[]`, `filters: FilterState`, `drillDown: { records: OrchardRecord[]; label: string } | null`, `activeTab`
    - Computes filtered records via `useMemo(applyFilters(records, filters), [records, filters])`
    - Pre-computes analytics (breakdown, platform summaries, rankings, etc.) via `useMemo` from filtered records; passes results as props to tab components — tabs do not call analytics functions directly
    - Shows `OrchardUploadPanel` when `records` is empty; shows tab bar + `OrchardFilterBar` + active tab when records are loaded
    - Passes `onMetricClick` callback to all tabs; callback opens `OrchardDrillDownDrawer` with matching records and label
    - _Requirements: 1.3, 1.4, 13.1, 14.1, 14.4, 14.5, 17.4, 17.5_
  - [x] 8.2 Wire `/orchard` route and nav link
    - Add `<Route path="/orchard" element={<OrchardReportPage />} />` to `App.tsx`
    - Add "Orchard Analyzer" nav link to `Layout.tsx` pointing to `/orchard`
    - _Requirements: 13.1_

- [x] 9. Final checkpoint — ensure all tests pass and the feature is fully wired
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- `classify()` and all functions in `orchard-analytics.ts` must be pure: no React imports, no Supabase imports, no side effects
- Check `package.json` for `fast-check` before running PBT tasks (2.4, 4.5); if absent, install it as a dev dependency first
- `FREE_TRIAL` in `StreamCategoryBreakdown` is `null` (not 0) when no report record has that category — all display components must null-check before rendering and show "N/I" / "No identificado en el reporte"
- `effectivePer1000` in `PlatformSummary` is `null` when total streams = 0 — UI must null-check before rendering

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5", "6.1", "6.2", "6.3"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 7, "tasks": ["8.1"] },
    { "id": 8, "tasks": ["8.2"] }
  ]
}
```
