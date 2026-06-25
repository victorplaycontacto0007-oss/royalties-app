/**
 * UniversalParser.ts — RUPE core engine
 * Reads any royalty report CSV/TSV/XLS/XLSX and returns structured rows + stats.
 */
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Logger } from './Logger'
import { mapColumns, type ColumnIndex } from './ColumnMapper'
import { findHeaderRow } from './HeaderFinder'
import { detectSeparator } from './SeparatorDetector'
import { detectProvider } from './ProviderDetector'
import { detectCurrency } from './CurrencyDetector'
import { parseMoney, parseInteger } from './MoneyParser'
import { normalizePeriod } from './DateParser'
import { computeStats, type RUPEStats } from './Statistics'
import { expandCountryCode } from '../lib/distrokid-parser'

export interface ParsedRow {
  net_total:     number
  gross_total:   number
  taxes:         number
  channel_costs: number
  other_costs:   number
  currency:      string
  artist:        string
  track:         string
  album:         string
  upc:           string
  isrc:          string
  platform:      string
  country:       string
  quantity:      number
  sale_period:   string
  // For DB insert compatibility
  artist_name:   string
  song_title:    string
  album_name:    string
  store:         string
  earnings_usd:  number
}

export interface RUPEResult {
  rows:  ParsedRow[]
  stats: RUPEStats
}

const MAX_ROWS = 100_000

function extractRow(
  textRow: string[],
  numRow: (string | number)[],
  colMap: ColumnIndex,
  currency: string,
  rowErrors: number[]
): ParsedRow | null {
  try {
    const get  = (i: number | null): string  => i !== null ? (textRow[i] ?? '').toString().trim() : ''
    const getN = (i: number | null): number  => {
      if (i === null) return 0
      const v = numRow[i]
      return typeof v === 'number' ? v : parseMoney(String(v ?? ''))
    }
    const getI = (i: number | null): number  => {
      if (i === null) return 0
      const v = numRow[i]
      return typeof v === 'number' ? Math.round(v) : parseInteger(String(v ?? ''))
    }

    const net   = getN(colMap.net_total)
    const qty   = getI(colMap.quantity)

    // Skip completely empty rows and repeated header rows
    const nonEmpty = textRow.filter(c => c && c.toString().trim()).length
    if (nonEmpty < 2) return null
    const netText = get(colMap.net_total).toLowerCase()
    const skipWords = ['net total','nettotal','earnings','royalty','amount','revenue','net']
    if (skipWords.includes(netText)) return null

    const rawCountry = get(colMap.country)
    const salePeriod = normalizePeriod(get(colMap.sale_period) || 'Unknown')

    const row: ParsedRow = {
      net_total:     isNaN(net) ? 0 : net,
      gross_total:   getN(colMap.gross_total),
      taxes:         getN(colMap.taxes),
      channel_costs: getN(colMap.channel_costs),
      other_costs:   getN(colMap.other_costs),
      currency:      get(colMap.currency) || currency,
      artist:        get(colMap.artist) || 'Unknown',
      track:         get(colMap.track)  || 'Unknown',
      album:         get(colMap.album)  || '',
      upc:           get(colMap.upc),
      isrc:          get(colMap.isrc),
      platform:      get(colMap.platform) || 'Unknown',
      country:       expandCountryCode(rawCountry) || 'Unknown',
      quantity:      isNaN(qty) ? 0 : qty,
      sale_period:   salePeriod,
      // DB compatibility aliases
      artist_name:   get(colMap.artist) || 'Unknown',
      song_title:    get(colMap.track)  || 'Unknown',
      album_name:    get(colMap.album)  || '',
      store:         get(colMap.platform) || 'Unknown',
      earnings_usd:  isNaN(net) ? 0 : net,
    }

    if (row.net_total === 0 && row.quantity === 0) return null
    return row
  } catch {
    rowErrors.push(1)
    return null
  }
}

async function parseTextRows(text: string, logger: Logger): Promise<{ textRows: string[][], numRows: string[][] }> {
  const sep = detectSeparator(text.slice(0, 4000))
  logger.info(`Separador detectado: "${sep === '\t' ? 'TAB' : sep}"`)
  const parsed = Papa.parse<string[]>(text, { delimiter: sep, skipEmptyLines: true })
  const rows = parsed.data as string[][]
  return { textRows: rows, numRows: rows }
}

export async function parseFile(file: File): Promise<RUPEResult> {
  const logger  = new Logger()
  const ext     = file.name.split('.').pop()?.toLowerCase() ?? ''
  const errors: number[] = []

  logger.info(`Archivo: ${file.name}`)
  logger.info(`Tipo: ${ext.toUpperCase()}`)

  let textRows: string[][]    = []
  let numRows:  (string | number)[][] = []

  if (['xlsx', 'xls'].includes(ext)) {
    const buf = await file.arrayBuffer()
    const wb  = XLSX.read(buf, { type: 'array', cellDates: true })
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn]
      const t  = XLSX.utils.sheet_to_json<string[]>(ws, { header:1, defval:'', raw:false }) as string[][]
      const n  = XLSX.utils.sheet_to_json<(string|number)[]>(ws, { header:1, defval:'', raw:true }) as (string|number)[][]
      if (t.length > textRows.length) { textRows = t; numRows = n }
    }
  } else {
    const text = await file.text()
    const r = await parseTextRows(text, logger)
    textRows = r.textRows
    numRows  = r.numRows
  }

  if (textRows.length < 2) {
    logger.error('Archivo vacío o sin datos')
    return { rows: [], stats: computeStats([], 'USD', 'Unknown', logger.toStrings(), 0) }
  }

  const headerIdx = findHeaderRow(textRows)
  logger.info(`Fila de encabezado: ${headerIdx}`)

  const rawHeaders = textRows[headerIdx].map(h => (h ?? '').toString())
  const colMap     = mapColumns(rawHeaders, logger)
  const currency   = detectCurrency(textRows, rawHeaders)
  const provider   = detectProvider(file.name, rawHeaders)

  logger.info(`Proveedor detectado: ${provider}`)
  logger.info(`Moneda: ${currency}`)
  logger.info(`Total filas en archivo: ${textRows.length - headerIdx - 1}`)

  const rows: ParsedRow[] = []
  const dataRows = textRows.slice(headerIdx + 1)
  const dataNum  = numRows.slice(headerIdx + 1)

  for (let i = 0; i < Math.min(dataRows.length, MAX_ROWS); i++) {
    const row = extractRow(dataRows[i], dataNum[i] ?? dataRows[i], colMap, currency, errors)
    if (row) rows.push(row)
  }

  logger.info(`Filas válidas parseadas: ${rows.length}`)

  const stats = computeStats(rows, currency, provider, logger.toStrings(), errors.length)
  logger.info(`Total Neto: ${stats.totalNet.toFixed(8)} ${currency}`)
  logger.info(logger.summary())

  return { rows, stats }
}
