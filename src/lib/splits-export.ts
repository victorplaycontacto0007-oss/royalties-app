import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RoyaltyRecord, Contract } from '../types/database'
import { formatCurrency, formatNumber, ratePerK } from './utils'
import type { OrchardRecord } from '../royalty-engine/StreamTypeClassifier'

// ── Apply split to an amount ──────────────────────────────────
export function applySplits(gross: number, splits: Contract['splits']): Array<{ participant: string; role: string; percentage: number; amount: number }> {
  if (!splits || splits.length === 0) return []
  return splits.map(s => ({
    participant: s.participant,
    role:        s.role,
    percentage:  Number(s.percentage),
    amount:      gross * (Number(s.percentage) / 100),
  }))
}

// ── Aggregate records by field ────────────────────────────────
function agg(rows: RoyaltyRecord[], key: keyof RoyaltyRecord) {
  const map: Record<string, { earnings: number; streams: number }> = {}
  rows.forEach(r => {
    const k = String(r[key] || 'Unknown')
    if (!map[k]) map[k] = { earnings: 0, streams: 0 }
    map[k].earnings += r.earnings_usd
    map[k].streams  += r.quantity
  })
  return Object.entries(map)
    .map(([name, v]) => ({ name, earnings: v.earnings, streams: v.streams }))
    .sort((a, b) => b.earnings - a.earnings)
}

function splitAmounts(gross: number, splits: NonNullable<Contract['splits']>) {
  return splits.map(s => gross * (Number(s.percentage) / 100))
}

// ── Excel liquidación (5 hojas) ───────────────────────────────
export function exportSplitsExcel(
  records: RoyaltyRecord[],
  contract: Contract,
  filename: string
) {
  const splits  = contract.splits ?? []
  const sHdr    = splits.map(s => `${s.participant} (${s.percentage}%)`)
  const wb      = XLSX.utils.book_new()

  const totalEarnings = records.reduce((a, r) => a + r.earnings_usd, 0)
  const totalStreams   = records.reduce((a, r) => a + r.quantity, 0)

  // Hoja 1 — Resumen
  const summaryRows = [
    ['Campo', 'Valor'],
    ['Artista',           contract.artist_name],
    ['Sello',             contract.label],
    ['Total registros',   records.length],
    ['Total streams',     totalStreams],
    ['Ingresos brutos',   totalEarnings],
    ['RPM ($/1K streams)', ratePerK(totalEarnings, totalStreams).toFixed(4)],
    [],
    ['Participante', 'Rol', 'Porcentaje', 'Monto'],
    ...splits.map(s => [
      s.participant, s.role, `${s.percentage}%`,
      totalEarnings * (Number(s.percentage) / 100)
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Resumen')

  // Hoja 2 — Por canción
  const songHdr = ['Canción', 'Streams', 'Bruto', '$/1,000', ...sHdr]
  const songRows = agg(records, 'song_title').map(s => [
    s.name, s.streams, s.earnings,
    ratePerK(s.earnings, s.streams),
    ...splitAmounts(s.earnings, splits),
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([songHdr, ...songRows]), 'Por canción')

  // Hoja 3 — Por plataforma
  const platHdr = ['Plataforma', 'Streams', 'Bruto', '$/1,000', ...sHdr]
  const platRows = agg(records, 'store').map(p => [
    p.name, p.streams, p.earnings,
    ratePerK(p.earnings, p.streams),
    ...splitAmounts(p.earnings, splits),
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([platHdr, ...platRows]), 'Por plataforma')

  // Hoja 4 — Por país
  const ctryHdr = ['País', 'Streams', 'Bruto', '$/1,000', ...sHdr]
  const ctryRows = agg(records, 'country').map(c => [
    c.name, c.streams, c.earnings,
    ratePerK(c.earnings, c.streams),
    ...splitAmounts(c.earnings, splits),
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([ctryHdr, ...ctryRows]), 'Por país')

  // Hoja 5 — Detalle completo
  const detailHdr = ['Período','Artista','Plataforma','País','Canción','Streams','Bruto','$/1,000',...sHdr]
  const detailRows = records.map(r => [
    r.sale_period, r.artist_name, r.store, r.country, r.song_title,
    r.quantity, r.earnings_usd,
    ratePerK(r.earnings_usd, r.quantity),
    ...splitAmounts(r.earnings_usd, splits),
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([detailHdr, ...detailRows]), 'Detalle completo')

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ── PDF profesional de liquidación ───────────────────────────
export function exportSplitsPdf(
  records: RoyaltyRecord[],
  contract: Contract,
  filename: string
) {
  const doc     = new jsPDF()
  const splits  = contract.splits ?? []
  const gross   = records.reduce((a, r) => a + r.earnings_usd, 0)
  const streams = records.reduce((a, r) => a + r.quantity, 0)

  // Header
  doc.setFillColor(99, 102, 241)
  doc.rect(0, 0, 220, 38, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18); doc.setFont('helvetica', 'bold')
  doc.text('Royalties', 14, 16)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text('Music Analytics Platform', 14, 24)
  doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, 14, 31)

  doc.setTextColor(0, 0, 0)
  doc.setFontSize(15); doc.setFont('helvetica', 'bold')
  doc.text(`Liquidación: ${contract.artist_name}`, 14, 50)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`Sello: ${contract.label}`, 14, 58)

  // Resumen ejecutivo
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text('Resumen ejecutivo', 14, 70)
  autoTable(doc, {
    startY: 74,
    body: [
      ['Ingresos brutos',       formatCurrency(gross)],
      ['Total streams',         formatNumber(streams)],
      ['RPM ($/1,000 streams)', `$${ratePerK(gross, streams).toFixed(4)}`],
    ],
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 }, 1: { cellWidth: 80 } },
    theme: 'plain',
  })

  const y1 = (doc as any).lastAutoTable.finalY + 8

  // Distribución
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('Distribución de regalías', 14, y1)
  autoTable(doc, {
    startY: y1 + 4,
    head: [['Participante', 'Rol', '%', 'Monto']],
    body: splits.map(s => [
      s.participant,
      s.role === 'artist' ? 'Artista' : s.role === 'label' ? 'Sello' : s.role === 'producer' ? 'Productor' : 'Otro',
      `${s.percentage}%`,
      formatCurrency(gross * (Number(s.percentage) / 100)),
    ]),
    foot: [['Total', '', '100%', formatCurrency(gross)]],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [99, 102, 241] },
    footStyles: { fontStyle: 'bold' },
  })

  const y2 = (doc as any).lastAutoTable.finalY + 8
  const splitHdr = splits.map(s => `${s.participant} (${s.percentage}%)`)

  // Top canciones
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('Top canciones', 14, y2)
  autoTable(doc, {
    startY: y2 + 4,
    head: [['Canción', 'Streams', 'Bruto', '$/1K', ...splitHdr]],
    body: agg(records, 'song_title').slice(0, 15).map(s => [
      s.name, formatNumber(s.streams), formatCurrency(s.earnings),
      `$${ratePerK(s.earnings, s.streams).toFixed(4)}`,
      ...splits.map(sp => formatCurrency(s.earnings * (Number(sp.percentage) / 100))),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [99, 102, 241] },
  })

  const y3 = (doc as any).lastAutoTable.finalY + 8

  // Por plataforma
  doc.setFont('helvetica', 'bold')
  doc.text('Por plataforma', 14, y3)
  autoTable(doc, {
    startY: y3 + 4,
    head: [['Plataforma', 'Streams', 'Bruto', '$/1K', ...splitHdr]],
    body: agg(records, 'store').map(p => [
      p.name, formatNumber(p.streams), formatCurrency(p.earnings),
      `$${ratePerK(p.earnings, p.streams).toFixed(4)}`,
      ...splits.map(sp => formatCurrency(p.earnings * (Number(sp.percentage) / 100))),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [99, 102, 241] },
  })

  doc.save(`${filename}.pdf`)
}

// ── Excel consolidado multi-artista ──────────────────────────
export function exportConsolidatedExcel(
  records: RoyaltyRecord[],
  contracts: Contract[],
  filename: string
) {
  const wb = XLSX.utils.book_new()
  const contractMap: Record<string, Contract> = {}
  contracts.forEach(c => { contractMap[c.artist_name] = c })

  const byArtist = agg(records, 'artist_name')
  const allParticipants = [...new Set(
    contracts.flatMap(c => (c.splits ?? []).map(s => s.participant))
  )]

  const summaryHdr = ['Artista', 'Streams', 'Bruto', '$/1,000', ...allParticipants]
  const summaryRows = byArtist.map(a => {
    const contract = contractMap[a.name]
    const splits   = contract?.splits ?? []
    const partMap: Record<string, number> = {}
    splits.forEach(s => { partMap[s.participant] = a.earnings * (Number(s.percentage) / 100) })
    return [
      a.name, a.streams, a.earnings,
      ratePerK(a.earnings, a.streams),
      ...allParticipants.map(p => partMap[p] ?? 0),
    ]
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([summaryHdr, ...summaryRows]), 'Consolidado')

  const platHdr = ['Plataforma', 'Streams', 'Bruto', '$/1,000']
  const platRows = agg(records, 'store').map(p => [
    p.name, p.streams, p.earnings, ratePerK(p.earnings, p.streams)
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([platHdr, ...platRows]), 'Por plataforma')

  const detailHdr = ['Período','Artista','Plataforma','País','Canción','Streams','Bruto']
  const detailRows = records.map(r => [
    r.sale_period, r.artist_name, r.store, r.country, r.song_title, r.quantity, r.earnings_usd
  ])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([detailHdr, ...detailRows]), 'Detalle')

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchard artist report — XLSX con formato visual tipo Google Sheets
// ─────────────────────────────────────────────────────────────────────────────

export interface ArtistSplit {
  artistPct: number  // 0-100
  labelPct:  number  // 0-100
  labelName: string
}

export function exportOrchardArtistReport(
  artist: string,
  records: OrchardRecord[],
  split: ArtistSplit,
) {
  const wb = XLSX.utils.book_new()

  const artistRecs = records.filter(r => r.artist === artist)
  const totalRev   = artistRecs.reduce((s, r) => s + r.net_total, 0)
  const totalStr   = artistRecs.reduce((s, r) => s + r.quantity, 0)
  const artistAmt  = totalRev * (split.artistPct / 100)
  const labelAmt   = totalRev * (split.labelPct  / 100)
  const rpm        = totalStr > 0 ? (totalRev / totalStr * 1000) : 0
  const period     = [...new Set(artistRecs.map(r => r.sale_period))].sort()
  const generated  = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

  // ── Estilo helper ──────────────────────────────────────────────────────────
  // SheetJS community edition no soporta estilos directamente, pero sí
  // permite definir anchos de columna y formatos de celda numérica.
  // Para color usamos xlsx-js-style si está disponible; si no, solo datos.

  // ── HOJA 1: Resumen / Liquidación ─────────────────────────────────────────
  const fmtMoney = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
  const fmtInt   = (n: number) => n.toLocaleString('en-US')

  const resumen: (string | number)[][] = [
    [],
    ['', 'LIQUIDACIÓN DE REGALÍAS', '', '', '', ''],
    ['', `Artista: ${artist}`, '', '', '', ''],
    ['', `Período: ${period.join(', ')}`, '', '', '', ''],
    ['', `Generado: ${generated}`, '', '', '', ''],
    [],
    ['', 'RESUMEN GENERAL', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', 'Total streams',          '', fmtInt(totalStr),   '', ''],
    ['', 'Ingresos brutos',        '', fmtMoney(totalRev), '', ''],
    ['', 'RPM ($/1,000 streams)',   '', `$${rpm.toFixed(4)}`,   '', ''],
    [],
    ['', 'DISTRIBUCIÓN DE INGRESOS', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['', 'Participante',           'Porcentaje', 'Monto',              '', ''],
    ['', artist,                   `${split.artistPct}%`, fmtMoney(artistAmt), '', ''],
    ['', split.labelName || 'Sello', `${split.labelPct}%`, fmtMoney(labelAmt), '', ''],
    ['', 'TOTAL',                  '100%',        fmtMoney(totalRev),  '', ''],
    [],
  ]

  const wsResumen = XLSX.utils.aoa_to_sheet(resumen)
  wsResumen['!cols'] = [{ wch: 2 }, { wch: 32 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Liquidación')

  // ── HOJA 2: Por canción ────────────────────────────────────────────────────
  const songMap = new Map<string, { streams: number; revenue: number; platform: Set<string> }>()
  for (const r of artistRecs) {
    const key = r.track
    if (!songMap.has(key)) songMap.set(key, { streams: 0, revenue: 0, platform: new Set() })
    const s = songMap.get(key)!
    s.streams += r.quantity
    s.revenue += r.net_total
    s.platform.add(r.platform)
  }
  const songs = [...songMap.entries()]
    .map(([name, v]) => ({ name, streams: v.streams, revenue: v.revenue, platforms: [...v.platform].join(', ') }))
    .sort((a, b) => b.revenue - a.revenue)
  const totalSongs = songs.length

  const songHdr = ['#', 'Canción', 'Plataformas', 'Streams', 'Ingresos brutos', '$/1,000', `Para ${artist} (${split.artistPct}%)`, `Para ${split.labelName || 'Sello'} (${split.labelPct}%)`]
  const songRows = songs.map((s, i) => {
    const rpm2 = s.streams > 0 ? s.revenue / s.streams * 1000 : 0
    return [
      i + 1, s.name, s.platforms, s.streams,
      parseFloat(s.revenue.toFixed(6)),
      parseFloat(rpm2.toFixed(6)),
      parseFloat((s.revenue * split.artistPct / 100).toFixed(6)),
      parseFloat((s.revenue * split.labelPct  / 100).toFixed(6)),
    ]
  })
  // Totals row
  const songTotals = [
    '', 'TOTAL', `${totalSongs} canciones`,
    songs.reduce((s, r) => s + r.streams, 0),
    parseFloat(totalRev.toFixed(6)),
    parseFloat(rpm.toFixed(6)),
    parseFloat(artistAmt.toFixed(6)),
    parseFloat(labelAmt.toFixed(6)),
  ]

  const wsSongs = XLSX.utils.aoa_to_sheet([songHdr, ...songRows, [], songTotals])
  wsSongs['!cols'] = [{ wch: 4 }, { wch: 36 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 22 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsSongs, 'Por canción')

  // ── HOJA 3: Por plataforma ─────────────────────────────────────────────────
  const platMap = new Map<string, { streams: number; revenue: number }>()
  for (const r of artistRecs) {
    if (!platMap.has(r.platform)) platMap.set(r.platform, { streams: 0, revenue: 0 })
    const p = platMap.get(r.platform)!
    p.streams += r.quantity
    p.revenue += r.net_total
  }
  const plats = [...platMap.entries()]
    .map(([name, v]) => ({ name, streams: v.streams, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)

  const platHdr = ['Plataforma', 'Streams', '% streams', 'Ingresos brutos', '% ingresos', '$/1,000', `Para ${artist}`, `Para ${split.labelName || 'Sello'}`]
  const platRows = plats.map(p => {
    const rpm3 = p.streams > 0 ? p.revenue / p.streams * 1000 : 0
    return [
      p.name, p.streams,
      totalStr > 0 ? parseFloat((p.streams / totalStr * 100).toFixed(2)) : 0,
      parseFloat(p.revenue.toFixed(6)),
      totalRev > 0  ? parseFloat((p.revenue / totalRev  * 100).toFixed(2)) : 0,
      parseFloat(rpm3.toFixed(6)),
      parseFloat((p.revenue * split.artistPct / 100).toFixed(6)),
      parseFloat((p.revenue * split.labelPct  / 100).toFixed(6)),
    ]
  })

  const wsPlat = XLSX.utils.aoa_to_sheet([platHdr, ...platRows])
  wsPlat['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsPlat, 'Por plataforma')

  // ── HOJA 4: Por país ───────────────────────────────────────────────────────
  const ctryMap = new Map<string, { streams: number; revenue: number }>()
  for (const r of artistRecs) {
    if (!ctryMap.has(r.country)) ctryMap.set(r.country, { streams: 0, revenue: 0 })
    const c = ctryMap.get(r.country)!
    c.streams += r.quantity
    c.revenue += r.net_total
  }
  const ctries = [...ctryMap.entries()]
    .map(([name, v]) => ({ name, streams: v.streams, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)

  const ctryHdr = ['País', 'Streams', '% streams', 'Ingresos brutos', '% ingresos', `Para ${artist}`, `Para ${split.labelName || 'Sello'}`]
  const ctryRows = ctries.map(c => {
    return [
      c.name, c.streams,
      totalStr > 0 ? parseFloat((c.streams / totalStr * 100).toFixed(2)) : 0,
      parseFloat(c.revenue.toFixed(6)),
      totalRev > 0  ? parseFloat((c.revenue / totalRev  * 100).toFixed(2)) : 0,
      parseFloat((c.revenue * split.artistPct / 100).toFixed(6)),
      parseFloat((c.revenue * split.labelPct  / 100).toFixed(6)),
    ]
  })

  const wsCtry = XLSX.utils.aoa_to_sheet([ctryHdr, ...ctryRows])
  wsCtry['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 22 }, { wch: 22 }]
  XLSX.utils.book_append_sheet(wb, wsCtry, 'Por país')

  // ── HOJA 5: Detalle completo ───────────────────────────────────────────────
  const detHdr = ['Período', 'Plataforma', 'País', 'Canción', 'ISRC', 'Tipo de stream', 'Streams', 'Ingresos brutos', `Para ${artist}`, `Para ${split.labelName || 'Sello'}`]
  const detRows = artistRecs.map(r => [
    r.sale_period, r.platform, r.country, r.track, r.isrc,
    r.rawStreamType || r.normalizedStreamType,
    r.quantity,
    parseFloat(r.net_total.toFixed(8)),
    parseFloat((r.net_total * split.artistPct / 100).toFixed(8)),
    parseFloat((r.net_total * split.labelPct  / 100).toFixed(8)),
  ])

  const wsDet = XLSX.utils.aoa_to_sheet([detHdr, ...detRows])
  wsDet['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 22 }, { wch: 36 }, { wch: 16 }, { wch: 38 }, { wch: 10 }, { wch: 18 }, { wch: 20 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, wsDet, 'Detalle')

  // ── Exportar ───────────────────────────────────────────────────────────────
  const safeName = artist.replace(/[^a-zA-Z0-9_\- ]/g, '').trim()
  const periodStr = period.length === 1 ? period[0] : `${period[0]}_${period[period.length - 1]}`
  XLSX.writeFile(wb, `Liquidacion_${safeName}_${periodStr}.xlsx`)
}
