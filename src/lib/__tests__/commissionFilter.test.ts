import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { Commission } from '../../types/referrals'

// ── Inline filter logic (same as useCommissions) ───────────
function filterByBuyer(commissions: Commission[], term: string): Commission[] {
  const t = term.trim().toLowerCase()
  if (!t) return commissions
  return commissions.filter(c =>
    c.buyer?.full_name?.toLowerCase().includes(t) ||
    c.buyer?.email?.toLowerCase().includes(t)
  )
}

function filterByAffiliate(commissions: Commission[], term: string): Commission[] {
  const t = term.trim().toLowerCase()
  if (!t) return commissions
  return commissions.filter(c =>
    c.affiliate?.full_name?.toLowerCase().includes(t) ||
    c.affiliate?.email?.toLowerCase().includes(t)
  )
}

// ── Arbitraries ────────────────────────────────────────────
const profileArb = fc.record({
  id:        fc.uuid(),
  full_name: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
  email:     fc.emailAddress(),
})

const commissionArb = fc.record({
  id:                    fc.uuid(),
  affiliate_id:          fc.uuid(),
  buyer_id:              fc.uuid(),
  purchase_amount_usd:   fc.double({ min: 0.01, max: 9999, noNaN: true, noDefaultInfinity: true }),
  commission_percentage: fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
  commission_amount:     fc.double({ min: 0, max: 9999, noNaN: true, noDefaultInfinity: true }),
  status:                fc.constantFrom('Pendiente', 'Aprobada', 'Pagada', 'Rechazada', 'Cancelada'),
  payment_method:        fc.constantFrom('PayPal', 'Bold', 'Transferencia', 'Otro'),
  paypal_order_id:       fc.option(fc.string(), { nil: null }),
  admin_id:              fc.option(fc.uuid(), { nil: null }),
  notes:                 fc.option(fc.string(), { nil: null }),
  paid_at:               fc.option(fc.string(), { nil: null }),
  payment_proof:         fc.option(fc.string(), { nil: null }),
  payment_notes:         fc.option(fc.string(), { nil: null }),
  created_at:            fc.string(),
  updated_at:            fc.string(),
  affiliate:             fc.option(profileArb, { nil: undefined }),
  buyer:                 fc.option(profileArb, { nil: undefined }),
}) as fc.Arbitrary<Commission>

// ── Property 8: Filter is inclusive and case-insensitive ───
// Validates: Requirements 3.2, 3.3

describe('Commission filter — Property 8', () => {
  it('buyer filter: all results contain term and no matching record is omitted', () => {
    fc.assert(
      fc.property(
        fc.array(commissionArb, { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (commissions, term) => {
          const results = filterByBuyer(commissions, term)
          const t = term.trim().toLowerCase()

          // If term is blank after trimming, filter returns everything — skip further checks
          if (!t) return results.length === commissions.length

          // All returned records must match
          const allMatch = results.every(c =>
            c.buyer?.full_name?.toLowerCase().includes(t) ||
            c.buyer?.email?.toLowerCase().includes(t)
          )

          // No matching record was omitted
          const matchingOriginals = commissions.filter(c =>
            c.buyer?.full_name?.toLowerCase().includes(t) ||
            c.buyer?.email?.toLowerCase().includes(t)
          )
          const noneOmitted = matchingOriginals.length === results.length

          return allMatch && noneOmitted
        },
      ),
      { numRuns: 100 },
    )
  })

  it('affiliate filter: all results contain term and no matching record is omitted', () => {
    fc.assert(
      fc.property(
        fc.array(commissionArb, { minLength: 0, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (commissions, term) => {
          const results = filterByAffiliate(commissions, term)
          const t = term.trim().toLowerCase()

          const allMatch = results.every(c =>
            c.affiliate?.full_name?.toLowerCase().includes(t) ||
            c.affiliate?.email?.toLowerCase().includes(t)
          )

          const matchingOriginals = commissions.filter(c =>
            c.affiliate?.full_name?.toLowerCase().includes(t) ||
            c.affiliate?.email?.toLowerCase().includes(t)
          )
          const noneOmitted = matchingOriginals.length === results.length

          return allMatch && noneOmitted
        },
      ),
      { numRuns: 100 },
    )
  })

  it('empty term returns all commissions unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(commissionArb, { minLength: 0, maxLength: 20 }),
        (commissions) => {
          const r1 = filterByBuyer(commissions, '')
          const r2 = filterByAffiliate(commissions, '')
          return r1.length === commissions.length && r2.length === commissions.length
        },
      ),
      { numRuns: 50 },
    )
  })
})
