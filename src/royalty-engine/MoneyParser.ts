/** Parses numeric strings in any format including scientific notation */
export function parseMoney(raw: string | number): number {
  if (typeof raw === 'number') return raw
  if (!raw) return 0
  let s = raw.toString().trim()
  s = s.replace(/[$€£¥₩₹USDEURCOP GBP]/g, '').trim()
  s = s.replace(/^\(([^)]+)\)$/, '-$1') // (123.45) → -123.45
  if (s === '' || s === '-') return 0
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    if (lastDot > lastComma) s = s.replace(/,/g, '')
    else s = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma && !hasDot) {
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 3 && /^\d+$/.test(parts[1])) {
      if (parts[1].length <= 2) s = s.replace(',', '.')
      else s = s.replace(/,/g, '')
    } else s = s.replace(',', '.')
  }
  s = s.replace(/\s/g, '')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function parseInteger(raw: string | number): number {
  if (typeof raw === 'number') return Math.round(raw)
  const n = parseMoney(raw)
  return isNaN(n) ? 0 : Math.round(n)
}
