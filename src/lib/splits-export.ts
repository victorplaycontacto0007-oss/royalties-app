import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { RoyaltyRecord, Contract, SplitResult } from '../types/database'
import { formatCurrency, formatNumber, ratePerK } from './utils'

// ── Apply split to an amount ──────────────────────────────────
export function applySplits(gross: number, splits: Contract['splits']): SplitResult[] {
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

// ── Build split column headers ────────────────────────────────
function splitHeaders(splits: NonNullable<Contract['splits']>) {
  return splits.map(s => `${s.participant} (${s.percentage}%)`)
}

function splitAmounts(gross: number, splits: NonNullable<Contract['splits']>) {
  return splits.map(s => gross * (Number(s.percentage) / 100))
}

// ── Main export ───────────────────────────────────────────────
export function exportSplitsExcel(
  records: RoyaltyRecord[],
  contract: Contract,
  filename: string
) {
  const splits  = contract.splits ?? []
  const sHdr    = splitHeaders(splits)
  const wb      = XLSX.utils.book_new()

  // ── Sheet 1: Resumen ──────────────────────────────────────
  const totalEarnings = records.reduce((a, r) => a + r.earnings_usd, 0)
  const totalStreams   = records.reduce((a, r) => a + r.quantity, 0)

  const summaryRows = [
    ['Campo', 'Valor'],
    ['Artista',          contract.artist_name],
    ['Sello',            contract.label],
    ['Total registros',  records.length],
    ['Total streams',    totalStreams],
    ['Ingresos brutos',  totalEarnings],
    ['RPM ($/1K)',        ratePerK(totalEarnings, totalStreams).toFixed(4)],
    [],
    ['Participante', 'Rol', 'Porcentaje', 'Monto'],
    ...splits.map(s => [
      s.participant, s.role, `${s.percentage}%`, totalEarnings * (Number(s.percentage)/100)
    ]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')

  // ── Sheet 2: Detalle por canción ─────────────────────────
  const bySong = agg(records, 'song_title')
  const songHeader = ['Canción', 'Streams', 'Bruto', '$/1,000', ...sHdr]
  const songRows = bySong.map(s => [
    s.name,
    s.streams,
    s.earnings,
    ratePerK(s.earnings, s.streams),
    ...splitAmounts(s.earnings, splits),
  ])
  const ws2 = XLSX.utils.aoa_to_sheet([songHeader, ...songRows])
  XLSX.utils.book_append_sheet(wb, ws2, 'Por canción')

  // ── Sheet 3: Por plataforma ───────────────────────────────
  const byPlat = agg(records, 'store')
  const platHeader = ['Plataforma', 'Streams', 'Bruto', '$/1,000', ...sHdr]
  const platRows = byPlat.map(p => [
    p.name,
    p.streams,
    p.earnings,
    ratePerK(p.earnings, p.streams),
    ...splitAmounts(p.earnings, splits),
  ])
  const ws3 = XLSX.utils.aoa_to_sheet([platHeader, ...platRows])
  XLSX.utils.book_append_sheet(wb, ws3, 'Por plataforma')

  // ── Sheet 4: Por país ─────────────────────────────────────
  const byCtry = agg(records, 'country')
  const ctryHeader = ['País', 'Streams', 'Bruto', '$/1,000', ...sHdr]
  const ctryRows = byCtry.map(c => [
    c.name,
    c.streams,
    c.earnings,
    ratePerK(c.earnings, c.streams),
    ...splitAmounts(c.earnings, splits),
  ])
  const ws4 = XLSX.utils.aoa_to_sheet([ctryHeader, ...ctryRows])
  XLSX.utils.book_append_sheet(wb, ws4, 'Por país')

  // ── Sheet 5: Detalle completo ─────────────────────────────
  const detailHeader = ['Período','Artista','Plataforma','País','Canción','Streams','Bruto','$/1,000',...sHdr]
  const detailRows = records.map(r => [
    r.sale_period, r.artist_name, r.store, r.country, r.song_title,
    r.quantity, r.earnings_usd,
    ratePerK(r.earnings_usd, r.quantity),
    ...splitAmounts(r.earnings_usd, splits),
  ])
  const ws5 = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows])
  XLSX.utils.book_append_sheet(wb, ws5, 'Detalle completo')

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ── Multi-artist consolidated export ─────────────────────────
export function exportConsolidatedExcel(
  records: RoyaltyRecord[],
  contracts: Contract[],
  filename: string
) {
  const wb = XLSX.utils.book_new()

  // Map artist → contract
  const contractMap: Record<string, Contract> = {}
  contracts.forEach(c => { contractMap[c.artist_name] = c })

  // Summary by artist
  const byArtist = agg(records, 'artist_name')

  // Collect all unique participants across contracts
  const allParticipants = [...new Set(
    contracts.flatMap(c => (c.splits ?? []).map(s => s.participant))
  )]

  const summaryHeader = ['Artista', 'Streams', 'Bruto', '$/1,000', ...allParticipants]
  const summaryRows = byArtist.map(a => {
    const contract = contractMap[a.name]
    const splits   = contract?.splits ?? []
    const partMap: Record<string, number> = {}
    splits.forEach(s => { partMap[s.participant] = a.earnings * (Number(s.percentage)/100) })
    return [
      a.name, a.streams, a.earnings,
      ratePerK(a.earnings, a.streams),
      ...allParticipants.map(p => partMap[p] ?? 0),
    ]
  })

  const ws1 = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryRows])
  XLSX.utils.book_append_sheet(wb, ws1, 'Consolidado artistas')

  // Per-platform summary
  const platHeader = ['Plataforma', 'Streams', 'Bruto', '$/1,000']
  const platRows = agg(records, 'store').map(p => [
    p.name, p.streams, p.earnings, ratePerK(p.earnings, p.streams)
  ])
  const ws2 = XLSX.utils.aoa_to_sheet([platHeader, ...platRows])
  XLSX.utils.book_append_sheet(wb, ws2, 'Por plataforma')

  // Full detail
  const detailHeader = ['Período','Artista','Plataforma','País','Canción','Streams','Bruto']
  const detailRows = records.map(r => [
    r.sale_period, r.artist_name, r.store, r.country, r.song_title, r.quantity, r.earnings_usd
  ])
  const ws3 = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows])
  XLSX.utils.book_append_sheet(wb, ws3, 'Detalle')

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ── PDF Liquidación por artista ───────────────────────────────
export function exportSplitsPdf(
  records: RoyaltyRecord[],
  contract: Contract,
  filename: string
) {
  const doc     = new jsPDF()
  const splits  = contract.splits ?? []
  const gross   = records.reduce((a, r) => a + r.earnings_usd, 0)
  const streams = records.reduce((a, r) => a + r.quantity, 0)
  const rK      = ratePerK(gross, streams)

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

  // Summary box
  doc.setTextColor(0, 0, 0)
  doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text('Resumen ejecutivo', 14, 70)
  autoTable(doc, {
    startY: 74,
    body: [
      ['💰 Ingresos brutos',      formatCurrency(gross)],
      ['🎧 Total streams',        formatNumber(streams)],
      ['📈 RPM ($/1,000 streams)', `$${rK.toFixed(4)}`],
      ['📅 Período',              records[0]?.sale_period?.slice(0,7) ?? '—'],
    ],
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 }, 1: { cellWidth: 80 } },
    theme: 'plain',
  })

  const y1 = (doc as any).lastAutoTable.finalY + 8

  // Splits liquidation
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('Distribución de regalías', 14, y1)
  autoTable(doc, {
    startY: y1 + 4,
    head: [['Participante', 'Rol', 'Porcentaje', 'Monto']],
    body: splits.map(s => [
      s.participant,
      s.role === 'artist' ? 'Artista' : s.role === 'label' ? 'Sello' : s.role === 'producer' ? 'Productor' : 'Otro',
      `${s.percentage}%`,
      formatCurrency(gross * (Number(s.percentage) / 100)),
    ]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [99, 102, 241] },
    foot: [['Total', '', '100%', formatCurrency(gross)]],
    footStyles: { fontStyle: 'bold', fillColor: [245, 245, 245] },
  })

  const y2 = (doc as any).lastAutoTable.finalY + 8

  // Top songs with split amounts
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('Top canciones', 14, y2)
  const splitHdr = splits.map(s => `${s.participant} (${s.percentage}%)`)
  autoTable(doc, {
    startY: y2 + 4,
    head: [['Canción', 'Streams', 'Bruto', '$/1K', ...splitHdr]],
    body: agg(records, 'song_title').slice(0, 15).map(s => [
      s.name,
      formatNumber(s.streams),
      formatCurrency(s.earnings),
      `$${ratePerK(s.earnings, s.streams).toFixed(4)}`,
      ...splits.map(sp => formatCurrency(s.earnings * (Number(sp.percentage) / 100))),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [99, 102, 241] },
  })

  const y3 = (doc as any).lastAutoTable.finalY + 8

  // Platforms with split amounts
  doc.setFont('helvetica', 'bold')
  doc.text('Por plataforma', 14, y3)
  autoTable(doc, {
    startY: y3 + 4,
    head: [['Plataforma', 'Streams', 'Bruto', '$/1K', ...splitHdr]],
    body: agg(records, 'store').map(p => [
      p.name,
      formatNumber(p.streams),
      formatCurrency(p.earnings),
      `$${ratePerK(p.earnings, p.streams).toFixed(4)}`,
      ...splits.map(sp => formatCurrency(p.earnings * (Number(sp.percentage) / 100))),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [99, 102, 241] },
  })

  doc.save(`${filename}.pdf`)
}
