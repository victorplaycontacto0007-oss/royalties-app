# Requirements Document

## Introduction

Este feature reemplaza la lógica actual de selección de columna de pago del motor de regalías
(`ProviderStrategy.ts`), que usaba una lista priorizada de candidatos por proveedor. En su lugar,
cada distribuidora tendrá **una sola columna de pago definitiva** (`paymentColumn`), sin fallbacks
automáticos ni recálculo. Adicionalmente, se agrega un **Módulo de Monedas** que agrupa los totales
por moneda y permite al usuario convertir subtotales a través de una API de tasas de cambio. Los
resultados del módulo de monedas se persisten en la base de datos y se presentan en una nueva
pestaña "Monedas" dentro de la interfaz de carga de reportes.

El sistema ya cuenta con: `ProviderDetector.ts`, `ProviderStrategy.ts`, `CurrencyDetector.ts`,
`DecimalAccumulator.ts`, `UniversalParser.ts`, y el flujo de carga en `UploadPage.tsx`. Este
feature extiende y refina esos componentes sin romper la compatibilidad hacia atrás.

---

## Glossary

- **PaymentColumnStrategy** / **PROVIDER_STRATEGIES**: Configuración central que mapea cada distribuidora a su columna de pago definitiva (`paymentColumn`). Reemplaza la lista `earningsCandidates` de `ProviderStrategyEntry` para la selección de columna.
- **paymentColumn**: Nombre canónico (pre-normalización) de la única columna que representa el dinero final del artista para una distribuidora específica. No hay fallbacks automáticos.
- **ProviderName**: Tipo enumerado de distribuidoras en `ProviderStrategy.ts`. Este feature agrega `'Dinastía'` al conjunto y añade los nombres exactos: `'Spotify Direct'`, `'Apple Music Reports'`, `'Amazon Music Reports'`, `'Tidal Reports'` (distintos de los genéricos V1).
- **PaymentColumnResolver**: Función (o módulo) que, dado un provider y los headers normalizados del archivo, retorna el índice de columna a usar para la suma de pagos.
- **CurrencyGrouper**: Módulo responsable de detectar la columna de moneda en el archivo y agrupar los totales por código ISO de moneda.
- **CurrencyGroup**: Estructura `{ currency, total, recordCount, percentage }` que representa el subtotal de una moneda.
- **CurrencyConverter**: Módulo que consulta una API de tasas de cambio bajo demanda explícita del usuario.
- **TargetCurrency**: Moneda de destino para conversión: `USD`, `EUR`, `COP`, `GBP`, `MXN`, `CAD`, `JPY`.
- **import_currency_summary**: Tabla de Supabase donde se persisten los totales por moneda de cada importación.
- **Monedas tab**: Pestaña en la UI que muestra las tarjetas de `CurrencyGroup` y el botón "Convertir Totales".
- **normalizedKey**: Nombre de columna en minúsculas, sin tildes, sin espacios ni caracteres especiales — mismo proceso que aplica `HeaderNormalizer.ts` (`normalizeHeader()`).
- **DecimalAccumulator**: Clase existente que acumula sumas con precisión `Decimal(20,8)` sin redondeo interno.
- **KNOWN_CODES**: Conjunto de códigos ISO de moneda reconocidos: `USD`, `EUR`, `GBP`, `CAD`, `AUD`, `JPY`, `MXN`, `COP`, `BRL`, `CHF`, `SEK`, `NOK`, `DKK`.

---

## Requirements

---

### Requirement 1: Configuración única de columna de pago por distribuidora

**User Story:** Como motor de regalías, quiero conocer de antemano la columna exacta de pago para cada distribuidora, para que nunca sume columnas incorrectas ni haga suposiciones.

#### Acceptance Criteria

1. THE `PROVIDER_STRATEGIES` record (in `ProviderStrategy.ts`) SHALL define an entry for each of the following providers, mapping each to exactly one `paymentColumn` string (pre-normalization name):
   - `Dinastía` → `net_total_client_currency`
   - `Ditto` → `net_total`
   - `DistroKid` → `earnings`
   - `TuneCore` → `net_revenue`
   - `ONErpm` → `net_revenue`
   - `Believe` → `net_amount`
   - `CD Baby` → `net_payable`
   - `Symphonic` → `net_revenue`
   - `UnitedMasters` → `royalty`
   - `RouteNote` → `net_amount`
   - `Too Lost` → `royalty`
   - `FUGA` → `royalty_amount`
   - `Amuse` → `net_revenue`
   - `Spotify Direct` → `royalties`
   - `Apple Music Reports` → `royalty`
   - `Amazon Music Reports` → `royalty`
   - `Tidal Reports` → `royalty`
   - `YouTube Content ID` → `partner_revenue`
   - `Meta` → `revenue`

2. THE `PROVIDER_STRATEGIES` record SHALL be implemented as a plain TypeScript `Record<ProviderName, ProviderStrategyEntry>`, so that adding a new provider requires only adding a new entry to this object without modifying any other file in the engine.

3. WHEN a new provider entry is added to `PROVIDER_STRATEGIES`, THE engine SHALL automatically use the new entry without requiring changes to `UniversalParser.ts`, `ColumnMapper.ts`, or `RowValidator.ts`.

4. IF a provider key is present in `ProviderDetector.ts` but absent from `PROVIDER_STRATEGIES`, THEN THE `PaymentColumnResolver` SHALL treat that provider as `UNKNOWN` and log `[WARN]` identifying the missing entry, rather than throwing a runtime error.

---

### Requirement 2: Resolución de columna de pago (una sola columna, sin fallbacks)

**User Story:** Como motor de regalías, quiero seleccionar la columna de pago de forma determinista, para que el resultado sea siempre predecible y auditable.

#### Acceptance Criteria

1. WHEN the engine resolves the payment column for a known provider, THE `PaymentColumnResolver` SHALL look up the `paymentColumn` from `PROVIDER_STRATEGIES` for that provider, normalize it using `normalizeHeader()` (from `HeaderNormalizer.ts`), and return the index of the first header in the file that matches the normalized key via exact match.

2. WHEN the `paymentColumn` (normalized) is found in the file headers, THE `PaymentColumnResolver` SHALL return that column index and log `[INFO]` indicating the selected column name and the provider.

3. WHEN the `paymentColumn` (normalized) is NOT found in the file headers, THE `PaymentColumnResolver` SHALL return `null` and log `[ERROR]` identifying the missing column name and the provider.

4. IF the provider is `UNKNOWN`, THEN THE `PaymentColumnResolver` SHALL iterate the aliases in `ALIAS_DICTIONARY['net_total']` in order and return the index of the first alias found in the file headers, logging `[WARN]` to indicate generic fallback is in use. IF no alias from `ALIAS_DICTIONARY['net_total']` is found in the headers, THEN THE `PaymentColumnResolver` SHALL return `null`.

5. WHEN evaluating candidates, THE `PaymentColumnResolver` SHALL skip any candidate whose normalized form matches a key in `EXCLUDED_COLUMNS` (from `AliasDictionary.ts`), and shall never return the index of a `gross_total`, `taxes`, `channel_costs`, or `other_costs` column.

6. THE `PaymentColumnResolver` SHALL never perform currency conversion, tax subtraction, or any arithmetic recalculation when determining the payment column.

---

### Requirement 3: Caso especial Dinastía — columna obligatoria sin sustitución

**User Story:** Como operador que procesa reportes de Dinastía, quiero que el sistema use exclusivamente `net_total_client_currency` y no intente sustituirla, para que el total refleje exactamente el pago en la moneda del cliente.

#### Acceptance Criteria

1. WHEN the detected provider is `Dinastía` and the column `net_total_client_currency` (normalized: `nettotalclientcurrency`) is found in the file headers, THE `PaymentColumnResolver` SHALL select that column index and log `[INFO]` confirming the selection.

2. WHEN the detected provider is `Dinastía` and `nettotalclientcurrency` is NOT found in the file headers, THE `PaymentColumnResolver` SHALL return `null` and log `[ERROR]` stating that the official Dinastía payment column is missing.

3. WHEN `PaymentColumnResolver` returns `null` for provider `Dinastía`, THE engine SHALL throw an error (or reject the returned Promise) with a message indicating the missing column, halting processing before any row accumulation begins.

4. IF the detected provider is `Dinastía`, THEN THE `PaymentColumnResolver` SHALL never substitute `net_total_client_currency` with any other column — including `net_total`, `gross_total`, or any alias from `ALIAS_DICTIONARY` — even if `ColumnMapper.ts` would otherwise map `currency_net_total` to `net_total` as a secondary field.

---

### Requirement 4: Protección de integridad del total de pago

**User Story:** Como sistema de regalías, quiero garantizar que el total calculado proviene exclusivamente de sumar la columna de pago configurada, para que el resultado sea siempre el dinero final del artista sin modificaciones.

#### Acceptance Criteria

1. WHEN computing the total payment for a report, THE engine SHALL sum only the values in the column index returned by `PaymentColumnResolver`, using `DecimalAccumulator` with full 8-decimal precision (`toFixed8()`).

2. THE engine SHALL accumulate `gross_total`, `taxes`, `channel_costs`, and `other_costs` in separate `DecimalAccumulator` instances if needed; those values SHALL NOT be added to, subtracted from, or used to adjust the payment total.

3. THE engine SHALL never perform automatic currency conversion on any payment cell value during row accumulation.

4. THE engine SHALL never apply `Math.round()`, `toFixed()`, or any truncation to payment values during internal accumulation; rounding to 2 decimal places SHALL only occur when calling a display-layer method (e.g., `toNumber()` followed by `toFixed(2)` in a UI component).

5. WHEN a cell in the payment column contains a non-numeric or empty value after `MoneyParser` processing, THE engine SHALL treat that cell as `0`, log `[WARN]` identifying the row index and the raw cell value, and continue processing remaining rows.

6. WHEN `PaymentColumnResolver` returns `null` (column not found) for a non-Dinastía provider, THE engine SHALL set the payment total to `0.00000000`, log `[ERROR]` identifying the missing column, and set `audit.status` to `'discrepancy'` rather than `'valid'`.

---

### Requirement 5: Detección de columna de moneda

**User Story:** Como módulo de monedas, quiero detectar automáticamente la columna de moneda en el archivo, para que el agrupamiento sea correcto sin requerir configuración manual.

#### Acceptance Criteria

1. WHEN a file is parsed, THE `CurrencyGrouper` SHALL scan the normalized file headers and attempt to match the following candidate keys in priority order (all already in post-normalization form): `currency`, `currencycode`, `clientcurrency`, `paymentcurrency`, `settlementcurrency`.

2. WHEN a currency column is found in the headers, THE `CurrencyGrouper` SHALL read each data row's currency value from that column, trim whitespace, uppercase the result, and resolve any symbol (`$` → `USD`, `€` → `EUR`, `£` → `GBP`) before comparing against `KNOWN_CODES`.

3. WHEN no currency column is found in the headers, THE `CurrencyGrouper` SHALL use the `defaultCurrency` field from `PROVIDER_STRATEGIES` entry for that provider.

4. IF the provider entry has no `defaultCurrency` field (or `defaultCurrency` is `undefined`), THEN THE `CurrencyGrouper` SHALL use `'USD'` and log `[WARN]` once per file (not per row).

5. WHEN a row's resolved currency value is empty, or is not in `KNOWN_CODES` and cannot be resolved via the symbol map, THE `CurrencyGrouper` SHALL assign that row to the provider's `defaultCurrency` (or `'USD'` if none) and log `[WARN]` with the row index and the unrecognized value.

---

### Requirement 6: Agrupamiento de totales por moneda

**User Story:** Como módulo de monedas, quiero agrupar las filas por código de moneda y calcular el total por moneda, para que el usuario vea exactamente cuánto se pagó en cada divisa.

#### Acceptance Criteria

1. WHEN processing validated, non-skipped rows, THE `CurrencyGrouper` SHALL group them by their resolved currency code and produce one `CurrencyGroup` per distinct currency code.

2. FOR each `CurrencyGroup`, THE `CurrencyGrouper` SHALL compute:
   - `currency`: the resolved ISO currency code (e.g., `'USD'`, `'EUR'`, `'COP'`).
   - `total`: sum of payment column values for all rows in that group, accumulated with a per-group `DecimalAccumulator`.
   - `recordCount`: count of rows in that group.
   - `percentage`: `(groupTotal / globalPaymentTotal) * 100`, where `globalPaymentTotal` equals the sum of all per-group `DecimalAccumulator` totals.

3. THE `CurrencyGrouper` SHALL maintain one independent `DecimalAccumulator` per currency group; values from different groups SHALL NEVER be added to the same accumulator.

4. WHEN `globalPaymentTotal` is `0`, THE `CurrencyGrouper` SHALL set `percentage` to `0` for all groups rather than producing `NaN` or `Infinity`.

5. THE `percentage` value SHALL be retained at full precision internally; `Math.round(percentage * 100) / 100` SHALL only be applied in the display layer.

6. WHEN returning the list of `CurrencyGroup`, THE `CurrencyGrouper` SHALL sort it in descending order by `total` (highest first), using `DecimalAccumulator.toNumber()` for comparison.

---

### Requirement 7: Interfaz — pestaña "Monedas"

**User Story:** Como usuario que visualiza un reporte procesado, quiero ver una pestaña "Monedas" con el detalle por divisa, para entender la composición de pagos sin necesidad de hacer cálculos.

#### Acceptance Criteria

1. WHEN a report has been successfully processed (status `success` or `discrepancy`) and `stats.currencyGroups` contains at least one entry, THE UI SHALL render a tab labeled `"Monedas"` alongside any existing result tabs.

2. WHEN the "Monedas" tab is active, THE UI SHALL render one card per `CurrencyGroup` displaying:
   - The currency code in a visually prominent element (e.g., badge or heading).
   - The `total` value formatted as `Math.round(total * 100) / 100` with exactly 2 decimal places.
   - The `recordCount` value (integer, no decimal).
   - The `percentage` value formatted as `Math.round(percentage * 100) / 100` followed by `%`.

3. THE UI SHALL render the currency cards in the order provided by `CurrencyGrouper` (descending by total, highest first).

4. WHEN the "Monedas" tab is active, THE UI SHALL render a button labeled `"Convertir Totales"`.

5. WHEN `stats.currencyGroups` is empty or absent, THE UI SHALL render the message `"No se encontraron datos de monedas para este reporte."` inside the "Monedas" tab content area.

---

### Requirement 8: Conversión de totales bajo demanda

**User Story:** Como usuario, quiero convertir todos los subtotales por moneda a una única divisa de destino, para comparar los ingresos en una moneda común.

#### Acceptance Criteria

1. WHEN the user clicks `"Convertir Totales"`, THE UI SHALL present a selector with exactly these target options: `USD`, `EUR`, `COP`, `GBP`, `MXN`, `CAD`, `JPY`.

2. WHEN the user selects a target currency, THE `CurrencyConverter` SHALL make a single HTTP request to an external exchange-rate API to retrieve the current rates for all source currencies in `stats.currencyGroups`, then multiply each group's `total` by the corresponding rate to produce the converted value.

3. WHEN the conversion request is in flight, THE UI SHALL display a loading indicator on or near the "Convertir Totales" button and set the button to `disabled` to prevent concurrent requests.

4. WHEN the conversion succeeds, THE UI SHALL display the converted total for each `CurrencyGroup` card alongside the original total, clearly labeled with the target currency code (e.g., `"USD 42.30"`).

5. IF the external API request fails (network error, HTTP 4xx/5xx, or response timeout after 10 seconds), THEN THE UI SHALL display the message `"Error al obtener tasas de cambio. Intenta de nuevo."` and re-enable the `"Convertir Totales"` button.

6. IF the user has not clicked `"Convertir Totales"`, THEN THE engine SHALL never invoke the exchange-rate API; no currency conversion SHALL occur during file parsing or row accumulation.

7. WHEN a `CurrencyGroup.currency` equals the selected target currency, THE `CurrencyConverter` SHALL apply a conversion rate of `1.0` for that group without making an API sub-request for it.

---

### Requirement 9: Persistencia de totales por moneda

**User Story:** Como sistema, quiero guardar el resumen de monedas de cada importación en la base de datos, para poder consultarlo posteriormente sin re-procesar el archivo.

#### Acceptance Criteria

1. WHEN a report row is successfully inserted into the `reports` table, THE system SHALL insert one row per `CurrencyGroup` into the `import_currency_summary` table with the following fields:
   - `id`: UUID primary key, auto-generated.
   - `report_id`: UUID referencing `public.reports(id)` (NOT NULL).
   - `user_id`: UUID of the authenticated user (required for RLS).
   - `distributor`: the detected provider name string (max 100 chars).
   - `currency`: the ISO currency code of the group (max 10 chars).
   - `payment_column_used`: the original (pre-normalization) column header name used for payment (max 100 chars).
   - `total_by_currency`: the `DecimalAccumulator.toFixed8()` value cast to `NUMERIC(20, 8)`.
   - `record_count`: `INTEGER`, count of rows in that group.
   - `import_date`: `TIMESTAMPTZ DEFAULT now()`, set at insert time.

2. THE `import_currency_summary` table SHALL declare `FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE` so that deleting a report automatically removes all its currency summary rows.

3. IF inserting into `import_currency_summary` fails (any error), THEN THE system SHALL log `[ERROR]` identifying the `report_id` and error message, and SHALL NOT throw or reject in a way that rolls back or fails the main report insertion.

4. THE system SHALL enforce Row Level Security on `import_currency_summary` with:
   - A `SELECT` policy: `USING (user_id = auth.uid())`.
   - An `INSERT` policy: `WITH CHECK (user_id = auth.uid())`.

---

### Requirement 10: Extensibilidad — agregar nuevas distribuidoras

**User Story:** Como desarrollador, quiero poder agregar nuevas distribuidoras con su columna de pago y moneda predeterminada sin modificar el motor principal, para que el sistema sea mantenible a largo plazo.

#### Acceptance Criteria

1. WHEN a developer adds a new `ProviderName` key with its `paymentColumn` and optional `defaultCurrency` to `PROVIDER_STRATEGIES`, THE engine SHALL use the new configuration automatically — specifically, no changes SHALL be required in `UniversalParser.ts`, `ColumnMapper.ts`, `RowValidator.ts`, or `CurrencyGrouper`.

2. THE `PROVIDER_STRATEGIES` record SHALL be the single source of truth for payment column names; no payment column name string SHALL be hardcoded in any file outside of `ProviderStrategy.ts`.

3. WHEN a developer adds (a) a new detection signal in `ProviderDetector.ts` and (b) a corresponding entry in `PROVIDER_STRATEGIES` and (c) the necessary aliases in `ALIAS_DICTIONARY` for any new canonical fields, THEN a file from the new provider SHALL parse successfully with `audit.provider` equal to the new provider name, `rows.length > 0`, and `stats.netTotal` being a finite number.

---

### Requirement 11: Compatibilidad con el motor existente (migración no destructiva)

**User Story:** Como sistema existente, quiero que los cambios de este feature no rompan la funcionalidad actual de procesamiento de reportes, para que los usuarios no experimenten regresiones.

#### Acceptance Criteria

1. THE following exported types SHALL retain all existing field names and TypeScript types unchanged: `RUPEResult` (`rows`, `stats`, `audit`, `debug`), `ParsedRow` (including `artist_name`, `song_title`, `album_name`, `store`, `earnings_usd` alias fields), `AuditReport`, and `DebugSnapshot`.

2. THE `resolveEarningsColumn(provider: ProviderName, normalizedHeaders: string[], logger: Logger): { colIdx: number | null; fieldUsed: string | null }` function SHALL retain this exact signature; its internal implementation MAY be updated to delegate to the new `PaymentColumnResolver` logic.

3. WHEN the `UNKNOWN` provider is passed to `resolveEarningsColumn`, THE function SHALL iterate `ALIAS_DICTIONARY['net_total']` aliases in order as the fallback strategy, preserving existing behavior for unrecognized files.

4. THE SQL migration file for `import_currency_summary` SHALL use `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` patterns so it is safe to execute more than once without error.

5. THE existing `reports` table and `royalty_records` table SHALL NOT have any column added, removed, or altered by this feature's migration script.
