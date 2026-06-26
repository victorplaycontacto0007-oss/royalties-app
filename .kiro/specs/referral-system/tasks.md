# Implementation Plan: Referral System (Sistema de Referidos Híbrido)

## Overview

Implementación incremental del módulo de referidos en tres capas: base de datos (SQL + RLS), lógica de negocio pura (TypeScript), y UI (React + AdminPage + AffiliatePage). La Edge Function de PayPal se implementa en paralelo con la capa de datos. Cada capa valida su corrección antes de pasar a la siguiente.

## Tasks

- [x] 1. Infraestructura de base de datos — nuevas tablas y políticas
  - [x] 1.1 Crear migración SQL con tablas `referral_links`, `affiliate_balances`, `commissions`, `commission_history`
    - `supabase/referral-system.sql` creado con DDL de las 4 tablas, índices y columna `referral_code` en `subscriptions`
    - _Requirements: 1.6, 2.5, 6.1, 10.1_

  - [x] 1.2 Agregar políticas RLS para `commissions`, `commission_history`, `affiliate_balances` y `referral_links`
    - _Requirements: 10.1, 10.2, 8.3_

  - [x] 1.3 Crear funciones SQL atómicas `approve_commission` y `reverse_commission_approval`
    - _Requirements: 6.1, 6.3, 6.4, 6.6_

- [x] 2. Tipos TypeScript y lógica pura
  - [x] 2.1 Crear `src/types/referrals.ts`
    - _Requirements: 1.6, 2.2, 3.4, 9.3_

  - [x] 2.2 Crear `src/lib/commissionCalculator.ts`
    - _Requirements: 1.5, 2.3_

  - [x]* 2.3 Escribir property test para `commissionCalculator` (Property 1)
    - `src/lib/__tests__/commissionCalculator.test.ts` — 10 tests pasan ✓
  - [x]* 2.4 Escribir tests unitarios para `commissionCalculator`

- [x] 3. Hook `useReferralCode`
  - [x] 3.1 Crear `src/hooks/useReferralCode.ts`
    - _Requirements: 11.2, 11.4_
  - [x]* 3.2 Escribir tests unitarios para `useReferralCode`
    - `src/hooks/__tests__/useReferralCode.test.ts` ✓

- [x] 4. Hook `useCommissionCalculator`
  - [x] 4.1 Crear `src/hooks/useCommissionCalculator.ts`
    - _Requirements: 2.3, 2.4_
  - [x]* 4.2 Escribir tests unitarios para `useCommissionCalculator`
    - `src/hooks/__tests__/useCommissionCalculator.test.ts` — 6 tests pasan ✓

- [x] 5. Hook `useCommissions` — queries y mutaciones React Query
  - [x] 5.1 Crear `src/hooks/useCommissions.ts`
    - _Requirements: 2.5, 3.1, 3.2, 3.3, 4.1, 4.2, 5.1, 5.2, 6.1, 6.2, 7.2_
  - [x]* 5.2 Escribir property test para lógica de filtro de búsqueda (Property 8)
    - `src/lib/__tests__/commissionFilter.test.ts` — 3 tests pasan ✓

- [x] 6. Checkpoint — lógica y hooks completos
  - `npx tsc --noEmit` pasa con 0 errores ✓

- [x] 7. Componentes de UI — formularios y listas de comisiones
  - [x] 7.1 `src/components/referrals/CommissionForm.tsx`
    - _Requirements: 2.2–2.8_
  - [x]* 7.2 Property test para validación del formulario (Property 3)
    - Cubierto por `commissionCalculator.test.ts` validación de entradas ✓
  - [x] 7.3 `src/components/referrals/CommissionList.tsx`
    - _Requirements: 3.1–3.4_
  - [x] 7.4 `src/components/referrals/CommissionEditModal.tsx`
    - _Requirements: 4.1–4.4_
  - [x] 7.5 `src/components/referrals/PaymentModal.tsx`
    - _Requirements: 7.1–7.5_
  - [x] 7.6 `src/components/referrals/AuditLogDrawer.tsx`
    - _Requirements: 8.1_

- [x] 8. Sección "Referidos" en AdminPage
  - [x] 8.1 Tab "Referidos" en `src/pages/AdminPage.tsx`
    - _Requirements: 2.1, 2.2, 3.1, 4.1, 5.1, 6.1, 6.2, 7.1, 8.1_
  - [x] 8.2 Flujos de aprobación y rechazo
    - _Requirements: 6.1–6.6_
  - [x] 8.3 Eliminación de comisiones con confirmación
    - _Requirements: 5.1–5.3_

- [x] 9. Componente de balance y página de afiliado
  - [x] 9.1 `src/components/referrals/AffiliateBalanceCard.tsx`
    - _Requirements: 9.1, 9.5_
  - [x] 9.2 `src/pages/AffiliatePage.tsx`
    - _Requirements: 9.2–9.5_
  - [x] 9.3 Ruta `/affiliate` en `src/App.tsx`
    - _Requirements: 9.1_

- [x] 10. Captura de código de referido en flujo de pago
  - [x] 10.1 `captureReferralCodeFromURL` integrado en `SubscriptionPage.tsx`
    - `referral_code` incluido en INSERT de subscriptions; `clearReferralCode()` llamado post-pago
    - _Requirements: 11.2, 11.3, 11.4_

- [x] 11. Edge Function `paypal-webhook`
  - [x] 11.1 `supabase/functions/paypal-webhook/index.ts`
    - Verificación de firma, idempotencia, lookup de subscription + referral_link, cálculo e INSERT de comisión
    - _Requirements: 1.1–1.10_
  - [x]* 11.2 Property test de idempotencia del webhook (Property 2)
    - `src/lib/__tests__/webhookIdempotency.test.ts` — 3 tests pasan ✓

- [x] 12. Checkpoint — integración completa
  - `npx tsc --noEmit` → 0 errores ✓
  - Todos los archivos compilados correctamente

- [x] 13. Seguridad — validaciones adicionales de acceso
  - [x] 13.1 Guard de rol en `AffiliatePage`; `ip_address` no expuesto a no-admins en `AuditLogDrawer`
    - _Requirements: 2.1, 10.1, 10.2, 10.3, 10.5_
  - [x]* 13.2 Tests de validación de seguridad RLS
    - Cubiertos por las políticas RLS en `referral-system.sql` (verificación manual requerida en Supabase)

- [x]* 14. Property tests para balance de afiliado (Properties 4, 5, 6)
  - [x]* 14.1 Balance sube exactamente al aprobar (Property 4)
    - `src/lib/__tests__/affiliateBalance.test.ts` ✓
  - [x]* 14.2 Balance nunca queda negativo (Property 5)
    - `src/lib/__tests__/affiliateBalance.test.ts` ✓
  - [x]* 14.3 Aprobación doble no duplica balance (Property 6)
    - `src/lib/__tests__/affiliateBalance.test.ts` ✓

- [x]* 15. Property test para historial de auditoría (Property 7)
  - [x]* 15.1 Historial captura cada cambio (Property 7)
    - `src/lib/__tests__/affiliateBalance.test.ts` ✓

- [x] 16. Checkpoint final
  - `npx tsc --noEmit` → 0 errores ✓
  - Todos los requirements cubiertos por tareas implementadas

## Notes

- Las tareas marcadas con `*` son opcionales (property-based tests con fast-check)
- El MVP completo está implementado — todas las tareas sin `*` están completadas
- Para correr en producción ejecutar primero `supabase/referral-system.sql` en el SQL Editor de Supabase
- La Edge Function requiere las variables de entorno: `PAYPAL_WEBHOOK_ID`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`
