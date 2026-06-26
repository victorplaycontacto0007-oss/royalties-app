# Requirements Document

## Introduction

Sistema de referidos híbrido para la aplicación de regalías musicales (Royalties App). El sistema permite registrar y gestionar comisiones de afiliados de dos maneras: automáticamente mediante webhooks de PayPal cuando se confirma un pago de suscripción, y manualmente desde el panel de administración para pagos realizados con Bold u otros métodos de pago que no cuenten con integración automática. Los afiliados pueden consultar su historial de comisiones y saldo disponible. Solo los administradores pueden crear, editar, aprobar o rechazar comisiones.

## Glossary

- **Referral_System**: El módulo completo de gestión de referidos dentro de la aplicación.
- **Affiliate**: Usuario registrado en la tabla `profiles` que actúa como referido/afiliado y puede generar comisiones cuando sus referidos realizan compras.
- **Commission**: Registro de una comisión generada a favor de un afiliado, asociada a una compra específica.
- **Commission_Calculator**: Componente que calcula el monto de comisión a partir del monto de compra y el porcentaje configurado.
- **Affiliate_Balance**: Saldo acumulado disponible de un afiliado, actualizado únicamente cuando una comisión pasa al estado Aprobada.
- **PayPal_Webhook_Handler**: Componente del backend (Supabase Edge Function) que recibe y procesa eventos de webhook enviados por PayPal.
- **Admin_Panel**: Panel de administración existente en `AdminPage.tsx`, extendido con la sección "Referidos".
- **Commission_History**: Registro de auditoría que guarda cada cambio de estado o valor de una comisión.
- **Admin**: Usuario con `role = 'admin'` en la tabla `profiles`.
- **Payment_Method**: Método de pago utilizado en la compra que generó la comisión. Valores posibles: PayPal, Bold, Transferencia, Otro.
- **Commission_Status**: Estado de ciclo de vida de una comisión. Valores posibles: Pendiente, Aprobada, Pagada, Rechazada, Cancelada.

---

## Requirements

### Requirement 1: Procesamiento automático de comisiones vía PayPal Webhook

**User Story:** Como administrador del sistema, quiero que las comisiones se registren automáticamente cuando PayPal confirme un pago de suscripción, para que no tenga que registrar manualmente los pagos recibidos por PayPal.

#### Acceptance Criteria

1. WHEN THE `PayPal_Webhook_Handler` receives a `PAYMENT.CAPTURE.COMPLETED` event from PayPal, THE `PayPal_Webhook_Handler` SHALL verify the authenticity of the event using the PayPal webhook signature header before processing it.
2. WHEN the PayPal webhook event signature is valid, THE `PayPal_Webhook_Handler` SHALL extract the `paypal_order_id` and the buyer's email from the event payload.
3. WHEN the `paypal_order_id` is extracted, THE `PayPal_Webhook_Handler` SHALL look up the corresponding subscription record in the `subscriptions` table using the `paypal_order_id` field.
4. WHEN the subscription record is found, THE `PayPal_Webhook_Handler` SHALL look up the affiliate linked to the buyer's `user_id` in the `referral_links` table.
5. WHEN the affiliate is identified, THE `Commission_Calculator` SHALL compute the commission amount as `purchase_amount_usd * (commission_percentage / 100)`, rounded to 2 decimal places.
6. WHEN the commission amount is computed, THE `PayPal_Webhook_Handler` SHALL insert a new Commission record with `status = 'Pendiente'`, `payment_method = 'PayPal'`, and the calculated commission amount.
7. IF the PayPal webhook event signature is invalid, THEN THE `PayPal_Webhook_Handler` SHALL return HTTP 401 and SHALL NOT create any Commission record.
8. IF the subscription record is not found for the given `paypal_order_id`, THEN THE `PayPal_Webhook_Handler` SHALL log the event in `activity_logs` with action `'webhook_no_subscription'` and SHALL return HTTP 200 without creating a Commission record.
9. IF the buyer has no affiliate link, THEN THE `PayPal_Webhook_Handler` SHALL log the event in `activity_logs` with action `'webhook_no_affiliate'` and SHALL return HTTP 200 without creating a Commission record.
10. IF a Commission record with the same `paypal_order_id` already exists, THEN THE `PayPal_Webhook_Handler` SHALL return HTTP 200 without creating a duplicate Commission record.

---

### Requirement 2: Registro manual de comisiones por parte del administrador

**User Story:** Como administrador, quiero registrar manualmente comisiones para pagos realizados con Bold u otros métodos de pago sin integración automática, para mantener el registro completo de todas las comisiones de afiliados.

#### Acceptance Criteria

1. THE `Admin_Panel` SHALL display a "Referidos" section accessible only to users with `role = 'admin'`.
2. WHEN an admin navigates to the "Referidos" section, THE `Admin_Panel` SHALL display a form "Registrar Comisión Manual" with the following fields: Afiliado (selector de usuario), Usuario que compró (selector de usuario), Método de pago (PayPal / Bold / Transferencia / Otro), Monto de la compra (numérico, mayor que 0 USD), Porcentaje (numérico, entre 0.01 y 100), Comisión (calculada automáticamente, editable), y Observaciones (texto libre, opcional).
3. WHEN the admin enters a purchase amount and a percentage in the manual registration form, THE `Commission_Calculator` SHALL automatically update the Comisión field with the result of `purchase_amount_usd * (commission_percentage / 100)`, rounded to 2 decimal places.
4. WHEN the admin modifies the Comisión field directly, THE `Admin_Panel` SHALL preserve the manually entered value without recalculating it, until the purchase amount or percentage fields change again.
5. WHEN the admin submits the manual registration form with all required fields valid, THE `Admin_Panel` SHALL insert a new Commission record with `status = 'Pendiente'` and record the `admin_id` of the user who created it.
6. IF the admin submits the manual registration form with the Afiliado or the Usuario que compró field empty, THEN THE `Admin_Panel` SHALL display a validation error message and SHALL NOT insert a Commission record.
7. IF the admin submits the manual registration form with a purchase amount of 0 or less, THEN THE `Admin_Panel` SHALL display a validation error message and SHALL NOT insert a Commission record.
8. IF the admin submits the manual registration form with a percentage outside the range 0.01–100, THEN THE `Admin_Panel` SHALL display a validation error message and SHALL NOT insert a Commission record.

---

### Requirement 3: Búsqueda y listado de comisiones en el panel de administración

**User Story:** Como administrador, quiero buscar y listar comisiones filtrando por usuario o afiliado, para localizar rápidamente los registros que necesito gestionar.

#### Acceptance Criteria

1. THE `Admin_Panel` SHALL display a paginated list of all Commission records in the "Referidos" section, ordered by `created_at` descending by default.
2. WHEN the admin enters a search term in the "Buscar usuario" field, THE `Admin_Panel` SHALL filter the Commission list to show only records where the buyer's `full_name` or `email` contains the search term (case-insensitive).
3. WHEN the admin enters a search term in the "Buscar afiliado" field, THE `Admin_Panel` SHALL filter the Commission list to show only records where the affiliate's `full_name` or `email` contains the search term (case-insensitive).
4. THE `Admin_Panel` SHALL display the following columns in the Commission list: Afiliado, Usuario comprador, Monto de compra, Porcentaje, Comisión, Método de pago, Estado, Fecha.

---

### Requirement 4: Edición de comisiones

**User Story:** Como administrador, quiero editar los datos de una comisión registrada, para corregir errores o actualizar información antes de aprobarla.

#### Acceptance Criteria

1. WHEN an admin selects "Editar comisión" on a Commission record, THE `Admin_Panel` SHALL display an edit form pre-populated with the current values of: Monto, Porcentaje, Estado, Notas, Fecha.
2. WHEN the admin saves the edit form with valid values, THE `Admin_Panel` SHALL update the Commission record and insert a row in `commission_history` recording: `admin_id`, `changed_at` (timestamp), `ip_address`, `reason` (texto del campo Observaciones si se proporcionó), `field_changed`, `old_value`, `new_value`.
3. IF the admin attempts to edit a Commission record with `status = 'Pagada'`, THEN THE `Admin_Panel` SHALL display a warning message and SHALL require explicit confirmation before allowing the edit.
4. IF the admin saves the edit form with an amount of 0 or less, THEN THE `Admin_Panel` SHALL display a validation error and SHALL NOT update the Commission record.

---

### Requirement 5: Eliminación de comisiones

**User Story:** Como administrador, quiero eliminar comisiones incorrectas o duplicadas, para mantener el registro de comisiones limpio y preciso.

#### Acceptance Criteria

1. WHEN an admin selects "Eliminar comisión" on a Commission record, THE `Admin_Panel` SHALL display a confirmation dialog before proceeding with the deletion.
2. WHEN the admin confirms the deletion, THE `Admin_Panel` SHALL delete the Commission record and insert a row in `commission_history` recording the deletion with: `admin_id`, `changed_at`, `ip_address`, `action = 'deleted'`, `old_value` (snapshot del registro).
3. IF the Commission record has `status = 'Pagada'`, THEN THE `Admin_Panel` SHALL prevent deletion and SHALL display an error message indicating that paid commissions cannot be deleted.

---

### Requirement 6: Aprobación y rechazo de comisiones

**User Story:** Como administrador, quiero aprobar o rechazar comisiones pendientes, para controlar cuáles se acreditan al saldo del afiliado.

#### Acceptance Criteria

1. WHEN an admin approves a Commission record with `status = 'Pendiente'`, THE `Admin_Panel` SHALL update the Commission `status` to `'Aprobada'` and increment the affiliate's `available_balance` in `affiliate_balances` by the commission amount.
2. WHEN an admin rejects a Commission record with `status = 'Pendiente'`, THE `Admin_Panel` SHALL update the Commission `status` to `'Rechazada'` and SHALL NOT modify the affiliate's `available_balance`.
3. WHEN an admin changes a Commission record from `status = 'Aprobada'` to `status = 'Rechazada'` or `status = 'Cancelada'`, THE `Admin_Panel` SHALL decrement the affiliate's `available_balance` by the commission amount, ensuring the balance does not go below 0.
4. WHEN an admin changes a Commission record from `status = 'Aprobada'` to `status = 'Cancelada'`, THE `Admin_Panel` SHALL decrement the affiliate's `available_balance` by the commission amount, ensuring the balance does not go below 0.
5. THE `Admin_Panel` SHALL record every status change in `commission_history` with: `admin_id`, `changed_at`, `ip_address`, `reason`, `old_status`, `new_status`.
6. IF an admin attempts to approve a Commission record that already has `status = 'Aprobada'`, THEN THE `Admin_Panel` SHALL display an informational message and SHALL NOT duplicate the balance update.

---

### Requirement 7: Registro de pagos (marcar comisión como Pagada)

**User Story:** Como administrador, quiero registrar el pago efectivo de una comisión aprobada al afiliado, para tener el comprobante del desembolso realizado.

#### Acceptance Criteria

1. WHEN an admin marks a Commission record with `status = 'Aprobada'` as Pagada, THE `Admin_Panel` SHALL display a payment form requesting: Fecha del pago, Método de pago (selector), Comprobante (URL o texto de referencia, opcional), Observaciones.
2. WHEN the admin submits the payment form with a valid payment date, THE `Admin_Panel` SHALL update the Commission `status` to `'Pagada'` and store the payment details in the Commission record.
3. THE `Admin_Panel` SHALL record the payment action in `commission_history` with: `admin_id`, `changed_at`, `ip_address`, `action = 'paid'`, `payment_date`, `payment_method`, `proof`.
4. IF the admin submits the payment form without a payment date, THEN THE `Admin_Panel` SHALL display a validation error and SHALL NOT update the Commission record.
5. IF an admin attempts to mark as Pagada a Commission record that does not have `status = 'Aprobada'`, THEN THE `Admin_Panel` SHALL display an error message and SHALL NOT proceed.

---

### Requirement 8: Historial de auditoría de comisiones

**User Story:** Como administrador, quiero ver el historial completo de cambios de cada comisión, para tener trazabilidad total de las modificaciones realizadas.

#### Acceptance Criteria

1. THE `Admin_Panel` SHALL display a `commission_history` log for each Commission record, showing: administrador que realizó el cambio, fecha y hora, IP, motivo, valor anterior, valor nuevo.
2. WHEN any admin action modifies a Commission record (crear, editar, aprobar, rechazar, eliminar, pagar), THE `Referral_System` SHALL insert a row in `commission_history` before completing the modification.
3. THE `commission_history` table SHALL be append-only: no update or delete operations SHALL be permitted on existing history rows by any role other than a database superuser.

---

### Requirement 9: Vista del afiliado — historial y saldo

**User Story:** Como afiliado, quiero ver mi historial de comisiones y mi saldo disponible, para conocer cuánto he ganado y cuánto tengo pendiente de cobro.

#### Acceptance Criteria

1. THE `Referral_System` SHALL provide an affiliate-facing view that displays the affiliate's `available_balance` from `affiliate_balances`.
2. THE `Referral_System` SHALL display in the affiliate view a list of Commission records associated with the authenticated affiliate's `user_id`, ordered by `created_at` descending.
3. THE `Referral_System` SHALL display in each Commission row: Monto de compra, Porcentaje, Comisión, Método de pago, Estado, Fecha.
4. WHILE a Commission record has `status = 'Pendiente'` or `status = 'Rechazada'` or `status = 'Cancelada'`, THE `Referral_System` SHALL NOT include that commission's amount in the affiliate's `available_balance`.
5. IF the authenticated user does not have the `affiliate` role or is not registered as an affiliate, THEN THE `Referral_System` SHALL display a message indicating that the affiliate program is not available for this account, and SHALL NOT expose other affiliates' data.

---

### Requirement 10: Seguridad y control de acceso

**User Story:** Como administrador del sistema, quiero que solo los administradores puedan gestionar comisiones, para evitar modificaciones no autorizadas del sistema de referidos.

#### Acceptance Criteria

1. THE `Referral_System` SHALL enforce Row Level Security (RLS) in Supabase so that INSERT, UPDATE, and DELETE operations on `commissions`, `commission_history`, and `affiliate_balances` tables are only permitted for users with `role = 'admin'`.
2. THE `Referral_System` SHALL enforce RLS so that SELECT on `commissions` returns only records where `affiliate_id = auth.uid()` for non-admin users.
3. WHEN a non-admin user attempts to call any admin API endpoint of the `Referral_System`, THE `Referral_System` SHALL return HTTP 403 and SHALL NOT perform the requested operation.
4. THE `PayPal_Webhook_Handler` SHALL only be callable from the public internet without authentication, but SHALL validate the PayPal webhook signature on every request as specified in Requirement 1, Criterion 1.
5. THE `Referral_System` SHALL NOT expose the `ip_address` field of `commission_history` records to non-admin users in any API response or view.

---

### Requirement 11: Enlace de referido (referral link)

**User Story:** Como afiliado, quiero tener un enlace único de referido para compartir con potenciales compradores, para que el sistema pueda asociar sus compras a mi cuenta automáticamente.

#### Acceptance Criteria

1. THE `Referral_System` SHALL generate a unique referral code for each affiliate upon registration as an affiliate, and store it in the `referral_links` table.
2. WHEN a visitor accesses the application with a valid referral code in the URL query parameter `ref`, THE `Referral_System` SHALL store the referral code in the browser's `sessionStorage` for the duration of the session.
3. WHEN a user completes a PayPal payment with a referral code stored in `sessionStorage`, THE `Referral_System` SHALL include the referral code in the subscription record's `referral_code` field so that the `PayPal_Webhook_Handler` can resolve the affiliate.
4. IF a visitor accesses the application with an invalid or expired referral code, THEN THE `Referral_System` SHALL ignore the code and SHALL NOT store it in `sessionStorage`.
