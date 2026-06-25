const KNOWN = ['USD','EUR','GBP','CAD','AUD','JPY','MXN','COP','BRL','CHF','SEK','NOK','DKK','PLN','HUF','CZK','RON']

export function detectCurrency(rows: string[][], headerRow: string[]): string {
  // Check header names for a currency column value pattern
  for (const row of rows.slice(0, 30)) {
    for (const cell of row) {
      const v = (cell ?? '').toString().trim().toUpperCase()
      if (KNOWN.includes(v)) return v
      if (v === '$' || v.startsWith('USD')) return 'USD'
      if (v === '€' || v.startsWith('EUR')) return 'EUR'
      if (v === '£' || v.startsWith('GBP')) return 'GBP'
    }
  }
  // Check header names
  for (const h of headerRow) {
    const v = h.trim().toUpperCase()
    if (KNOWN.includes(v)) return v
  }
  return 'USD'
}
