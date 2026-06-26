// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCommissionCalculator } from '../useCommissionCalculator'

describe('useCommissionCalculator', () => {
  it('calculates commission automatically on mount', () => {
    const { result } = renderHook(() => useCommissionCalculator(20, 20))
    expect(result.current.commission).toBe(4)
    expect(result.current.isManualOverride).toBe(false)
  })

  it('recalculates when purchaseAmount changes', () => {
    const { result, rerender } = renderHook(
      ({ amount, pct }) => useCommissionCalculator(amount, pct),
      { initialProps: { amount: 20, pct: 20 } },
    )
    expect(result.current.commission).toBe(4)

    rerender({ amount: 100, pct: 20 })
    expect(result.current.commission).toBe(20)
    expect(result.current.isManualOverride).toBe(false)
  })

  it('recalculates when percentage changes', () => {
    const { result, rerender } = renderHook(
      ({ amount, pct }) => useCommissionCalculator(amount, pct),
      { initialProps: { amount: 100, pct: 10 } },
    )
    expect(result.current.commission).toBe(10)

    rerender({ amount: 100, pct: 25 })
    expect(result.current.commission).toBe(25)
    expect(result.current.isManualOverride).toBe(false)
  })

  it('preserves manual override when setManualCommission is called', () => {
    const { result } = renderHook(() => useCommissionCalculator(20, 20))

    act(() => { result.current.setManualCommission(9.99) })

    expect(result.current.commission).toBe(9.99)
    expect(result.current.isManualOverride).toBe(true)
  })

  it('clears manual override when inputs change', () => {
    const { result, rerender } = renderHook(
      ({ amount, pct }) => useCommissionCalculator(amount, pct),
      { initialProps: { amount: 20, pct: 20 } },
    )

    act(() => { result.current.setManualCommission(9.99) })
    expect(result.current.isManualOverride).toBe(true)

    // Changing input clears override
    rerender({ amount: 50, pct: 20 })
    expect(result.current.commission).toBe(10)
    expect(result.current.isManualOverride).toBe(false)
  })

  it('resetToCalculated restores auto value and clears override', () => {
    const { result } = renderHook(() => useCommissionCalculator(20, 20))

    act(() => { result.current.setManualCommission(99) })
    expect(result.current.isManualOverride).toBe(true)

    act(() => { result.current.resetToCalculated() })
    expect(result.current.commission).toBe(4)
    expect(result.current.isManualOverride).toBe(false)
  })
})
