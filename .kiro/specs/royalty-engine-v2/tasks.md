# Implementation Plan: Royalty Engine V2.0

## Overview

Plan de implementación para RUPE V2.0. Las tareas están organizadas en 7 fases secuenciales para minimizar dependencias. Cada tarea referencia los requirements que satisface.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": [1, 2, 3, 4], "description": "Nuevos módulos base — sin dependencias entre sí" },
    { "wave": 2, "tasks": [5, 6, 7, 8, 9, 10, 11, 12], "description": "Upgrades módulos existentes — requieren wave 1" },
    { "wave": 3, "tasks": [13, 14, 15], "description": "UniversalParser + DB schema — requieren wave 2" },
    { "wave": 4, "tasks": [16, 17, 18, 19, 20], "description": "UI + exports — requieren wave 3" },
    { "wave": 5, "tasks": [21, 22, 23], "description": "QA y verificación final" }
  ]
}
```

## Tasks

Each task maps directly to requirements and design components. Tasks are ordered for minimum dependency — complete Phase 1 before starting Phase 2, etc.

---

## Phase 1: Engine Core — Nuevos módulos base

- [x] 1. **ProviderStrategy.ts** — Tabla de estrategias por proveedor
  - Crear `src/royalty-engine/ProviderStrategy.ts`
  - Definir tipo `ProviderName` con los 20 proveedores + UNKNOWN
  - Definir interface `ProviderStrategyEntry { earningsCandidates: string[], secondaryField?: string }`
  - Implementar `PROVIDER_STRATEGIES` con las 20 entradas según spec (Requirement 4.1)
  - Implementar `resolveEarningsColumn(provider, normalizedHeaders, logger)` que:
    - Itera los candidatos en orden, busca exact match en normalizedHeaders
    - Si no encuentra candidato, hace fallback al siguiente
    - Si ningún candidato existe, usa AliasDictionary para `net_total`
    - Loguea con [INFO] qué columna fue seleccionada y por qué estrategia
    - Loguea [WARN] si usó fallback, [ERROR] si usó generic alias
  - Exportar desde `index.ts`
  - _Requirement: 4_

- [x] 2. **DecimalAccumulator.ts** — Acumulación sin float drift
  - Crear `src/royalty-engine/DecimalAccumulator.ts`
  - Implementar clase `DecimalAccumulator` usando `BigInt` (escala ×10^8)
  - Método `add(value: number): void` — convierte a BigInt antes de sumar
  - Método `toNumber(): number` — divide BigInt por 1e8
  - Método `toFixed8(): string` — formatea con exactamente 8 decimales
  - Método `reset(): void`
  - Verificar que acumular 100.000 valores de `0.00000001` produce `0.00100000` exacto
  - _Requirement: 6_

- [x] 3. **RowValidator.ts** — Validación de filas
  - Crear `src/royalty-engine/RowValidator.ts`
  - Definir `ValidationIssue { rowIndex, type, field, message }`
  - Definir `ValidationResult { issues, isSkipped }`
  - Implementar clase `RowValidator(expectedColCount, fileCurrency)`
  - Implementar `validate(row, rowIndex, colMap): ValidationResult`:
    - Check `corrupt`: `row.length !== expectedColCount` → `isSkipped = true`
    - Check `empty_field`: campos requeridos (artist, track, platform, country, sale_period) vacíos → issue, continuar
    - Check `non_numeric`: columnas monetarias con texto no parseable → issue, valor = 0
    - Check `negative`: `net_total < 0` → issue, incluir fila
    - Check `duplicate`: clave compuesta ya en Set → issue, incluir fila
    - Check `currency_mismatch`: columna currency ≠ fileCurrency → issue, incluir fila
  - Solo generar issues cuando hay problema (no loguear filas limpias)
  - _Requirement: 7_

- [x] 4. **AuditReport.ts** — Tipos y builder de auditoría
  - Crear `src/royalty-engine/AuditReport.ts`
  - Definir interface `AuditReport` (ver design.md)
  - Definir interface `DebugSnapshot` (ver design.md)
  - Implementar `buildAuditReport(params): AuditReport`:
    - Comparar accumulated net vs. re-sum de la columna de earnings para status `valid`/`discrepancy`
    - Si difieren en cualquier cantidad → `discrepancy` con nota explicativa
    - Calcular `reportedMonth` como período más frecuente en los datos
  - Implementar `buildDebugSnapshot(params): DebugSnapshot`
  - Exportar desde `index.ts`
  - _Requirement: 10, 11_

---

## Phase 2: Engine Core — Upgrades a módulos existentes

- [x] 5. **AliasDictionary.ts** — Agregar aliases faltantes
  - Agregar a `net_total`: `partnerrevenue`, `netpayable`, `revenue`
  - Agregar a `quantity`: `partnerstreams` (YouTube)
  - Agregar a `platform`: `contenttype` (YouTube)
  - Verificar que todos los candidatos de `PROVIDER_STRATEGIES` tienen alias correspondiente
  - _Requirement: 2, 4_

- [x] 6. **ProviderDetector.ts** — Ampliar señales de detección
  - Agregar señales para: `UnitedMasters`, `FUGA`, `RouteNote`, `Too Lost`, `TikTok`, `Meta`
  - Agregar señal de desempate: cuando múltiples providers hacen match, usar el primero en lista
  - Limitar detección a nombre de archivo + headers normalizados (NO contenido de celdas)
  - Loguear provider detectado al inicio con [INFO]
  - Loguear [WARN] si provider = UNKNOWN con mensaje "estrategia genérica en uso"
  - _Requirement: 3_

- [x] 7. **HeaderFinder.ts** — Ajustes V2
  - Ampliar escaneo a primeras 40 filas (ya está en V1, confirmar)
  - Si ninguna fila hace match de aliases → usar fila 0 + log [WARN] "No se encontró header, usando fila 0"
  - Tratar todas las filas post-header como data rows (ya está)
  - _Requirement: 16_

- [x] 8. **CurrencyDetector.ts** — Frequency-wins multi-currency
  - Refactorizar para escanear columna de currency en TODAS las filas (no solo primeras 30)
  - Implementar frequency-wins: retornar la moneda más frecuente
  - Si múltiples monedas detectadas → guardar mapa para uso en RowValidator
  - Si ninguna detectada → retornar 'USD' + log [WARN] "Moneda no detectada, usando USD por defecto"
  - _Requirement: 13_

- [x] 9. **MoneyParser.ts** — Completar strips de moneda
  - Agregar `MXN` al strip de currency codes (ya tiene USD/EUR/COP/GBP)
  - Agregar `BRL`, `CHF`, `SEK`, `NOK`, `DKK`, `CAD`, `AUD`, `JPY` al strip
  - Confirmar que `(1234.56)` → `-1234.56` funciona
  - Confirmar que `15 000,55` (espacio como miles) parsea correctamente
  - _Requirement: 5_

- [x] 10. **SeparatorDetector.ts** — Fallback explícito
  - Si todos los conteos son 0 → retornar `,` como default + log [INFO] "No se detectó separador, usando coma"
  - _Requirement: 1_

- [x] 11. **Logger.ts** — Summary mejorado
  - Actualizar `summary()` para incluir: `rows processed`, `rows skipped`, `total errors`
  - Recibir estos contadores como parámetros o vía método `setSummaryStats(processed, skipped, errors)`
  - _Requirement: 17_

- [x] 12. **Statistics.ts** — Agregar stats V2
  - Agregar `totalDownloads: number` (suma quantity de filas marcadas como download)
  - Agregar `byAlbum: Array<{name, net, streams}>` top 20
  - Agregar `auditStatus: 'valid' | 'discrepancy' | 'error'`
  - Agregar `processingTimeMs: number`
  - Mantener todos los campos V1 sin cambios
  - _Requirement: 9_

---

## Phase 3: UniversalParser.ts — Reescritura core

- [x] 13. **UniversalParser.ts** — Integrar todo V2
  - Actualizar `parseFile()` para:
    - Verificar tamaño antes de leer (default max 1 GB; configurable via options)
    - Detectar encoding (BOM detection para UTF-16, UTF-8 BOM; heurística bytes para Latin1/CP1252)
    - Para CSV/TSV/TXT: usar Papa.parse en modo chunk (16 KB) para streaming real
    - Para XLSX/XLS/ODS: leer con XLSX.read, procesar en bloques de 1000 sin acumular array completo
    - Usar `resolveEarningsColumn()` para obtener columna según provider strategy
    - Usar `RowValidator` para validar cada fila
    - Usar `DecimalAccumulator` para acumular net, gross, taxes, costs, otherCosts
    - Capturar first20/last20 rows para DebugSnapshot
    - Emitir `onProgress` cada 10.000 filas procesadas
    - Emitir `onProgress` al completar
    - Construir `AuditReport` al final usando `buildAuditReport()`
    - Construir `DebugSnapshot` al final usando `buildDebugSnapshot()`
    - Retornar `{ rows, stats, audit, debug }` (V2) — backward compatible
  - Soportar `.ods` pasando por la misma rama que XLSX (xlsxjs lo soporta con bookType:'ods')
  - Mantener MAX_ROWS configurable, subir default a 500.000
  - _Requirement: 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 17, 18, 19_

---

## Phase 4: Database Schema Migration

- [x] 14. **Supabase schema migration** — Columnas V2 en reports
  - Crear `supabase/v2-migration.sql`
  - Agregar 11 columnas aditivas a `reports` (ver design.md):
    - `provider`, `currency`, `net_total`, `gross_total`, `taxes`, `channel_costs`, `other_costs`
    - `audit_status`, `discrepancy_note`, `processing_ms`, `reported_month`, `total_columns`, `error_rows`
  - Crear índices en `provider` y `audit_status`
  - Incluir comentario `-- V2 additive migration; does NOT alter or drop existing columns`
  - _Requirement: 12, 14, 19_

- [x] 15. **database.ts** — Actualizar tipos TypeScript
  - Agregar interface `ReportV2 extends Report` con los nuevos campos
  - Mantener `Report` original sin modificar (backward compat)
  - Exportar `ReportV2`
  - _Requirement: 19_

---

## Phase 5: UploadPage.tsx — UI V2

- [x] 16. **UploadPage.tsx** — Agregar estado `discrepancy` y progreso mejorado
  - Agregar estado `'discrepancy'` al tipo `UploadStatus`
  - Cuando `audit.status === 'discrepancy'` → setStatus('discrepancy') en lugar de 'success'
  - Pasar `onProgress` a `parseFile()` y actualizar setProgress con filas procesadas
  - Persistir campos V2 en el `reports` insert:
    - `provider`, `currency`, `net_total`, `gross_total`, `taxes`, `channel_costs`, `other_costs`
    - `audit_status`, `discrepancy_note`, `processing_ms`, `reported_month`, `total_columns`, `error_rows`
  - Agregar `.ods` al `accept` del dropzone
  - _Requirement: 15_

- [x] 17. **AuditSummary component** — Tarjeta de resumen post-importación
  - Crear `src/components/AuditSummary.tsx`
  - Props: `audit: AuditReport, stats: RUPEStats`
  - Mostrar: Provider, Archivo, Período, Moneda, Filas, Columnas, Bruto, Impuestos, Costos, Neto, Estado, Tiempo
  - Estado `valid` → badge verde; `discrepancy` → badge amarillo con nota
  - Reemplazar el bloque de stats actual en UploadPage por este componente
  - _Requirement: 10, 15_

- [x] 18. **DebugViewer component** — Modal "Ver Auditoría"
  - Crear `src/components/DebugViewer.tsx`
  - Props: `debug: DebugSnapshot, audit: AuditReport, isOpen: boolean, onClose: () => void`
  - Secciones:
    1. Proveedor detectado + columna de cálculo usada
    2. Tabla de columnas detectadas (campo → nombre columna → índice)
    3. Tabla primeras 20 filas (raw data)
    4. Tabla últimas 20 filas (raw data)
    5. Total acumulado (full precision) vs. total mostrado (2 dec)
    6. Lista de errores de validación con colores (WARN=yellow, ERROR=red)
  - Si `discrepancy`: banner prominente con "columna usada: X, total calculado: Y, diferencia: Z"
  - _Requirement: 11_

- [x] 19. **UploadPage.tsx** — Integrar AuditSummary + DebugViewer
  - Almacenar `debug: DebugSnapshot | null` en estado local
  - Botón "Ver Auditoría" → abre DebugViewer
  - Mostrar AuditSummary en estado `success` y `discrepancy`
  - Mostrar log de procesamiento colapsable (ya existe en V1, mantener)
  - _Requirement: 11, 15, 17_

---

## Phase 6: index.ts — Exports finales

- [x] 20. **index.ts** — Actualizar exports
  - Mantener todos los exports V1 sin cambios (backward compat)
  - Agregar exports nuevos: `AuditReport`, `DebugSnapshot`, `RowValidator`, `ValidationIssue`, `DecimalAccumulator`, `ProviderStrategy`, `PROVIDER_STRATEGIES`, `resolveEarningsColumn`
  - _Requirement: 19_

---

## Phase 7: Validación y QA

- [x] 21. **Verificación de tipos TypeScript**
  - Ejecutar `npx tsc --noEmit` y corregir todos los errores de tipos
  - Verificar que UploadPage.tsx compila sin errores con los nuevos tipos

- [x] 22. **Smoke test manual — archivos reales**
  - Probar con archivo DistroKid TSV: verificar provider=DistroKid, columna=Earnings(USD)
  - Probar con archivo Ditto XLSX: verificar provider=Ditto, columna=Net Total, secundaria=Net Total Client Currency
  - Probar con un CSV con separador `;`: verificar detección correcta
  - Probar con archivo con preamble (filas de metadata antes del header): verificar headerIdx > 0
  - Probar con archivo ODS: verificar que parsea igual que XLSX
  - Verificar que el total calculado aparece en el AuditSummary

- [x] 23. **Verificar backward compatibility**
  - Verificar que `parseFile(file)` sin options funciona igual que V1
  - Verificar que `{ rows, stats }` se puede desestructurar de `RUPEResult` sin cambios
  - Verificar que los inserts en `royalty_records` siguen con los campos originales

---

## Notes

- **No eliminar** ni renombrar ningún archivo existente — solo agregar y modificar
- **No modificar** columnas existentes en `royalty_records` ni en `profiles`
- Todos los valores monetarios en DB se guardan como `NUMERIC(20,8)` (string en transport)
- El modo debug (`DebugSnapshot`) se captura **durante** el parse — no requiere releer el archivo
- La migración SQL debe ejecutarse manualmente en Supabase SQL Editor antes del deploy
