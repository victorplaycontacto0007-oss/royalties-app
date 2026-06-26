import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ── Pure simulation of the SQL atomic functions ────────────
// These mirror approve_commission and reverse_commission_approval logic

interface State {
  balance:    number
  status:     'Pendiente' | 'Aprobada' | 'Rechazada' | 'Cancelada' | 'Pagada'
  historyLen: number
}

function approveCommission(state: State, amount: number): { newState: State; error?: string } {
  if (state.status === 'Aprobada') return { newState: state, error: 'already_approved' }
  return {
    newState: {
      balance:    state.balance + amount,
      status:     'Aprobada',
      historyLen: state.historyLen + 1,
    },
  }
}

function reverseApproval(
  state: State,
  amount: number,
  newStatus: 'Rechazada' | 'Cancelada',
): { newState: State; error?: string } {
  if (state.status !== 'Aprobada') return { newState: state, error: 'not_approved' }
  return {
    newState: {
      balance:    Math.max(0, state.balance - amount),
      status:     newStatus,
      historyLen: state.historyLen + 1,
    },
  }
}

// ── Property 4: Balance sube exactamente al aprobar ────────
// Validates: Requirements 6.1

describe('affiliateBalance — Property 4', () => {
  it('approving a Pendiente commission increases balance by exactly commission_amount', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true }),
        (initialBalance, amount) => {
          const state: State = { balance: initialBalance, status: 'Pendiente', historyLen: 0 }
          const { newState } = approveCommission(state, amount)
          return Math.abs(newState.balance - (initialBalance + amount)) < 0.001
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ── Property 5: Balance never goes negative ────────────────
// Validates: Requirements 6.3, 6.4

describe('affiliateBalance — Property 5', () => {
  it('balance is always >= 0 after any sequence of approve/reverse operations', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            op:     fc.constantFrom('approve', 'reject', 'cancel'),
            amount: fc.double({ min: 0.01, max: 1000, noNaN: true, noDefaultInfinity: true }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (ops) => {
          let state: State = { balance: 0, status: 'Pendiente', historyLen: 0 }

          for (const { op, amount } of ops) {
            if (op === 'approve') {
              const { newState } = approveCommission(state, amount)
              state = newState
            } else if (op === 'reject') {
              // Reset to Pendiente to allow re-approval in sequence
              if (state.status === 'Aprobada') {
                const { newState } = reverseApproval(state, amount, 'Rechazada')
                state = { ...newState, status: 'Pendiente' }
              }
            } else if (op === 'cancel') {
              if (state.status === 'Aprobada') {
                const { newState } = reverseApproval(state, amount, 'Cancelada')
                state = { ...newState, status: 'Pendiente' }
              }
            }
            if (state.balance < 0) return false
          }
          return true
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ── Property 6: Double approval doesn't duplicate balance ──
// Validates: Requirements 6.6

describe('affiliateBalance — Property 6', () => {
  it('approving an already-Aprobada commission returns already_approved error and balance unchanged', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100_000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.01, max: 10_000, noNaN: true, noDefaultInfinity: true }),
        (initialBalance, amount) => {
          // First approval
          const state: State = { balance: initialBalance, status: 'Pendiente', historyLen: 0 }
          const { newState: afterFirst } = approveCommission(state, amount)

          // Second approval attempt
          const { newState: afterSecond, error } = approveCommission(afterFirst, amount)

          return (
            error === 'already_approved' &&
            afterSecond.balance === afterFirst.balance // balance unchanged
          )
        },
      ),
      { numRuns: 200 },
    )
  })
})

// ── Property 7: History captures every change ─────────────
// Validates: Requirements 8.2

describe('commissionHistory — Property 7', () => {
  it('historyLen increases by exactly 1 for each approve or reverse operation', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('approve', 'reverse'),
          { minLength: 1, maxLength: 15 },
        ),
        (ops) => {
          let state: State = { balance: 0, status: 'Pendiente', historyLen: 0 }
          let expectedHistory = 0

          for (const op of ops) {
            const prevHistory = state.historyLen

            if (op === 'approve' && state.status !== 'Aprobada') {
              const { newState } = approveCommission(state, 10)
              state = newState
              expectedHistory++
            } else if (op === 'reverse' && state.status === 'Aprobada') {
              const { newState } = reverseApproval(state, 10, 'Rechazada')
              state = { ...newState, status: 'Pendiente' }
              expectedHistory++
            }
            // else: no-op, history unchanged
          }

          return state.historyLen === expectedHistory
        },
      ),
      { numRuns: 200 },
    )
  })
})
