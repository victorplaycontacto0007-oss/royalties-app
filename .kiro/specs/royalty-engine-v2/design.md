# Design Document — Royalty Engine V2.0

## Components and Interfaces

See detailed component designs below in each section.

## Overview

Royalty Engine V2.0 (RUPE V2) es una actualización mayor del motor de importación y auditoría ya existente en `src/royalty-engine/`. La arquitectura central de V1 se conserva íntegramente; V2 agrega las capas que faltan: estrategias por proveedor, validación de filas, modo debug, auditoría persistente, historial de importaciones, soporte ODS y precisión decimal garantizada.

El motor se ejecuta 100% en el cliente (browser) usando Web Workers para los archivos grandes. La persistencia usa Supabase (Postgres + Storage) con RLS.

---

## Architecture

### Processing Pipeline

```
File Input
    │
    ▼
[1] FormatDetector       → ext, mime type → reject si no soportado
    │
    ▼
[2] EncodingDetector     → UTF-8 / BOM / Latin1 / CP1252 / UTF-16
    │
    ▼
[3] SeparatorDetector    → , ; TAB |  (solo text-based)
    │
    ▼
[4] FileReader           → textRows[][]  +  numRows[][]  (dual-pass Excel)
    │
    ▼
[5] HeaderFinder         → headerIdx (escanea 40 primeras filas)
    │
    ▼
[6] HeaderNormalizer     → normalized headers[]
    │
    ▼
[7] ProviderDetector     → provider: string
    │
    ▼
[8] ProviderStrategy     → earningsCol: string[]  (lista priorizada)
    │
    ▼
[9] ColumnMapper         → ColumnIndex (campo → índice columna)
    │
    ▼
[10] RowValidator        → ValidationResult por fila
    │
    ▼
[11] RowProcessor        → ParsedRow[] (streaming, chunks de 1000)
         │
         ├── MoneyParser    → Decimal(20,8) safe accumulation
         ├── DateParser     → YYYY-MM
         └── CountryExpander → ISO-2 → nombre completo
    │
    ▼
[12] StatsComputer       → RUPEStats + AuditReport + DebugSnapshot
    │
    ▼
[13] AuditValidator      → status: 'valid' | 'discrepancy'
    │
    ▼
[14] DatabasePersister   → reports + royalty_records (batches 1000, concurrency 5)
    │
    ▼
[15] UIRenderer          → UploadPage: resumen, auditoría, "Ver Auditoría"
```

### Module Map (src/royalty-engine/)

| Archivo | Rol V1 | Cambios V2 |
|---|---|---|
| `UniversalParser.ts` | Core parse loop | Agregar streaming chunks, debug snapshot, provider strategy hook |
| `AliasDictionary.ts` | Aliases centrales | Agregar aliases faltantes (partner_revenue, net_payable, etc.) |
| `ColumnMapper.ts` | Header → índice | Agregar `selectEarningsColumn(provider, colIndex)` |
| `ProviderDetector.ts` | Detecta proveedor | Agregar signals TikTok, Meta, UnitedMasters, FUGA, RouteNote, etc. |
| `ProviderStrategy.ts` | **NUEVO** | Tabla de estrategias por proveedor → lista priorizada de campos |
| `HeaderNormalizer.ts` | Normaliza headers | Sin cambios (ya cumple V2) |
| `HeaderFinder.ts` | Encuentra header row | Ampliar a 40 filas (ya está), agregar log si usa fila 0 |
| `MoneyParser.ts` | Parsea números | Agregar MXN al strip; retornar string para acumulación decimal-safe |
| `DecimalAccumulator.ts` | **NUEVO** | Acumulación Decimal(20,8) sin float drift |
| `RowValidator.ts` | **NUEVO** | Valida cada fila: vacíos, texto en numérico, negativo, duplicados, moneda |
| `CurrencyDetector.ts` | Detecta moneda | Agregar frecuency-wins para multi-currency; warning si USD default |
| `SeparatorDetector.ts` | Detecta separador | Agregar fallback explícito a `,` con log |
| `DateParser.ts` | Normaliza período | Sin cambios |
| `Statistics.ts` | Calcula stats | Agregar totalDownloads, byAlbum top, audit metadata |
| `AuditReport.ts` | **NUEVO** | Genera y persiste AuditReport + DebugSnapshot |
| `Logger.ts` | Log entries | Agregar summary con rows processed/skipped/errors |
| `index.ts` | Exports | Agregar exports nuevos manteniendo API V1 |

---

## Component Design

### 1. ProviderStrategy.ts (nuevo)

Tabla central que define, por proveedor, qué campos buscar en orden de prioridad para calcular `net_total`.

```typescript
export type ProviderName = 
  | 'Ditto' | 'DistroKid' | 'TuneCore' | 'ONErpm' | 'Believe'
  | 'CD Baby' | 'Symphonic' | 'UnitedMasters' | 'FUGA' | 'RouteNote'
  | 'Too Lost' | 'Amuse' | 'Spotify' | 'Apple Music' | 'Amazon Music'
  | 'Tidal' | 'YouTube' | 'TikTok' | 'Meta' | 'UNKNOWN'

export interface ProviderStrategyEntry {
  /** Canonical field names to try in order. First one found in the file wins. */
  earningsCandidates: string[]
  /** For Ditto: also capture currency_net_total as secondary */
  secondaryField?: string
}

export const PROVIDER_STRATEGIES: Record<ProviderName, ProviderStrategyEntry> = {
  Ditto:          { earningsCandidates: ['nettotal'],                                              secondaryField: 'currencynettotal' },
  DistroKid:      { earningsCandidates: ['netearnings', 'royaltyamount', 'payment'] },
  TuneCore:       { earningsCandidates: ['netrevenue', 'royaltyamount', 'netamount'] },
  ONErpm:         { earningsCandidates: ['netrevenue', 'amount', 'royalty'] },
  Believe:        { earningsCandidates: ['netamount', 'royalty'] },
  'CD Baby':      { earningsCandidates: ['netpayable', 'netearnings'] },
  Symphonic:      { earningsCandidates: ['netrevenue'] },
  UnitedMasters:  { earningsCandidates: ['royaltyamount'] },
  FUGA:           { earningsCandidates: ['royaltyamount'] },
  RouteNote:      { earningsCandidates: ['netamount'] },
  'Too Lost':     { earningsCandidates: ['netrevenue', 'royalty'] },
  Amuse:          { earningsCandidates: ['netrevenue'] },
  Spotify:        { earningsCandidates: ['royalty', 'revenue'] },
  'Apple Music':  { earningsCandidates: ['royalty', 'netamount'] },
  'Amazon Music': { earningsCandidates: ['royalty'] },
  Tidal:          { earningsCandidates: ['royalty'] },
  YouTube:        { earningsCandidates: ['partnerrevenue', 'netrevenue', 'royalty'] },
  TikTok:         { earningsCandidates: ['royalty', 'netrevenue'] },
  Meta:           { earningsCandidates: ['royalty', 'netrevenue'] },
  UNKNOWN:        { earningsCandidates: ['nettotal', 'royalty', 'netrevenue', 'netearnings', 'netamount'] },
}

/**
 * Given a provider and the normalized column headers, returns
 * the column index to use for earnings, plus which candidate matched.
 */
export function resolveEarningsColumn(
  provider: ProviderName,
  normalizedHeaders: string[],
  logger: Logger
): { colIdx: number | null; fieldUsed: string | null }
```

**Regla clave:** Esta función resuelve la columna correcta y registra en el Logger exactamente qué columna fue encontrada y cuál estrategia se usó. Si ningún candidato se encuentra, hace fallback a `AliasDictionary` para `net_total` y loguea un error.

---

### 2. DecimalAccumulator.ts (nuevo)

Evita el drift de punto flotante al acumular miles de valores pequeños.

```typescript
/**
 * Accumulates monetary values using integer arithmetic scaled by 1e8
 * to achieve Decimal(20,8) precision without a BigDecimal library.
 * 
 * Strategy: store cents as BigInt (scaled × 10^8), convert to display
 * string only at the end.
 */
export class DecimalAccumulator {
  private total: bigint = 0n

  add(value: number): void {
    // Scale to 8 decimal places using string rounding to avoid float artifacts
    const scaled = Math.round(value * 1e8)
    this.total += BigInt(scaled)
  }

  /** Returns the total as a number (safe for values < 2^53 / 1e8 ≈ 90 trillion) */
  toNumber(): number {
    return Number(this.total) / 1e8
  }

  /** Returns a fixed-8 string for storage */
  toFixed8(): string {
    const abs = this.total < 0n ? -this.total : this.total
    const sign = this.total < 0n ? '-' : ''
    const str = abs.toString().padStart(9, '0')
    const int = str.slice(0, -8) || '0'
    const dec = str.slice(-8)
    return `${sign}${int}.${dec}`
  }

  reset(): void { this.total = 0n }
}
```

---

### 3. RowValidator.ts (nuevo)

```typescript
export interface ValidationIssue {
  rowIndex: number
  type: 'empty_field' | 'non_numeric' | 'negative' | 'duplicate' | 'currency_mismatch' | 'corrupt'
  field: string
  message: string
}

export interface ValidationResult {
  issues: ValidationIssue[]
  isSkipped: boolean   // true solo si corrupt (wrong column count)
}

export class RowValidator {
  private seen = new Set<string>()
  private expectedColCount: number
  private fileCurrency: string

  constructor(expectedColCount: number, fileCurrency: string) {
    this.expectedColCount = expectedColCount
    this.fileCurrency = fileCurrency
  }

  validate(row: string[], rowIndex: number, colMap: ColumnIndex): ValidationResult
}
```

**Checks implementados:**
1. `corrupt` — `row.length !== expectedColCount` → skip row
2. `empty_field` — campos requeridos vacíos → log + continuar con default
3. `non_numeric` — columna monetaria contiene texto no parseable → log + usar 0
4. `negative` — `net_total < 0` → log + incluir fila
5. `duplicate` — clave `${artist}|${track}|${platform}|${country}|${period}|${net}` ya vista → log
6. `currency_mismatch` — columna currency ≠ fileCurrency → log por fila (no por archivo)

---

### 4. AuditReport.ts (nuevo)

```typescript
export interface AuditReport {
  // Metadata
  provider:          string
  fileName:          string
  reportedMonth:     string   // YYYY-MM del período más frecuente
  reportedYear:      string
  currency:          string
  // Counts
  totalRows:         number
  totalColumns:      number
  errorRows:         number
  // Financials (Decimal(20,8) stored as strings)
  grossTotal:        string
  taxes:             string
  channelCosts:      string
  otherCosts:        string
  netTotal:          string
  // Status
  status:            'valid' | 'discrepancy' | 'error'
  discrepancyNote:   string | null
  // Timing
  processingTimeMs:  number
  createdAt:         string   // ISO UTC
}

export interface DebugSnapshot {
  provider:          string
  columnMap:         Record<string, { colIdx: number; header: string }>
  earningsColUsed:   string
  earningsColIdx:    number
  first20Rows:       string[][]
  last20Rows:        string[][]
  accumulatedNet:    string
  validationErrors:  ValidationIssue[]
}
```

---

### 5. UniversalParser.ts — cambios V2

**parseFile() V2 signature (backward compatible):**

```typescript
export async function parseFile(
  file: File,
  options?: {
    onProgress?: (processed: number, total: number) => void
    maxFileSizeBytes?: number  // default: 1_073_741_824 (1 GB)
  }
): Promise<RUPEResult>

export interface RUPEResult {
  rows:          ParsedRow[]
  stats:         RUPEStats
  audit:         AuditReport      // NUEVO en V2
  debug:         DebugSnapshot    // NUEVO en V2
}
```

**Flujo interno V2:**

```
1. Verificar tamaño → reject si > maxFileSizeBytes
2. Detectar encoding (bytes BOM / chardet heuristic)
3. Leer archivo:
   - XLSX/XLS/ODS: dual-pass (raw:false + raw:true), sheet con más filas
   - CSV/TSV/TXT: streaming con Papa.parse({chunk, chunkSize: 16384})
4. findHeaderRow() → headerIdx
5. normalizeHeaders() → normalizedHeaders[]
6. detectProvider(fileName, normalizedHeaders)
7. resolveEarningsColumn(provider, normalizedHeaders) → earningsColIdx
8. mapColumns() → ColumnIndex completo
9. detectCurrency() → fileCurrency (frequency-wins)
10. Inicializar:
    - DecimalAccumulator para net, gross, taxes, costs
    - RowValidator(expectedColCount, fileCurrency)
    - Arrays first20/last20 para DebugSnapshot
11. Loop rows (streaming, chunks de 1000):
    a. validate() → si corrupt: skip + log; si warnings: log + continuar
    b. extractRow() → ParsedRow
    c. accumulator.add(row.net_total)
    d. Emitir onProgress cada 10.000 filas
12. computeStats() usando accumulated values
13. Construir AuditReport (status = comparar accumulated == resum)
14. Construir DebugSnapshot
15. Retornar { rows, stats, audit, debug }
```

---

### 6. Statistics.ts — cambios V2

Agregar a `RUPEStats`:

```typescript
export interface RUPEStats {
  // ... todo V1 existente ...
  
  // V2 additions
  totalDownloads:   number     // suma quantity donde transaction_type = 'download'
  totalOtherCosts:  number     // channel_costs + other_costs separados
  uniqueAlbums:     number     // ya existe, confirmar
  byAlbum:          Array<{ name: string; net: number; streams: number }>  // NUEVO
  auditStatus:      'valid' | 'discrepancy' | 'error'
  processingTimeMs: number
}
```

---

### 7. Streaming para archivos grandes

Para CSV/TSV/TXT se usa `Papa.parse` en modo chunk:

```typescript
// Procesamiento streaming — nunca en memoria completo
Papa.parse(file, {
  delimiter: sep,
  skipEmptyLines: true,
  chunkSize: 16 * 1024,  // 16 KB chunks
  chunk: (results, parser) => {
    for (const row of results.data as string[][]) {
      processRow(row)
    }
    rowsProcessed += results.data.length
    if (rowsProcessed % 10_000 === 0) {
      options?.onProgress?.(rowsProcessed, estimatedTotal)
    }
  },
})
```

Para XLSX/ODS (que no soportan streaming nativo en browser): leer con `XLSX.read` pero procesar en chunks de 1000 filas sin retener el array completo en memoria más allá del chunk actual.

---

## Data Models

### Database Schema — Cambios V2 (aditivos)

```sql
-- Agregar columnas V2 a reports (NUNCA modificar existentes)
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS provider          TEXT,
  ADD COLUMN IF NOT EXISTS currency          TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS net_total         NUMERIC(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_total       NUMERIC(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxes             NUMERIC(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel_costs     NUMERIC(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_costs       NUMERIC(20, 8) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_status      TEXT DEFAULT 'pending'
                             CHECK (audit_status IN ('pending','valid','discrepancy','error')),
  ADD COLUMN IF NOT EXISTS discrepancy_note  TEXT,
  ADD COLUMN IF NOT EXISTS processing_ms     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reported_month    TEXT,
  ADD COLUMN IF NOT EXISTS total_columns     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_rows        INTEGER DEFAULT 0;

-- Índices adicionales
CREATE INDEX IF NOT EXISTS idx_reports_provider     ON public.reports(provider);
CREATE INDEX IF NOT EXISTS idx_reports_audit_status ON public.reports(audit_status);
```

**Nota:** La tabla `royalty_records` **no cambia**. Todos los campos requeridos ya existen.

### TypeScript Types — database.ts

```typescript
// Ampliar el tipo Report existente
export interface ReportV2 extends Report {
  provider:         string | null
  currency:         string
  net_total:        number
  gross_total:      number
  taxes:            number
  channel_costs:    number
  other_costs:      number
  audit_status:     'pending' | 'valid' | 'discrepancy' | 'error'
  discrepancy_note: string | null
  processing_ms:    number
  reported_month:   string | null
  total_columns:    number
  error_rows:       number
}
```

---

## UI Design

### UploadPage.tsx — Estados V2

```
idle          → dropzone
detecting     → leyendo períodos
selecting     → selector de períodos
uploading     → subiendo a Storage
processing    → parseando con RUPE
saving        → insertando en DB (con progreso N/Total)
success       → resumen + botón "Ver Auditoría"
discrepancy   → advertencia de discrepancia + botón "Ver Auditoría"
error         → mensaje error + retry
```

### Componente AuditSummary (nuevo)

Mostrado en estado `success` y `discrepancy`:

```
┌─────────────────────────────────────────────────────────┐
│  ✅ Reporte importado correctamente   [VÁLIDO]           │
│  ─────────────────────────────────────────────────────  │
│  Proveedor    DistroKid        Archivo    earnings.tsv  │
│  Período      2026-03          Moneda     USD           │
│  Filas        45,231           Columnas   18            │
│  ─────────────────────────────────────────────────────  │
│  Total Bruto  $12,450.30       Impuestos  $0.00         │
│  Costos       $0.00            Total Neto $12,450.30    │
│  ─────────────────────────────────────────────────────  │
│  Errores      3 filas          Tiempo     2,341 ms      │
│                                                         │
│           [Ver Auditoría]   [Ver Análisis]              │
└─────────────────────────────────────────────────────────┘
```

### Modal DebugViewer (nuevo, "Ver Auditoría")

```
┌─────────────────────────────────────────────────────────┐
│  🔍 Modo Debug — Auditoría                        [✕]   │
│  ─────────────────────────────────────────────────────  │
│  Proveedor detectado    DistroKid                       │
│  Columna de cálculo     "Earnings (USD)"  [col 8]       │
│                                                         │
│  Columnas detectadas:                                   │
│  net_total → "Earnings (USD)" [8]  ✅                   │
│  artist    → "Artist Name"    [2]  ✅                   │
│  ...                                                    │
│  ─────────────────────────────────────────────────────  │
│  Primeras 20 filas    [tabla scrollable]                │
│  Últimas 20 filas     [tabla scrollable]                │
│  ─────────────────────────────────────────────────────  │
│  Total acumulado      $12,450.29999847                  │
│  Total mostrado       $12,450.30                        │
│  ─────────────────────────────────────────────────────  │
│  Errores (3):                                           │
│  [WARN] fila 142: net_total vacío → usó 0               │
│  [WARN] fila 891: moneda COP ≠ USD                      │
│  [ERROR] fila 2034: fila corrupta (10 cols, esperadas 18)│
└─────────────────────────────────────────────────────────┘
```

---

## Error Handling

| Escenario | Comportamiento |
|---|---|
| Formato no soportado | Error antes de leer. Status `error`. |
| Archivo > límite | Error antes de leer. Muestra tamaño vs. máximo. |
| Encoding detection falla | Usar UTF-8. Log INFO. Continuar. |
| Columna de ganancias no encontrada | Fallback a siguiente candidato. Log WARN. Si ninguno: Log ERROR, total = 0. |
| Fila corrupta (columnas wrongas) | Skip fila. Log ERROR. Contar en error_rows. |
| Fila con valor no numérico | Usar 0. Log WARN. Incluir fila. |
| Total ≠ suma columna | Status `discrepancy`. UI muestra advertencia. NO marcar valid. |
| Insert batch falla | Update report status = error. Stop inserts. Mostrar error. |
| Persist AuditReport falla | Mostrar error en UI pero mostrar AuditReport de todas formas. |

---

## Performance Considerations

- **Streaming CSV**: Papa.parse chunked (16 KB) → nunca > 16 KB en memoria por chunk
- **Excel/ODS**: `XLSX.read` lee completo (limitación de la librería), pero procesa filas en bloques de 1000 sin acumular ParsedRow[] completo
- **DB inserts**: 1000 filas/batch, 5 concurrentes → throughput ~5000 filas/ciclo
- **Progress events**: cada 10.000 filas durante parse; cada batch durante save
- **Límite de filas**: configurado en `MAX_ROWS = 500_000` (subir de 100k a 500k para V2)
- **Límite de archivo**: default 1 GB, configurable

---

## Backward Compatibility

- `parseFile(file)` sigue funcionando exactamente igual que en V1
- `RUPEResult.rows` y `RUPEResult.stats` mantienen misma forma
- `ParsedRow` mantiene todos los campos V1 (incluyendo alias `earnings_usd`, `store`, `artist_name`, `song_title`)
- `RUPEResult.audit` y `RUPEResult.debug` son campos **adicionales** opcionales — no rompen código existente que desestructura `{ rows, stats }`
- El schema DB es aditivo — columnas nuevas en `reports`, ningún cambio en `royalty_records`


---

## Correctness Properties

### Property 1: Decimal Accumulation Precision
`DecimalAccumulator.toNumber()` para N filas con valores `v_i` debe satisfacer `|result - Σv_i| < 1e-8`.
**Validates: Requirements 6.1, 6.2**

### Property 2: No Royalty Recalculation
El total neto nunca puede derivarse de gross − taxes. Solo de sumar la columna de earnings seleccionada por provider strategy.
**Validates: Requirements 4.3, 4.4, 4.5**

### Property 3: Header Normalization Idempotency
`normalizeHeader(normalizeHeader(x)) === normalizeHeader(x)` para todo string x.
**Validates: Requirements 2.1, 2.4**

### Property 4: Provider Strategy First-Match
Si el archivo contiene múltiples candidatos, siempre gana el de menor índice en `earningsCandidates` del provider strategy seleccionado.
**Validates: Requirements 4.1, 4.6**

### Property 5: Backward Compatibility
`parseFile(file)` retorna `{ rows, stats }` con forma idéntica a V1; los campos `audit` y `debug` son aditivos sin breaking changes.
**Validates: Requirements 19.1, 19.2, 19.3**

### Property 6: Discrepancy Detection
Si la diferencia entre accumulated total y re-sum > 1e-8, el status debe ser `discrepancy`, nunca `valid`.
**Validates: Requirements 10.2, 10.3**

---

## Testing Strategy

### Unit tests recomendados

| Módulo | Casos clave |
|---|---|
| `DecimalAccumulator` | 100K valores 0.00000001 → 0.00100000 exacto |
| `MoneyParser` | Todos los formatos del Req 5: 100, 100.55, 100,55, 1,500.50, 1.500,50, 15 000.55, 15 000,55 |
| `HeaderNormalizer` | "Net Total", "NET TOTAL", "net_total", "Net-Total" → todos "nettotal" |
| `RowValidator` | Cada tipo de issue en forma individual y combinada |
| `ProviderStrategy` | Cada proveedor con headers exactos y fallback |
| `AuditReport.buildAuditReport` | status=valid cuando totales coinciden; discrepancy cuando difieren |

### Integration tests recomendados

- CSV DistroKid real → provider correcto, columna correcta, total correcto
- XLSX Ditto real → columna Net Total, secondary currency_net_total
- Archivo con preamble → headerIdx > 0, datos correctos
- Archivo con filas corruptas → skip + error_rows count
- Archivo con multi-currency → frequency-wins + warnings en log
