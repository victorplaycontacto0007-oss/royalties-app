/**
 * Calculates the commission amount for a given purchase amount and percentage.
 * Result is rounded to 2 decimal places.
 *
 * @param purchaseAmountUsd  - The purchase amount in USD (must be > 0)
 * @param commissionPercentage - The commission percentage (must be in [0.01, 100])
 * @returns Commission amount rounded to 2 decimal places
 */
export function calculateCommission(
  purchaseAmountUsd: number,
  commissionPercentage: number,
): number {
  return Math.round(purchaseAmountUsd * (commissionPercentage / 100) * 100) / 100
}
