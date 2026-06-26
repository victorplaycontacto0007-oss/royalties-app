import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import {
  buildColumnMap, parseNumericValue, detectCurrencyFromRows,
} from './royalty-normalizer'

export interface RoyaltyRow {
  sale_period: string
  store: string
  country: string
  artist_name: string
  song_title: string
  album_name: string
  quantity: number
  earnings_usd: number
}

// ============================================================
// KEYWORD MAPPINGS — covers DistroKid, SoundOn, TuneCore,
// CD Baby, Ditto, ONErpm, UnitedMasters, Amuse, etc.
// Each field has a list of known column name fragments.
// Matching is case-insensitive and partial.
// ============================================================
const FIELD_KEYWORDS: Record<keyof RoyaltyRow, string[]> = {
  sale_period: [
    'reporting date', 'sale period', 'sale month', 'period', 'reporting period',
    'month', 'date', 'transaction date', 'report date', 'settlement date',
    'payment date', 'sales period', 'income period', 'billing period',
  ],
  store: [
    // SoundOn exact first
    'store name',
    'store', 'platform', 'service', 'dsp', 'channel',
    'retailer', 'music service', 'streaming service', 'outlet',
    'distributor', 'provider', 'source', 'vendor',
  ],
  country: [
    // SoundOn exact first
    'sales region',
    'country of sale', 'country', 'territory', 'region',
    'market', 'geo', 'location', 'sale country', 'sales country',
  ],
  artist_name: [
    'artist name', 'artist', 'performer', 'recording artist',
    'main artist', 'primary artist', 'act',
    'track artists',
  ],
  song_title: [
    // SoundOn exact first
    'track title',
    'song title', 'title', 'track name', 'recording title',
    'song', 'work title', 'song name', 'asset title',
    'content title', 'release title',
    // 'track' alone goes last — to avoid matching "Track Artists" or plain "Track" (album track col)
    'track',
  ],
  album_name: [
    'album title', 'album name', 'album', 'release', 'product title',
    'release name', 'ep/album',
  ],
  quantity: [
    // SoundOn exact first
    'units of sold', 'units sold',
    'quantity', 'streams', 'units',
    'plays', 'net units', 'total quantity', 'number of streams',
    'stream count', 'total streams', 'downloads', 'total plays',
    'streams/downloads',
  ],
  earnings_usd: [
    // Label/distributor reports (Global Sound Stars format)
    'collaborator share',
    // SoundOn exact first
    'final royalty',
    'royalty (usd)', 'royalty amount (usd)', 'royalty amount',
    'total royalty', 'net royalty',
    // DistroKid
    'earnings (usd)', 'earnings', 'you earned', 'your earnings',
    'paid (usd)',
    // Generic
    'net revenue', 'amount (usd)', 'amount',
    'net amount', 'total earnings', 'revenue', 'payment',
    'net', 'usd', 'gross revenue', 'total revenue', 'income',
    'net income', 'payout', 'net payout', 'settlement amount',
    'total amount', 'earning',
    // royalty last (to avoid matching "royalty basis" which is a rate, not an amount)
    'royalty',
  ],
}

// ============================================================
// Country code → full name
// ============================================================
const COUNTRY_CODES: Record<string, string> = {
  AF: 'Afganistán', AL: 'Albania', DZ: 'Argelia', AD: 'Andorra',
  AO: 'Angola', AG: 'Antigua y Barbuda', AR: 'Argentina', AM: 'Armenia',
  AU: 'Australia', AT: 'Austria', AZ: 'Azerbaiyán', BS: 'Bahamas',
  BH: 'Baréin', BD: 'Bangladés', BB: 'Barbados', BY: 'Bielorrusia',
  BE: 'Bélgica', BZ: 'Belice', BJ: 'Benín', BT: 'Bután',
  BO: 'Bolivia', BA: 'Bosnia y Herzegovina', BW: 'Botsuana', BR: 'Brasil',
  BN: 'Brunéi', BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi',
  CV: 'Cabo Verde', KH: 'Camboya', CM: 'Camerún', CA: 'Canadá',
  CF: 'Rep. Centroafricana', TD: 'Chad', CL: 'Chile', CN: 'China',
  CO: 'Colombia', KM: 'Comoras', CG: 'Congo', CR: 'Costa Rica',
  HR: 'Croacia', CU: 'Cuba', CY: 'Chipre', CZ: 'República Checa',
  DK: 'Dinamarca', DJ: 'Yibuti', DM: 'Dominica', DO: 'Rep. Dominicana',
  EC: 'Ecuador', EG: 'Egipto', SV: 'El Salvador', GQ: 'Guinea Ecuatorial',
  ER: 'Eritrea', EE: 'Estonia', SZ: 'Suazilandia', ET: 'Etiopía',
  FJ: 'Fiyi', FI: 'Finlandia', FR: 'Francia', GA: 'Gabón',
  GM: 'Gambia', GE: 'Georgia', DE: 'Alemania', GH: 'Ghana',
  GR: 'Grecia', GD: 'Granada', GT: 'Guatemala', GN: 'Guinea',
  GW: 'Guinea-Bisáu', GY: 'Guyana', HT: 'Haití', HN: 'Honduras',
  HU: 'Hungría', IS: 'Islandia', IN: 'India', ID: 'Indonesia',
  IR: 'Irán', IQ: 'Irak', IE: 'Irlanda', IL: 'Israel',
  IT: 'Italia', JM: 'Jamaica', JP: 'Japón', JO: 'Jordania',
  KZ: 'Kazajistán', KE: 'Kenia', KI: 'Kiribati', KP: 'Corea del Norte',
  KR: 'Corea del Sur', KW: 'Kuwait', KG: 'Kirguistán', LA: 'Laos',
  LV: 'Letonia', LB: 'Líbano', LS: 'Lesoto', LR: 'Liberia',
  LY: 'Libia', LI: 'Liechtenstein', LT: 'Lituania', LU: 'Luxemburgo',
  MG: 'Madagascar', MW: 'Malaui', MY: 'Malasia', MV: 'Maldivas',
  ML: 'Malí', MT: 'Malta', MH: 'Islas Marshall', MR: 'Mauritania',
  MU: 'Mauricio', MX: 'México', FM: 'Micronesia', MD: 'Moldavia',
  MC: 'Mónaco', MN: 'Mongolia', ME: 'Montenegro', MA: 'Marruecos',
  MZ: 'Mozambique', MM: 'Myanmar', NA: 'Namibia', NR: 'Nauru',
  NP: 'Nepal', NL: 'Países Bajos', NZ: 'Nueva Zelanda', NI: 'Nicaragua',
  NE: 'Níger', NG: 'Nigeria', MK: 'Macedonia del Norte', NO: 'Noruega',
  OM: 'Omán', PK: 'Pakistán', PW: 'Palaos', PA: 'Panamá',
  PG: 'Papúa Nueva Guinea', PY: 'Paraguay', PE: 'Perú', PH: 'Filipinas',
  PL: 'Polonia', PT: 'Portugal', QA: 'Catar', RO: 'Rumanía',
  RU: 'Rusia', RW: 'Ruanda', KN: 'San Cristóbal y Nieves', LC: 'Santa Lucía',
  VC: 'San Vicente y las Granadinas', WS: 'Samoa', SM: 'San Marino',
  ST: 'Santo Tomé y Príncipe', SA: 'Arabia Saudita', SN: 'Senegal',
  RS: 'Serbia', SC: 'Seychelles', SL: 'Sierra Leona', SG: 'Singapur',
  SK: 'Eslovaquia', SI: 'Eslovenia', SB: 'Islas Salomón', SO: 'Somalia',
  ZA: 'Sudáfrica', SS: 'Sudán del Sur', ES: 'España', LK: 'Sri Lanka',
  SD: 'Sudán', SR: 'Surinam', SE: 'Suecia', CH: 'Suiza',
  SY: 'Siria', TW: 'Taiwán', TJ: 'Tayikistán', TZ: 'Tanzania',
  TH: 'Tailandia', TL: 'Timor-Leste', TG: 'Togo', TO: 'Tonga',
  TT: 'Trinidad y Tobago', TN: 'Túnez', TR: 'Turquía', TM: 'Turkmenistán',
  TV: 'Tuvalu', UG: 'Uganda', UA: 'Ucrania', AE: 'Emiratos Árabes Unidos',
  GB: 'Reino Unido', US: 'Estados Unidos', UY: 'Uruguay', UZ: 'Uzbekistán',
  VU: 'Vanuatu', VE: 'Venezuela', VN: 'Vietnam', YE: 'Yemen',
  ZM: 'Zambia', ZW: 'Zimbabue', XK: 'Kosovo', PS: 'Palestina',
  // Common extras
  HK: 'Hong Kong', MO: 'Macao',
  EU: 'Europa', ROW: 'Resto del mundo',
}

export function expandCountryCode(code: string): string {
  if (!code) return 'Unknown'
  const upper = code.trim().toUpperCase()
  return COUNTRY_CODES[upper] ?? code
}

// ============================================================
// Normalize artist name
// "Track Artists" in label reports contains ALL collaborators
// separated by "|" (e.g. "Yasir|kelly cc"). Each row already
// represents a single collaborator's payout, so we take only
// the first name before "|" as the canonical artist name.
// ============================================================
export function normalizeArtistName(raw: string): string {
  if (!raw) return ''
  // Split on "|" and take the first non-empty segment
  const parts = raw.split('|').map(s => s.trim()).filter(Boolean)
  return parts[0] ?? raw.trim()
}

// ============================================================
// Normalize sale_period to "YYYY-MM" format
// Handles:
//   - "Jan-26" / "Feb-25" (TuneOrchard / Global Sound Stars format)
//   - "2026-01-01~2026-01-31" (SoundOn range format)
//   - "2026-01-15" (full date)
//   - "2026-01" (already correct)
// ============================================================
const MONTH_ABBR: Record<string, string> = {
  // 3-letter abbreviations
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  // Full English names (e.g. "March, 2026" from MILL reports)
  january: '01', february: '02', march: '03', april: '04',
  june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  // Full Spanish names
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
}

export function normalizeSalePeriod(raw: string): string {
  if (!raw || raw === 'Unknown') return 'Unknown'
  const s = raw.trim()

  // "Jan-26" or "Jan-2026" format (TuneOrchard / Global Sound Stars)
  const monYearMatch = s.match(/^([A-Za-z]{3})[-\s](\d{2,4})$/)
  if (monYearMatch) {
    const mon = MONTH_ABBR[monYearMatch[1].toLowerCase()]
    if (mon) {
      const yr = monYearMatch[2].length === 2 ? `20${monYearMatch[2]}` : monYearMatch[2]
      return `${yr}-${mon}`
    }
  }

  // "2026M1", "2026M10", "2026 M2" (MILL Digital Sales format)
  const millMatch = s.match(/^(20\d{2})\s*[Mm](0?[1-9]|1[0-2])$/)
  if (millMatch) {
    return `${millMatch[1]}-${millMatch[2].padStart(2, '0')}`
  }

  // "March, 2026" or "March 2026" or "March,2026" or "Marzo, 2026" (full or short month name)
  const fullMonthMatch = s.match(/^([A-Za-z]+)[,\s]+(\d{4})$/)
  if (fullMonthMatch) {
    const mon = MONTH_ABBR[fullMonthMatch[1].toLowerCase()]
    if (mon) return `${fullMonthMatch[2]}-${mon}`
  }

  // SoundOn range "2026-01-01~2026-01-31"
  if (s.includes('~')) {
    return s.split('~')[0].slice(0, 7)
  }

  // Full date "2026-01-15" → "2026-01"
  if (s.length > 7 && /^\d{4}-\d{2}/.test(s)) {
    return s.slice(0, 7)
  }

  return s
}

// ============================================================
// Find the data header row (skip preamble / metadata lines)
// ============================================================
function scoreRow(row: (string | number)[]): number {
  let score = 0
  for (const cell of row) {
    const key = (cell ?? '').toString().toLowerCase().trim()
    if (!key) continue
    for (const keywords of Object.values(FIELD_KEYWORDS)) {
      for (const kw of keywords) {
        if (key === kw || key.includes(kw) || kw.includes(key)) {
          score++
          break
        }
      }
    }
  }
  return score
}

function findHeaderRow(rows: (string | number)[][]): number {
  // First pass: look for a row that contains clear header markers
  // These are unambiguous column names that only appear in the real header row
  const STRONG_HEADER_MARKERS = [
    'statement period', 'transaction type', 'collaborator share',
    'isrc', 'display upc', 'track artists',
  ]
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i]
    if (!row || row.length < 3) continue
    const cells = row.map(c => (c ?? '').toString().toLowerCase().trim())
    const hits = STRONG_HEADER_MARKERS.filter(m => cells.includes(m))
    if (hits.length >= 2) return i  // found 2+ strong markers → this is the header
  }

  // Fallback: pick the row with the highest keyword score
  let bestIdx = 0
  let bestScore = 0
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i]
    if (!row || row.length < 2) continue
    const s = scoreRow(row)
    if (s > bestScore) {
      bestScore = s
      bestIdx = i
    }
  }
  return bestIdx
}

// ============================================================
// Map headers to column indices — exact match wins over partial
// ============================================================
function mapHeaders(headerRow: (string | number)[]): Record<keyof RoyaltyRow, number | undefined> & { _trackArtistIdx?: number } {
  const map: Partial<Record<keyof RoyaltyRow, number>> & { _trackArtistIdx?: number } = {}
  const headers = headerRow.map(h => (h ?? '').toString())

  // ── Use the intelligent normalizer for earnings_usd ──────────────────────
  // This ensures proper hierarchy: net_total > currency_net > royalty > amount
  // and ignores rate columns like "royalty basis", "tax rate", etc.
  const normResult = buildColumnMap(headers)
  const normMap = normResult.columnMap

  // Map earnings_usd from normalizer (uses full hierarchy)
  if (normMap.net_total !== null) {
    map.earnings_usd = normMap.net_total
  }
  // Map other fields from normalizer
  if (normMap.quantity !== null)    map.quantity    = normMap.quantity
  if (normMap.store !== null)       map.store       = normMap.store
  if (normMap.country !== null)     map.country     = normMap.country
  if (normMap.artist !== null)      map.artist_name = normMap.artist
  if (normMap.track !== null)       map.song_title  = normMap.track
  if (normMap.album !== null)       map.album_name  = normMap.album
  if (normMap.sale_period !== null) map.sale_period = normMap.sale_period

  // Log for dev
  if (import.meta.env.DEV) {
    console.group('[Normalizer] Column mapping')
    normResult.logs.forEach(l => console.log(`  [${l.level}] ${l.message}`))
    console.groupEnd()
  }

  // Pass 0: priority overrides — these exact headers always win over normalizer
  const PRIORITY_EXACT: Partial<Record<keyof RoyaltyRow, string[]>> = {
    earnings_usd: ['collaborator share', 'final royalty', 'earnings (usd)', 'royalty amount (usd)', 'royalty amount'],
    quantity:     ['units of sold', 'units sold', 'quantity'],
    artist_name:  ['track artists', 'artist name'],
    song_title:   ['track title', 'track', 'song title'],
    store:        ['store name', 'store'],
    country:      ['sales region', 'country of sale', 'country'],
    sale_period:  ['reporting date', 'sale period', 'statement period', 'period'],
  }
  for (const [field, priorityKeys] of Object.entries(PRIORITY_EXACT) as [keyof RoyaltyRow, string[]][]) {
    for (const pk of priorityKeys) {
      const idx = headerRow.findIndex(h => (h ?? '').toString().toLowerCase().trim() === pk)
      if (idx !== -1) {
        if (field === 'song_title' && pk === 'track') {
          const colName = (headerRow[idx] ?? '').toString().toLowerCase().trim()
          if (colName === 'track artists') continue
        }
        map[field] = idx
        break
      }
    }
  }

  // Pass 1: exact matches for remaining unmapped fields
  headerRow.forEach((h, i) => {
    const key = (h ?? '').toString().toLowerCase().trim()
    if (!key) return
    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS) as [keyof RoyaltyRow, string[]][]) {
      if (map[field] !== undefined) continue
      if (keywords.includes(key)) {
        map[field] = i
        break
      }
    }
  })

  // Pass 2: partial/fuzzy matches for fields still unmapped
  // Columns that look like rates/percentages — never map these as earnings
  const RATE_COLUMN_EXCLUSIONS = [
    'royalty basis', 'tax %', 'tax rate', 'rate', 'basis',
    'share %', 'percentage', 'transaction type', 'transaction type description',
    'currency', 'isrc', 'upc', 'project code', 'product code', 'label',
  ]

  headerRow.forEach((h, i) => {
    const key = (h ?? '').toString().toLowerCase().trim()
    if (!key) return
    // Skip columns that are clearly rates, not amounts
    if (RATE_COLUMN_EXCLUSIONS.some(exc => key === exc || key.includes(exc))) return
    for (const [field, keywords] of Object.entries(FIELD_KEYWORDS) as [keyof RoyaltyRow, string[]][]) {
      if (map[field] !== undefined) continue
      // Sort keywords by length descending so longer/more specific matches win
      const sorted = [...keywords].sort((a, b) => b.length - a.length)
      for (const kw of sorted) {
        if (key.includes(kw) || kw.includes(key)) {
          map[field] = i
          break
        }
      }
    }
  })

  // ── Label/distributor report detection ──────────────────────────────────────
  // When both "Artist" and "Track Artists" columns exist, "Artist" typically
  // contains the label/distributor name (not the real artist). In that case,
  // store the "Track Artists" index separately so parseRow can prefer it.
  let genericArtistIdx: number | undefined
  let trackArtistIdx: number | undefined

  headerRow.forEach((h, i) => {
    const key = (h ?? '').toString().toLowerCase().trim()
    if (key === 'artist') genericArtistIdx = i
    if (key === 'track artists') trackArtistIdx = i
  })

  if (genericArtistIdx !== undefined && trackArtistIdx !== undefined) {
    // Keep the "Artist" col index as a fallback but prefer "Track Artists"
    map._trackArtistIdx = trackArtistIdx
  }

  return map as Record<keyof RoyaltyRow, number | undefined> & { _trackArtistIdx?: number }
}

// ============================================================
// Parse a data row
// ============================================================
function parseRow(
  row: (string | number)[],
  colMap: Record<keyof RoyaltyRow, number | undefined> & { _trackArtistIdx?: number }
): RoyaltyRow | null {
  const get = (field: keyof RoyaltyRow): string => {
    const idx = colMap[field]
    if (idx === undefined) return ''
    return (row[idx] ?? '').toString().trim()
  }

  // If the report has both "Artist" and "Track Artists" columns, prefer
  // "Track Artists" — in label/distributor reports the "Artist" column
  // holds the label name, not the actual artist.
  const getArtist = (): string => {
    if (colMap._trackArtistIdx !== undefined) {
      const trackArtist = (row[colMap._trackArtistIdx] ?? '').toString().trim()
      if (trackArtist) return normalizeArtistName(trackArtist)
    }
    return normalizeArtistName(get('artist_name'))
  }

  const rawEarnings = get('earnings_usd')
  const rawQty      = get('quantity')

  const earnings = parseNumericValue(rawEarnings)
  const quantity = (() => {
    const n = parseNumericValue(rawQty)
    return isNaN(n) ? NaN : Math.round(n)
  })()

  if (isNaN(earnings) && isNaN(quantity)) return null

  // Skip repeated header rows — match exact header values only
  const earningsRaw = get('earnings_usd').toLowerCase()
  const headerWords = ['earnings', 'amount', 'revenue', 'usd', 'income', 'final royalty', 'royalty']
  if (headerWords.includes(earningsRaw)) return null

  const nonEmpty = row.filter(c => c && c.toString().trim()).length
  if (nonEmpty < 2) return null

  const rawCountry = get('country')

  // Normalize sale_period to YYYY-MM
  const salePeriod = normalizeSalePeriod(get('sale_period') || 'Unknown')

  return {
    sale_period:  salePeriod,
    store:        get('store')        || 'Unknown',
    country:      expandCountryCode(rawCountry),
    artist_name:  getArtist()         || 'Unknown',
    song_title:   get('song_title')   || 'Unknown',
    album_name:   get('album_name')   || '',
    quantity:     isNaN(quantity)  ? 0 : quantity,
    earnings_usd: isNaN(earnings)  ? 0 : earnings,
  }
}

// ============================================================
// Mixed row parser — uses textRow for strings/dates, numRow for
// earnings and quantity to preserve full numeric precision.
// ============================================================
function parseRowMixed(
  textRow: string[],
  numRow: (string | number)[],
  colMap: Record<keyof RoyaltyRow, number | undefined> & { _trackArtistIdx?: number }
): RoyaltyRow | null {
  // Text fields come from the formatted row (raw:false)
  const getText = (field: keyof RoyaltyRow): string => {
    const idx = colMap[field]
    if (idx === undefined) return ''
    return (textRow[idx] ?? '').toString().trim()
  }
  // Numeric fields: prefer raw number, fall back to robust parseNumericValue
  const getNum = (field: keyof RoyaltyRow): number => {
    const idx = colMap[field]
    if (idx === undefined) return NaN
    const v = numRow[idx]
    if (typeof v === 'number') return v
    return parseNumericValue(String(v ?? ''))
  }

  const earnings = getNum('earnings_usd')
  const quantity = (() => {
    const idx = colMap['quantity']
    if (idx === undefined) return NaN
    const v = numRow[idx]
    if (typeof v === 'number') return Math.round(v)
    const n = parseNumericValue(String(v ?? ''))
    return isNaN(n) ? NaN : Math.round(n)
  })()

  if (isNaN(earnings) && isNaN(quantity)) return null

  // Skip repeated header rows
  const earningsText = getText('earnings_usd').toLowerCase()
  const headerWords = ['earnings', 'amount', 'revenue', 'usd', 'income', 'final royalty', 'royalty']
  if (headerWords.includes(earningsText)) return null

  const nonEmpty = textRow.filter(c => c && c.toString().trim()).length
  if (nonEmpty < 2) return null

  const getArtist = (): string => {
    if (colMap._trackArtistIdx !== undefined) {
      const ta = (textRow[colMap._trackArtistIdx] ?? '').toString().trim()
      if (ta) return normalizeArtistName(ta)
    }
    return normalizeArtistName(getText('artist_name'))
  }

  const salePeriod = normalizeSalePeriod(getText('sale_period') || 'Unknown')

  return {
    sale_period:  salePeriod,
    store:        getText('store')     || 'Unknown',
    country:      expandCountryCode(getText('country')),
    artist_name:  getArtist()          || 'Unknown',
    song_title:   getText('song_title')|| 'Unknown',
    album_name:   getText('album_name')|| '',
    quantity:     isNaN(quantity)  ? 0 : quantity,
    earnings_usd: isNaN(earnings)  ? 0 : earnings,
  }
}

function toRawFraudRowMixed(
  textRow: string[],
  numRow: (string | number)[],
  colMap: Record<keyof RoyaltyRow, number | undefined> & { _trackArtistIdx?: number },
  txCols: { codeIdx: number; descIdx: number }
): RawFraudRow | null {
  const getText = (field: keyof RoyaltyRow) => {
    const idx = colMap[field]
    return idx !== undefined ? (textRow[idx] ?? '').toString().trim() : ''
  }
  const txCode = txCols.codeIdx >= 0 ? (textRow[txCols.codeIdx] ?? '').toString().trim() : ''
  const txDesc = txCols.descIdx >= 0 ? (textRow[txCols.descIdx] ?? '').toString().trim() : ''

  const qtyRaw = numRow[colMap['quantity'] ?? -1]
  const earnRaw = numRow[colMap['earnings_usd'] ?? -1]
  const qty  = typeof qtyRaw  === 'number' ? Math.round(qtyRaw)  : parseInt(String(qtyRaw  ?? '').replace(/[,\s]/g, ''), 10)
  const earn = typeof earnRaw === 'number' ? earnRaw : parseFloat(String(earnRaw ?? '').replace(/[$€£¥,\s]/g, '').replace(/\(([^)]+)\)/, '-$1'))

  if (isNaN(qty) && isNaN(earn)) return null

  const getArtist = () => {
    if (colMap._trackArtistIdx !== undefined) {
      const ta = (textRow[colMap._trackArtistIdx] ?? '').toString().trim()
      if (ta) return normalizeArtistName(ta)
    }
    return normalizeArtistName(getText('artist_name'))
  }

  let salePeriod = normalizeSalePeriod(getText('sale_period') || 'Unknown')

  return {
    isFraud:      isFraudulentTransaction(txCode, txDesc),
    song_title:   getText('song_title')  || 'Unknown',
    artist_name:  getArtist()            || 'Unknown',
    store:        getText('store')       || 'Unknown',
    country:      expandCountryCode(getText('country')),
    sale_period:  salePeriod,
    quantity:     isNaN(qty)  ? 0 : qty,
    earnings_usd: isNaN(earn) ? 0 : earn,
  }
}

// ============================================================
// Row limit — prevents browser OOM on huge files
// ============================================================
export const MAX_PARSED_ROWS = 50_000

// ============================================================
// Report period detection
// Tries to identify the intended month of the report from:
//   1. The file name (e.g. "March 2026", "2026-03", "2026 m3", "ENERO 2026")
//   2. Metadata rows at the top of the Excel sheet
// Returns a "YYYY-MM" string, or null if not determinable.
// ============================================================
const MONTH_NAMES_EN: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}
const MONTH_NAMES_ES: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04',
  mayo: '05', junio: '06', julio: '07', agosto: '08',
  septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
  ene: '01', feb: '02', mar: '03', abr: '04',
  may: '05', jun: '06', jul: '07', ago: '08',
  sep: '09', oct: '10', nov: '11', dic: '12',
}

function detectReportPeriodFromText(text: string): string | null {
  const s = text.toLowerCase().trim()

  // "2026-03" or "2026/03"
  const isoMatch = s.match(/\b(20\d{2})[-\/](0?[1-9]|1[0-2])\b/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}`

  // "2026 m3" or "2026m10" (custom short format)
  const mMatch = s.match(/\b(20\d{2})\s*m(0?[1-9]|1[0-2])\b/)
  if (mMatch) return `${mMatch[1]}-${mMatch[2].padStart(2, '0')}`

  // "march 2026" or "marzo 2026"
  const allMonths = { ...MONTH_NAMES_EN, ...MONTH_NAMES_ES }
  for (const [name, num] of Object.entries(allMonths)) {
    const re = new RegExp(`\\b${name}\\s*(20\\d{2})\\b`)
    const m = s.match(re)
    if (m) return `${m[1]}-${num}`
    // also "2026 march" order
    const re2 = new RegExp(`\\b(20\\d{2})\\s*${name}\\b`)
    const m2 = s.match(re2)
    if (m2) return `${m2[1]}-${num}`
  }

  // "Jan-26" or "Jan-2026"
  const monAbbrMatch = s.match(/\b([a-z]{3})[-\s](20\d{2}|\d{2})\b/)
  if (monAbbrMatch) {
    const mon = allMonths[monAbbrMatch[1]]
    if (mon) {
      const yr = monAbbrMatch[2].length === 2 ? `20${monAbbrMatch[2]}` : monAbbrMatch[2]
      return `${yr}-${mon}`
    }
  }

  return null
}

/**
 * Detects the report period for MILL Digital Sales files.
 *
 * Returns one of:
 *   - "YYYY-MM"  → exact month filter  (e.g. "2026-03" for "March 2026")
 *   - "YYYY"     → full-year filter    (e.g. "2026" when no month is found)
 *   - null       → not a MILL report, no filter applied
 *
 * Filter logic in parseExcel:
 *   - "YYYY-MM" → keep rows where sale_period === "YYYY-MM"  (exact month)
 *   - "YYYY"    → keep rows where sale_period.startsWith("YYYY")  (whole year)
 */
export function detectReportPeriod(
  fileName: string,
  metadataRows?: string[][]
): string | null {
  // Only apply date filtering for "MILL Digital Sales" reports.
  // Other distributors (DistroKid, SoundOn, TuneCore, etc.) may have rows
  // from multiple periods intentionally — don't filter those.
  const nameUpper = fileName.toUpperCase()
  const isMILLReport = nameUpper.includes('MILL')

  if (!isMILLReport) return null

  // 1. Try the file name first — prefer exact month over year-only
  const fromName = detectReportPeriodFromText(fileName)
  if (fromName) return fromName  // e.g. "2026-03"

  // 2. Try the first few metadata rows of the file
  if (metadataRows) {
    for (const row of metadataRows.slice(0, 15)) {
      for (const cell of row) {
        const val = (cell ?? '').toString()
        if (!val.trim()) continue
        const found = detectReportPeriodFromText(val)
        if (found) return found
      }
    }
  }

  // 3. Fallback: extract just the year (whole-year filter)
  const yearOnly = detectReportYearFromText(fileName)
  if (yearOnly) return yearOnly  // e.g. "2026"

  return null
}

/** Extracts just the year from a text string (e.g. "March 2026" → "2026") */
function detectReportYearFromText(text: string): string | null {
  const m = text.match(/\b(20\d{2})\b/)
  return m ? m[1] : null
}

// ============================================================
// Main export
// ============================================================
export async function parseDistroKidFile(file: File): Promise<RoyaltyRow[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (['xlsx', 'xls'].includes(ext)) return (await parseExcel(file)).rows
  return parseDelimited(file)
}

// ============================================================
// Period detection — Step 1 of the upload flow
// Reads the file, finds all distinct raw period values, and
// returns them WITHOUT computing any statistics.
// ============================================================
export interface PeriodDetectionResult {
  /** All unique raw period values found in the file (unsorted) */
  availablePeriods: string[]
  /** Official total from the report metadata, if present */
  officialTotal: number | null
  currency: string
}

export async function detectAvailablePeriods(file: File): Promise<PeriodDetectionResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  let textRows: string[][] = []
  let officialTotal: number | null = null
  let currency = 'USD'

  if (['xlsx', 'xls'].includes(ext)) {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

    // Extract official total and currency
    const otInfo = extractOfficialTotal(wb)
    officialTotal = otInfo?.value ?? null

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const t = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
      if (t.length > textRows.length) textRows = t
      // Detect currency using normalizer (handles more currencies: COP, MXN, JPY, etc.)
      currency = detectCurrencyFromRows(textRows) || currency
    }
  } else {
    // CSV/TSV — read as text and parse
    const text = await file.text()
    const sample = text.slice(0, 3000)
    const tabCount   = (sample.match(/\t/g)  ?? []).length
    const commaCount = (sample.match(/,/g)   ?? []).length
    const pipeCount  = (sample.match(/\|/g)  ?? []).length
    const semiCount  = (sample.match(/;/g)   ?? []).length
    const max = Math.max(tabCount, commaCount, pipeCount, semiCount)
    let delimiter = ','
    if (tabCount === max) delimiter = '\t'
    else if (pipeCount === max) delimiter = '|'
    else if (semiCount === max) delimiter = ';'
    const parsed = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true })
    textRows = parsed.data as string[][]
  }

  if (textRows.length < 2) return { availablePeriods: [], officialTotal, currency }

  const headerIdx = findHeaderRow(textRows)
  const colMap    = mapHeaders(textRows[headerIdx])

  // Collect all unique raw period values
  const seen = new Set<string>()
  for (const row of textRows.slice(headerIdx + 1)) {
    const raw = (row[colMap.sale_period ?? -1] ?? '').toString().trim()
    if (raw) seen.add(raw)
  }

  return {
    availablePeriods: [...seen],
    officialTotal,
    currency,
  }
}

// ============================================================
// Delimited (CSV, TSV, TXT, and anything else)
// ============================================================
async function parseDelimited(file: File, selectedRawPeriods?: string[]): Promise<RoyaltyRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const sample = text.slice(0, 3000)

      const tabCount   = (sample.match(/\t/g)  ?? []).length
      const commaCount = (sample.match(/,/g)   ?? []).length
      const pipeCount  = (sample.match(/\|/g)  ?? []).length
      const semiCount  = (sample.match(/;/g)   ?? []).length

      const max = Math.max(tabCount, commaCount, pipeCount, semiCount)
      let delimiter = ','
      if (tabCount   === max) delimiter = '\t'
      else if (pipeCount  === max) delimiter = '|'
      else if (semiCount  === max) delimiter = ';'

      // Build normalized set of selected periods (if user chose specific ones)
      const selectedNormalized = selectedRawPeriods && selectedRawPeriods.length > 0
        ? new Set(selectedRawPeriods.map(p => normalizeSalePeriod(p)))
        : null

      Papa.parse(text, {
        delimiter,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const rows = results.data as string[][]
            if (rows.length < 2) { resolve([]); return }

            const headerIdx = findHeaderRow(rows)
            const colMap    = mapHeaders(rows[headerIdx])

            if (import.meta.env.DEV) {
              console.log('[Parser] delimiter:', JSON.stringify(delimiter))
              console.log('[Parser] headerIdx:', headerIdx)
              console.log('[Parser] header:', rows[headerIdx])
              console.log('[Parser] colMap:', colMap)
            }

            let parsed = rows
              .slice(headerIdx + 1)
              .map(row => parseRow(row, colMap))
              .filter((r): r is RoyaltyRow => r !== null)

            // Apply period filter if user selected specific periods
            if (selectedNormalized) {
              parsed = parsed.filter(r => selectedNormalized.has(r.sale_period))
            }

            resolve(parsed.slice(0, MAX_PARSED_ROWS))
          } catch (err) { reject(err) }
        },
        error: reject,
      })
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsText(file, 'utf-8')
  })
}

// ============================================================
// Excel
// ============================================================
async function parseExcel(file: File, reportPeriod?: string, selectedRawPeriods?: string[]): Promise<{ rows: RoyaltyRow[]; normLogs: string[] }> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  // Read twice:
  // - raw:false → formatted strings for text/date columns (sale_period, country, store, etc.)
  // - raw:true  → exact numeric values for earnings and quantity (avoids decimal truncation)
  let textRows: string[][] = []
  let numRows:  (string | number)[][] = []

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const t = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
    const n = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', raw: true }) as (string | number)[][]
    if (t.length > textRows.length) { textRows = t; numRows = n }
  }

  if (textRows.length < 2) return { rows: [], normLogs: [] }

  const headerIdx = findHeaderRow(textRows)
  const colMap    = mapHeaders(textRows[headerIdx])
  // Capture normalizer logs for the processing log panel
  const normLogs = buildColumnMap(textRows[headerIdx].map(h => (h ?? '').toString())).logs

  // Detect the report period if not supplied
  const metaRows = textRows.slice(0, headerIdx)
  const period = reportPeriod ?? detectReportPeriod(file.name, metaRows)

  if (import.meta.env.DEV) {
    console.log('[Parser] Excel headerIdx:', headerIdx)
    console.log('[Parser] Excel header:', textRows[headerIdx])
    console.log('[Parser] Excel colMap:', colMap)
    console.log('[Parser] Detected period:', period ?? '(none — no filter applied)')
    console.warn('[Parser] earnings_usd mapped to col:', colMap.earnings_usd, '→', textRows[headerIdx]?.[colMap.earnings_usd ?? -1])
    console.warn('[Parser] quantity mapped to col:', colMap.quantity, '→', textRows[headerIdx]?.[colMap.quantity ?? -1])
    // Log all column headers with their indices for debugging
    console.table(textRows[headerIdx]?.map((h, i) => ({ col: i, header: h })))
  }

  const allParsed = textRows
    .slice(headerIdx + 1)
    .map((row, i) => parseRowMixed(row, numRows[headerIdx + 1 + i] ?? row, colMap))
    .filter((r): r is RoyaltyRow => r !== null)

  if (import.meta.env.DEV) {
    // Show raw vs normalized period for first 30 data rows
    console.group('[Parser] Raw sale_period values (primeras 30 filas de datos)')
    textRows.slice(headerIdx + 1, headerIdx + 31).forEach((row, i) => {
      const raw = row[colMap.sale_period ?? -1] ?? ''
      const normalized = normalizeSalePeriod(raw)
      console.log(`  [${i}] raw: "${raw}" → normalized: "${normalized}"`)
    })
    console.groupEnd()

    // Period distribution across ALL parsed rows
    const periodCounts: Record<string, number> = {}
    const periodEarnings: Record<string, number> = {}
    for (const r of allParsed) {
      periodCounts[r.sale_period] = (periodCounts[r.sale_period] ?? 0) + 1
      periodEarnings[r.sale_period] = (periodEarnings[r.sale_period] ?? 0) + r.earnings_usd
    }
    console.group('[Parser] Distribución de periodos en el archivo completo')
    Object.entries(periodCounts).sort().forEach(([p, c]) => {
      const usd = periodEarnings[p]?.toFixed(2) ?? '0.00'
      console.log(`  ${p}: ${c} filas | USD ${usd}`)
    })
    console.groupEnd()

    if (period) {
      const mode = period.length === 7 ? 'EXACT MONTH' : 'FULL YEAR'
      console.log(`[Parser] Filter: ${mode} → "${period}"`)
    } else {
      console.log('[Parser] Filter: none (no MILL period detected)')
    }
  }

  // ── Date filter: for MILL reports, keep only rows matching the detected period ──
  // period = "YYYY-MM" → exact month match (e.g. file is "MILL March 2026")
  // period = "YYYY"    → full year match   (e.g. file is "MILL 2026 Annual")
  // Build a normalized set of selected periods if the user chose specific ones
  const selectedNormalized = selectedRawPeriods && selectedRawPeriods.length > 0
    ? new Set(selectedRawPeriods.map(p => normalizeSalePeriod(p)))
    : null

  const parsed = allParsed
    .filter((r) => {
      // ── User-selected periods (Step 2 of upload flow) ──────────────────────
      // When the user explicitly chose periods, always use that selection —
      // it overrides the automatic MILL year/month filter.
      if (selectedNormalized) {
        return selectedNormalized.has(r.sale_period)
      }
      // ── Automatic MILL filter (legacy path / direct upload) ────────────────
      if (!period) return true                                         // not a MILL report → keep all
      if (!r.sale_period || r.sale_period === 'Unknown') return false  // unrecognized date → drop
      if (period.length === 7) {
        return r.sale_period === period
      }
      return r.sale_period.startsWith(period)
    })
    .slice(0, MAX_PARSED_ROWS)

  if (import.meta.env.DEV) {
    console.group('[Parser] Primeras 5 filas parseadas (después del filtro)')
    parsed.slice(0, 5).forEach((r, i) => {
      console.log(`  [${i}] ${r.artist_name} | ${r.song_title} | period: ${r.sale_period} | earnings: ${r.earnings_usd} | qty: ${r.quantity}`)
    })
    const total = parsed.reduce((s, r) => s + r.earnings_usd, 0)
    console.log(`  TOTAL earnings (${parsed.length} filas): $${total.toFixed(8)}`)
    console.groupEnd()
  }

  return {
    rows: parsed,
    normLogs: normLogs.map(l => `[${l.level.toUpperCase()}] ${l.message}`),
  }
}


// Fraud detection
// ============================================================

export interface FraudRow {
  song_title:  string
  artist_name: string
  store:       string
  country:     string
  sale_period: string
  quantity:    number
  earnings_usd: number
}

export interface FraudReport {
  fraudStreams:   number
  totalStreams:   number
  fraudPct:       number        // 0–100
  fraudEarnings:  number
  isAlert:        boolean       // true when fraudPct > FRAUD_ALERT_THRESHOLD
  bySong:         Array<{ name: string; streams: number; earnings: number }>
  byCountry:      Array<{ name: string; streams: number }>
  byStore:        Array<{ name: string; streams: number }>
  rows:           FraudRow[]
}

const FRAUD_ALERT_THRESHOLD = 5   // percent

/** Parse the raw file again keeping ALL rows (including fraudulent) to build the fraud report. */
export async function detectFraudulentStreams(file: File): Promise<FraudReport> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const allRows = ['xlsx', 'xls'].includes(ext)
    ? await parseFraudExcel(file)
    : await parseFraudDelimited(file)

  const fraudRows  = allRows.filter(r => r.isFraud)
  const totalStreams = allRows.reduce((s, r) => s + r.quantity, 0)
  const fraudStreams = fraudRows.reduce((s, r) => s + r.quantity, 0)
  const fraudEarnings = fraudRows.reduce((s, r) => s + r.earnings_usd, 0)
  const fraudPct = totalStreams > 0 ? (fraudStreams / totalStreams) * 100 : 0

  // aggregate helpers
  const agg = <K extends keyof FraudRow>(rows: typeof fraudRows, key: K) => {
    const map: Record<string, { streams: number; earnings: number }> = {}
    rows.forEach(r => {
      const k = String(r[key] ?? 'Unknown')
      if (!map[k]) map[k] = { streams: 0, earnings: 0 }
      map[k].streams  += r.quantity
      map[k].earnings += r.earnings_usd
    })
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.streams - a.streams)
  }

  return {
    fraudStreams,
    totalStreams,
    fraudPct,
    fraudEarnings,
    isAlert: fraudPct > FRAUD_ALERT_THRESHOLD,
    bySong:    agg(fraudRows, 'song_title'),
    byCountry: agg(fraudRows, 'country'),
    byStore:   agg(fraudRows, 'store'),
    rows: fraudRows.map(({ isFraud: _f, ...r }) => r),
  }
}

// ── Internal extended row type ─────────────────────────────
interface RawFraudRow extends FraudRow { isFraud: boolean }

function isFraudulentTransaction(code: string, desc: string): boolean {
  // Code column: "FS" = Fraudulent Streams
  if (code.trim().toUpperCase() === 'FS') return true
  // Description column fallback
  if (desc.toLowerCase().includes('fraudulent')) return true
  return false
}

async function parseFraudDelimited(file: File): Promise<RawFraudRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = (e.target?.result as string) ?? ''
      const sample = text.slice(0, 3000)
      const tabCount   = (sample.match(/\t/g)  ?? []).length
      const commaCount = (sample.match(/,/g)   ?? []).length
      const pipeCount  = (sample.match(/\|/g)  ?? []).length
      const semiCount  = (sample.match(/;/g)   ?? []).length
      const max = Math.max(tabCount, commaCount, pipeCount, semiCount)
      let delimiter = ','
      if (tabCount  === max) delimiter = '\t'
      else if (pipeCount === max) delimiter = '|'
      else if (semiCount === max) delimiter = ';'

      Papa.parse(text, {
        delimiter,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const rows = results.data as string[][]
            if (rows.length < 2) { resolve([]); return }
            const headerIdx = findHeaderRow(rows)
            const colMap    = mapHeaders(rows[headerIdx])
            const txCols    = findTransactionTypeCol(rows[headerIdx])
            resolve(
              rows.slice(headerIdx + 1).map(r => toRawFraudRow(r, colMap, txCols)).filter(Boolean) as RawFraudRow[]
            )
          } catch (err) { reject(err) }
        },
        error: reject,
      })
    }
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    reader.readAsText(file, 'utf-8')
  })
}

async function parseFraudExcel(file: File): Promise<RawFraudRow[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  let textRows: string[][] = []
  let numRows:  (string | number)[][] = []
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const t = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
    const n = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', raw: true }) as (string | number)[][]
    if (t.length > textRows.length) { textRows = t; numRows = n }
  }
  if (textRows.length < 2) return []
  const headerIdx = findHeaderRow(textRows)
  const colMap    = mapHeaders(textRows[headerIdx])
  const txCols    = findTransactionTypeCol(textRows[headerIdx])

  if (import.meta.env.DEV) {
    console.log('[FraudParser] Excel headerIdx:', headerIdx)
    console.log('[FraudParser] Excel header:', textRows[headerIdx])
    console.log('[FraudParser] txCols:', txCols)
  }

  return textRows.slice(headerIdx + 1).map((row, i) => {
    const numRow = numRows[headerIdx + 1 + i] ?? row
    return toRawFraudRowMixed(row, numRow, colMap, txCols)
  }).filter(Boolean) as RawFraudRow[]
}

function findTransactionTypeCol(headerRow: (string | number)[]): { codeIdx: number; descIdx: number } {
  let codeIdx = -1
  let descIdx = -1
  headerRow.forEach((h, i) => {
    const key = (h ?? '').toString().toLowerCase().trim()
    // "Transaction Type" (the short code col: FS, S, AS, etc.)
    if (key === 'transaction type') codeIdx = i
    // "Transaction Type Description" (the human-readable col)
    if (key === 'transaction type description' || key === 'transaction_type_description') descIdx = i
    // Also catch partial matches as fallback
    if (codeIdx === -1 && key.includes('transaction') && !key.includes('description')) codeIdx = i
    if (descIdx === -1 && key.includes('description') && key.includes('type')) descIdx = i
  })
  return { codeIdx, descIdx }
}

function toRawFraudRow(
  row: (string | number)[],
  colMap: Record<keyof RoyaltyRow, number | undefined> & { _trackArtistIdx?: number },
  txCols: { codeIdx: number; descIdx: number }
): RawFraudRow | null {
  const get = (field: keyof RoyaltyRow) => {
    const idx = colMap[field]
    return idx !== undefined ? (row[idx] ?? '').toString().trim() : ''
  }
  const txCode = txCols.codeIdx >= 0 ? (row[txCols.codeIdx] ?? '').toString().trim() : ''
  const txDesc = txCols.descIdx >= 0 ? (row[txCols.descIdx] ?? '').toString().trim() : ''

  const rawQty  = get('quantity').replace(/[,\s]/g, '')
  const rawEarn = get('earnings_usd').replace(/[$€£¥,\s]/g, '').replace(/\(([^)]+)\)/, '-$1')
  const qty     = parseInt(rawQty, 10)
  const earn    = parseFloat(rawEarn)

  if (isNaN(qty) && isNaN(earn)) return null

  const getArtist = () => {
    if (colMap._trackArtistIdx !== undefined) {
      const ta = (row[colMap._trackArtistIdx] ?? '').toString().trim()
      if (ta) return normalizeArtistName(ta)
    }
    return normalizeArtistName(get('artist_name'))
  }

  const salePeriod = normalizeSalePeriod(get('sale_period') || 'Unknown')

  return {
    isFraud:     isFraudulentTransaction(txCode, txDesc),
    song_title:  get('song_title')  || 'Unknown',
    artist_name: getArtist()        || 'Unknown',
    store:       get('store')       || 'Unknown',
    country:     expandCountryCode(get('country')),
    sale_period: salePeriod,
    quantity:    isNaN(qty)  ? 0 : qty,
    earnings_usd: isNaN(earn) ? 0 : earn,
  }
}

// ============================================================
// Report Summary — official total extraction
// ============================================================

export interface ReportSummary {
  officialReportTotal: number | null
  currency: string
  sheet: string
  cell: string
  detailRowsTotal: number
  difference: number
  differencePercent: number
  source: string
  status: 'Official total found' | 'No official total — using sum of detail rows'
  parsedRows: number
  savedRows?: number
  truncated?: boolean
  reportPeriod?: string | null
  /** Processing log from the intelligent column detector */
  processingLog?: string[]
  periodBreakdown?: {
    included: Array<{ period: string; rows: number; earnings: number; streams: number }>
    excluded: string[]
    totalStreams: number
    totalEarnings: number
  }
}

/** Labels that indicate an official summary total in the metadata rows */
const OFFICIAL_TOTAL_LABELS = [
  'earned this report',
  'total earnings',
  'report total',
  'total revenue',
  'total royalties',
  'earnings summary',
  'net earnings',
  'total earned',
  'total payout',
  'net payout',
]

function extractOfficialTotal(
  wb: ReturnType<typeof XLSX.read>
): { value: number; sheet: string; cell: string; source: string } | null {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    // Get raw rows (numeric precision) and text rows side by side
    const textRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
    const numRows  = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', raw: true }) as (string | number)[][]

    for (let r = 0; r < Math.min(textRows.length, 40); r++) {
      const row = textRows[r]
      for (let c = 0; c < row.length; c++) {
        const cellText = (row[c] ?? '').toString().toLowerCase().trim()
        if (OFFICIAL_TOTAL_LABELS.some(label => cellText === label || cellText.includes(label))) {
          // Value is usually in the next column of the same row
          for (let vc = c + 1; vc < Math.min(row.length, c + 4); vc++) {
            const rawVal = numRows[r]?.[vc]
            const numVal = typeof rawVal === 'number'
              ? rawVal
              : parseFloat(String(rawVal ?? '').replace(/[$€£¥,\s]/g, ''))
            if (!isNaN(numVal) && numVal > 0) {
              // Convert cell address to A1 notation
              const colLetter = XLSX.utils.encode_col(vc)
              const cellAddr  = `${colLetter}${r + 1}`
              return {
                value: numVal,
                sheet: sheetName,
                cell: cellAddr,
                source: row[c].toString().trim(),
              }
            }
          }
        }
      }
    }
  }
  return null
}

export interface ParseResultWithSummary {
  rows: RoyaltyRow[]
  summary: ReportSummary
}

/** Full parse — returns rows + official total summary */
export async function parseDistroKidFileWithSummary(
  file: File,
  selectedRawPeriods?: string[]
): Promise<ParseResultWithSummary> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  let rows: RoyaltyRow[]
  let officialTotalInfo: { value: number; sheet: string; cell: string; source: string } | null = null
  let currency = 'USD'
  let reportPeriod: string | null = null
  const processingLog: string[] = []

  processingLog.push(`Archivo: ${file.name}`)
  processingLog.push(`Tipo: ${file.name.split('.').pop()?.toUpperCase() ?? 'desconocido'}`)

  if (['xlsx', 'xls'].includes(ext)) {
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

    // Extract official total from metadata
    officialTotalInfo = extractOfficialTotal(wb)

    // Try to detect currency using normalizer
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName]
      const textRows2 = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false }) as string[][]
      const detected = detectCurrencyFromRows(textRows2)
      if (detected !== 'USD') { currency = detected; break }
      if (detected) currency = detected
    }

    // Detect report period from file name + metadata
    const firstSheet = wb.SheetNames[0]
    const ws0 = firstSheet ? wb.Sheets[firstSheet] : null
    const metaRows: string[][] = ws0
      ? (XLSX.utils.sheet_to_json<string[]>(ws0, { header: 1, defval: '', raw: false }) as string[][]).slice(0, 20)
      : []
    reportPeriod = detectReportPeriod(file.name, metaRows)

    rows = await parseExcel(file, reportPeriod ?? undefined, selectedRawPeriods).then(r => {
      processingLog.push(...r.normLogs)
      return r.rows
    })
  } else {
    rows = await parseDelimited(file, selectedRawPeriods)
    reportPeriod = detectReportPeriod(file.name)
    processingLog.push(`Separador detectado automáticamente`)
  }

  processingLog.push(`Filas procesadas: ${rows.length}`)
  processingLog.push(`Moneda detectada: ${currency}`)
  const detailRowsTotal = rows.reduce((sum, r) => sum + r.earnings_usd, 0)
  processingLog.push(`Total calculado: ${detailRowsTotal.toFixed(6)} ${currency}`)

  const truncated = rows.length >= MAX_PARSED_ROWS

  // ── Period breakdown — shown in upload summary ─────────────────────────────
  // Calculate whenever a period filter was active (MILL auto-filter OR user selection)
  const hasFilter = !!reportPeriod || (selectedRawPeriods && selectedRawPeriods.length > 0)
  let periodBreakdown: ReportSummary['periodBreakdown'] = undefined

  if (hasFilter) {
    // Build included periods map from the filtered rows
    const includedMap: Record<string, { rows: number; earnings: number; streams: number }> = {}
    for (const r of rows) {
      const p = r.sale_period
      if (!includedMap[p]) includedMap[p] = { rows: 0, earnings: 0, streams: 0 }
      includedMap[p].rows++
      includedMap[p].earnings += r.earnings_usd
      includedMap[p].streams  += r.quantity
    }

    // To find excluded periods we need ALL raw periods — re-read the file
    let allRawPeriods: string[] = []
    if (['xlsx', 'xls'].includes(ext)) {
      const buffer2 = await file.arrayBuffer()
      const wb2 = XLSX.read(buffer2, { type: 'array', cellDates: true })
      let textRows2: string[][] = []
      for (const sn of wb2.SheetNames) {
        const t = XLSX.utils.sheet_to_json<string[]>(wb2.Sheets[sn], { header: 1, defval: '', raw: false }) as string[][]
        if (t.length > textRows2.length) textRows2 = t
      }
      const hIdx2 = findHeaderRow(textRows2)
      const cMap2 = mapHeaders(textRows2[hIdx2])
      allRawPeriods = textRows2.slice(hIdx2 + 1).map(row => {
        const raw = row[cMap2.sale_period ?? -1] ?? ''
        return normalizeSalePeriod(raw)
      }).filter(p => p && p !== 'Unknown')
    }

    const excludedSet = new Set<string>()
    for (const p of allRawPeriods) {
      let isIncluded: boolean
      if (selectedRawPeriods && selectedRawPeriods.length > 0) {
        // User explicitly chose periods — use normalized comparison
        const selNorm = new Set(selectedRawPeriods.map(s => normalizeSalePeriod(s)))
        isIncluded = selNorm.has(p)
      } else if (reportPeriod) {
        // MILL auto-filter
        isIncluded = reportPeriod.length === 7
          ? p === reportPeriod
          : p.startsWith(reportPeriod)
      } else {
        isIncluded = true
      }
      if (!isIncluded) excludedSet.add(p)
    }

    periodBreakdown = {
      included: Object.entries(includedMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, v]) => ({ period, ...v })),
      excluded: [...excludedSet].sort(),
      totalStreams:  rows.reduce((s, r) => s + r.quantity, 0),
      totalEarnings: detailRowsTotal,
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  if (officialTotalInfo) {
    const diff    = officialTotalInfo.value - detailRowsTotal
    const diffPct = officialTotalInfo.value > 0
      ? Math.abs(diff / officialTotalInfo.value) * 100
      : 0
    return {
      rows,
      summary: {
        officialReportTotal: officialTotalInfo.value,
        currency,
        sheet: officialTotalInfo.sheet,
        cell: officialTotalInfo.cell,
        detailRowsTotal: Math.round(detailRowsTotal * 1e8) / 1e8,
        difference: Math.round(diff * 1e8) / 1e8,
        differencePercent: Math.round(diffPct * 100) / 100,
        source: officialTotalInfo.source,
        status: 'Official total found',
        parsedRows: rows.length,
        truncated,
        reportPeriod,
        periodBreakdown,
        processingLog,
      },
    }
  }

  return {
    rows,
    summary: {
      officialReportTotal: null,
      currency,
      sheet: '',
      cell: '',
      detailRowsTotal: Math.round(detailRowsTotal * 1e8) / 1e8,
      difference: 0,
      differencePercent: 0,
      source: '',
      status: 'No official total — using sum of detail rows',
      parsedRows: rows.length,
      truncated,
      reportPeriod,
      periodBreakdown,
      processingLog,
    },
  }
}

// ============================================================
// Summary helpers
// ============================================================
export function summarizeByField<K extends keyof RoyaltyRow>(
  rows: RoyaltyRow[],
  field: K
): Array<{ name: string; earnings: number; streams: number }> {
  const map: Record<string, { earnings: number; streams: number }> = {}
  rows.forEach(r => {
    const key = String(r[field] || 'Unknown')
    if (!map[key]) map[key] = { earnings: 0, streams: 0 }
    map[key].earnings += r.earnings_usd
    map[key].streams  += r.quantity
  })
  return Object.entries(map)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.earnings - a.earnings)
}
