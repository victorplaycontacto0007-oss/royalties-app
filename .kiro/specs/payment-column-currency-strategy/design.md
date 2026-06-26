# Design Document — payment-column-currency-strategy

## Overview

Esta feature comprende dos módulos interrelacionados del motor de regalías RUPE:

1. **PaymentColumnStrategy** — tabla de configuración explícita en `ProviderStrategy.ts` que asigna, por distribuidora, la **única** columna de pago válida para acumular `net_total`. No se permiten fallbacks automáticos para proveedores conocidos, ni cálculos derivados (sin brutos, sin impuestos, sin conversiones automáticas).

2. **Módulo de Monedas** — detección automática de la columna de moneda, agrupación de filas por moneda usando `DecimalAccumulator` para precisión `Decimal(20,8)`, presentación en la pestaña "Monedas" del detalle de reporte, conversión opcional a moneda destino mediante API de tasas de cambio (solo en acción explícita del usuario), y persistencia de totales por moneda en la tabla `currency_records` de Supabase.

El proyecto es React + TypeScript + Supabase. El motor de regalías reside en `src/royalty-engine/`. **El código central ya existe** (la spec formaliza sus contratos, cierra los gaps detectados y define los criterios de aceptación verificables). El diseño sirve como blueprint de verificación y guía de extensión.

---

## Architecture

### Vista de alto nivel

```
┌────────────────────────────────────────────────────────────────────────┐
│                         parseFile() — UniversalParser                  │
│                                                                        │
│  File → detectProvider() → resolveEarningsColumn() → processRows()     │
│                ↓                       ↓                   ↓           │
│         ProviderDetector        ProviderStrategy     RowValidator       │
│                                 (PaymentColumn)      DecimalAccumulator │
│                                                                        │
│  → groupByCurrency() → CurrencyGrouperResult                           │
│         ↓                                                              │
│   CurrencyGrouper                                                      │
│   (per-group DecimalAccumulators)                                      │
│                                                                        │
│  → computeStats() → RUPEResult { rows, stats, audit, debug }           │
└────────────────────────────────────────────────────────────────────────┘
         │
         │  (user uploads)
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        UploadPage / ReportDetailPage                    │
│                                                                         │
│  RUPEResult.stats.currencyGroups → CurrencyTab                          │
│                                        ↓                                │
│  User clicks "Convertir Totales" → convertCurrencies()                  │
│                                        ↓                                │
│                                  CurrencyConverter                      │
│                                  (open.er-api.com)                      │
│                                        ↓                                │
│                              ConversionResult → CurrencyTab (display)   │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │  (on successful parse)
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Supabase DB                                      │
│                                                                         │
│  reports ─────────────────────────── currency_records                  │
│  (id, provider, currency, …)         (report_id FK, currency, total, …)│
└────────────────────────────────────────────────────────────────────────┘
```

### Principios de diseño

- **Tabla como única fuente de verdad**: toda la configuración por proveedor está en `PROVIDER_STRATEGIES`. El motor no tiene lógica condicional por proveedor fuera de `ProviderStrategy.ts` y `ProviderDetector.ts`.
- **Fallo explícito, sin fallback silencioso**: si un proveedor conocido no tiene su columna de pago en el archivo, el resolver retorna `null` y el parser lanza un error visible. No existe conversión silenciosa a otra columna.
- **Sin mezcla de monedas**: `CurrencyGrouper` acumula totales en acumuladores separados por moneda. La conversión es exclusivamente bajo demanda del usuario.
- **Precisión decimal garantizada**: todos los totales monetarios usan `DecimalAccumulator` (BigInt × 1e8), que evita drift de punto flotante al sumar miles de valores pequeños.

---

## Components and Interfaces

### 1. `ProviderStrategy.ts` — PaymentColumnStrategy

**Responsabilidad**: definir la tabla `PROVIDER_STRATEGIES` y exponer `resolveEarningsColumn()`.

```typescript
// Tipos públicos (ya implementados)
export type ProviderName = 'Dinastía' | 'Ditto' | 'DistroKid' | /* … */ | 'UNKNOWN'

export interface ProviderStrategyEntry {
  paymentColumn:       string          // columna de pago (pre-normalización)
  defaultCurrency?:    string          // ISO-4217, default 'USD'
  earningsCandidates?: string[]        // @deprecated V1 compat
  secondaryField?:     string          // @deprecated Ditto V1
}

export const PROVIDER_STRATEGIES: Record<string, ProviderStrategyEntry>

export function resolveEarningsColumn(
  provider: ProviderName,
  normalizedHeaders: string[],
  logger: Logger,
): { colIdx: number | null; fieldUsed: string | null }
```

**Algoritmo de `resolveEarningsColumn`**:

```
1. Buscar strategy = PROVIDER_STRATEGIES[provider]
2. Si no existe → delegar a UNKNOWN path (warn: proveedor no encontrado)
3. Si provider === 'UNKNOWN' o paymentColumn === '':
     Iterar ALIAS_DICTIONARY['net_total']:
       normalizar alias → buscar en normalizedHeaders
       si encontrado → return { colIdx, fieldUsed }, warn "estrategia genérica en uso"
     Si ninguno → return { colIdx: null, fieldUsed: null }
4. Si proveedor conocido:
     normPayment = normalizeHeader(strategy.paymentColumn)
     Si normPayment ∈ EXCLUDED_COLUMNS → error, return null
     idx = normalizedHeaders.indexOf(normPayment)
     Si idx !== -1 → info log, return { idx, fieldUsed }
     Si idx === -1 → error log, return { colIdx: null, fieldUsed: null }
```

**Tabla PROVIDER_STRATEGIES — 19 proveedores + UNKNOWN + 5 aliases V1**:

| Provider               | paymentColumn                | defaultCurrency |
|------------------------|------------------------------|-----------------|
| Dinastía               | net_total_client_currency    | COP             |
| Ditto                  | net_total                    | USD             |
| DistroKid              | earnings                     | USD             |
| TuneCore               | net_revenue                  | USD             |
| ONErpm                 | net_revenue                  | USD             |
| Believe                | net_amount                   | EUR             |
| CD Baby                | net_payable                  | USD             |
| Symphonic              | net_revenue                  | USD             |
| UnitedMasters          | royalty                      | USD             |
| RouteNote              | net_amount                   | USD             |
| Too Lost               | royalty                      | USD             |
| FUGA                   | royalty_amount               | USD             |
| Amuse                  | net_revenue                  | USD             |
| Spotify Direct         | royalties                    | USD             |
| Apple Music Reports    | royalty                      | USD             |
| Amazon Music Reports   | royalty                      | USD             |
| Tidal Reports          | royalty                      | USD             |
| YouTube Content ID     | partner_revenue              | USD             |
| Meta                   | revenue                      | USD             |
| UNKNOWN                | *(alias fallback)*           | USD             |

### 2. `CurrencyGrouper.ts`

**Responsabilidad**: agrupar `ParsedRow[]` por moneda y calcular totales con `DecimalAccumulator`.

```typescript
export interface CurrencyGroup {
  currency:    string   // ISO code
  total:       number   // DecimalAccumulator.toNumber()
  totalFixed8: string   // DecimalAccumulator.toFixed8() — para BD
  recordCount: number
  percentage:  number   // (groupTotal / globalTotal) * 100
}

export interface CurrencyGrouperResult {
  groups:         CurrencyGroup[]
  currencyColIdx: number | null
}

export function groupByCurrency(
  rows: ParsedRow[],
  rawHeaders: string[],
  provider: ProviderName,
  logger: Logger,
): CurrencyGrouperResult
```

**Algoritmo** (7 pasos):

```
1. Normalizar rawHeaders → buscar columna de moneda en orden:
   ['currency', 'currencycode', 'clientcurrency', 'paymentcurrency', 'settlementcurrency']
2. defaultCurrency = PROVIDER_STRATEGIES[provider]?.defaultCurrency ?? 'USD'
3. Por cada fila:
     rawCode = row.currency ?? ''
     resolved = normalizeCode(rawCode, defaultCurrency)
     Si código desconocido → warn + usar defaultCurrency
4. Acumular row.net_total en Map<currency, DecimalAccumulator>
5. Calcular globalTotal = suma de todos los acumuladores
6. Construir CurrencyGroup[]:
     percentage = globalTotal > 0 ? (groupTotal / globalTotal) * 100 : 0
7. Ordenar descendente por total
```

### 3. `CurrencyConverter.ts`

**Responsabilidad**: obtener tasas de cambio una vez (USD-base) y calcular cross-rates en cliente.

```typescript
export type TargetCurrency = 'USD' | 'EUR' | 'COP' | 'GBP' | 'MXN' | 'CAD' | 'JPY'

export interface ConversionResult {
  targetCurrency: TargetCurrency
  groups: Array<{
    currency:       string
    originalTotal:  number
    convertedTotal: number
    rate:           number
  }>
}

export async function convertCurrencies(
  groups: CurrencyGroup[],
  targetCurrency: TargetCurrency,
  signal?: AbortSignal,
): Promise<ConversionResult>
```

**Fórmula de cross-rate**:
```
rate = rates[targetCurrency] / rates[sourceCurrency]  // ambas vs USD
convertedTotal = round(originalTotal * rate, 2)
```

**Restricciones de invocación**: `convertCurrencies` NUNCA se llama durante el parsing. Solo se invoca desde el handler del botón "Convertir Totales" en `CurrencyTab`.

### 4. `CurrencyTab.tsx`

**Responsabilidad**: mostrar tarjetas por moneda, selector de moneda destino, botón de conversión, resultados.

```typescript
interface CurrencyTabProps {
  groups:           CurrencyGroup[]
  onConvert:        (target: TargetCurrency) => Promise<void>
  converting:       boolean
  conversionResult: ConversionResult | null
  conversionError:  string | null
}
```

**Estado del componente**:
- `target: TargetCurrency` — moneda destino seleccionada (local state)
- El resto del estado (converting, conversionResult, conversionError) es gestionado por el padre (`ReportDetailPage`)

### 5. Supabase — tabla `currency_records`

```sql
CREATE TABLE IF NOT EXISTS public.currency_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id           UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider            TEXT NOT NULL,
  currency            TEXT NOT NULL,
  payment_column_used TEXT NOT NULL,
  total               NUMERIC(20, 8) NOT NULL DEFAULT 0,
  record_count        INTEGER NOT NULL DEFAULT 0,
  import_date         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_currency_records_report_currency
  ON public.currency_records(report_id, currency);
```

**RLS Policies**:
- `SELECT`: `user_id = auth.uid() OR public.is_admin()`
- `INSERT`: `user_id = auth.uid()`

---

## Data Models

### `ParsedRow` (existente, sin cambios)

```typescript
interface ParsedRow {
  net_total:     number
  gross_total:   number
  taxes:         number
  channel_costs: number
  other_costs:   number
  currency:      string   // código ISO o '' cuando no detectado
  artist:        string
  track:         string
  album:         string
  upc:           string
  isrc:          string
  platform:      string
  country:       string
  quantity:      number
  sale_period:   string
  // DB aliases
  artist_name:   string
  song_title:    string
  album_name:    string
  store:         string
  earnings_usd:  number
}
```

### `RUPEStats` — campos agregados por esta feature

```typescript
interface RUPEStats {
  // … campos V1 y V2 existentes …

  // Adicionados por payment-column-currency-strategy:
  currencyGroups:    CurrencyGroup[]  // grupos por moneda (vacío si no calculado)
  paymentColumnUsed: string           // nombre pre-normalización de la columna usada
}
```

### Flujo de datos en `UniversalParser.parseFile()`

```
File
  → detectProvider() → ProviderName
  → resolveEarningsColumn(provider, normalizedHeaders) → { colIdx, fieldUsed }
  → ColumnMapper con colMap.net_total = earningsColIdx
  → processDataRow() × N → ParsedRow[]
  → groupByCurrency(rows, rawHeaders, provider) → CurrencyGrouperResult
  → computeStats(rows, …, currencyGroups, earningsFieldUsed) → RUPEStats
  → RUPEResult { rows, stats, audit, debug }
```

### Registro en BD post-parse

```
RUPEResult.stats.currencyGroups
  → forEach(group):
       INSERT INTO currency_records (
         report_id, user_id, provider,
         currency, payment_column_used,
         total = group.totalFixed8,
         record_count = group.recordCount,
         import_date = NOW()
       )
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: PaymentColumn no está en EXCLUDED_COLUMNS

*Para todo proveedor en `PROVIDER_STRATEGIES` (excluyendo `UNKNOWN`), el `paymentColumn` normalizado NO debe aparecer en `EXCLUDED_COLUMNS`, y NO debe ser igual a `grosstotal`.*

**Validates: Requirements 1.6, 4.2**

---

### Property 2: Proveedores conocidos tienen paymentColumn no-vacío

*Para todo proveedor en `PROVIDER_STRATEGIES` excepto `UNKNOWN`, el campo `paymentColumn` debe ser una cadena no-vacía.*

**Validates: Requirements 1.3**

---

### Property 3: DefaultCurrency correcta para todos los proveedores

*Para todo proveedor en `PROVIDER_STRATEGIES` que NO sea `Dinastía` ni `Believe`, el campo `defaultCurrency` (o ausencia del mismo) implica `USD`. Es decir: `entry.defaultCurrency === undefined || entry.defaultCurrency === 'USD'`.*

**Validates: Requirements 1.5**

---

### Property 4: Resolución determinista — proveedor conocido con columna presente

*Para cualquier proveedor conocido `P` y cualquier array de headers normalizados `H` que contenga el `paymentColumn` normalizado de `P` en la posición `k`, `resolveEarningsColumn(P, H, logger)` debe retornar `{ colIdx: k, fieldUsed: strategyEntry.paymentColumn }`.*

**Validates: Requirements 2.1, 3.1**

---

### Property 5: Resolución determinista — proveedor conocido sin columna

*Para cualquier proveedor conocido `P` (excluyendo `UNKNOWN`) y cualquier array de headers normalizados `H` que NO contenga el `paymentColumn` normalizado de `P`, `resolveEarningsColumn(P, H, logger)` debe retornar `{ colIdx: null, fieldUsed: null }`.*

**Validates: Requirements 2.2, 3.2**

---

### Property 6: UNKNOWN usa alias fallback

*Para cualquier array de headers `H` que contenga al menos un alias de `ALIAS_DICTIONARY['net_total']` (que no esté en `EXCLUDED_COLUMNS`), `resolveEarningsColumn('UNKNOWN', H, logger)` debe retornar un `colIdx !== null`.*

**Validates: Requirements 2.3**

---

### Property 7: Dinastía sin columna → no fallback a otras columnas de dinero

*Para cualquier array de headers que contenga columnas de dinero válidas (como `nettotal`, `royalty`, `revenue`) pero NO `nettotalclientcurrency`, `resolveEarningsColumn('Dinastía', H, logger)` debe retornar `{ colIdx: null, fieldUsed: null }`.*

**Validates: Requirements 3.4**

---

### Property 8: Aislamiento por moneda — no mezcla de acumuladores

*Para cualquier array de `ParsedRow[]` con múltiples monedas, el total de cada `CurrencyGroup` retornado por `groupByCurrency()` debe ser igual a la suma directa de los `net_total` de las filas con esa moneda (dentro de la precisión de `DecimalAccumulator`).*

**Validates: Requirements 4.4, 6.1, 6.2, 6.5**

---

### Property 9: Conservación de totales (round-trip monetario)

*Para cualquier array de `ParsedRow[]`, la suma de todos los `CurrencyGroup.total` retornados por `groupByCurrency()` debe ser igual a la suma directa de todos los `row.net_total` del array de entrada (dentro de la precisión de `DecimalAccumulator`, tolerancia 1e-8).*

**Validates: Requirements 6.6**

---

### Property 10: Grupos ordenados descendente por total

*Para cualquier array de `ParsedRow[]` con al menos 2 grupos de moneda distintos, la lista `CurrencyGrouperResult.groups` debe satisfacer: `groups[i].total >= groups[i+1].total` para todo `i`.*

**Validates: Requirements 6.4**

---

### Property 11: Porcentajes suman ~100%

*Para cualquier array de `ParsedRow[]` no-vacío y con `globalTotal > 0`, la suma de `CurrencyGroup.percentage` de todos los grupos debe ser ≈ 100 (dentro de tolerancia de punto flotante, e.g. `|sum - 100| < 0.001`).*

**Validates: Requirements 6.3**

---

### Property 12: Cross-rate de conversión — fórmula fuente→USD→destino

*Para cualquier array de `CurrencyGroup[]`, mapa de tasas `rates` (USD-base), y moneda destino `T`, para cada grupo con moneda `S`: `convertedTotal ≈ round(originalTotal × (rates[T] / rates[S]), 2)`.*

**Validates: Requirements 8.3**

---

### Property 13: Identidad de conversión (source = target)

*Para cualquier `CurrencyGroup` con `currency === targetCurrency`, el resultado de conversión debe tener `rate === 1` y `convertedTotal === originalTotal`.*

**Validates: Requirements 8.4**

---

### Property 14: Extensibilidad — nuevo proveedor en tabla funciona sin cambios al motor

*Al agregar dinámicamente un nuevo `ProviderName` con `paymentColumn = 'test_payment'` a `PROVIDER_STRATEGIES` y llamar a `resolveEarningsColumn(newProvider, headersWithTestPayment, logger)`, el resolver debe retornar el índice correcto sin modificar ningún otro archivo del motor.*

**Validates: Requirements 10.1**

---

### Reflexión de propiedades — eliminación de redundancias

Tras revisar las 14 propiedades:

- **Properties 8 y 9** son complementarias pero no redundantes: la 8 verifica aislamiento (ningún grupo mezcla monedas), la 9 verifica conservación global (no se pierden ni duplican valores).
- **Property 5** (proveedor sin columna → null) y **Property 7** (Dinastía sin columna → null) parecen solapadas, pero la 7 es más específica: refuerza que para Dinastía específicamente, columnas de dinero alternativas tampoco se usan como fallback. La propiedad 7 tiene un generador diferente.
- **Properties 4 y 5** son inversas entre sí: la 4 prueba cuando la columna existe, la 5 cuando no existe. Ambas son necesarias.
- **Properties 12 y 13** son complementarias: la 12 verifica la fórmula general, la 13 verifica el caso identidad.

No se eliminan propiedades — cada una provee valor de verificación único.

---

## Error Handling

### Errors en `resolveEarningsColumn`

| Situación | Comportamiento | Logger |
|-----------|----------------|--------|
| Proveedor conocido, columna presente | Retorna `{ colIdx, fieldUsed }` | `[INFO]` con nombre de columna |
| Proveedor conocido, columna ausente | Retorna `{ colIdx: null, fieldUsed: null }` | `[ERROR]` con nombre de columna esperada |
| Proveedor `UNKNOWN`, alias encontrado | Retorna índice del primer alias | `[WARN]` "estrategia genérica en uso" |
| Proveedor `UNKNOWN`, ningún alias | Retorna `{ colIdx: null, fieldUsed: null }` | sin log adicional |
| Proveedor no en tabla | Delega a `UNKNOWN` | `[WARN]` "proveedor no encontrado en PROVIDER_STRATEGIES" |
| `paymentColumn` en `EXCLUDED_COLUMNS` | Retorna null | `[ERROR]` |

### Error fatal en `UniversalParser.parseFile()` para Dinastía

Cuando `provider === 'Dinastía'` y `resolveEarningsColumn` retorna `colIdx: null`, el parser lanza:

```
Error: "Reporte de Dinastía: columna "net_total_client_currency" no encontrada.
Verifica que el archivo contenga esta columna antes de procesar."
```

Este error propaga al caller (UploadPage) y se muestra al usuario. No se produce un reporte parcial.

### Errors en `CurrencyGrouper`

| Situación | Comportamiento |
|-----------|----------------|
| Código de moneda desconocido en fila | Usa `defaultCurrency`, emite `[WARN]` con row index y código |
| Valor de moneda vacío | Usa `defaultCurrency` silenciosamente |
| Sin columna de moneda y sin `defaultCurrency` en estrategia | Usa `'USD'`, emite `[WARN]` |

### Errors en `CurrencyConverter`

| Situación | Error message |
|-----------|---------------|
| Timeout > 10s | "La solicitud de tasas de cambio excedió el tiempo límite (10 s)." |
| HTTP no-2xx | "Error al obtener tasas de cambio (HTTP {status}). Intenta de nuevo." |
| Respuesta inválida | "Respuesta de tasas de cambio inválida. Intenta de nuevo." |
| Error de red | "Error de red al obtener tasas de cambio. Verifica tu conexión." |

`CurrencyTab` muestra estos errores en un callout de error sin perder los datos originales de `CurrencyGroup[]`.

### Errors en persistencia de `currency_records`

Los errores de inserción en `currency_records` se capturan y loguean, pero no deben bloquear la experiencia del usuario (la visualización del reporte ya fue exitosa). Se emite un log `[ERROR]` y se muestra una advertencia discreta en la UI.

---

## Testing Strategy

### Framework

El proyecto usa **Vitest** con **fast-check** (ya instalados como devDependencies). Los tests se ejecutan con `npm test` (`vitest run`).

### Estructura de archivos de tests

```
src/royalty-engine/
  ProviderStrategy.test.ts        ← ya existe, ampliar con property tests
  CurrencyGrouper.test.ts         ← nuevo archivo
  CurrencyConverter.test.ts       ← nuevo archivo
src/components/
  CurrencyTab.test.tsx            ← nuevo archivo (con @testing-library/react)
```

### Enfoque dual: Unit tests + Property-Based Tests

**Unit tests** cubren:
- Mapeos exactos de `PROVIDER_STRATEGIES` (19 proveedores + UNKNOWN + 5 aliases V1)
- Comportamiento específico de Dinastía (con y sin columna)
- Logging de resolveEarningsColumn (INFO/ERROR/WARN)
- Empty state de `CurrencyTab`
- Timeout y error HTTP de `CurrencyConverter`

**Property-based tests** cubren:
- Las 14 propiedades de corrección definidas en este documento
- Mínimo 100 iteraciones por propiedad (configuración default de fast-check)
- Generadores personalizados para: arrays de headers normalizados, arrays de ParsedRow con monedas aleatorias, mapas de tasas de cambio

### Tag format

Cada property test debe incluir un comentario de trazabilidad:

```typescript
// Feature: payment-column-currency-strategy, Property N: <texto de la propiedad>
```

Ejemplo:

```typescript
// Feature: payment-column-currency-strategy, Property 9: Conservación de totales
fc.assert(
  fc.property(fc.array(arbitraryParsedRow()), (rows) => {
    const result = groupByCurrency(rows, [], 'UNKNOWN', mockLogger)
    const groupSum = result.groups.reduce((s, g) => s + g.total, 0)
    const rowSum   = rows.reduce((s, r) => s + r.net_total, 0)
    return Math.abs(groupSum - rowSum) < 1e-8
  }),
  { numRuns: 100 }
)
```

### Cobertura esperada por módulo

| Módulo | Unit tests | Property tests |
|--------|------------|----------------|
| `ProviderStrategy.ts` | Mapeos exactos (1.4), logging, Dinastía | Props 1–7, 14 |
| `CurrencyGrouper.ts` | Casos borde (código vacío, desconocido) | Props 8–11 |
| `CurrencyConverter.ts` | Timeout, HTTP error, red error | Props 12–13 |
| `CurrencyTab.tsx` | Empty state, error display, loading | (UI: examples) |
| DB migration | Schema check (SMOKE) | — |
