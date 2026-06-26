# Implementation Plan: payment-column-currency-strategy

## Overview

El código central ya existe en el proyecto. Este plan formaliza los **gaps** detectados entre la implementación actual y los contratos definidos en la spec: cerrar tests faltantes, completar la migración SQL de `currency_records`, conectar `CurrencyTab` al `ReportDetailPage`, y garantizar que las 14 propiedades de corrección estén cubiertas con property-based tests usando Vitest + fast-check.

Las tareas están organizadas para construir incrementalmente sobre el código existente, primero cerrando los gaps de infraestructura/DB, luego los tests de motor, luego la integración UI, y finalmente la persistencia en BD.

---

## Tasks

- [x] 1. Crear migración SQL para la tabla `currency_records`
  - [x] 1.1 Escribir el archivo de migración `supabase/currency-records.sql`
    - Crear la tabla `currency_records` con columnas: `id UUID PK`, `report_id UUID FK → reports(id) ON DELETE CASCADE`, `user_id UUID FK → profiles(id) ON DELETE CASCADE`, `provider TEXT NOT NULL`, `currency TEXT NOT NULL`, `payment_column_used TEXT NOT NULL`, `total NUMERIC(20,8) NOT NULL DEFAULT 0`, `record_count INTEGER NOT NULL DEFAULT 0`, `import_date TIMESTAMPTZ NOT NULL DEFAULT now()`
    - Crear índice `idx_currency_records_report_currency ON currency_records(report_id, currency)`
    - Agregar RLS: `SELECT` para `user_id = auth.uid() OR public.is_admin()`; `INSERT` para `user_id = auth.uid()`
    - Usar `CREATE TABLE IF NOT EXISTS` y `CREATE INDEX IF NOT EXISTS` para idempotencia
    - _Requirements: 9.1, 9.4, 9.5_

- [x] 2. Ampliar `ProviderStrategy.test.ts` con las property-based tests faltantes (Props 1–7, 14)
  - [x] 2.1 Cerrar gaps en el test existente: agregar Property 1 (PaymentColumn no está en EXCLUDED_COLUMNS)
    - Importar `EXCLUDED_COLUMNS` desde `AliasDictionary`; importar `normalizeHeader` desde `HeaderNormalizer`
    - Iterar todos los proveedores conocidos (excluyendo UNKNOWN): verificar que `normalizeHeader(entry.paymentColumn)` no está en `EXCLUDED_COLUMNS` y no es igual a `'grosstotal'`
    - Comentario de trazabilidad: `// Feature: payment-column-currency-strategy, Property 1: PaymentColumn no está en EXCLUDED_COLUMNS`
    - _Requirements: 1.6, 4.2_

  - [x] 2.2 Agregar Property 3 (DefaultCurrency correcta para todos los proveedores no-Dinastía/no-Believe)
    - Verificar con `fc.constantFrom(...KNOWN_V2_PROVIDERS_sin_Dinas_Believe)` que `entry.defaultCurrency === undefined || entry.defaultCurrency === 'USD'`
    - Comentario: `// Feature: payment-column-currency-strategy, Property 3: DefaultCurrency correcta`
    - _Requirements: 1.5_

  - [x] 2.3 Agregar Property 14 (Extensibilidad — nuevo proveedor en tabla funciona sin cambios al motor)
    - Test que agrega dinámicamente `PROVIDER_STRATEGIES['TestProvider'] = { paymentColumn: 'test_payment', defaultCurrency: 'USD' }` y llama `resolveEarningsColumn('TestProvider' as ProviderName, ['testpayment'], logger)` verificando `colIdx !== null`; limpiar después del test
    - Comentario: `// Feature: payment-column-currency-strategy, Property 14: Extensibilidad`
    - _Requirements: 10.1_

- [x] 3. Crear `src/royalty-engine/CurrencyGrouper.test.ts` con unit tests + property-based tests (Props 8–11)
  - [x] 3.1 Implementar unit tests para `CurrencyGrouper`
    - Test: código de moneda vacío usa `defaultCurrency` del proveedor
    - Test: código desconocido usa `defaultCurrency` y emite `[WARN]`
    - Test: sin columna de moneda en headers y sin `defaultCurrency` en estrategia → usa `'USD'` con `[WARN]`
    - Test: filas con múltiples monedas generan un `CurrencyGroup` por moneda
    - Test: `currencyColIdx` es `null` cuando no hay columna de moneda en headers
    - Test: `currencyColIdx` es el índice correcto cuando se detecta columna de moneda
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 3.2 Agregar Property 8 (Aislamiento por moneda — no mezcla de acumuladores)
    - Generador `arbitraryParsedRowWithCurrency()` con `fc.record({ net_total: fc.float({ min: 0, max: 1000 }), currency: fc.constantFrom('USD', 'EUR', 'COP'), ... })`
    - Verificar que `groupByCurrency(rows).groups` donde `g.currency === 'USD'` tiene total igual a la suma directa de `rows.filter(r => r.currency === 'USD').map(r => r.net_total)` (tolerancia 1e-8)
    - Comentario: `// Feature: payment-column-currency-strategy, Property 8: Aislamiento por moneda`
    - _Requirements: 4.4, 6.1, 6.2, 6.5_

  - [x] 3.3 Agregar Property 9 (Conservación de totales — round-trip monetario)
    - Para cualquier `ParsedRow[]`, la suma de todos los `CurrencyGroup.total` debe ser igual a la suma directa de `row.net_total` (tolerancia 1e-8)
    - Comentario: `// Feature: payment-column-currency-strategy, Property 9: Conservación de totales`
    - _Requirements: 6.6_

  - [x] 3.4 Agregar Property 10 (Grupos ordenados descendente por total)
    - Para cualquier input con ≥ 2 grupos de moneda distintos, verificar `groups[i].total >= groups[i+1].total` para todo `i`
    - Comentario: `// Feature: payment-column-currency-strategy, Property 10: Grupos ordenados descendente`
    - _Requirements: 6.4_

  - [x] 3.5 Agregar Property 11 (Porcentajes suman ~100%)
    - Para cualquier input no-vacío con `globalTotal > 0`, verificar `|sum(group.percentage) - 100| < 0.001`
    - Comentario: `// Feature: payment-column-currency-strategy, Property 11: Porcentajes suman ~100%`
    - _Requirements: 6.3_

- [x] 4. Checkpoint — pasar todos los tests de motor
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Crear `src/royalty-engine/CurrencyConverter.test.ts` con unit tests + property-based tests (Props 12–13)
  - [x] 5.1 Implementar unit tests para `CurrencyConverter` con mock de `fetch`
    - Usar `vi.stubGlobal('fetch', ...)` para simular respuestas HTTP
    - Test: timeout > 10s → error `"La solicitud de tasas de cambio excedió el tiempo límite (10 s)."`
    - Test: HTTP 429 → error `"Error al obtener tasas de cambio (HTTP 429). Intenta de nuevo."`
    - Test: JSON sin campo `rates` → error `"Respuesta de tasas de cambio inválida. Intenta de nuevo."`
    - Test: error de red (fetch rechaza) → error `"Error de red al obtener tasas de cambio. Verifica tu conexión."`
    - Test: currency source === target → `rate: 1`, `convertedTotal === originalTotal`
    - _Requirements: 8.2, 8.5, 8.6_

  - [x] 5.2 Agregar Property 12 (Cross-rate fuente→USD→destino)
    - Generador `arbitraryCurrencyGroup()` y `arbitraryRatesMap()` con `fc.record({ USD: fc.constant(1), EUR: fc.float({ min: 0.5, max: 1.5 }), COP: fc.float({ min: 3000, max: 5000 }), ... })`
    - Verificar fórmula: `Math.abs(result.convertedTotal - Math.round(group.total * (rates[target] / rates[source]) * 100) / 100) < 0.01`
    - Stubear `fetch` globalmente para devolver las tasas del generador
    - Comentario: `// Feature: payment-column-currency-strategy, Property 12: Cross-rate de conversión`
    - _Requirements: 8.3_

  - [x] 5.3 Agregar Property 13 (Identidad de conversión: source === target)
    - Para cualquier `CurrencyGroup` con `currency === targetCurrency`, resultado tiene `rate === 1` y `convertedTotal === originalTotal`
    - Comentario: `// Feature: payment-column-currency-strategy, Property 13: Identidad de conversión`
    - _Requirements: 8.4_

- [x] 6. Integrar `CurrencyTab` en `ReportDetailPage`
  - [x] 6.1 Agregar query de `currency_records` en `ReportDetailPage.tsx`
    - Crear un `useQuery` con `queryKey: ['currency-records', id]` que consulte `supabase.from('currency_records').select('*').eq('report_id', id).eq('user_id', user.id).order('total', { ascending: false })`
    - Mapear el resultado a `CurrencyGroup[]` usando los campos `currency`, `total` (cast a `number`), `record_count`, y calculando `percentage` en cliente si no está en BD
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.2 Agregar estado de conversión y handler `handleConvert` en `ReportDetailPage.tsx`
    - Declarar estados: `converting: boolean`, `conversionResult: ConversionResult | null`, `conversionError: string | null`
    - Implementar `handleConvert(target: TargetCurrency)`: llama `convertCurrencies(currencyGroups, target)`, actualiza `conversionResult` o `conversionError` según resultado; mientras corre, `converting = true`
    - _Requirements: 8.1, 8.7, 8.8_

  - [x] 6.3 Agregar pestaña "Monedas" al sistema de tabs en `ReportDetailPage.tsx`
    - Agregar `'monedas'` al tipo de tabs activo (si existe selector de tabs)
    - Renderizar `<CurrencyTab groups={currencyGroups} onConvert={handleConvert} converting={converting} conversionResult={conversionResult} conversionError={conversionError} />` dentro de la sección de tabs
    - Mostrar mensaje de empty-state cuando `currencyGroups.length === 0`
    - _Requirements: 7.1, 7.4_

- [x] 7. Implementar persistencia en `currency_records` post-parse
  - [x] 7.1 Crear función `saveCurrencyRecords` en `src/lib/supabase.ts` o en un nuevo archivo `src/lib/currencyRecords.ts`
    - Función signature: `saveCurrencyRecords(reportId: string, userId: string, provider: string, paymentColumnUsed: string, groups: CurrencyGroup[]): Promise<void>`
    - Construir el array de inserciones mapeando cada `CurrencyGroup` a `{ report_id, user_id, provider, currency: group.currency, payment_column_used: paymentColumnUsed, total: group.totalFixed8, record_count: group.recordCount, import_date: new Date().toISOString() }`
    - Usar `supabase.from('currency_records').insert(records)` en una sola operación
    - En caso de error: loguear con `console.error` y NO relanzar (error no debe bloquear la UI)
    - _Requirements: 9.2, 9.3_

  - [x] 7.2 Invocar `saveCurrencyRecords` desde el flujo post-parse en `UploadPage.tsx`
    - Después del `INSERT` de `royalty_records` exitoso, llamar `saveCurrencyRecords(reportId, user.id, stats.provider, stats.paymentColumnUsed, stats.currencyGroups)` sin `await` bloqueante (usar `void` o `.catch(console.error)`)
    - _Requirements: 9.2, 9.3_

- [x] 8. Crear `src/components/CurrencyTab.test.tsx` con unit tests de UI
  - [x] 8.1 Implementar unit tests para `CurrencyTab`
    - Usar `@testing-library/react` con `vi.fn()` para los handlers
    - Test: con `groups = []` renderiza el mensaje de empty-state (Requirement 7.4)
    - Test: con grupos válidos renderiza una tarjeta por grupo con código de moneda, total a 2 decimales, y porcentaje (Requirement 7.2)
    - Test: `conversionError` muestra el mensaje de error sin perder las tarjetas originales (Requirement 8.7)
    - Test: mientras `converting = true` el botón está deshabilitado (Requirement 8.8)
    - Test: después de una conversión exitosa, las tarjetas muestran `convertedTotal` y `rate` (Requirement 7.5)
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 8.7, 8.8_

- [ ] 9. Checkpoint final — todos los tests pasan
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Las tareas con `*` son opcionales (tests de propiedad y de UI). Se pueden omitir para un MVP más rápido.
- Las tareas de motor (2, 3, 5) son independientes entre sí y pueden ejecutarse en paralelo.
- La tarea 1 (SQL) no tiene dependencias de código TypeScript y puede aplicarse a Supabase en cualquier momento.
- La tarea 6 depende de que la tabla `currency_records` exista (tarea 1) para que las queries no fallen en runtime.
- La tarea 7 depende de que exista la función `saveCurrencyRecords` (7.1) antes de invocarla (7.2).
- El código existente (`ProviderStrategy.ts`, `CurrencyGrouper.ts`, `CurrencyConverter.ts`, `CurrencyTab.tsx`) ya está implementado — las tareas de test amplían o crean archivos de test, no modifican los módulos del motor.
- Para correr los tests: `npm test` (vitest run) o `npx vitest run --reporter=verbose`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "5.1"] },
    { "id": 1, "tasks": ["2.2", "2.3", "3.2", "3.3", "3.4", "3.5", "5.2", "5.3"] },
    { "id": 2, "tasks": ["6.1", "7.1", "8.1"] },
    { "id": 3, "tasks": ["6.2", "7.2"] },
    { "id": 4, "tasks": ["6.3"] }
  ]
}
```
