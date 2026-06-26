# Requirements Document

## Introduction

Esta feature define dos módulos interrelacionados del motor de regalías:

1. **PaymentColumnStrategy** — una tabla de configuración explícita que asigna, por distribuidora, la única columna de pago válida a utilizar para acumular `net_total`. No se permiten fallbacks automáticos para distribuidoras conocidas ni cálculos derivados (no se usan brutos, impuestos ni conversiones automáticas).

2. **Módulo de Monedas** — detección automática de la columna de moneda en el reporte, agrupación de filas por moneda usando `DecimalAccumulator` para precisión máxima, presentación en la pestaña "Monedas" del reporte, y conversión opcional a moneda destino mediante API de tasas de cambio (solo cuando el usuario lo solicita explícitamente). Los resultados se persisten en base de datos.

El proyecto es una aplicación React + TypeScript + Supabase. El motor de regalías se encuentra en `src/royalty-engine/`. Ya existe `ProviderStrategy.ts` con la tabla de estrategias y `CurrencyGrouper.ts` con la agrupación por moneda; esta spec formaliza sus contratos, cierra los gaps identificados y define los criterios de aceptación verificables.

---

## Glossary

- **Provider / Distribuidora**: Empresa distribuidora de música digital (ej. DistroKid, Ditto, Believe). Identificada por `ProviderName`.
- **PaymentColumn**: Nombre de columna (pre-normalización) que contiene el monto neto pagado por la distribuidora para esa fila.
- **PaymentColumnStrategy**: Tabla que mapea cada `ProviderName` a su única `PaymentColumn` permitida.
- **PROVIDER_STRATEGIES**: El objeto `Record<string, ProviderStrategyEntry>` definido en `ProviderStrategy.ts`.
- **ProviderStrategyEntry**: Entrada en `PROVIDER_STRATEGIES` con campos `paymentColumn`, `defaultCurrency`, y campos deprecados de compatibilidad V1.
- **resolveEarningsColumn**: Función pública que resuelve el índice de columna de pago dado un proveedor y lista de headers normalizados.
- **HeaderNormalizer / normalizeHeader**: Función que convierte un nombre de columna a minúsculas sin tildes, espacios ni caracteres especiales.
- **EXCLUDED_COLUMNS**: Conjunto de columnas que nunca deben mapearse como columna de pago.
- **DecimalAccumulator**: Clase de precisión decimal que evita errores de punto flotante en acumulaciones monetarias.
- **CurrencyDetector**: Módulo que detecta la moneda de un archivo escaneando todas las filas y cabeceras usando estrategia de frecuencia.
- **CurrencyGrouper**: Módulo que agrupa `ParsedRow[]` por moneda y calcula totales por grupo.
- **CurrencyGroup**: Estructura con `{ currency, total, totalFixed8, recordCount, percentage }`.
- **CurrencyTab**: Componente React que muestra la pestaña "Monedas" con tarjetas por moneda y el botón de conversión.
- **CurrencyConverter**: Módulo que obtiene tasas de cambio de `open.er-api.com` y convierte totales entre monedas.
- **TargetCurrency**: Moneda destino para conversión. Valores permitidos: `USD | EUR | COP | GBP | MXN | CAD | JPY`.
- **UNKNOWN**: Proveedor sentinela para archivos cuyo distribuidor no fue identificado. Usa búsqueda por alias en lugar de columna fija.
- **Dinastía**: Distribuidora local. Su `PaymentColumn` es `net_total_client_currency`; si no existe → error fatal, sin fallback.
- **currency_mismatch**: Tipo de issue de validación emitido cuando se detectan múltiples monedas en un reporte de proveedor de moneda única.
- **RUPEResult**: Tipo de retorno de `parseFile()` con `{ rows, stats, audit, debug }`.
- **currency_records**: Tabla de base de datos que persiste totales por moneda por reporte importado.

---

## Requirements

### Requirement 1: PaymentColumnStrategy — tabla de columnas de pago por distribuidora

**User Story:** Como motor de regalías, quiero tener una tabla explícita de la columna de pago por distribuidora, para que nunca se use una columna incorrecta o derivada al calcular los totales netos pagados.

#### Acceptance Criteria

1. THE `PROVIDER_STRATEGIES` SHALL contain an entry for each of the following 19 providers: `Dinastía`, `Ditto`, `DistroKid`, `TuneCore`, `ONErpm`, `Believe`, `CD Baby`, `Symphonic`, `UnitedMasters`, `RouteNote`, `Too Lost`, `FUGA`, `Amuse`, `Spotify Direct`, `Apple Music Reports`, `Amazon Music Reports`, `Tidal Reports`, `YouTube Content ID`, `Meta`.
2. THE `PROVIDER_STRATEGIES` SHALL contain entries for `UNKNOWN` and the five V1 backward-compat aliases: `Spotify`, `Apple Music`, `Amazon Music`, `Tidal`, `YouTube`.
3. WHEN a `ProviderStrategyEntry` is defined for a known provider (excluding `UNKNOWN`), THE `PaymentColumn` field SHALL be a non-empty string.
4. THE `PROVIDER_STRATEGIES` SHALL assign the following `paymentColumn` values: `Dinastía → net_total_client_currency`, `Ditto → net_total`, `DistroKid → earnings`, `TuneCore → net_revenue`, `ONErpm → net_revenue`, `Believe → net_amount`, `CD Baby → net_payable`, `Symphonic → net_revenue`, `UnitedMasters → royalty`, `RouteNote → net_amount`, `Too Lost → royalty`, `FUGA → royalty_amount`, `Amuse → net_revenue`, `Spotify Direct → royalties`, `Apple Music Reports → royalty`, `Amazon Music Reports → royalty`, `Tidal Reports → royalty`, `YouTube Content ID → partner_revenue`, `Meta → revenue`.
5. THE `PROVIDER_STRATEGIES` SHALL assign the following `defaultCurrency` values: `Dinastía → COP`, `Believe → EUR`, all other providers → `USD`.
6. THE `PaymentColumnStrategy` SHALL NOT use `gross_total`, derived fields, or any column in `EXCLUDED_COLUMNS` as a payment column for any known provider.
7. THE `PROVIDER_STRATEGIES` SHALL be extensible by adding a new entry without modifying any other part of the engine.

### Requirement 2: Resolución determinista de la columna de pago

**User Story:** Como motor de regalías, quiero que la resolución de la columna de pago sea determinista y sin ambigüedad, para que el mismo archivo siempre produzca el mismo resultado.

#### Acceptance Criteria

1. WHEN `resolveEarningsColumn` is called with a known provider and the headers contain the provider's `paymentColumn` (after normalization), THE `Resolver` SHALL return the exact column index where the normalized `paymentColumn` appears.
2. WHEN `resolveEarningsColumn` is called with a known provider and the headers do NOT contain the provider's `paymentColumn`, THE `Resolver` SHALL return `{ colIdx: null, fieldUsed: null }`.
3. WHEN `resolveEarningsColumn` is called with `UNKNOWN` as provider, THE `Resolver` SHALL iterate through `ALIAS_DICTIONARY['net_total']` aliases and return the index of the first matching header.
4. WHEN `resolveEarningsColumn` is called with a provider not present in `PROVIDER_STRATEGIES`, THE `Resolver` SHALL delegate to the `UNKNOWN` resolution path.
5. WHEN `resolveEarningsColumn` resolves a column successfully, THE `Logger` SHALL emit an `[INFO]` log entry containing the matched column name and provider.
6. WHEN `resolveEarningsColumn` fails to find the payment column for a known provider, THE `Logger` SHALL emit an `[ERROR]` log entry.
7. WHEN `resolveEarningsColumn` uses the `UNKNOWN` alias fallback path, THE `Logger` SHALL emit a `[WARN]` log entry with the text `"estrategia genérica en uso"`.

### Requirement 3: Garantías de no-fallback para Dinastía

**User Story:** Como administrador de regalías, quiero que los reportes de Dinastía fallen explícitamente si no contiene la columna `net_total_client_currency`, para que nunca se acumulen valores incorrectos para esta distribuidora.

#### Acceptance Criteria

1. WHEN `resolveEarningsColumn` is called with provider `Dinastía` and the normalized headers contain `nettotalclientcurrency`, THE `Resolver` SHALL return the correct column index.
2. WHEN `resolveEarningsColumn` is called with provider `Dinastía` and the normalized headers do NOT contain `nettotalclientcurrency`, THE `Resolver` SHALL return `{ colIdx: null, fieldUsed: null }`.
3. WHEN `parseFile` processes a file identified as `Dinastía` provider and `resolveEarningsColumn` returns `colIdx: null`, THE `UniversalParser` SHALL throw an `Error` with a message indicating the missing column.
4. THE `Resolver` SHALL NOT use any other column (including `net_total`, `royalty`, `revenue`) as a substitute for `Dinastía` under any circumstances.

### Requirement 4: Prohibiciones absolutas en el cálculo de pagos

**User Story:** Como motor de regalías, quiero que ciertas operaciones estén prohibidas en el cálculo de pagos, para garantizar la integridad de los totales de regalías.

#### Acceptance Criteria

1. THE `PaymentColumnStrategy` SHALL NOT recalculate royalties using formulas (e.g., `gross_total - taxes - channel_costs`).
2. THE `PaymentColumnStrategy` SHALL NOT use `gross_total` as a payment column or as a basis for payment calculation for any provider.
3. THE `PaymentColumnStrategy` SHALL NOT subtract taxes or costs from any payment column value.
4. THE `CurrencyGrouper` SHALL NOT sum amounts from different currencies into a single total without explicit user-initiated conversion.
5. THE `CurrencyConverter` SHALL NOT be invoked during file parsing; it SHALL only be invoked upon explicit user action.

### Requirement 5: Detección de columna de moneda

**User Story:** Como motor de regalías, quiero detectar automáticamente la columna de moneda en el reporte, para que cada fila tenga asignado su código de moneda correcto.

#### Acceptance Criteria

1. WHEN `groupByCurrency` is called, THE `CurrencyGrouper` SHALL search the raw headers for a currency column by matching (after normalization) against the candidates in priority order: `currency`, `currencycode`, `clientcurrency`, `paymentcurrency`, `settlementcurrency`.
2. WHEN a currency column is found, THE `CurrencyGrouper` SHALL use the value of that column in each row to determine the row's currency.
3. WHEN no currency column is found in the headers, THE `CurrencyGrouper` SHALL use the `defaultCurrency` from the provider's `ProviderStrategyEntry` for all rows.
4. WHEN no currency column is found and the provider has no `defaultCurrency` configured, THE `CurrencyGrouper` SHALL use `USD` and emit a `[WARN]` log entry.
5. WHEN a row's currency column value is empty, THE `CurrencyGrouper` SHALL assign the provider's `defaultCurrency` (or `USD`) to that row.
6. WHEN a row's currency column contains an unrecognized code, THE `CurrencyGrouper` SHALL assign the `defaultCurrency` and emit a `[WARN]` log entry identifying the row index and invalid code.

### Requirement 6: Agrupación por moneda con precisión decimal

**User Story:** Como motor de regalías, quiero que los totales por moneda se calculen usando `DecimalAccumulator`, para que los totales sean exactos sin errores de punto flotante.

#### Acceptance Criteria

1. WHEN `groupByCurrency` is called, THE `CurrencyGrouper` SHALL create one `DecimalAccumulator` per distinct currency code encountered.
2. WHEN accumulating row totals, THE `CurrencyGrouper` SHALL add each row's `net_total` value to the accumulator of its resolved currency.
3. WHEN building `CurrencyGroup` results, THE `CurrencyGrouper` SHALL compute `percentage` as `(groupTotal / globalTotal) * 100`; WHEN `globalTotal` is zero, percentage SHALL be `0`.
4. WHEN `groupByCurrency` returns results, THE `CurrencyGrouperResult.groups` array SHALL be sorted in descending order by `total`.
5. WHEN `groupByCurrency` processes rows, THE `CurrencyGrouper` SHALL NOT sum values from different currencies into a single accumulator.
6. FOR ALL valid `ParsedRow[]` inputs, THE sum of all `CurrencyGroup.total` values SHALL equal the sum of all `row.net_total` values (within `DecimalAccumulator` precision).

### Requirement 7: Pestaña "Monedas" en la interfaz de reporte

**User Story:** Como usuario, quiero ver una pestaña "Monedas" en el detalle del reporte, para conocer cuánto se pagó en cada moneda y qué porcentaje representa del total.

#### Acceptance Criteria

1. WHEN a report detail page is displayed and currency groups exist, THE `CurrencyTab` SHALL render one card per `CurrencyGroup`.
2. WHEN rendering a currency card, THE `CurrencyTab` SHALL display: currency code (`CurrencyGroup.currency`), total amount formatted to 2 decimal places, record count, and percentage of the global total.
3. WHEN currency groups exist, THE `CurrencyTab` SHALL display them in descending order by total (as provided by `CurrencyGrouper`).
4. WHEN no currency groups exist for a report, THE `CurrencyTab` SHALL display an informative empty-state message.
5. WHEN a conversion has been performed, THE `CurrencyTab` SHALL display the converted total and exchange rate on each card alongside the original total.

### Requirement 8: Conversión de totales a moneda destino

**User Story:** Como usuario, quiero poder convertir los totales de cada moneda a una moneda destino (USD, EUR, COP, GBP, MXN, CAD, JPY), para comparar los ingresos en una única moneda de referencia.

#### Acceptance Criteria

1. WHEN the user clicks "Convertir Totales", THE `CurrencyTab` SHALL invoke `convertCurrencies` with the selected `TargetCurrency` and the current `CurrencyGroup[]`.
2. WHEN `convertCurrencies` is called, THE `CurrencyConverter` SHALL fetch exchange rates from `open.er-api.com` using a single HTTP request.
3. WHEN the exchange rate API responds successfully, THE `CurrencyConverter` SHALL compute cross-rates client-side (source → USD → target) without additional HTTP requests.
4. WHEN the source currency equals the target currency, THE `CurrencyConverter` SHALL return `rate: 1` and `convertedTotal` equal to `originalTotal`.
5. WHEN the exchange rate API request exceeds 10 seconds, THE `CurrencyConverter` SHALL abort the request and return an error message indicating timeout.
6. WHEN the exchange rate API returns a non-2xx HTTP status, THE `CurrencyConverter` SHALL return an error message including the HTTP status code.
7. WHEN the `CurrencyTab` receives a conversion error, THE `CurrencyTab` SHALL display the error message to the user without losing the original currency group data.
8. WHEN the conversion is in progress, THE `CurrencyTab` SHALL disable the "Convertir Totales" button and display a loading indicator.

### Requirement 9: Persistencia de totales por moneda en base de datos

**User Story:** Como administrador, quiero que los totales por moneda de cada reporte importado se guarden en base de datos, para poder consultar históricos y detectar cambios entre importaciones.

#### Acceptance Criteria

1. THE database SHALL contain a `currency_records` table with columns: `id`, `report_id` (FK → `reports.id`), `user_id` (FK → `profiles.id`), `provider`, `currency`, `payment_column_used`, `total`, `record_count`, `import_date`.
2. WHEN a report is successfully processed, THE `currency_records` table SHALL receive one row per `CurrencyGroup` produced by `CurrencyGrouper`.
3. WHEN inserting into `currency_records`, THE system SHALL store: the provider name, the currency code, the `paymentColumn` from `PROVIDER_STRATEGIES` that was used, the `totalFixed8` value from `CurrencyGroup`, the `recordCount`, and the current timestamp as `import_date`.
4. WHEN Row Level Security is applied to `currency_records`, THE policy SHALL allow users to read and insert only their own records (`user_id = auth.uid()`), and administrators to read all records.
5. THE `currency_records` table SHALL have an index on `(report_id, currency)` to support efficient per-report queries.

### Requirement 10: Extensibilidad para nuevas distribuidoras

**User Story:** Como desarrollador, quiero agregar una nueva distribuidora sin modificar el motor de regalías, para que la tabla de estrategias sea la única fuente de verdad.

#### Acceptance Criteria

1. WHEN a new provider entry is added to `PROVIDER_STRATEGIES` with a valid `paymentColumn` and `defaultCurrency`, THE `resolveEarningsColumn` function SHALL correctly resolve that provider's payment column without any other code changes.
2. WHEN a new provider entry is added to `PROVIDER_STRATEGIES`, THE `detectProvider` function in `ProviderDetector.ts` SHALL be the only other file that requires modification to support full provider detection.
3. THE `PROVIDER_STRATEGIES` object SHALL be the single source of truth for payment column configuration; no hard-coded provider logic SHALL exist outside of `ProviderStrategy.ts` and `ProviderDetector.ts`.
