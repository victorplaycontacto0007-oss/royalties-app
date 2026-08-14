# Design Document

## Feature: orchard-report-analyzer

## Overview

This document describes the technical design for extending the royalties-app with full support for The Orchard distributor reports. The core challenge is that Orchard reports include a `transaction_type` (stream type) column that must drive all stream categorization — FULL_PAY, FREE_AD_SUPPORTED, FREE_TRIAL, UNQUALIFIED, FRAUDULENT, OTHER, UNKNOWN — without ever inferring category from revenue, country, or platform.

The design extends the existing `royalty-engine` pipeline with minimal coupling: a new `StreamTypeClassifier`, an extended `OrchardRecord` data model, a pure analytics module, and a dedicated UI page. Existing providers and existing `ParsedRow` consumers are unaffected.

---

## Architecture

### High-Level Layers

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer (React)                                        │
│  OrchardReportPage → Tabs → FilterBar → DrillDownDrawer │
└────────────────────┬────────────────────────────────────┘
                     │ OrchardRecord[]
┌────────────────────▼────────────────────────────────────┐
│  Analytics Layer (pure functions)                        │
│  OrchardAnalytics: breakdowns, rankings, reconciliation  │
└────────────────────┬────────────────────────────────────┘
                     │ OrchardRecord[]
┌────────────────────▼────────────────────────────────────┐
│  Parser / Classifier Layer (royalty-engine extensions)  │
│  UniversalParser → OrchardRecord converter              │
│  StreamTypeClassifier (raw → normalized category)       │
└────────────────────┬────────────────────────────────────┘
                     │ File (TSV/CSV/XLSX)
┌────────────────────▼────────────────────────────────────┐
│  Storage Layer                                           │
│  In-memory OrchardRecord[] (browser session)            │
│  Supabase (optional persistence, future scope)          │
└─────────────────────────────────────────────────────────┘
```

### Module Map

```
src/
├── royalty-engine/
│   ├── AliasDictionary.ts          ← ADD transaction_type canonical field
│   ├── ColumnMapper.ts             ← No change needed
│   ├── ProviderDetector.ts         ← ADD "The Orchard" detection
│   ├── ProviderStrategy.ts         ← ADD "The Orchard" strategy entry
│   └── StreamTypeClassifier.ts     ← NEW
├── lib/
│   └── orchard-analytics.ts        ← NEW (pure functions only)
├── pages/
│   └── OrchardReportPage.tsx       ← NEW
└── components/
    └── orchard/
        ├── OrchardUploadPanel.tsx
        ├── OrchardDashboardTab.tsx
        ├── OrchardPlatformsTab.tsx
        ├── OrchardCountriesTab.tsx
        ├── OrchardCatalogTab.tsx
        ├── OrchardNoRoyaltyTab.tsx
        ├── OrchardReconciliationTab.tsx
        ├── OrchardFilterBar.tsx
        └── OrchardDrillDownDrawer.tsx
```

---

## Components and Interfaces

### royalty-engine additions

| Component | File | Role |
|---|---|---|
| `StreamCategory` | `StreamTypeClassifier.ts` | Type union for 7 normalized stream categories |
| `OrchardRecord` | `StreamTypeClassifier.ts` | Immutable record extending ParsedRow with stream + audit fields |
| `classify()` | `StreamTypeClassifier.ts` | Pure function: `string → StreamCategory`, no side effects |
| `toOrchardRecords()` | `StreamTypeClassifier.ts` | Converts `RUPEResult + rawRows[]` into `OrchardRecord[]` |
| `parseOrchardFile()` | `StreamTypeClassifier.ts` | Async entry point: File → `{ records, unmappedColumns, importLog }` |

### lib additions

| Component | File | Role |
|---|---|---|
| `FilterState` | `orchard-analytics.ts` | Interface for all combinable filter dimensions |
| `StreamCategoryBreakdown` | `orchard-analytics.ts` | Per-category streams + revenue totals |
| `applyFilters()` | `orchard-analytics.ts` | AND-filter over `OrchardRecord[]` |
| `computeBreakdown()` | `orchard-analytics.ts` | Aggregates one-pass breakdown from records |
| `computePlatformSummaries()` | `orchard-analytics.ts` | Per-DSP breakdown + effectivePer1000 |
| `computeCountrySummaries()` | `orchard-analytics.ts` | Per `(platform, country)` breakdown |
| `computeMatrix()` | `orchard-analytics.ts` | Flat matrix for country × stream type table |
| `computeArtistSummaries()` | `orchard-analytics.ts` | Artist-level aggregation |
| `computeTrackSummaries()` | `orchard-analytics.ts` | Track-level aggregation with ISRC |
| `computeReleaseSummaries()` | `orchard-analytics.ts` | Release-level aggregation with UPC |
| `computeNoRoyaltyReport()` | `orchard-analytics.ts` | Zero/negative revenue records grouped by cause |
| `computeReconciliation()` | `orchard-analytics.ts` | Stream + revenue reconciliation with deltas |
| `computeRankings()` | `orchard-analytics.ts` | Revenue-sorted rankings across all dimensions |
| `getDateRange()` | `orchard-analytics.ts` | Min/max `sale_period` from records |
| `rankByRevenue()` | `orchard-analytics.ts` | Generic sort helper for any breakdown-bearing item |

### UI Components

| Component | File | Role |
|---|---|---|
| `OrchardReportPage` | `pages/OrchardReportPage.tsx` | Root page: owns record + filter state, pre-computes analytics |
| `OrchardUploadPanel` | `components/orchard/OrchardUploadPanel.tsx` | File drop zone + import feedback |
| `OrchardFilterBar` | `components/orchard/OrchardFilterBar.tsx` | Active filter chips + clear button |
| `OrchardDashboardTab` | `components/orchard/OrchardDashboardTab.tsx` | Global totals + all rankings |
| `OrchardPlatformsTab` | `components/orchard/OrchardPlatformsTab.tsx` | Per-platform breakdown accordion |
| `OrchardCountriesTab` | `components/orchard/OrchardCountriesTab.tsx` | Sortable platform × country matrix table |
| `OrchardCatalogTab` | `components/orchard/OrchardCatalogTab.tsx` | Artist → Release → Track drill-down |
| `OrchardNoRoyaltyTab` | `components/orchard/OrchardNoRoyaltyTab.tsx` | Zero-revenue streams by category and cause |
| `OrchardReconciliationTab` | `components/orchard/OrchardReconciliationTab.tsx` | Stream + revenue reconciliation alerts |
| `OrchardDrillDownDrawer` | `components/orchard/OrchardDrillDownDrawer.tsx` | Slide-over with raw records + CSV export |

### Modified existing files

| File | Change |
|---|---|
| `AliasDictionary.ts` | Add `transaction_type` to `CanonicalField` + `ALIAS_DICTIONARY` |
| `ColumnMapper.ts` | Add `transaction_type` to `ColumnIndex` type |
| `ProviderDetector.ts` | Add "The Orchard" filename + header detection |
| `ProviderStrategy.ts` | Add `'The Orchard'` strategy entry |
| `App.tsx` | Add `/orchard` route |
| `Layout.tsx` | Add Orchard nav link |

---

## Data Models

### StreamCategory

```typescript
// src/royalty-engine/StreamTypeClassifier.ts

export type StreamCategory =
  | 'FULL_PAY'
  | 'FREE_AD_SUPPORTED'
  | 'FREE_TRIAL'
  | 'UNQUALIFIED'
  | 'FRAUDULENT'
  | 'OTHER'
  | 'UNKNOWN'
```

### OrchardRecord

Extends the existing `ParsedRow` shape without modifying it. `OrchardRecord` is a separate type used only in the Orchard pipeline.

```typescript
// src/royalty-engine/StreamTypeClassifier.ts

export interface OrchardRecord {
  // ── Inherited from ParsedRow ──────────────────────────────
  net_total:      number      // revenue for this row
  gross_total:    number
  taxes:          number
  currency:       string
  artist:         string
  track:          string
  album:          string
  upc:            string
  isrc:           string
  platform:       string      // DSP name
  country:        string      // expanded from ISO-2 if needed
  quantity:       number      // stream count
  sale_period:    string

  // ── Orchard-specific fields ───────────────────────────────
  rawStreamType:          string         // literal value from report, never modified
  normalizedStreamType:   StreamCategory // assigned by StreamTypeClassifier
  rowIndex:               number         // 1-based row index in source file
  sourceFile:             string         // original filename
}
```

### FilterState

```typescript
// src/lib/orchard-analytics.ts

export interface FilterState {
  period:               string | null   // e.g. "2024-01"
  platform:             string | null
  country:              string | null
  artist:               string | null
  track:                string | null
  release:              string | null   // album name
  isrc:                 string | null
  upc:                  string | null
  normalizedStreamType: StreamCategory | null
  rawStreamType:        string | null   // literal value match
}
```

All non-null filters combine with AND logic. A null value means "no filter on this dimension".

---

## StreamTypeClassifier

### File: `src/royalty-engine/StreamTypeClassifier.ts`

Classification is based solely on `rawStreamType` string matching. No other field is ever consulted.

```typescript
const FULL_PAY_PATTERNS = [
  'subscription audio stream', 'premium', 'paid subscription',
  'full pay', 'paid', 'subscription'
]

const FREE_AD_PATTERNS = [
  'ad-supported audio stream', 'ad supported', 'free',
  'avod', 'ad-supported'
]

const FREE_TRIAL_PATTERNS = [
  'free trial', 'trial', 'trial subscription', 'promotional trial'
]

const UNQUALIFIED_PATTERNS = [
  'unqualified audio stream', 'unqualified stream',
  'non-qualified', 'no qualifying stream', 'unqualified'
]

const FRAUDULENT_PATTERNS = [
  'fraudulent stream', 'fraud', 'artificial stream',
  'invalid stream', 'fraudulent'
]
```

**Algorithm** (order matters — more specific patterns first):

```
classify(raw: string): StreamCategory
  if raw is empty/null → UNKNOWN
  normalized = raw.trim().toLowerCase()
  if matches FRAUDULENT_PATTERNS → FRAUDULENT   (checked before UNQUALIFIED)
  if matches UNQUALIFIED_PATTERNS → UNQUALIFIED
  if matches FREE_TRIAL_PATTERNS → FREE_TRIAL    (checked before FREE_AD)
  if matches FREE_AD_PATTERNS → FREE_AD_SUPPORTED
  if matches FULL_PAY_PATTERNS → FULL_PAY
  → OTHER (known value but no category match)
```

Pattern matching uses `normalized.includes(pattern)` after lowercasing both sides. The order is critical: FRAUDULENT before UNQUALIFIED prevents "fraudulent unqualified" from landing in UNQUALIFIED; FREE_TRIAL before FREE_AD_SUPPORTED prevents "free trial" matching "free".

**Key invariants:**
- FREE_TRIAL and FREE_AD_SUPPORTED are mutually exclusive (ensured by check order)
- FRAUDULENT and UNQUALIFIED are mutually exclusive (ensured by check order)
- Classification never reads `net_total`, `country`, `platform`, or `quantity`

---

## AliasDictionary Extension

Add `transaction_type` as a new `CanonicalField` in `AliasDictionary.ts`:

```typescript
// Add to CanonicalField union:
| 'transaction_type'

// Add to ALIAS_DICTIONARY:
transaction_type: [
  'transaction type',
  'usage type',
  'stream type',
  'subscription type',
  'transaction type description',
  'play type',
  'stream category',
  'transactiontype',
  'usagetype',
  'streamtype',
  'subscriptiontype',
]
```

Add `transaction_type` to `ColumnIndex` in `ColumnMapper.ts` so it is mapped and available during row extraction.

---

## ProviderDetector Extension

Add detection logic for "The Orchard" in `ProviderDetector.ts`:

- **Filename match**: filename contains "orchard" (case-insensitive)
- **Header match**: headers contain any of: "transaction type", "usage type", "stream type", "subscription type" AND platform-like column is present

Detection priority: filename match takes precedence over header match.

---

## ProviderStrategy Extension

Add to `PROVIDER_STRATEGIES` in `ProviderStrategy.ts`:

```typescript
'The Orchard': {
  paymentColumn: 'net_revenue',
  defaultCurrency: 'USD',
  earningsCandidates: ['netrevenue', 'revenue', 'royalty', 'amount']
}
```

---

## OrchardRecord Conversion

After `parseFile()` returns a `RUPEResult`, a converter function produces `OrchardRecord[]`:

```typescript
// src/royalty-engine/StreamTypeClassifier.ts

export function toOrchardRecords(
  result: RUPEResult,
  rawHeaders: string[],
  rawRows: string[][],   // original rows from file (for rawStreamType extraction)
  transactionTypeColIdx: number | null,
  fileName: string
): OrchardRecord[]
```

For each `ParsedRow` at index `i`:
- `rowIndex` = `i + 2` (1-based, accounting for header row)
- `sourceFile` = `fileName`
- `rawStreamType` = raw cell value from `rawRows[i][transactionTypeColIdx]`, or `""` if column absent
- `normalizedStreamType` = `classify(rawStreamType)`
- All other fields copied from `ParsedRow`

Raw rows must be captured during parsing. The `UniversalParser` already collects `first20`/`last20`; for Orchard files, the full raw row array must be accessible. This is done by passing raw rows through a dedicated hook rather than modifying `ParsedRow` globally.

---

## OrchardAnalytics Module

### File: `src/lib/orchard-analytics.ts`

Pure functions only — no React, no side effects, no imports from UI layer.

### applyFilters

```typescript
export function applyFilters(
  records: OrchardRecord[],
  filters: FilterState
): OrchardRecord[]
```

Applies all non-null filter fields with AND logic. String comparisons are case-insensitive exact matches (except `rawStreamType` which is case-insensitive contains).

### StreamCategoryBreakdown

```typescript
export interface StreamCategoryBreakdown {
  FULL_PAY:         { streams: number; revenue: number }
  FREE_AD_SUPPORTED:{ streams: number; revenue: number }
  FREE_TRIAL:       { streams: number; revenue: number } | null // null = not in report
  UNQUALIFIED:      { streams: number; revenue: number }
  FRAUDULENT:       { streams: number; revenue: number }
  OTHER:            { streams: number; revenue: number }
  UNKNOWN:          { streams: number; revenue: number }
  total:            { streams: number; revenue: number }
  monetizable:      { streams: number; revenue: number } // FULL_PAY + FREE_AD_SUPPORTED where revenue > 0
}
```

`FREE_TRIAL` is `null` when no record in the dataset has `normalizedStreamType === 'FREE_TRIAL'`.

### computeBreakdown

```typescript
export function computeBreakdown(records: OrchardRecord[]): StreamCategoryBreakdown
```

Iterates records once, accumulating streams and revenue per category.

### PlatformSummary

```typescript
export interface PlatformSummary {
  platform: string
  breakdown: StreamCategoryBreakdown
  effectivePer1000: number | null  // null when total streams = 0
}

export function computePlatformSummaries(records: OrchardRecord[]): PlatformSummary[]
```

Grouped by `platform`. `effectivePer1000 = (revenue / streams) * 1000`, only when `streams > 0`. Label in UI: "Promedio efectivo según este reporte".

### CountrySummary

```typescript
export interface CountrySummary {
  platform: string
  country: string
  breakdown: StreamCategoryBreakdown
}

export function computeCountrySummaries(records: OrchardRecord[]): CountrySummary[]
```

Grouped by `platform + country` composite key.

### PlatformCountryMatrix

```typescript
export interface MatrixRow {
  platform: string
  country:  string
  breakdown: StreamCategoryBreakdown
}

export function computeMatrix(records: OrchardRecord[]): MatrixRow[]
```

Flat list, one entry per unique `(platform, country)` pair. Used to render the filterable/sortable country × stream type table.

### CatalogSummary

```typescript
export interface ArtistSummary {
  artist: string
  breakdown: StreamCategoryBreakdown
  platforms: PlatformSummary[]
}

export interface TrackSummary {
  track: string
  artist: string
  isrc: string
  breakdown: StreamCategoryBreakdown
  platforms: PlatformSummary[]
}

export interface ReleaseSummary {
  release: string
  artist: string
  upc: string
  breakdown: StreamCategoryBreakdown
}

export function computeArtistSummaries(records: OrchardRecord[]): ArtistSummary[]
export function computeTrackSummaries(records: OrchardRecord[]): TrackSummary[]
export function computeReleaseSummaries(records: OrchardRecord[]): ReleaseSummary[]
```

### NoRoyaltyReport

```typescript
export interface NoRoyaltyEntry {
  normalizedStreamType: StreamCategory
  streams: number
  platform: string
  country: string
  cause: 'UNQUALIFIED' | 'FRAUDULENT' | 'FREE_AD_ZERO' | 'FREE_TRIAL_ZERO' | 'OTHER_ZERO' | 'UNKNOWN_ZERO'
  rowIndexes: number[]
}

export function computeNoRoyaltyReport(records: OrchardRecord[]): NoRoyaltyEntry[]
```

Groups records where `net_total <= 0` by `(normalizedStreamType, platform, country)`.

### ReconciliationResult

```typescript
export interface ReconciliationResult {
  totalStreams:        number
  categorizedStreams:  number
  uncategorizedStreams: number // should be 0
  totalRevenue:       number
  categorizedRevenue: number
  revenueDiscrepancy: number  // abs difference; alert if > 0.01
  byPlatform: Array<{
    platform: string
    streamDelta: number
    revenueDelta: number
  }>
  isClean: boolean // true only if both deltas = 0
}

export function computeReconciliation(records: OrchardRecord[]): ReconciliationResult
```

Stream reconciliation: `total = FULL_PAY + FREE_AD + FREE_TRIAL + UNQUALIFIED + FRAUDULENT + OTHER + UNKNOWN`. Revenue reconciliation with $0.01 tolerance.

### Rankings

```typescript
export function rankByRevenue<T extends { breakdown: StreamCategoryBreakdown }>(
  items: T[]
): T[]  // sorted descending by total revenue

export function computeRankings(records: OrchardRecord[]): {
  platforms: PlatformSummary[]
  countries: CountrySummary[]
  artists:   ArtistSummary[]
  tracks:    TrackSummary[]
}
```

### DateRange

```typescript
export function getDateRange(records: OrchardRecord[]): {
  min: string
  max: string
} | null
```

Returns min/max `sale_period` across all records. Returns `null` if records is empty.

---

## UI Components

### OrchardReportPage

Main page component. Owns: `OrchardRecord[]` state, `FilterState` state, selected-metric state for drill-down, active tab state.

```
OrchardReportPage
├── OrchardUploadPanel          (shown when no records loaded)
│   └── FileDropZone
├── OrchardFilterBar            (shown when records loaded)
├── TabBar
│   ├── Dashboard tab → OrchardDashboardTab
│   ├── Platforms tab → OrchardPlatformsTab
│   ├── Countries tab → OrchardCountriesTab
│   ├── Catalog tab   → OrchardCatalogTab
│   ├── No Royalty tab → OrchardNoRoyaltyTab
│   └── Reconciliation tab → OrchardReconciliationTab
└── OrchardDrillDownDrawer      (overlay, shown on metric click)
```

All tab components receive `records: OrchardRecord[]` (already filtered by `applyFilters`) and do not call analytics functions directly — the page pre-computes analytics results and passes them as props.

### OrchardFilterBar

Renders active filter chips. Each chip has an × button to remove that filter. "Clear all" button. Inputs: dropdowns/text fields for each `FilterState` field, populated from distinct values in `records`.

### OrchardDashboardTab

- Global `StreamCategoryBreakdown` summary cards
- Date range badge (or "Multiple periods")
- Platform ranking table (sortable by revenue, streams)
- Country ranking table
- Artist ranking table
- Track ranking table

### OrchardPlatformsTab

- Accordion or table: one row per platform
- Columns: Platform, Total Streams, FULL_PAY, FREE_AD_SUPPORTED, FREE_TRIAL (N/I if null), UNQUALIFIED, FRAUDULENT, Revenue, Avg/1000
- Click on a row → expand to country breakdown for that platform

### OrchardCountriesTab

- MatrixRow table: Platform | Country | Total | FULL_PAY | FREE_AD | FREE_TRIAL | UNQUALIFIED | FRAUDULENT | Revenue
- FREE_TRIAL column shows "N/I" when null
- Filterable column headers (client-side sort)
- Totals row pinned at bottom

### OrchardCatalogTab

- Primary hierarchy: Artist → Release → Track
- Each level shows `StreamCategoryBreakdown` inline
- Secondary view toggle: Platform → Country → Stream Type → Records

### OrchardNoRoyaltyTab

- Groups by `normalizedStreamType` + platform + country
- Columns: Category, Cause, Platform, Country, Streams, Revenue (always 0 or negative)
- Cause labels: UNQUALIFIED → "No calificó", FRAUDULENT → "Fraude detectado", FREE_AD_ZERO → "Ad-Supported sin monetizar", etc.

### OrchardReconciliationTab

- Stream reconciliation: total vs sum of categories, delta highlighted in red if ≠ 0
- Revenue reconciliation: total vs categorized sum, warning if delta > $0.01
- Per-platform reconciliation table
- "No issues found" state when `isClean = true`

### OrchardDrillDownDrawer

Slide-over panel. Triggered by clicking any metric. Shows:
- Metric label + computed value
- Table of matching `OrchardRecord[]`: rowIndex, sourceFile, platform, country, artist, track, rawStreamType, normalizedStreamType, quantity, net_total
- Row count badge
- Export CSV button (downloads filtered records)

---

## File Parsing for Orchard

The `UniversalParser` is not modified. Instead, a wrapper function handles Orchard-specific extraction:

```typescript
// src/royalty-engine/StreamTypeClassifier.ts

export async function parseOrchardFile(file: File): Promise<{
  records: OrchardRecord[]
  unmappedColumns: string[]
  importLog: string[]
}>
```

Internally:
1. Calls `parseFile(file)` → `RUPEResult`
2. Re-reads raw rows from file to extract `rawStreamType` values (PapaParse/XLSX again, or cache raw rows during step 1 via a lightweight second pass)
3. Calls `mapColumns` to find `transaction_type` column index
4. Calls `toOrchardRecords()` to build `OrchardRecord[]`
5. Returns records + unmapped column names + import log strings

For TSV/XLSX files from The Orchard the second pass is lightweight (headers already known). To avoid double-parsing large files, the raw row array can be captured during step 1 by reading raw rows before calling `parseFile` for the text/num extraction.

---

## Property-Based Testing

### File: `src/royalty-engine/__tests__/StreamTypeClassifier.pbt.test.ts`

Using `fast-check`:

#### Property 1 — Classification Exhaustiveness
Every non-empty string produces exactly one category (never throws):
```
∀ s: string → classify(s) ∈ StreamCategory
```

#### Property 2 — Mutual Exclusivity: FREE_TRIAL vs FREE_AD_SUPPORTED
```
∀ s: string → NOT (classify(s) === 'FREE_TRIAL' AND classify(s) === 'FREE_AD_SUPPORTED')
```
(Trivially true by return type, but explicitly tested with strings containing both "free" and "trial".)

#### Property 3 — FRAUDULENT / UNQUALIFIED Separation
```
∀ s: string → NOT (classify(s) === 'FRAUDULENT' AND classify(s) === 'UNQUALIFIED')
```

#### Property 4 — No Side Effects on Input
```
∀ record: OrchardRecord →
  let copy = {...record}
  classify(record.rawStreamType)
  record deep-equals copy
```

### File: `src/lib/__tests__/orchard-analytics.pbt.test.ts`

#### Property 5 — Stream Reconciliation Invariant
```
∀ records: OrchardRecord[] →
  sum(records, r => r.quantity)
  ===
  sum(FULL_PAY) + sum(FREE_AD) + sum(FREE_TRIAL) + sum(UNQUALIFIED) + sum(FRAUDULENT) + sum(OTHER) + sum(UNKNOWN)
```

#### Property 6 — Revenue Reconciliation Invariant
```
∀ records: OrchardRecord[] →
  abs(
    sum(records, r => r.net_total)
    - (sum_FULL_PAY + sum_FREE_AD + sum_FREE_TRIAL + sum_UNQUALIFIED + sum_FRAUDULENT + sum_OTHER + sum_UNKNOWN)
  ) <= 0.01
```

#### Property 7 — Filter Monotonicity
Adding a filter never produces more records:
```
∀ records, filters, extraFilter →
  applyFilters(records, {...filters, ...extraFilter}).length
  <= applyFilters(records, filters).length
```

#### Property 8 — Platform Summary Completeness
Every platform in records appears in `computePlatformSummaries`:
```
∀ records: OrchardRecord[] →
  Set(records.map(r => r.platform))
  ⊆ Set(computePlatformSummaries(records).map(s => s.platform))
```

#### Property 9 — Drill-Down Traceability
For any metric computed from a subset of records, the `rowIndex` values in the subset are a subset of all `rowIndex` values in `records`:
```
∀ records, filters →
  applyFilters(records, filters).map(r => r.rowIndex)
  ⊆ records.map(r => r.rowIndex)
```

---

## Correctness Properties

### Property 1: Classification never reads revenue/country/platform
`classify()` accepts only `rawStreamType: string`. It has no access to any other field. Enforced by function signature in `StreamTypeClassifier.ts`.

**Validates: Requirements 3.9, 16.1**

### Property 2: FREE_TRIAL and FREE_AD_SUPPORTED are mutually exclusive
FREE_TRIAL patterns are checked before FREE_AD patterns in `classify()`. A string matching "free trial" returns FREE_TRIAL and never reaches the FREE_AD check. Verified by PBT Property 2.

**Validates: Requirements 3.4, 16.5**

### Property 3: FRAUDULENT and UNQUALIFIED are mutually exclusive
FRAUDULENT patterns are checked before UNQUALIFIED in `classify()`. Verified by PBT Property 3.

**Validates: Requirements 3.6**

### Property 4: Σ(stream categories) = total streams
`computeReconciliation()` computes this sum and exposes `uncategorizedStreams`. Any gap triggers a visible alert in `OrchardReconciliationTab`. Verified by PBT Property 5.

**Validates: Requirements 4.1, 11.1, 11.2**

### Property 5: Revenue delta across categories ≤ $0.01
`computeReconciliation()` checks absolute difference with $0.01 tolerance. Verified by PBT Property 6.

**Validates: Requirements 12.1, 12.2**

### Property 6: Filters combine with AND
`applyFilters()` evaluates each non-null `FilterState` field sequentially against each record; a record is included only if all checks pass. Verified by PBT Property 7.

**Validates: Requirements 14.2, 14.3**

### Property 7: rawStreamType is never mutated
`OrchardRecord` fields are plain values (not references). `classify()` operates on the string value and returns a new value; it does not write back. Verified by PBT Property 4.

**Validates: Requirements 1.5, 16.3**

### Property 8: Every metric is traceable to specific rowIndex values
`OrchardDrillDownDrawer` receives the exact `OrchardRecord[]` slice that produced the metric. The `rowIndex` field on each record identifies its position in the source file. No aggregation discards row-level identity.

**Validates: Requirements 15.1, 15.2, 18.2, 18.3**

### Property 9: FREE_TRIAL shows N/I when absent from report
`breakdown.FREE_TRIAL === null` when no record has `normalizedStreamType === 'FREE_TRIAL'`. All display components check this before rendering and show "N/I" (No Identificado) instead of 0.

**Validates: Requirements 3.3, 5.3, 7.2**

### Property 10: effectivePer1000 is only shown when streams > 0
`computePlatformSummaries()` sets `effectivePer1000 = null` when total streams = 0. UI components null-check before rendering the value.

**Validates: Requirements 5.4, 8.2**

---

## Error Handling

| Scenario | Detection | Response |
|---|---|---|
| File has no `transaction_type` column | `transactionTypeColIdx === null` after `mapColumns` | All records get `rawStreamType: ""`, `normalizedStreamType: 'UNKNOWN'`; import log warns "Columna de tipo de stream no encontrada" |
| Unknown `transaction_type` value | `classify()` falls through all patterns | Assigns `OTHER`, preserves literal value in `rawStreamType`, logs in import log |
| Empty/null `transaction_type` cell | `raw.trim() === ""` guard in `classify()` | Assigns `UNKNOWN`; import log entry with `rowIndex` |
| Revenue column not found | Existing `ColumnMapper` warning path | `net_total = 0` for all rows; `OrchardReconciliationTab` shows revenue column missing alert |
| File parsing failure (corrupt XLSX, wrong encoding) | Caught in `parseOrchardFile()` try/catch | Returns `{ records: [], unmappedColumns: [], importLog: ["Error: <message>"] }`; UI shows error state in `OrchardUploadPanel` |
| Revenue reconciliation discrepancy > $0.01 | `computeReconciliation()` | `isClean = false`; `OrchardReconciliationTab` shows warning with exact delta amount |
| Stream reconciliation gap ≠ 0 | `computeReconciliation()` | `uncategorizedStreams > 0`; reconciliation tab shows "Existen N streams no clasificados" alert |
| Filters produce empty result set | `applyFilters()` returns `[]` | All tabs show empty-state message; `OrchardFilterBar` shows active filter chips so user can clear them |

### Classification Safety Rules

The classifier must never throw. All edge cases collapse to a safe category:
- `null` / `undefined` → treated as `""` → `UNKNOWN`
- Only-whitespace string → trimmed to `""` → `UNKNOWN`
- Numeric value coerced to string → no pattern match → `OTHER`
- Extremely long string → same pattern matching, no truncation

---

## Testing Strategy

### Unit Tests

Each pure function in `orchard-analytics.ts` and `StreamTypeClassifier.ts` gets deterministic unit tests with known input → expected output fixtures.

Key cases for `classify()`:
- Exact canonical Orchard values: "Subscription Audio Streams", "Ad-Supported Audio Streams", "Free Trial", "Unqualified Audio Streams", "Fraudulent Streams"
- Case variants: "PREMIUM", "ad supported", "FREE TRIAL"
- Ambiguous strings: "free" (→ FREE_AD_SUPPORTED, not FREE_TRIAL), "fraud unqualified" (→ FRAUDULENT, not UNQUALIFIED)
- Empty/null/whitespace → UNKNOWN
- Truly unknown value → OTHER

Key cases for `computeReconciliation()`:
- All records classified → `uncategorizedStreams = 0`, `isClean = true`
- Floating point revenue sum — use tolerance check not strict equality

### Property-Based Tests

Described in the [Property-Based Testing](#property-based-testing) section above. Run with `vitest` + `fast-check`. PBT tests live in:
- `src/royalty-engine/__tests__/StreamTypeClassifier.pbt.test.ts`
- `src/lib/__tests__/orchard-analytics.pbt.test.ts`

### Integration Tests

`parseOrchardFile()` tested against fixture TSV/CSV files representing known Orchard report shapes:
- Standard TSV with "Transaction Type" column
- Report using "Usage Type" column name variant
- Report with no stream type column (all UNKNOWN)
- Report with mixed known + unknown stream type values

### Component Tests

`OrchardReconciliationTab`: renders alert when `isClean = false`, renders success state when `isClean = true`.  
`OrchardFilterBar`: removing a filter chip calls the correct state setter.  
`OrchardDrillDownDrawer`: export CSV button generates correct CSV output from `OrchardRecord[]`.

---

## Integration Points with Existing System

| Existing module | Change |
|---|---|
| `AliasDictionary.ts` | Add `transaction_type` canonical field + aliases |
| `ColumnMapper.ts` | Minor: add `transaction_type` to `ColumnIndex` type |
| `ProviderDetector.ts` | Add "The Orchard" detection rules |
| `ProviderStrategy.ts` | Add "The Orchard" strategy entry |
| `App.tsx` / router | Add route for `/orchard` → `OrchardReportPage` |
| `Layout.tsx` | Add nav link for Orchard analyzer |

All other existing modules (`UniversalParser`, `MoneyParser`, `DecimalAccumulator`, etc.) are unchanged.

---

## Key Design Decisions

**1. OrchardRecord as a separate type (not extending ParsedRow globally)**
Adding `rawStreamType`/`normalizedStreamType`/`rowIndex`/`sourceFile` to the global `ParsedRow` would require changes in every existing consumer. A separate `OrchardRecord` type keeps the Orchard pipeline isolated.

**2. Pure analytics module**
`orchard-analytics.ts` has no React imports and no side effects. This makes it trivially testable with PBT and reusable from any context.

**3. Classification by pattern matching, not enums**
The Orchard occasionally changes column value strings between report periods. Pattern matching (`includes`) is more resilient than exact-match enums and covers minor phrasing variations.

**4. FREE_TRIAL defaults to null (not 0)**
`null` signals "this category was not present in the report at all", which is semantically different from "present but zero streams". This prevents the UI from showing 0 Free Trial when in reality the report has no such concept.

**5. No database persistence in v1**
All `OrchardRecord[]` live in React state for the browser session. Supabase persistence is deferred; the design is compatible with adding it later by serializing `OrchardRecord[]` as JSON rows.
