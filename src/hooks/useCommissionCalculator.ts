import { useState, useEffect } from 'react'
import { calculateCommission } from '../lib/commissionCalculator'

export interface UseCommissionCalculatorReturn {
  commission:         number
  isManualOverride:   boolean
  setManualCommission: (value: number) => void
  resetToCalculated:  () => void
}

/**
 * Manages the commission amount field with auto-calculation and manual override.
 *
 * - When `purchaseAmount` or `percentage` change the commission is recalculated
 *   automatically and any manual override is cleared.
 * - When `setManualCommission` is called the value is preserved as-is and
 *   `isManualOverride` is set to true.
 * - `resetToCalculated` restores the auto-calculated value.
 */
export function useCommissionCalculator(
  purchaseAmount: number,
  percentage: number,
): UseCommissionCalculatorReturn {
  const calculated = calculateCommission(purchaseAmount, percentage)

  const [commission, setCommission]               = useState<number>(calculated)
  const [isManualOverride, setIsManualOverride]   = useState<boolean>(false)

  // Recalculate whenever inputs change, unless user has overridden manually
  useEffect(() => {
    setCommission(calculated)
    setIsManualOverride(false)
  }, [purchaseAmount, percentage]) // eslint-disable-line react-hooks/exhaustive-deps

  const setManualCommission = (value: number) => {
    setCommission(value)
    setIsManualOverride(true)
  }

  const resetToCalculated = () => {
    setCommission(calculated)
    setIsManualOverride(false)
  }

  return { commission, isManualOverride, setManualCommission, resetToCalculated }
}
