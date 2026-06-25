/**
 * royalty-normalizer.ts
 * ============================================================
 * Intelligent column detection and normalization layer for
 * royalty reports from any distributor.
 *
 * Architecture:
 *   1. COLUMN_MAP  — dictionary of equivalences per field
 *   2. normalizeKey()  — strips spaces, lowercase
 *   3. findColumn() — finds a column index by equivalences
 *   4. parseNumeric() — robust number parser (1.234,56 / 1,234.56)
 *   5. detectCurrency() — scans file for currency code
 *   6. buildColumnMap() — maps all fields to column indices
 *   7. ProcessingLog — collects warnings and info messages
 * ============================================================
 */

// ── Types ──────────────────────────────────────────────────────────────────
export interface ColumnMap {
  net_total:         number | null  // PRIMARY earnings column
  gross_total:       number | null
  taxes:             number | null
  channel_costs:     number | null
  other_costs:       number | null
  currency:          number | null
  currency_net:      number | null
  artist:            number | null
  track:             number | null
  album:             number | null
  upc:               number | null
  isrc:              number | null
  store:             number | null
  country:           number | null
  quantity:          number | null
  sale_period:       number | null
}

export interface ProcessingLog {
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface NormalizerResult {
  columnMap:    ColumnMap
  logs:         ProcessingLog[]
  currency:     string
  detectedCols: Record<string, string>  // fieldName → actual column header found
}

// ── Normalize a column header key ─────────────────────────────────────────
// Strips all spaces and converts to lowercase for fuzzy matching
export function normalizeKey(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

// ── Column equivalence dictionary ─────────────────────────────────────────
// Each field maps to an ordered list of possible column names.
// Matching is done after normalizeKey() on both sides.
// Order matters: first exact match wins, then partial.
//
// ADD NEW PROVIDERS HERE — no need to change any other code.
// ──────────────────────────────────────────────────────────────────────────
const COLUMN_MAP: Record<keyof ColumnMap, string[]> = {
  net_total: [
    // Exact / high-priority
    'net total', 'nettotal', 'net_total',
    'net revenue', 'netrevenue', 'net_revenue',
    'net earnings', 'netearnings',
    'net amount', 'netamount',
    'net income', 'netincome',
    'net payout', 'netpayout',
    'you earned', 'youearned',
    'your earnings', 'yourearnings',
    'earnings (usd)', 'earningsusd',
    'earnings',
    'royalty (usd)', 'royaltyusd',
    'royalty amount (usd)',
    'royalty amount', 'royaltyamount',
    'total royalty', 'totalroyalty',
    'net royalty', 'netroyalty',
    'collaborator share', 'collaboratorshare',
    'final royalty', 'finalroyalty',
    'paid (usd)', 'paidusd',
    'settlement amount', 'settlementamount',
    // Generic fallbacks (lower priority)
    'amount (usd)', 'amountusd',
    'total earnings', 'totalearnings',
    'payout',
    'payment',
    'income',
    'royalty',
    'amount',
    'net',
  ],
  gross_total: [
    'gross total', 'grosstotal', 'gross_total',
    'gross revenue', 'grossrevenue',
    'gross earnings', 'grossearnings',
    'gross amount', 'grossamount',
    'gross income', 'grossincome',
    'gross',
  ],
  taxes: [
    'taxes', 'tax', 'tax amount', 'taxamount',
    'withholding tax', 'witholdingtax',
    'vat', 'gst',
  ],
  channel_costs: [
    'channel costs', 'channelcosts', 'channel cost',
    'distribution cost', 'distributioncost',
    'distribution fee', 'distributionfee',
  ],
  other_costs: [
    'other costs', 'othercosts', 'other cost',
    'deductions', 'deduction',
    'fees', 'fee',
  ],
  currency: [
    'currency', 'cur', 'curr',
    'currency code', 'currencycode',
    'payment currency', 'paymentcurrency',
    'reporting currency', 'reportingcurrency',
  ],
  currency_net: [
    'currency net total', 'currencynettotal',
    'currency net', 'currencynet',
    'local net', 'localnet',
    'local amount', 'localamount',
    'local currency amount', 'localcurrencyamount',
  ],
  artist: [
    'artist name', 'artistname', 'artist_name',
    'track artists', 'trackartists',
    'artist', 'performer', 'act',
    'recording artist', 'recordingartist',
    'main artist', 'mainartist',
    'primary artist', 'primaryartist',
    'label artist', 'labelartist',
  ],
  track: [
    'track title', 'tracktitle', 'track_title',
    'song title', 'songtitle', 'song_title',
    'title', 'track name', 'trackname',
    'song name', 'songname',
    'recording title', 'recordingtitle',
    'asset title', 'assettitle',
    'content title', 'contenttitle',
    'work title', 'worktitle',
    'song', 'track',
  ],
  album: [
    'album title', 'albumtitle', 'album_title',
    'album name', 'albumname',
    'release title', 'releasetitle',
    'release name', 'releasename',
    'product title', 'producttitle',
    'album', 'release', 'ep/album',
  ],
  upc: [
    'upc', 'display upc', 'displayupc',
    'product upc', 'productupc',
    'barcode',
  ],
  isrc: [
    'isrc', 'track isrc', 'trackisrc',
    'recording isrc', 'recordingisrc',
  ],
  store: [
    'store name', 'storename', 'store_name',
    'dsp name', 'dspname',
    'platform name', 'platformname',
    'music service', 'musicservice',
    'streaming service', 'streamingservice',
    'retailer', 'outlet',
    'store', 'platform', 'dsp', 'service', 'channel',
    'distributor', 'provider', 'source', 'vendor',
  ],
  country: [
    'country of sale', 'countryofsale',
    'sales region', 'salesregion', 'sales_region',
    'territory', 'region', 'market',
    'sale country', 'salecountry',
    'sales country', 'salescountry',
    'geo', 'location',
    'country',
  ],
  quantity: [
    'units of sold', 'unitsofsold',
    'units sold', 'unitssold',
    'number of streams', 'numberofstreams',
    'stream count', 'streamcount',
    'total streams', 'totalstreams',
    'total plays', 'totalplays',
    'streams/downloads', 'streamsdownloads',
    'net units', 'netunits',
    'total quantity', 'totalquantity',
    'downloads', 'quantity', 'streams',
    'plays', 'units',
  ],
  sale_period: [
    'reporting date', 'reportingdate',
    'reporting month', 'reportingmonth',
    'report month', 'reportmonth',
    'sale month', 'salemonth',
    'sales period', 'salesperiod',
    'sale period', 'saleperiod', 'sale_period',
    'reporting period', 'reportingperiod',
    'income period', 'incomeperiod',
    'billing period', 'billingperiod',
    'settlement date', 'settlementdate',
    'payment date', 'paymentdate',
    'transaction date', 'transactiondate',
    'report date', 'reportdate',
    'period', 'month', 'date',
  ],
}

// Columns that look like rates/percentages — never map these as net_total
const RATE_EXCLUSIONS = new Set([
  'royaltybasis', 'royalty basis',
  'taxrate', 'tax rate', 'tax%', 'share%',
  'percentage', 'rate', 'basis',
  'transactiontype', 'transaction type',
  'transactiontypedescription', 'transaction type description',
  'currencycode', 'currency code',
  'isrc', 'upc', 'projectcode', 'productcode',
  'label',
])

// ── Currency detection ─────────────────────────────────────────────────────
const KNOWN_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'MXN', 'COP', 'BRL', 'CHF', 'SEK', 'NOK', 'DKK']

export function detectCurrencyFromRows(rows: string[][]): string {
  // Scan first 30 rows for a known currency code
  for (const row of rows.slice(0, 30)) {
    for (const cell of row) {
      const v = (cell ?? '').toString().trim().toUpperCase()
      if (KNOWN_CURRENCIES.includes(v)) return v
      // Also check for currency symbols in values
      if (v.startsWith('$')) return 'USD'
      if (v.startsWith('€')) return 'EUR'
      if (v.startsWith('£')) return 'GBP'
    }
  }
  return 'USD'
}

// ── Numeric parser — handles multiple formats ──────────────────────────────
// Accepts: 1234.56 | 1,234.56 | 1.234,56 | 1234,56 | (1234.56) negative
export function parseNumericValue(raw: string | number): number {
  if (typeof raw === 'number') return raw
  if (!raw) return NaN

  let s = raw.toString().trim()
  // Remove currency symbols
  s = s.replace(/[$€£¥₩₹]/g, '').trim()
  // Handle negative in parentheses: (123.45) → -123.45
  s = s.replace(/^\(([^)]+)\)$/, '-$1')

  // Detect format: if both . and , present
  const hasDot   = s.includes('.')
  const hasComma = s.includes(',')

  if (hasDot && hasComma) {
    // Last separator is the decimal: 1,234.56 or 1.234,56
    const lastDot   = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    if (lastDot > lastComma) {
      // 1,234.56 → US format
      s = s.replace(/,/g, '')
    } else {
      // 1.234,56 → EU format
      s = s.replace(/\./g, '').replace(',', '.')
    }
  } else if (hasComma && !hasDot) {
    // Could be 1234,56 (EU decimal) or 1,234 (US thousands)
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      // Likely decimal comma: 1234,56
      s = s.replace(',', '.')
    } else {
      // Likely thousands comma: 1,234
      s = s.replace(/,/g, '')
    }
  }
  // Remove remaining thousands separators (spaces)
  s = s.replace(/\s/g, '')

  const n = parseFloat(s)
  return isNaN(n) ? NaN : n
}

// ── Find a column index by field name ─────────────────────────────────────
function findColumn(
  headers: string[],
  field: keyof ColumnMap,
  logs: ProcessingLog[]
): number | null {
  const equivalences = COLUMN_MAP[field]
  const normalizedHeaders = headers.map(h => normalizeKey((h ?? '').toString()))

  // Pass 1: exact match (after normalizeKey)
  for (const equiv of equivalences) {
    const normalizedEquiv = normalizeKey(equiv)
    if (RATE_EXCLUSIONS.has(normalizedEquiv)) continue
    const idx = normalizedHeaders.findIndex(h => h === normalizedEquiv)
    if (idx !== -1) {
      logs.push({ level: 'info', message: `Campo "${field}" → columna "${headers[idx]}" (pos ${idx})` })
      return idx
    }
  }

  // Pass 2: partial match — header contains equivalence OR equivalence contains header
  for (const equiv of equivalences) {
    const normalizedEquiv = normalizeKey(equiv)
    if (RATE_EXCLUSIONS.has(normalizedEquiv)) continue
    const idx = normalizedHeaders.findIndex(h =>
      h.includes(normalizedEquiv) || normalizedEquiv.includes(h)
    )
    if (idx !== -1) {
      logs.push({ level: 'info', message: `Campo "${field}" → columna "${headers[idx]}" (partial, pos ${idx})` })
      return idx
    }
  }

  return null
}

// ── Main: build full column map from a header row ─────────────────────────
export function buildColumnMap(headers: string[]): NormalizerResult {
  const logs: ProcessingLog[] = []
  const detectedCols: Record<string, string> = {}

  logs.push({ level: 'info', message: `Columnas detectadas: ${headers.length}` })

  const map: ColumnMap = {
    net_total:     null,
    gross_total:   null,
    taxes:         null,
    channel_costs: null,
    other_costs:   null,
    currency:      null,
    currency_net:  null,
    artist:        null,
    track:         null,
    album:         null,
    upc:           null,
    isrc:          null,
    store:         null,
    country:       null,
    quantity:      null,
    sale_period:   null,
  }

  for (const field of Object.keys(map) as (keyof ColumnMap)[]) {
    const idx = findColumn(headers, field, logs)
    map[field] = idx
    if (idx !== null) {
      detectedCols[field] = headers[idx]
    }
  }

  // Warnings for missing important columns
  const important: (keyof ColumnMap)[] = ['net_total', 'artist', 'track', 'store', 'country', 'quantity', 'sale_period']
  for (const f of important) {
    if (map[f] === null) {
      logs.push({ level: 'warn', message: `⚠ Columna "${f}" no encontrada.` })
    }
  }

  // Fallback: if net_total not found, try currency_net
  if (map.net_total === null && map.currency_net !== null) {
    logs.push({ level: 'warn', message: 'net_total no encontrado. Usando currency_net como fallback.' })
    map.net_total = map.currency_net
    detectedCols['net_total'] = detectedCols['currency_net'] + ' (fallback)'
  }

  if (map.net_total === null) {
    logs.push({ level: 'error', message: '❌ No se encontró ninguna columna de ingresos netos.' })
  } else {
    logs.push({ level: 'info', message: `✅ Columna de ingresos netos: "${detectedCols['net_total']}"` })
  }

  return { columnMap: map, logs, currency: 'USD', detectedCols }
}

// ── Get numeric value from a row using the column map ─────────────────────
export function getNumeric(
  row: (string | number)[],
  idx: number | null
): number {
  if (idx === null || idx < 0 || idx >= row.length) return 0
  const raw = row[idx]
  if (typeof raw === 'number') return raw
  const n = parseNumericValue(String(raw ?? ''))
  return isNaN(n) ? 0 : n
}

export function getString(
  row: (string | number)[],
  idx: number | null,
  fallback = ''
): string {
  if (idx === null || idx < 0 || idx >= row.length) return fallback
  return (row[idx] ?? '').toString().trim() || fallback
}
