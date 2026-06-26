# Implementation Plan: Referral System (Sistema de Referidos Híbrido)

## Overview

Implementación incremental del módulo de referidos en tres capas: base de datos (SQL + RLS), lógica de negocio pura (TypeScript), y UI (React + AdminPage + AffiliatePage). La Edge Function de PayPal se implementa en paralelo con la capa de datos. Cada capa valida su corrección antes de pasar a la siguiente.

## Tasks

- [ ] 1. Infraestructura de base de datos — nuevas tablas y políticas
  - [ ] 1.1 Crear migración SQL con tablas `referral_links`, `affiliate_balances`, `commissions`, `commission_history`
    - Crear `supabase/referral-system.sql` con los DDL de las 4 tablas nuevas, índices y la columna `referral_code` en `subscriptions`
    - Incluir restricciones CHECK (`status IN (...)`, `payment_method IN (...)`, `purchase_amount_usd > 0`, `commission_percentage BETWEEN 0.01 AND 100`, `available_balance >= 0`)
    - _Requirements: 1.6, 2.5, 6.1, 10.1_

  - [ ] 1.2 Agregar políticas RLS para `commissions`, `commission_history`, `affiliate_balances` y `referral_links`
    - Admins: acceso completo (ALL) en las 4 tablas
    - Afiliados: SELECT propio en `commissions` (`affiliate_id = auth.uid()`) y `affiliate_balances` y `referral_links`
    - `commission_history`: sin políticas UPDATE/DELETE para roles no-superuser (append-only por diseño)
    - _Requirements: 10.1, 10.2, 8.3_

  - [ ] 1.3 Crear funciones SQL atómicas `approve_commission` y `reverse_commission_approval`
    - `approve_commission(p_commission_id, p_admin_id, p_ip)`: usa `SELECT ... FOR UPDATE`, actualiza status, upsert balance, inserta history
    - `reverse_commission_approval(p_commission_id, p_admin_id, p_ip, p_new_status)`: decrementa balance con `GREATEST(0, balance - amount)`, inserta history
    - Ambas funciones con `SECURITY DEFINER` y manejo de excepción `already_approved`
    - _Requirements: 6.1, 6.3, 6.4, 6.6_

- [ ] 2. Tipos TypeScript y lógica pura
  - [ ] 2.1 Crear `src/types/referrals.ts` con todos los tipos e interfaces del dominio
    - Exportar `CommissionStatus`, `PaymentMethod`, `Commission`, `CommissionHistory`, `AffiliateBalance`, `ReferralLink`, `CommissionFilters`
    - Incluir joins opcionales (`affiliate`, `buyer`) en `Commission`
    - _Requirements: 1.6, 2.2, 3.4, 9.3_

  - [ ] 2.2 Crear `src/lib/commissionCalculator.ts` — función pura de cálculo
    - Exportar `calculateCommission(purchaseAmountUsd: number, commissionPercentage: number): number`
    - Implementar como `Math.round(p * c / 100 * 100) / 100`
    - _Requirements: 1.5, 2.3_

  - [ ]* 2.3 Escribir property test para `commissionCalculator` (Property 1)
    - **Property 1: Cálculo de comisión es correcto para cualquier entrada válida**
    - Instalar `fast-check` si no está en devDependencies; crear `src/lib/__tests__/commissionCalculator.test.ts`
    - Usar `fc.float({ min: 0.01, max: 100_000 })` × `fc.float({ min: 0.01, max: 100 })`, numRuns: 100
    - **Validates: Requirements 1.5, 2.3**

  - [ ]* 2.4 Escribir tests unitarios para `commissionCalculator` (ejemplos concretos y bordes)
    - Cubrir: porcentaje mínimo (0.01%), máximo (100%), monto con muchos decimales, resultado redondeado
    - _Requirements: 1.5, 2.3_

- [ ] 3. Hook `useReferralCode` — captura y almacenamiento del código de referido
  - [ ] 3.1 Crear `src/hooks/useReferralCode.ts`
    - Implementar `useReferralCode(): string | null` (lee `sessionStorage`)
    - Implementar `captureReferralCodeFromURL()`: extrae `?ref=`, consulta `referral_links` en Supabase para validar, guarda en `sessionStorage` si es válido, ignora si es inválido o expirado
    - Implementar `clearReferralCode()`
    - _Requirements: 11.2, 11.4_

  - [ ]* 3.2 Escribir tests unitarios para `useReferralCode`
    - Casos: código válido guardado, código inválido ignorado, sin parámetro `ref` en URL, `clearReferralCode` limpia el storage
    - _Requirements: 11.2, 11.4_

- [ ] 4. Hook `useCommissionCalculator` — estado del cálculo con override manual
  - [ ] 4.1 Crear `src/hooks/useCommissionCalculator.ts`
    - Implementar la interfaz `UseCommissionCalculatorReturn` con `commission`, `isManualOverride`, `setManualCommission`, `resetToCalculated`
    - Al cambiar `purchaseAmount` o `percentage`, recalcular y limpiar el override manual
    - Al llamar `setManualCommission`, preservar el valor y marcar `isManualOverride = true`
    - _Requirements: 2.3, 2.4_

  - [ ]* 4.2 Escribir tests unitarios para `useCommissionCalculator`
    - Verificar: auto-cálculo al cambiar monto/porcentaje, override manual preservado, reset a calculado, `isManualOverride` correcto
    - _Requirements: 2.3, 2.4_

- [ ] 5. Hook `useCommissions` — queries y mutaciones React Query
  - [ ] 5.1 Crear `src/hooks/useCommissions.ts` con todas las queries y mutaciones
    - Implementar `useCommissions(filters)`: SELECT con joins a `profiles` para `affiliate` y `buyer`, filtro `ilike` para búsqueda, paginación
    - Implementar `useCreateCommission`, `useUpdateCommission`, `useDeleteCommission`
    - Implementar `useApproveCommission` (llama a `approve_commission` RPC), `useRejectCommission`, `useMarkCommissionPaid`
    - Cada mutación llama `invalidateQueries(['commissions'])` en `onSuccess`
    - _Requirements: 2.5, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 7.2_

  - [ ]* 5.2 Escribir property test para lógica de filtro de búsqueda (Property 8)
    - **Property 8: El filtro de búsqueda es inclusivo y case-insensitive**
    - Mock de lista de comisiones con nombres/emails arbitrarios, verificar que todos los resultados contienen `q` (lowercase) y no se omite ninguno que lo contenga
    - **Validates: Requirements 3.2, 3.3**

- [ ] 6. Checkpoint — lógica y hooks completos
  - Asegurar que todos los tests unitarios y de propiedad pasan con `npm test`
  - Verificar que los tipos TypeScript compilan sin errores con `npx tsc --noEmit`
  - Corregir cualquier problema antes de continuar con la UI

- [ ] 7. Componentes de UI — formularios y listas de comisiones
  - [ ] 7.1 Crear `src/components/referrals/CommissionForm.tsx` — formulario de registro manual
    - Campos: Afiliado (selector de `profiles`), Usuario que compró (selector), Método de pago (select enum), Monto de compra (number > 0), Porcentaje (0.01–100), Comisión (calculada, editable), Observaciones (textarea opcional)
    - Integrar `useCommissionCalculator` para el campo Comisión
    - Validación inline: mostrar error si afiliado/comprador vacío, monto ≤ 0, porcentaje fuera de rango
    - Al submit válido: llamar `useCreateCommission`
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 7.2 Escribir property test para validación del formulario (Property 3)
    - **Property 3: Validación rechaza entradas inválidas**
    - Generar con fast-check combinaciones con `purchaseAmount ≤ 0` o `percentage` fuera de `[0.01, 100]`, verificar que no se llama a la mutación de inserción
    - **Validates: Requirements 2.7, 2.8**

  - [ ] 7.3 Crear `src/components/referrals/CommissionList.tsx` — tabla paginada con búsqueda
    - Columnas: Afiliado, Usuario comprador, Monto de compra, Porcentaje, Comisión, Método de pago, Estado (badge con color), Fecha
    - Inputs de búsqueda: "Buscar usuario" y "Buscar afiliado" (ilike case-insensitive)
    - Paginación con controles de página
    - Botones por fila: Editar, Aprobar, Rechazar, Marcar Pagada, Eliminar, Ver historial (condicionales según estado)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ] 7.4 Crear `src/components/referrals/CommissionEditModal.tsx` — edición de comisión
    - Campos editables: Monto, Porcentaje, Estado, Notas, Fecha
    - Pre-poblar con valores actuales
    - Si `status = 'Pagada'`, mostrar advertencia y requerir confirmación explícita antes de permitir edición
    - Validar: monto > 0
    - Al guardar: llamar `useUpdateCommission` e insertar en `commission_history` vía RPC o trigger
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ] 7.5 Crear `src/components/referrals/PaymentModal.tsx` — registrar pago de comisión aprobada
    - Campos: Fecha del pago (required), Método de pago (select), Comprobante (URL/texto, opcional), Observaciones
    - Solo activable para comisiones con `status = 'Aprobada'`
    - Validar: fecha de pago requerida
    - Al submit: llamar `useMarkCommissionPaid`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 7.6 Crear `src/components/referrals/AuditLogDrawer.tsx` — historial de auditoría por comisión
    - Mostrar filas de `commission_history`: admin, fecha/hora, IP (solo admins), motivo, campo cambiado, valor anterior, valor nuevo
    - Abrirse como drawer lateral desde el botón "Ver historial" de una fila
    - _Requirements: 8.1_

- [ ] 8. Sección "Referidos" en AdminPage
  - [ ] 8.1 Extender `src/pages/AdminPage.tsx` con pestaña/sección "Referidos"
    - Agregar tab "Referidos" al layout existente (solo visible para `role = 'admin'`)
    - Renderizar `CommissionForm` para registro manual
    - Renderizar `CommissionList` con todos los datos y acciones admin
    - Integrar `CommissionEditModal`, `PaymentModal` y `AuditLogDrawer` como modales/drawers controlados por estado local
    - _Requirements: 2.1, 2.2, 3.1, 4.1, 5.1, 6.1, 6.2, 7.1, 8.1_

  - [ ] 8.2 Implementar flujos de aprobación y rechazo en AdminPage
    - Botón "Aprobar": llama `useApproveCommission` (RPC `approve_commission`) solo si `status = 'Pendiente'`
    - Botón "Rechazar": llama `useRejectCommission` solo si `status = 'Pendiente'`
    - Revertir aprobada: llama `reverse_commission_approval` RPC con nuevo status `'Rechazada'` o `'Cancelada'`
    - Mostrar mensaje informativo si se intenta aprobar una ya aprobada (sin modificar balance)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ] 8.3 Implementar eliminación de comisiones en AdminPage
    - Mostrar modal de confirmación antes de eliminar
    - Llamar `useDeleteCommission` e insertar registro en `commission_history` con `action = 'deleted'` y snapshot del registro
    - Bloquear eliminación si `status = 'Pagada'` con mensaje de error
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 9. Componente de balance y página de afiliado
  - [ ] 9.1 Crear `src/components/referrals/AffiliateBalanceCard.tsx`
    - Mostrar `available_balance` del afiliado autenticado (query a `affiliate_balances`)
    - Mostrar mensaje si el usuario no es afiliado
    - _Requirements: 9.1, 9.5_

  - [ ] 9.2 Crear `src/pages/AffiliatePage.tsx` — vista del afiliado
    - Renderizar `AffiliateBalanceCard`
    - Listar comisiones del afiliado autenticado ordenadas por `created_at DESC`
    - Columnas: Monto de compra, Porcentaje, Comisión, Método de pago, Estado, Fecha
    - Si `status IN ('Pendiente', 'Rechazada', 'Cancelada')`, aclarar visualmente que no está acreditado al saldo
    - Si el usuario no es afiliado, mostrar mensaje de programa no disponible sin exponer datos de otros afiliados
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [ ] 9.3 Registrar la ruta `/affiliate` en `src/App.tsx`
    - Agregar ruta protegida (requiere autenticación) para `AffiliatePage`
    - _Requirements: 9.1_

- [ ] 10. Captura de código de referido en flujo de pago
  - [ ] 10.1 Integrar `captureReferralCodeFromURL` en `src/pages/SubscriptionPage.tsx`
    - Al montar el componente, llamar `captureReferralCodeFromURL()` para leer `?ref=` y validar contra `referral_links`
    - Al crear el registro de suscripción en Supabase, incluir el `referral_code` del `sessionStorage` en el INSERT de `subscriptions`
    - Limpiar el código de `sessionStorage` tras el INSERT exitoso con `clearReferralCode()`
    - _Requirements: 11.2, 11.3, 11.4_

- [ ] 11. Edge Function `paypal-webhook`
  - [ ] 11.1 Crear `supabase/functions/paypal-webhook/index.ts`
    - Verificar firma `PAYPAL-TRANSMISSION-SIG` con la API de PayPal (retornar HTTP 401 si inválida)
    - Parsear evento `PAYMENT.CAPTURE.COMPLETED`, extraer `paypal_order_id` y email del comprador
    - Verificar idempotencia: si ya existe comisión con ese `paypal_order_id`, retornar HTTP 200 sin inserción
    - Buscar subscription por `paypal_order_id`; si no existe, log `webhook_no_subscription` + retornar HTTP 200
    - Buscar `referral_links` por `referral_code` de la suscripción; si no existe, log `webhook_no_affiliate` + retornar HTTP 200
    - Calcular comisión con la misma fórmula de `commissionCalculator`
    - INSERT en `commissions` con `status = 'Pendiente'`, `payment_method = 'PayPal'`
    - Usar service role key internamente para bypassar RLS
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [ ]* 11.2 Escribir property test de idempotencia del webhook (Property 2)
    - **Property 2: Idempotencia del webhook — sin duplicados**
    - Mockear Supabase client; para cualquier `paypal_order_id` generado por fast-check, procesar el mismo evento dos veces y verificar que `commissions` tiene exactamente 1 registro con ese ID
    - **Validates: Requirements 1.10**

- [ ] 12. Checkpoint — integración completa
  - Ejecutar `npm test` y verificar que todos los tests (unitarios + propiedad) pasan
  - Verificar con `npx tsc --noEmit` que no hay errores de tipos
  - Verificar manualmente en Supabase local que las políticas RLS funcionan para rol admin y rol usuario/afiliado
  - Corregir cualquier problema encontrado antes de continuar

- [ ] 13. Seguridad — validaciones adicionales de acceso
  - [ ] 13.1 Agregar guard de rol en `AffiliatePage` y en la sección "Referidos" de `AdminPage`
    - Usar `useAuth()` para verificar `role`; redirigir o mostrar error si no tiene permiso
    - Verificar que los componentes no exponen `ip_address` de `commission_history` a usuarios no-admin
    - _Requirements: 2.1, 10.1, 10.2, 10.3, 10.5_

  - [ ]* 13.2 Escribir tests de validación de seguridad RLS
    - Verificar con tests de integración que usuario no-admin no puede INSERT/UPDATE/DELETE en `commissions`
    - Verificar que `commission_history` es append-only (UPDATE/DELETE fallan para no-superuser)
    - Verificar que afiliado solo ve sus propias comisiones en SELECT
    - _Requirements: 10.1, 10.2, 8.3_

- [ ] 14. Property tests para balance de afiliado (Properties 4, 5, 6)
  - [ ]* 14.1 Escribir property test — balance sube exactamente al aprobar (Property 4)
    - **Property 4: El balance del afiliado sube exactamente la comisión al aprobar**
    - Mockear DB; para cualquier comisión `Pendiente` con monto `m` y balance previo `b`, aprobar y verificar `new_balance === b + m`
    - **Validates: Requirements 6.1**

  - [ ]* 14.2 Escribir property test — balance nunca queda negativo (Property 5)
    - **Property 5: El balance del afiliado nunca queda negativo**
    - Generar secuencias arbitrarias de aprobaciones y cancelaciones/rechazos, verificar `available_balance >= 0` en todo momento
    - **Validates: Requirements 6.3, 6.4**

  - [ ]* 14.3 Escribir property test — aprobación doble no duplica balance (Property 6)
    - **Property 6: Aprobación doble no duplica el balance**
    - Aprobar una comisión ya en estado `Aprobada` y verificar que el balance no cambia (excepción `already_approved` manejada)
    - **Validates: Requirements 6.6**

- [ ] 15. Property test para historial de auditoría (Property 7)
  - [ ]* 15.1 Escribir property test — historial captura cada cambio (Property 7)
    - **Property 7: El historial de auditoría captura cada cambio de estado**
    - Para cualquier secuencia de operaciones (crear, aprobar, rechazar, editar, pagar), verificar que `commission_history` tiene exactamente N filas donde N = número de operaciones realizadas
    - **Validates: Requirements 8.2**

- [ ] 16. Checkpoint final — todos los tests pasan
  - Ejecutar `npm test` con todos los tests activos
  - Verificar que no hay errores TypeScript
  - Asegurar que todos los requirements están cubiertos por al menos una tarea implementada

## Notes

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requirements específicos para trazabilidad completa
- Los checkpoints en tareas 6, 12 y 16 garantizan validación incremental
- Las funciones SQL atómicas (`approve_commission`, `reverse_commission_approval`) son críticas para la consistencia del balance — deben implementarse antes que los hooks de aprobación
- La Edge Function usa Deno (entorno Supabase); la lógica de cálculo de comisión es idéntica a `commissionCalculator.ts` pero replicada o importada como módulo compartido
- `fast-check` debe instalarse: `npm install --save-dev fast-check`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.1", "4.1", "11.1"] },
    { "id": 3, "tasks": ["3.2", "4.2", "5.1", "11.2"] },
    { "id": 4, "tasks": ["5.2", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.6"] },
    { "id": 6, "tasks": ["8.1", "9.1", "10.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "9.2"] },
    { "id": 8, "tasks": ["9.3", "13.1"] },
    { "id": 9, "tasks": ["13.2", "14.1", "14.2", "14.3"] },
    { "id": 10, "tasks": ["15.1"] }
  ]
}
```
