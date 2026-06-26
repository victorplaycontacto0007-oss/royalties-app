# Implementation Plan: payment-column-strategy

## Overview

Implementación en seis fases ordenadas por dependencias:

1. **Motor** — refactor `ProviderStrategy`, detector, alias, nuevo `CurrencyGrouper`, extensión de `Statistics` e integración en `UniversalParser`, más exportaciones en `index.ts`.
2. **Tests PBT** — property-based tests con `fast-check` para las 10 propiedades formales del diseño.
3. **CurrencyConverter** — cliente HTTP de tasas de cambio bajo demanda.
4. **UI** — nuevo `CurrencyTab.tsx` e integración en `UploadPage.tsx`.
5. **DB y tipos** — migración SQL `v3-currency-migration.sql` y extensión de `database.ts`.
6. **QA** — typecheck TypeScript y verificación de compatibilidad hacia atrás.

Cada tarea construye sobre las anteriores. Al terminar la Fase 1, el motor es completamente funcional sin UI. Al terminar la Fase 4, el flujo de carga completo está operativo. Las fases 5 y 6 son el cierre de producción.

---

## Tasks

- [ ] 1. Instalar dependencia `fast-check` para property-based testing
  - Ejecutar `npm install --save-dev fast-check@3` para agregar la dependencia de PBT
  - Verificar que `package.json` refleja la nueva `devDependency`
  - _Requirements: testing strategy (design.md)_

- [ ] 2. Actualizar `ProviderStrategy.ts` — nueva tabla y resolver determinista
  - [ ] 2.1 Extender `ProviderName` con `'Dinastía'`, `'Spotify Direct'`, `'Apple Music Reports'`, `'Amazon Music Reports'`, `'Tidal Reports'`, `'YouTube Content ID'`; mantener los nombres V1 (`Spotify`, `Apple Music`, etc.) en la unión de tipos para compatibilidad con datos existentes en DB
    - Los nombres V1 ya no tendrán entradas en `PROVIDER_STRATEGIES` pero permanecen en el tipo
    - _Requirements: 1.1, 11.1_
  - [ ] 2.2 Extender `ProviderStrategyEntry` agregando campo `paymentColumn: string` (obligatorio) y `defaultCurrency?: string` (opcional); marcar `earningsCandidates` como `@deprecated` y `secondaryField` como `@deprecated`
    - El campo `earningsCandidates` se conserva como `earningsCandidates?: string[]` para no romper los tests existentes
    - _Requirements: 1.1, 10.2, 11.2_
  - [ ] 2.3 Reescribir `PROVIDER_STRATEGIES` con las 21 entradas nuevas (incluyendo `'Dinastía'` → `net_total_client_currency`, DSPs renombrados, y `UNKNOWN` con `paymentColumn: ''` como sentinel)
    - Seguir exactamente la tabla de `design.md § 1c`
    - `defaultCurrency` debe estar en todas las entradas no-UNKNOWN
    - _Requirements: 1.1, 1.2, 3.1_
  - [ ] 2.4 Reescribir la lógica interna de `resolveEarningsColumn()` como `PaymentColumnResolver` manteniendo la firma pública sin cambios: `(provider, normalizedHeaders, logger) → { colIdx, fieldUsed }`
    - Implementar los cuatro paths del algoritmo de `design.md § 2`: guard-missing-provider, UNKNOWN/empty-paymentColumn, known-provider-found, known-provider-not-found
    - Importar y usar `normalizeHeader` de `HeaderNormalizer.ts` para normalizar `paymentColumn` antes del `indexOf`
    - Nunca retornar el índice de una columna cuyo normalized form esté en `EXCLUDED_COLUMNS`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.4, 11.2_

  - [ ]* 2.5 Escribir property test — Property 1: cada proveedor conocido tiene `paymentColumn` string
    - **Property 1: Cada proveedor tiene exactamente un `paymentColumn`**
    - Usar `fc.constantFrom(...allKnownProviderNames)` para iterar todos los proveedores excepto `UNKNOWN`
    - Verificar que `PROVIDER_STRATEGIES[p].paymentColumn` es string no vacío
    - **Validates: Requirements 1.1**

  - [ ]* 2.6 Escribir property test — Property 2: resolver encuentra la columna cuando está presente
    - **Property 2: `PaymentColumnResolver` encuentra la columna cuando está presente**
    - Usar `fc.record({ provider: fc.constantFrom(...knownProviders), position: fc.nat(20) })` para generar headers que incluyan la columna esperada en posición aleatoria
    - Verificar que `colIdx === position`
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 2.7 Escribir property test — Property 3: resolver retorna null cuando la columna no está
    - **Property 3: `PaymentColumnResolver` retorna null cuando la columna no está**
    - Generar arrays de headers que deliberadamente NO incluyan el `normalizeHeader(paymentColumn)` del proveedor (filtrar con `fc.array(fc.string()).filter(...)`)
    - Verificar `colIdx === null`
    - **Validates: Requirements 2.3, 3.2, 3.4**

  - [ ]* 2.8 Escribir property test — Property 4: Dinastía nunca usa columna sustituta
    - **Property 4: Dinastía nunca usa columna sustituta**
    - Usar `fc.array(fc.string())` generando headers que NO contienen `'nettotalclientcurrency'` pero pueden contener cualquier alias de `ALIAS_DICTIONARY['net_total']`
    - Verificar que `colIdx === null` siempre para proveedor `'Dinastía'`
    - **Validates: Requirements 3.2, 3.4**

- [ ] 3. Actualizar `ProviderDetector.ts` — señales para Dinastía y DSPs renombrados
  - [ ] 3.1 Agregar entrada `{ name: 'Dinastía', signals: ['dinastia', 'nettotalclientcurrency', 'clientcurrency'] }` **antes** del bloque de DSPs genéricos en el array `PROVIDERS` (tiebreak por posición)
    - _Requirements: 3.1, 10.3_
  - [ ] 3.2 Reemplazar las entradas V1 de DSPs por sus versiones renombradas según `design.md § 3`:
    - `'Spotify'` → `'Spotify Direct'` con signals `['spotifydirect']`
    - `'Apple Music'` → `'Apple Music Reports'` con signals `['applemusicreports', 'applemusic']`
    - `'Amazon Music'` → `'Amazon Music Reports'` con signals `['amazonmusicreports', 'amazonmusic']`
    - `'Tidal'` → `'Tidal Reports'` con signals `['tidalreports', 'tidal']`
    - `'YouTube'` → `'YouTube Content ID'` con signals `['youtubecontentid', 'youtube', 'contentid', 'partnerrevenue']`
    - _Requirements: 1.1, 10.3_

- [ ] 4. Actualizar `AliasDictionary.ts` — alias `royalties` para Spotify Direct
  - Agregar la cadena `'royalties'` a la lista de aliases de `net_total` en `ALIAS_DICTIONARY` (necesario para que `UNKNOWN` fallback encuentre la columna de Spotify Direct)
  - Agregar `'clientcurrency'` a la lista de aliases de `currency` si no existe ya
  - _Requirements: 5.1, 10.3_

- [ ] 5. Crear `CurrencyGrouper.ts` — nuevo módulo de agrupamiento por moneda
  - [ ] 5.1 Crear `src/royalty-engine/CurrencyGrouper.ts` con las interfaces `CurrencyGroup` y `CurrencyGrouperResult` exactamente como están en `design.md § 4`
    - `CurrencyGroup`: `{ currency, total, totalFixed8, recordCount, percentage }`
    - `CurrencyGrouperResult`: `{ groups, currencyColIdx }`
    - _Requirements: 6.1, 6.2_
  - [ ] 5.2 Implementar la función `groupByCurrency(rows, rawHeaders, provider, logger)` siguiendo el algoritmo de 7 pasos de `design.md § 4`:
    - Paso 1: detectar columna de moneda en `normalizedHeaders` iterando `CURRENCY_CANDIDATES` en orden
    - Paso 2: si no se detecta, usar `PROVIDER_STRATEGIES[provider]?.defaultCurrency ?? 'USD'`; loguear `[WARN]` si no hay `defaultCurrency`
    - Paso 3: por cada fila, usar `row.currency` (ya populado por `extractRow()`) como valor de moneda; si vacío o desconocido, asignar a `defaultCurrency` y loguear `[WARN]`
    - Paso 4–5: acumular con un `DecimalAccumulator` independiente por currency group; nunca mezclar accumulators de grupos diferentes
    - Paso 6: calcular `percentage = globalTotal > 0 ? (groupTotal / globalTotal) * 100 : 0`
    - Paso 7: ordenar desc por `total`, retornar `{ groups, currencyColIdx }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 5.3 Escribir property test — Property 5: totales por moneda correctos
    - **Property 5: Acumulación por moneda produce totales correctos**
    - Usar `fc.array(rowArbitrary)` donde `rowArbitrary = fc.record({ currency: fc.constantFrom('USD','EUR','COP'), net_total: fc.float({ min: 0, max: 1e6, noNaN: true }) })`
    - Verificar que `group.total` ≈ suma aritmética de `net_total` de todas las filas con esa moneda (tolerancia `1e-8`)
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 5.4 Escribir property test — Property 6: suma de grupos = total global
    - **Property 6: La suma de todos los grupos es igual al total global**
    - Para cualquier `ParsedRow[]`, verificar que `Σ groups[i].total ≈ Σ rows[j].net_total` (tolerancia `1e-8`)
    - **Validates: Requirements 6.2, 6.3**

  - [ ]* 5.5 Escribir property test — Property 7: percentages suman 100 (o 0 si todo es cero)
    - **Property 7: `percentage` suma 100 (o 0 cuando todo es cero)**
    - Separar en dos ramas: `globalTotal > 0` → `Σ percentage ≈ 100.0`; `globalTotal === 0` → todos `percentage === 0`
    - **Validates: Requirements 6.2, 6.4**

  - [ ]* 5.6 Escribir property test — Property 8: orden descendente por total
    - **Property 8: Orden descendente por total**
    - Para cada par de grupos adyacentes `(groups[i], groups[i+1])`, verificar `groups[i].total >= groups[i+1].total`
    - **Validates: Requirements 6.6**

- [ ] 6. Extender `Statistics.ts` — agregar `currencyGroups` y `paymentColumnUsed` a `RUPEStats`
  - Agregar a la interfaz `RUPEStats`: `currencyGroups: CurrencyGroup[]` y `paymentColumnUsed: string`
  - Actualizar la firma de `computeStats()` agregando dos parámetros opcionales con defaults: `currencyGroups: CurrencyGroup[] = []` y `paymentColumnUsed: string = ''`
  - Incluir ambos campos en el objeto retornado por `computeStats()`
  - Importar `CurrencyGroup` desde `CurrencyGrouper.ts` en `Statistics.ts`
  - _Requirements: 11.1, 11.2_

- [ ] 7. Integrar `CurrencyGrouper` en `UniversalParser.ts`
  - [ ] 7.1 Importar `groupByCurrency` y `CurrencyGroup` desde `CurrencyGrouper.ts`
    - _Requirements: 6.1_
  - [ ] 7.2 Agregar el guard para Dinastía sin columna de pago: después de llamar a `resolveEarningsColumn()`, si `provider === 'Dinastía' && earningsColIdx === null`, lanzar `Error` con el mensaje especificado en `design.md § 2` antes de iniciar el loop de filas
    - _Requirements: 3.3_
  - [ ] 7.3 Después del loop principal (antes de `buildAuditReport`), llamar a `groupByCurrency(state.rows, rawHeaders, provider, logger)` y capturar `currencyGroups`
    - _Requirements: 6.1_
  - [ ] 7.4 Pasar `currencyGroups` y `earningsFieldUsed ?? ''` a `computeStats()` como quinto y sexto parámetro nuevo
    - _Requirements: 11.1_

- [ ] 8. Actualizar `index.ts` — exportar nuevos módulos y tipos
  - Agregar exports: `CurrencyGrouper`, `groupByCurrency`, y el type `CurrencyGroup` desde `CurrencyGrouper.ts`
  - Verificar que `ProviderName`, `ProviderStrategyEntry`, y `PROVIDER_STRATEGIES` siguen exportados
  - _Requirements: 10.1_

- [ ] 9. Checkpoint — motor completo, ejecutar suite de tests existente
  - Asegurar que todos los tests pasan: `npm test`
  - Prestar especial atención a `ProviderStrategy.test.ts` (los tests V1 serán actualizados en task 10)
  - Resolver cualquier error de TypeScript antes de avanzar a la siguiente fase

- [ ] 10. Actualizar `ProviderStrategy.test.ts` — PBT Properties 1–4 + ajustar tests V1
  - [ ] 10.1 Actualizar los tests de unidad V1 existentes para reflejar los nombres de proveedores nuevos (21 entradas en lugar de 20, `'Spotify Direct'` en lugar de `'Spotify'`, etc.)
    - Los tests de `PROVIDER_STRATEGIES shape` deben reflejar el nuevo conteo y nombres
    - _Requirements: 1.1_
  - [ ]* 10.2 Implementar los 4 property tests (Properties 1–4) con `fast-check` en `ProviderStrategy.test.ts` (ver especificación en tasks 2.5–2.8)
    - Cada property test usa `fc.assert(fc.property(...), { numRuns: 100 })`
    - Incluir comentario de trazabilidad: `// Feature: payment-column-strategy, Property N: ...`
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 3.2, 3.4_

- [ ] 11. Crear `CurrencyGrouper.test.ts` — PBT Properties 5–8 + unit tests edge cases
  - [ ] 11.1 Crear `src/royalty-engine/CurrencyGrouper.test.ts` con los 4 property tests (Properties 5–8) con `fast-check` (ver especificación en tasks 5.3–5.6)
    - Definir `rowArbitrary` como `fc.record({ currency: fc.constantFrom('USD','EUR','COP','GBP'), net_total: fc.float({ min: -1e4, max: 1e6, noNaN: true }) })` con los campos mínimos de `ParsedRow`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_
  - [ ]* 11.2 Agregar unit tests de ejemplo para edge cases de `CurrencyGrouper`:
    - Archivo sin columna de moneda → usa `defaultCurrency`
    - Código de moneda desconocido en fila → asignado a `defaultCurrency`, log `[WARN]`
    - `globalPaymentTotal === 0` → todos los `percentage` son `0`
    - _Requirements: 5.3, 5.4, 5.5, 6.4_

- [ ] 12. Extender `DecimalAccumulator.test.ts` — PBT Properties 9 y 10
  - [ ]* 12.1 Agregar property test — Property 9: precisión Decimal(20,8) en acumulación
    - **Property 9: Precisión Decimal(20,8) en acumulación**
    - `fc.array(fc.float({ min: 0, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 200 })`
    - Verificar `|acc.toNumber() - Σvalores| < 1e-8`
    - **Validates: Requirements 4.1, 4.4**
  - [ ]* 12.2 Agregar property test — Property 10: celdas no numéricas contribuyen cero al total
    - **Property 10: Celdas no numéricas contribuyen cero al total**
    - Usar `fc.array(fc.oneof(fc.float({ noNaN: true }), fc.constant(NaN), fc.constant(0)))` simulando que `MoneyParser` retorna `NaN` para celdas no numéricas
    - Verificar que `acc.toNumber()` ≈ suma de valores finitos únicamente (equivalente a `parseMoney` retornando `0` para NaN)
    - **Validates: Requirements 4.5**

- [ ] 13. Checkpoint — todos los PBT pasan, typecheck sin errores
  - Ejecutar `npm test` y verificar que todas las propiedades 1–10 pasan en mínimo 100 iteraciones cada una
  - Ejecutar `npx tsc --noEmit` y resolver cualquier error de tipos antes de avanzar

- [ ] 14. Crear `CurrencyConverter.ts` — cliente HTTP de tasas de cambio bajo demanda
  - [ ] 14.1 Crear `src/royalty-engine/CurrencyConverter.ts` con el type `TargetCurrency`, la interface `ConversionResult`, y la función `convertCurrencies(groups, targetCurrency, signal?)`
    - Endpoint: `https://open.er-api.com/v6/latest/USD` (base USD, sin API key)
    - Derivar tasas cruzadas: `rate = rates[target] / rates[source]`; si `source === target`, `rate = 1.0` sin hacer sub-request
    - Timeout de 10 segundos usando `AbortController` + `AbortSignal.timeout(10_000)` o un `setTimeout` manual
    - Lanzar `Error` con mensaje de UI en caso de red, HTTP 4xx/5xx, o timeout
    - _Requirements: 8.2, 8.5, 8.6, 8.7_
  - [ ]* 14.2 Crear `src/royalty-engine/CurrencyConverter.test.ts` con unit tests usando `fetch` mockeado (vi.stubGlobal / vi.fn):
    - Petición exitosa → `convertedTotal = originalTotal * rate`, `rate = 1.0` para misma moneda
    - Timeout 10s → lanza Error
    - HTTP 500 → lanza Error
    - _Requirements: 8.2, 8.5, 8.7_

- [ ] 15. Crear `CurrencyTab.tsx` — componente de pestaña de monedas
  - [ ] 15.1 Crear `src/components/CurrencyTab.tsx` con la interface `CurrencyTabProps` y el layout del diseño: selector de divisa destino (7 opciones), botón "Convertir Totales" (disabled durante `converting`), y grid de tarjetas por `CurrencyGroup`
    - Cada tarjeta muestra: badge con código de moneda, total formateado a 2 decimales, `recordCount` entero, `percentage` redondeado a 2 decimales + `%`
    - Tras conversión exitosa, mostrar `convertedTotal` en cada tarjeta etiquetado con el código destino
    - Cuando `groups.length === 0`, mostrar `"No se encontraron datos de monedas para este reporte."`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.3, 8.4, 8.5_
  - [ ] 15.2 Mostrar spinner en el botón durante `converting === true` (usar `Loader2` de `lucide-react` o equivalente disponible en el proyecto); re-habilitar el botón cuando `converting === false`
    - _Requirements: 8.3_
  - [ ]* 15.3 Mostrar el mensaje de error `"Error al obtener tasas de cambio. Intenta de nuevo."` bajo el botón cuando `conversionError !== null`
    - _Requirements: 8.5_

- [ ] 16. Integrar en `UploadPage.tsx` — tab switcher, handleConvert, y persistencia
  - [ ] 16.1 Agregar los cuatro estados nuevos de React: `activeTab`, `converting`, `conversionResult`, `conversionError` con sus tipos y valores iniciales
    - _Requirements: 7.1_
  - [ ] 16.2 Implementar el handler `handleConvert(target: TargetCurrency)` siguiendo el pseudocódigo de `design.md § 8`: `setConverting(true)`, `convertCurrencies(...)`, `setConversionResult(...)`, `setConversionError(...)`, `setConverting(false)` en `finally`
    - Importar `convertCurrencies` desde `CurrencyConverter.ts` y `TargetCurrency` como tipo
    - _Requirements: 8.2, 8.3, 8.5_
  - [ ] 16.3 En los estados `success` y `discrepancy`, si `stats.currencyGroups.length > 0`, renderizar el tab switcher Auditoría/Monedas y el componente `CurrencyTab` condicionalmente según `activeTab`
    - Usar el badge `{stats.currencyGroups.length}` en el tab "Monedas" tal como indica el diseño
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ] 16.4 En `processFile()`, después del step 5 (mark complete), agregar el bloque de persistencia en `import_currency_summary`: mapear `parsedStats.currencyGroups` a `summaryRows` e insertar con `db.from('import_currency_summary').insert(summaryRows)`; envolver en `try/catch` independiente que solo loguea `[ERROR]` sin relanzar
    - _Requirements: 9.1, 9.3_

- [ ] 17. Crear migración SQL `supabase/v3-currency-migration.sql`
  - Crear el archivo con el contenido exacto del `Appendix: SQL Migration` de `design.md`: `CREATE TABLE IF NOT EXISTS public.import_currency_summary`, índices, RLS policies
  - Verificar que el script usa `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, y `CREATE POLICY IF NOT EXISTS` en todos los statements (idempotencia)
  - Confirmar que **no** modifica las tablas `reports`, `royalty_records`, ni ninguna columna V1/V2
  - _Requirements: 9.1, 9.2, 9.4, 11.4, 11.5_

- [ ] 18. Actualizar `src/types/database.ts` — interface `ImportCurrencySummary`
  - Agregar la interface `ImportCurrencySummary` con los campos que reflejan la tabla `import_currency_summary`: `id`, `report_id`, `user_id`, `distributor`, `currency`, `payment_column_used`, `total_by_currency`, `record_count`, `import_date`
  - Agregar el type export `export type ImportCurrencySummary = ...`
  - No modificar ningún tipo existente (`Report`, `RoyaltyRecord`, `ReportV2`, etc.)
  - _Requirements: 9.1, 11.1_

- [ ] 19. Checkpoint final — typecheck y verificación de compatibilidad hacia atrás
  - [ ] 19.1 Ejecutar `npx tsc --noEmit` y corregir todos los errores de TypeScript
    - _Requirements: 11.1, 11.2_
  - [ ] 19.2 Verificar compatibilidad hacia atrás:
    - Llamar a `parseFile(file)` sin `options` (no debe romper)
    - Verificar que `{ rows, stats, audit, debug }` es desestructurable desde `RUPEResult` (tipos no cambiaron)
    - Verificar que el insert a `royalty_records` en `UploadPage.tsx` sigue funcionando sin cambios (los campos `report_id`, `user_id`, `sale_period`, etc. no fueron alterados)
    - _Requirements: 11.1, 11.2, 11.3, 11.5_
  - [ ] 19.3 Ejecutar `npm test` una última vez y confirmar que toda la suite pasa (0 fallos)
    - _Requirements: general_

---

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia los requisitos específicos del feature para trazabilidad
- Los checkpoints (tasks 9, 13, 19) son puntos de validación incremental — no avanzar si hay errores
- Los property tests usan `fast-check` con `numRuns: 100` mínimo; incluir comentario de trazabilidad en cada `fc.assert`
- El motor `UniversalParser.ts` acepta `currencyGroups: []` como default en `computeStats()` — archivos que no pasan groups son backward compatible
- `fast-check` debe instalarse como `devDependency` (task 1) antes de escribir cualquier PBT
- La migración SQL (task 17) es independiente del código TypeScript y puede ejecutarse en Supabase en cualquier momento entre tasks 16 y 19

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "3.1", "3.2", "4"] },
    { "id": 3, "tasks": ["2.4"] },
    { "id": 4, "tasks": ["2.5", "2.6", "2.7", "2.8", "5.1"] },
    { "id": 5, "tasks": ["5.2", "6"] },
    { "id": 6, "tasks": ["5.3", "5.4", "5.5", "5.6", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3"] },
    { "id": 8, "tasks": ["7.4", "8"] },
    { "id": 9, "tasks": ["10.1", "14.1"] },
    { "id": 10, "tasks": ["10.2", "11.1", "12.1", "12.2", "14.2"] },
    { "id": 11, "tasks": ["11.2", "15.1"] },
    { "id": 12, "tasks": ["15.2", "15.3", "16.1"] },
    { "id": 13, "tasks": ["16.2", "16.3"] },
    { "id": 14, "tasks": ["16.4", "17", "18"] },
    { "id": 15, "tasks": ["19.1", "19.2", "19.3"] }
  ]
}
```
