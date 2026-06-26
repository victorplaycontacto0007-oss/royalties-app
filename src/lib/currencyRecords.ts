/**
 * currencyRecords.ts
 *
 * Persiste los totales por moneda de un reporte importado en la tabla
 * `currency_records` de Supabase.
 *
 * Requirements: 9.2, 9.3
 */

import { supabase } from './supabase'
import type { CurrencyGroup } from '../royalty-engine/CurrencyGrouper'

/**
 * Inserta un registro en `currency_records` por cada CurrencyGroup,
 * en una única operación batch.
 *
 * Los errores se capturan y loguean pero NO se relanzan, para que
 * un fallo de persistencia nunca bloquee la visualización del reporte.
 */
export async function saveCurrencyRecords(
  reportId: string,
  userId: string,
  provider: string,
  paymentColumnUsed: string,
  groups: CurrencyGroup[],
): Promise<void> {
  if (groups.length === 0) return

  const records = groups.map((group) => ({
    report_id:           reportId,
    user_id:             userId,
    provider,
    currency:            group.currency,
    payment_column_used: paymentColumnUsed,
    total:               group.totalFixed8,
    record_count:        group.recordCount,
    import_date:         new Date().toISOString(),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('currency_records').insert(records)

  if (error) {
    console.error('[currencyRecords] Error al insertar currency_records:', error)
  }
}
