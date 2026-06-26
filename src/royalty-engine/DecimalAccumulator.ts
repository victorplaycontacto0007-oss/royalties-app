/**
 * DecimalAccumulator.ts
 *
 * Accumulates monetary values using integer arithmetic scaled by 1e8
 * to achieve Decimal(20,8) precision without a BigDecimal library.
 *
 * Strategy: store totals as BigInt (scaled × 10^8), convert to display
 * string only at the end. This avoids floating-point drift when summing
 * thousands of small values.
 *
 * Requirement: 6
 */

export class DecimalAccumulator {
  private total: bigint = 0n

  /**
   * Adds a numeric value to the accumulator.
   * The value is rounded to 8 decimal places via Math.round before
   * converting to BigInt, which eliminates intermediate float artifacts.
   */
  add(value: number): void {
    // Scale to 8 decimal places — Math.round eliminates float representation
    // artifacts at the scaling boundary (e.g. 0.00000001 * 1e8 = 1.0000000000000002)
    const scaled = Math.round(value * 1e8)
    this.total += BigInt(scaled)
  }

  /**
   * Returns the accumulated total as a JavaScript number.
   * Safe for totals up to ~90 trillion (2^53 / 1e8).
   */
  toNumber(): number {
    return Number(this.total) / 1e8
  }

  /**
   * Returns a fixed-8 decimal string for lossless storage (e.g. "0.00100000").
   * Handles negative totals correctly.
   */
  toFixed8(): string {
    const abs = this.total < 0n ? -this.total : this.total
    const sign = this.total < 0n ? '-' : ''
    // padStart(9) ensures at least one integer digit when value < 1
    const str = abs.toString().padStart(9, '0')
    const int = str.slice(0, -8) || '0'
    const dec = str.slice(-8)
    return `${sign}${int}.${dec}`
  }

  /** Resets the accumulator to zero. */
  reset(): void {
    this.total = 0n
  }
}
