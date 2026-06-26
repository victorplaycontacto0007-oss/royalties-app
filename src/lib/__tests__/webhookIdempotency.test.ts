import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ── Simulated commission store ─────────────────────────────
// Mirrors the idempotency logic in the paypal-webhook Edge Function

interface CommissionStore {
  commissions: Map<string, { paypal_order_id: string }>
}

function processWebhookEvent(
  store: CommissionStore,
  paypalOrderId: string,
): 'inserted' | 'duplicate' {
  // Idempotency check — same as Edge Function logic
  if (store.commissions.has(paypalOrderId)) {
    return 'duplicate'
  }
  store.commissions.set(paypalOrderId, { paypal_order_id: paypalOrderId })
  return 'inserted'
}

// ── Property 2: Webhook idempotency — no duplicate commissions
// Validates: Requirements 1.10

describe('paypal-webhook — Property 2', () => {
  it('processing the same paypal_order_id twice results in exactly 1 commission', () => {
    fc.assert(
      fc.property(
        fc.uuid(), // arbitrary paypal_order_id
        (orderId) => {
          const store: CommissionStore = { commissions: new Map() }

          const first  = processWebhookEvent(store, orderId)
          const second = processWebhookEvent(store, orderId)

          return (
            first  === 'inserted'  &&
            second === 'duplicate' &&
            store.commissions.size === 1
          )
        },
      ),
      { numRuns: 200 },
    )
  })

  it('different paypal_order_ids each result in their own commission', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 10 }),
        (orderIds) => {
          const store: CommissionStore = { commissions: new Map() }
          for (const id of orderIds) processWebhookEvent(store, id)
          return store.commissions.size === orderIds.length
        },
      ),
      { numRuns: 100 },
    )
  })

  it('processing N distinct events then replaying all produces no extra commissions', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.uuid(), { minLength: 1, maxLength: 10 }),
        (orderIds) => {
          const store: CommissionStore = { commissions: new Map() }

          // First pass
          for (const id of orderIds) processWebhookEvent(store, id)
          const afterFirst = store.commissions.size

          // Replay all (simulates PayPal retries)
          for (const id of orderIds) processWebhookEvent(store, id)

          return store.commissions.size === afterFirst && afterFirst === orderIds.length
        },
      ),
      { numRuns: 100 },
    )
  })
})
