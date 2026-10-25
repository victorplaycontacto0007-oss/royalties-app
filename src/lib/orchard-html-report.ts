/**
 * orchard-html-report.ts
 *
 * Genera un archivo HTML autocontenido y profesional para la liquidación
 * de regalías de un artista. El archivo resultante:
 *  - No requiere conexión a internet
 *  - No requiere login ni Supabase
 *  - Incluye estilos CSS embebidos
 *  - Incluye gráficos SVG generados en tiempo de exportación
 *  - Incluye JS mínimo para navegación, filtros y ordenación de tablas
 *  - Es legible sin JavaScript
 */

import type { OrchardRecord } from '../royalty-engine/StreamTypeClassifier'
import type { ArtistSplit } from './splits-export'

// ─── Helpers numéricos ────────────────────────────────────────────────────────

const fmtMoney = (n: number, dec = 4) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`

const fmtInt = (n: number) => n.toLocaleString('en-US')

const fmtPct = (n: number) => `${n.toFixed(2)}%`

const escHtml = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// ─── SVG bar chart ────────────────────────────────────────────────────────────

function svgBarChart(
  items: { label: string; value: number; color: string }[],
  width = 560,
  barH  = 28,
  gap   = 8,
): string {
  if (items.length === 0) return ''
  const maxVal = Math.max(...items.map(i => i.value), 0.0001)
  const maxLabelW = 160
  const barMaxW   = width - maxLabelW - 80
  const height    = items.length * (barH + gap) + gap

  const bars = items.map((item, idx) => {
    const y       = gap + idx * (barH + gap)
    const barW    = Math.max(2, (item.value / maxVal) * barMaxW)
    const valStr  = fmtMoney(item.value, 2)
    const label   = item.label.length > 22 ? item.label.slice(0, 21) + '…' : item.label
    return `
      <text x="${maxLabelW - 6}" y="${y + barH / 2 + 5}" text-anchor="end"
            font-size="11" fill="#4b5563" font-family="Inter,sans-serif">${escHtml(label)}</text>
      <rect x="${maxLabelW}" y="${y}" width="${barW.toFixed(1)}" height="${barH}"
            rx="4" fill="${item.color}" opacity="0.85"/>
      <text x="${maxLabelW + barW + 6}" y="${y + barH / 2 + 5}"
            font-size="11" fill="#1a1d2e" font-family="Inter,sans-serif" font-weight="600">${escHtml(valStr)}</text>
    `
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bars}</svg>`
}

// ─── SVG donut chart ─────────────────────────────────────────────────────────

function svgDonut(
  slices: { label: string; value: number; color: string }[],
  r = 80,
): string {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total === 0) return ''
  const cx = r + 10, cy = r + 10, ri = r * 0.58
  let angle = -Math.PI / 2
  const paths: string[] = []

  slices.forEach(slice => {
    const pct   = slice.value / total
    const sweep = pct * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle)
    const y2 = cy + r * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    const xi1 = cx + ri * Math.cos(angle - sweep)
    const yi1 = cy + ri * Math.sin(angle - sweep)
    const xi2 = cx + ri * Math.cos(angle)
    const yi2 = cy + ri * Math.sin(angle)
    paths.push(
      `<path d="M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} L${xi2.toFixed(2)},${yi2.toFixed(2)} A${ri},${ri} 0 ${large},0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z" fill="${slice.color}" opacity="0.9"/>`
    )
  })

  const size = (r + 10) * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths.join('')}</svg>`
}

// ─── Tabla HTML sortable ──────────────────────────────────────────────────────

// htmlCols: column indices whose content is raw HTML (not escaped)
function htmlTable(
  id: string,
  headers: string[],
  rows: (string | number)[][],
  numericCols: number[] = [],
  htmlCols:    number[] = [],
): string {
  const thead = `<thead><tr>${headers.map((h, i) =>
    `<th onclick="sortTable('${id}',${i})" class="sortable">${escHtml(h)} <span class="sort-icon">⇅</span></th>`
  ).join('')}</tr></thead>`

  const tbody = `<tbody>${rows.map(row =>
    `<tr>${row.map((cell, i) => {
      const cls = numericCols.includes(i) ? ' class="num"' : ''
      const content = htmlCols.includes(i)
        ? String(cell ?? '')          // raw HTML — do not escape
        : escHtml(String(cell ?? '')) // plain text — escape
      return `<td${cls}>${content}</td>`
    }).join('')}</tr>`
  ).join('')}</tbody>`

  return `<table id="${id}" class="data-table">${thead}${tbody}</table>`
}

// ─── CSS embebido ─────────────────────────────────────────────────────────────

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --primary:#6366f1;--primary-light:#ede9fe;
  --success:#10b981;--warning:#f59e0b;--error:#ef4444;
  --text:#1a1d2e;--muted:#9ca3af;--border:#e8eaf2;
  --surface:#f5f6fa;--white:#ffffff;
}
body{font-family:'Inter',system-ui,sans-serif;color:var(--text);background:#f0f2f8;font-size:14px;line-height:1.5}
a{color:var(--primary);text-decoration:none}

/* ── Layout ── */
.page-wrap{max-width:1100px;margin:0 auto;padding:24px 16px 80px}

/* ── Cover ── */
.cover{
  color:#fff;border-radius:20px;padding:52px 48px;margin-bottom:32px;position:relative;overflow:hidden;
  background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 50%,#a78bfa 100%);
}
.cover.has-logo{
  background-size:cover;background-position:center;background-repeat:no-repeat;
}
.cover.has-logo::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(30,20,80,.72) 0%,rgba(80,40,120,.60) 100%);
  z-index:0;
}
.cover>*{position:relative;z-index:1}
.cover::before{content:'';position:absolute;top:-60px;right:-60px;width:280px;height:280px;
  border-radius:50%;background:rgba(255,255,255,.06);z-index:1}
.cover-label{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin-bottom:8px}
.cover-artist{font-size:42px;font-weight:800;line-height:1.1;margin-bottom:4px}
.cover-label2{font-size:18px;opacity:.85;font-weight:500;margin-bottom:24px}
.cover-meta{display:flex;gap:32px;flex-wrap:wrap}
.cover-meta-item{display:flex;flex-direction:column;gap:2px}
.cover-meta-item span:first-child{font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.08em}
.cover-meta-item span:last-child{font-size:16px;font-weight:700}

/* ── Nav ── */
.nav{background:#fff;border-radius:14px;padding:6px;display:flex;gap:4px;flex-wrap:wrap;
  margin-bottom:28px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid var(--border)}
.nav a{padding:8px 16px;border-radius:10px;font-size:13px;font-weight:500;color:var(--muted);
  transition:all .15s;white-space:nowrap}
.nav a:hover{background:var(--surface);color:var(--text)}
.nav a.active{background:var(--primary-light);color:var(--primary);font-weight:600}

/* ── Section ── */
.section{background:#fff;border-radius:16px;padding:28px 32px;margin-bottom:24px;
  box-shadow:0 1px 3px rgba(0,0,0,.06);border:1px solid var(--border)}
.section-title{font-size:17px;font-weight:700;margin-bottom:20px;display:flex;align-items:center;gap:8px}
.section-title .icon{width:28px;height:28px;border-radius:8px;display:inline-flex;
  align-items:center;justify-content:center;font-size:14px}

/* ── KPI grid ── */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:24px}
.kpi-card{background:var(--surface);border-radius:12px;padding:16px 18px;border:1px solid var(--border)}
.kpi-card .kpi-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.kpi-card .kpi-value{font-size:22px;font-weight:800;color:var(--text);line-height:1}
.kpi-card .kpi-sub{font-size:11px;color:var(--muted);margin-top:4px}

/* ── Split bar ── */
.split-bar{display:flex;border-radius:10px;overflow:hidden;height:36px;margin:12px 0;font-weight:700;font-size:13px}
.split-artist{background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center}
.split-label{background:#e5e7eb;color:#374151;display:flex;align-items:center;justify-content:center}

/* ── Tables ── */
.data-table{width:100%;border-collapse:collapse;font-size:13px}
.data-table thead tr{background:var(--surface);border-bottom:2px solid var(--border)}
.data-table th{padding:10px 12px;text-align:left;font-weight:600;color:var(--muted);
  font-size:11px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;cursor:pointer}
.data-table th:hover{color:var(--primary)}
.data-table th.sortable{user-select:none}
.sort-icon{opacity:.4;font-size:10px}
.data-table td{padding:9px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
.data-table tbody tr:hover{background:#f8f9fc}
.data-table td.num{text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,monospace}
.data-table tfoot td{font-weight:700;background:var(--surface);border-top:2px solid var(--border)}
.table-wrap{overflow-x:auto;border-radius:12px;border:1px solid var(--border)}
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;
  font-size:11px;font-weight:600}
.badge-primary{background:var(--primary-light);color:var(--primary)}
.badge-success{background:#d1fae5;color:#065f46}
.badge-warning{background:#fef3c7;color:#92400e}

/* ── Progress bar ── */
.prog{height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden}
.prog-fill{height:100%;border-radius:3px;background:var(--primary)}

/* ── Search ── */
.search-row{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.search-input{border:1px solid var(--border);border-radius:8px;padding:7px 12px;
  font-size:13px;outline:none;flex:1;min-width:180px}
.search-input:focus{border-color:var(--primary);box-shadow:0 0 0 3px rgba(99,102,241,.12)}

/* ── Print & buttons ── */
.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 18px;border-radius:10px;
  font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.btn-primary-btn{background:var(--primary);color:#fff}
.btn-primary-btn:hover{background:#5558e8}
.btn-outline{background:#fff;color:var(--text);border:1px solid var(--border)}
.btn-outline:hover{background:var(--surface)}
.back-top{position:fixed;bottom:24px;right:24px;width:42px;height:42px;border-radius:50%;
  background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;
  font-size:20px;box-shadow:0 4px 12px rgba(99,102,241,.4);cursor:pointer;text-decoration:none}

/* ── Charts ── */
.chart-row{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start}
.chart-box{flex:1;min-width:260px}
.chart-legend{display:flex;flex-direction:column;gap:8px;justify-content:center}
.legend-item{display:flex;align-items:center;gap:8px;font-size:12px}
.legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}

/* ── Methodology ── */
.method-box{background:var(--surface);border-radius:12px;padding:18px 20px;font-size:13px;
  color:#374151;line-height:1.7;border-left:4px solid var(--primary)}

/* ── Responsive ── */
@media(max-width:640px){
  .cover{padding:32px 24px}.cover-artist{font-size:28px}
  .kpi-grid{grid-template-columns:1fr 1fr}
  .section{padding:20px 18px}
  .page-wrap{padding:14px 10px 60px}
}
@media print{
  .toolbar,.back-top,.nav{display:none!important}
  body{background:#fff}
  .section{box-shadow:none;border:1px solid #e8eaf2;break-inside:avoid}
  .cover{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`

// ─── JS embebido ─────────────────────────────────────────────────────────────

const JS = `
// ── Sort tables ──
const sortState = {}
function sortTable(id, col) {
  const tbl = document.getElementById(id)
  if (!tbl) return
  const dir = sortState[id+col] === 'asc' ? 'desc' : 'asc'
  sortState[id+col] = dir
  const rows = Array.from(tbl.querySelectorAll('tbody tr'))
  rows.sort((a,b) => {
    const av = a.cells[col]?.innerText.replace(/[$,%]/g,'').replace(/,/g,'') || ''
    const bv = b.cells[col]?.innerText.replace(/[$,%]/g,'').replace(/,/g,'') || ''
    const an = parseFloat(av), bn = parseFloat(bv)
    const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv)
    return dir === 'asc' ? cmp : -cmp
  })
  const tbody = tbl.querySelector('tbody')
  rows.forEach(r => tbody.appendChild(r))
  tbl.querySelectorAll('th').forEach((th,i) => {
    th.querySelector('.sort-icon').textContent = i===col ? (dir==='asc'?'↑':'↓') : '⇅'
  })
}

// ── Filter table ──
function filterTable(inputId, tableId) {
  const q = document.getElementById(inputId).value.toLowerCase()
  document.querySelectorAll('#'+tableId+' tbody tr').forEach(tr => {
    tr.style.display = tr.innerText.toLowerCase().includes(q) ? '' : 'none'
  })
}

// ── Nav active ──
document.addEventListener('DOMContentLoaded', () => {
  const links = document.querySelectorAll('.nav a')
  const sections = Array.from(document.querySelectorAll('[data-section]'))
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.getAttribute('data-section')
        links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#'+id))
      }
    })
  }, { rootMargin: '-30% 0px -60% 0px' })
  sections.forEach(s => obs.observe(s))
})
`

// ─── Main export function ─────────────────────────────────────────────────────

export function generateOrchardArtistHTML(
  artist:  string,
  records: OrchardRecord[],
  split:   ArtistSplit,
  logoBase64?: string,
): string {
  const artistRecs = records.filter(r => r.artist === artist)
  if (artistRecs.length === 0) return '<html><body>Sin datos</body></html>'

  const totalRev  = artistRecs.reduce((s, r) => s + r.net_total, 0)
  const totalStr  = artistRecs.reduce((s, r) => s + r.quantity, 0)
  const artistAmt = totalRev * (split.artistPct / 100)
  const labelAmt  = totalRev * (split.labelPct  / 100)
  const rpm       = totalStr > 0 ? totalRev / totalStr * 1000 : 0
  const periods   = [...new Set(artistRecs.map(r => r.sale_period))].sort()
  const periodStr = periods.length === 1 ? periods[0] : `${periods[0]} – ${periods[periods.length - 1]}`
  const generated = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
  const labelName = split.labelName || 'Sello'

  // ── Aggregate by song ──
  const songMap = new Map<string, { streams: number; revenue: number; isrc: string; platforms: Set<string> }>()
  for (const r of artistRecs) {
    if (!songMap.has(r.track)) songMap.set(r.track, { streams: 0, revenue: 0, isrc: r.isrc ?? '', platforms: new Set() })
    const s = songMap.get(r.track)!
    s.streams += r.quantity
    s.revenue += r.net_total
    s.platforms.add(r.platform)
  }
  const songs = [...songMap.entries()]
    .map(([name, v]) => ({ name, streams: v.streams, revenue: v.revenue, isrc: v.isrc, platforms: [...v.platforms].join(', ') }))
    .sort((a, b) => b.revenue - a.revenue)

  // ── Aggregate by platform ──
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

  // ── Aggregate by country ──
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

  // ── Stream type breakdown ──
  const typeMap = new Map<string, { streams: number; revenue: number }>()
  for (const r of artistRecs) {
    const key = r.rawStreamType || r.normalizedStreamType
    if (!typeMap.has(key)) typeMap.set(key, { streams: 0, revenue: 0 })
    const t = typeMap.get(key)!
    t.streams += r.quantity
    t.revenue += r.net_total
  }
  const streamTypes = [...typeMap.entries()]
    .map(([name, v]) => ({ name, streams: v.streams, revenue: v.revenue }))
    .sort((a, b) => b.streams - a.streams)

  // ── Colors ──
  const PALETTE = ['#6366f1','#8b5cf6','#10b981','#f59e0b','#ef4444','#3b82f6','#ec4899','#14b8a6','#f97316','#84cc16']

  // ── SVG charts ──
  const platChartItems = plats.slice(0, 10).map((p, i) => ({ label: p.name, value: p.revenue, color: PALETTE[i % PALETTE.length] }))
  const songChartItems = songs.slice(0, 12).map((s, i) => ({ label: s.name, value: s.revenue, color: PALETTE[i % PALETTE.length] }))
  const ctryChartItems = ctries.slice(0, 10).map((c, i) => ({ label: c.name, value: c.revenue, color: PALETTE[i % PALETTE.length] }))
  const donutSlices    = plats.slice(0, 6).map((p, i) => ({ label: p.name, value: p.revenue, color: PALETTE[i % PALETTE.length] }))

  const platChart = svgBarChart(platChartItems, 580, 26, 7)
  const songChart = svgBarChart(songChartItems, 580, 26, 7)
  const ctryChart = svgBarChart(ctryChartItems, 580, 26, 7)
  const donut     = svgDonut(donutSlices, 90)

  // ── Donut legend ──
  const donutLegend = donutSlices.map((s, i) => {
    const pct = totalRev > 0 ? s.value / totalRev * 100 : 0
    return `<div class="legend-item">
      <div class="legend-dot" style="background:${s.color}"></div>
      <span>${escHtml(s.label)} <strong>${fmtPct(pct)}</strong></span>
    </div>`
  }).join('')

  // ── Song table rows ──
  const songRows = songs.map(s => {
    const rpm2   = s.streams > 0 ? s.revenue / s.streams * 1000 : 0
    const pct    = totalRev  > 0 ? s.revenue / totalRev  * 100  : 0
    const artAmt2 = s.revenue * split.artistPct / 100
    const pctBar  = `<div class="prog"><div class="prog-fill" style="width:${Math.min(pct,100).toFixed(1)}%"></div></div>`
    return [
      s.name,
      s.isrc || '—',
      s.platforms,
      fmtInt(s.streams),
      fmtMoney(s.revenue),
      fmtMoney(rpm2),
      fmtMoney(artAmt2),
      `${fmtPct(pct)}<br>${pctBar}`,
    ]
  })
  const songTfoot = `<tfoot><tr>
    <td colspan="3"><strong>TOTAL</strong></td>
    <td class="num"><strong>${fmtInt(totalStr)}</strong></td>
    <td class="num"><strong>${fmtMoney(totalRev)}</strong></td>
    <td class="num"><strong>${fmtMoney(rpm)}</strong></td>
    <td class="num"><strong>${fmtMoney(artistAmt)}</strong></td>
    <td></td>
  </tr></tfoot>`

  // ── Platform table rows ──
  const platRows = plats.map(p => {
    const rpm3   = p.streams > 0 ? p.revenue / p.streams * 1000 : 0
    const pct    = totalRev  > 0 ? p.revenue / totalRev  * 100  : 0
    const strPct = totalStr  > 0 ? p.streams / totalStr  * 100  : 0
    return [
      p.name,
      fmtInt(p.streams),
      fmtPct(strPct),
      fmtMoney(p.revenue),
      fmtPct(pct),
      fmtMoney(rpm3),
      fmtMoney(p.revenue * split.artistPct / 100),
      fmtMoney(p.revenue * split.labelPct  / 100),
    ]
  })

  // ── Country table rows ──
  const ctryRows = ctries.slice(0, 50).map(c => {
    const pct    = totalRev  > 0 ? c.revenue / totalRev  * 100  : 0
    const strPct = totalStr  > 0 ? c.streams / totalStr  * 100  : 0
    return [
      c.name,
      fmtInt(c.streams),
      fmtPct(strPct),
      fmtMoney(c.revenue),
      fmtPct(pct),
      fmtMoney(c.revenue * split.artistPct / 100),
    ]
  })

  // ── Detail table rows (max 500 for performance) ──
  const detailRows = artistRecs.slice(0, 500).map(r => [
    r.sale_period,
    r.platform,
    r.country,
    r.track,
    r.isrc || '—',
    r.rawStreamType || r.normalizedStreamType,
    fmtInt(r.quantity),
    fmtMoney(r.net_total, 6),
    fmtMoney(r.net_total * split.artistPct / 100, 6),
  ])
  const detailNote = artistRecs.length > 500
    ? `<p style="color:#9ca3af;font-size:12px;margin-top:8px">Mostrando 500 de ${fmtInt(artistRecs.length)} transacciones. Descarga el Excel para el detalle completo.</p>`
    : ''

  // ── Stream type rows ──
  const typeRows = streamTypes.map(t => {
    const pct = totalStr > 0 ? t.streams / totalStr * 100 : 0
    return [t.name, fmtInt(t.streams), fmtPct(pct), fmtMoney(t.revenue)]
  })

  // ── Build HTML ────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Liquidación — ${escHtml(artist)} — ${escHtml(periodStr)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page-wrap">

  <!-- ── TOOLBAR ── -->
  <div class="toolbar">
    <button class="btn btn-primary-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
    <span style="flex:1"></span>
    <span style="font-size:12px;color:#9ca3af;align-self:center">Generado el ${escHtml(generated)}</span>
  </div>

  <!-- ── COVER ── -->
  <div class="cover${logoBase64 ? ' has-logo' : ''}"
       data-section="cover" id="cover"
       ${logoBase64 ? `style="background-image:url('${logoBase64}')"` : ''}>
    <div class="cover-label">Royalties Music Analytics · Liquidación de regalías</div>
    <div class="cover-artist">${escHtml(artist)}</div>
    <div class="cover-label2">${escHtml(labelName)}</div>
    <div class="cover-meta">
      <div class="cover-meta-item">
        <span>Período</span>
        <span>${escHtml(periodStr)}</span>
      </div>
      <div class="cover-meta-item">
        <span>Ingresos brutos</span>
        <span>${fmtMoney(totalRev, 2)}</span>
      </div>
      <div class="cover-meta-item">
        <span>Para el artista (${split.artistPct}%)</span>
        <span>${fmtMoney(artistAmt, 2)}</span>
      </div>
      <div class="cover-meta-item">
        <span>Total streams</span>
        <span>${fmtInt(totalStr)}</span>
      </div>
    </div>
  </div>

  <!-- ── NAV ── -->
  <nav class="nav">
    <a href="#resumen" class="active">📊 Resumen</a>
    <a href="#liquidacion">💰 Liquidación</a>
    <a href="#canciones">🎵 Canciones</a>
    <a href="#plataformas">📡 Plataformas</a>
    <a href="#paises">🌎 Países</a>
    <a href="#tipos">🔖 Tipos de stream</a>
    <a href="#detalle">📋 Detalle</a>
    <a href="#metodologia">📌 Metodología</a>
  </nav>

  <!-- ── RESUMEN ── -->
  <div class="section" data-section="resumen" id="resumen">
    <div class="section-title"><span class="icon" style="background:#ede9fe">📊</span> Resumen general</div>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Ingresos brutos</div>
        <div class="kpi-value">${fmtMoney(totalRev, 2)}</div>
        <div class="kpi-sub">USD · ${escHtml(periodStr)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Para ${escHtml(artist)}</div>
        <div class="kpi-value" style="color:#6366f1">${fmtMoney(artistAmt, 2)}</div>
        <div class="kpi-sub">${split.artistPct}% del bruto</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Para ${escHtml(labelName)}</div>
        <div class="kpi-value" style="color:#374151">${fmtMoney(labelAmt, 2)}</div>
        <div class="kpi-sub">${split.labelPct}% del bruto</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total streams</div>
        <div class="kpi-value">${fmtInt(totalStr)}</div>
        <div class="kpi-sub">${fmtInt(songs.length)} canciones · ${fmtInt(plats.length)} plataformas</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">RPM ($/1,000 streams)</div>
        <div class="kpi-value">${fmtMoney(rpm, 4)}</div>
        <div class="kpi-sub">Promedio global</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Países</div>
        <div class="kpi-value">${fmtInt(ctries.length)}</div>
        <div class="kpi-sub">Top: ${escHtml(ctries[0]?.name ?? '—')}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Top plataforma</div>
        <div class="kpi-value" style="font-size:16px">${escHtml(plats[0]?.name ?? '—')}</div>
        <div class="kpi-sub">${fmtMoney(plats[0]?.revenue ?? 0, 2)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Top canción</div>
        <div class="kpi-value" style="font-size:14px">${escHtml(songs[0]?.name ?? '—')}</div>
        <div class="kpi-sub">${fmtMoney(songs[0]?.revenue ?? 0, 2)}</div>
      </div>
    </div>

    <!-- Donut + platform bar -->
    <div class="chart-row">
      <div class="chart-box">
        <p style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Ingresos por plataforma</p>
        ${platChart}
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
        <p style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.06em">Distribución</p>
        ${donut}
        <div class="chart-legend">${donutLegend}</div>
      </div>
    </div>
  </div>

  <!-- ── LIQUIDACIÓN ── -->
  <div class="section" data-section="liquidacion" id="liquidacion">
    <div class="section-title"><span class="icon" style="background:#d1fae5">💰</span> Liquidación contractual</div>

    <div class="split-bar">
      <div class="split-artist" style="width:${split.artistPct}%">${escHtml(artist)} — ${split.artistPct}%</div>
      <div class="split-label"  style="width:${split.labelPct}%">${escHtml(labelName)} — ${split.labelPct}%</div>
    </div>

    <div class="kpi-grid" style="margin-top:16px">
      <div class="kpi-card" style="border-color:#6366f1;border-width:2px">
        <div class="kpi-label">Artista: ${escHtml(artist)}</div>
        <div class="kpi-value" style="color:#6366f1">${fmtMoney(artistAmt, 4)}</div>
        <div class="kpi-sub">${split.artistPct}% × ${fmtMoney(totalRev, 4)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Sello: ${escHtml(labelName)}</div>
        <div class="kpi-value">${fmtMoney(labelAmt, 4)}</div>
        <div class="kpi-sub">${split.labelPct}% × ${fmtMoney(totalRev, 4)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Total a liquidar</div>
        <div class="kpi-value">${fmtMoney(totalRev, 4)}</div>
        <div class="kpi-sub">100% · USD</div>
      </div>
    </div>
  </div>

  <!-- ── CANCIONES ── -->
  <div class="section" data-section="canciones" id="canciones">
    <div class="section-title"><span class="icon" style="background:#fef3c7">🎵</span> Ingresos por canción</div>
    <div style="margin-bottom:16px">${songChart}</div>
    <div class="search-row">
      <input class="search-input" id="song-search" placeholder="Buscar canción…" oninput="filterTable('song-search','tbl-songs')">
    </div>
    <div class="table-wrap">
      ${htmlTable('tbl-songs',
        ['Canción','ISRC','Plataformas','Streams','Ingresos brutos','$/1,000',`Para ${artist} (${split.artistPct}%)`,'% del total'],
        songRows, [3,4,5,6], [7]
      ).replace('</table>', songTfoot + '</table>')}
    </div>
  </div>

  <!-- ── PLATAFORMAS ── -->
  <div class="section" data-section="plataformas" id="plataformas">
    <div class="section-title"><span class="icon" style="background:#ede9fe">📡</span> Ingresos por plataforma</div>
    <div style="margin-bottom:16px">${platChart}</div>
    <div class="table-wrap">
      ${htmlTable('tbl-plats',
        ['Plataforma','Streams','% streams','Ingresos brutos','% ingresos','$/1,000',`Para ${artist}`,`Para ${labelName}`],
        platRows, [1,3,5,6,7]
      )}
    </div>
  </div>

  <!-- ── PAÍSES ── -->
  <div class="section" data-section="paises" id="paises">
    <div class="section-title"><span class="icon" style="background:#d1fae5">🌎</span> Ingresos por país</div>
    <div style="margin-bottom:16px">${ctryChart}</div>
    <div class="search-row">
      <input class="search-input" id="ctry-search" placeholder="Buscar país…" oninput="filterTable('ctry-search','tbl-ctries')">
    </div>
    <div class="table-wrap">
      ${htmlTable('tbl-ctries',
        ['País','Streams','% streams','Ingresos brutos','% ingresos',`Para ${artist}`],
        ctryRows, [1,3,5]
      )}
    </div>
    ${ctries.length > 50 ? `<p style="color:#9ca3af;font-size:12px;margin-top:8px">Mostrando top 50 países.</p>` : ''}
  </div>

  <!-- ── TIPOS DE STREAM ── -->
  <div class="section" data-section="tipos" id="tipos">
    <div class="section-title"><span class="icon" style="background:#fce7f3">🔖</span> Tipos de stream</div>
    <div class="table-wrap">
      ${htmlTable('tbl-types',
        ['Tipo de stream','Streams','% streams','Ingresos brutos'],
        typeRows, [1,3]
      )}
    </div>
  </div>

  <!-- ── DETALLE ── -->
  <div class="section" data-section="detalle" id="detalle">
    <div class="section-title"><span class="icon" style="background:#f0fdf4">📋</span> Detalle de transacciones</div>
    <div class="search-row">
      <input class="search-input" id="det-search" placeholder="Buscar en detalle…" oninput="filterTable('det-search','tbl-detail')">
    </div>
    <div class="table-wrap">
      ${htmlTable('tbl-detail',
        ['Período','Plataforma','País','Canción','ISRC','Tipo de stream','Streams','Ingresos brutos',`Para ${artist}`],
        detailRows, [6,7,8]
      )}
    </div>
    ${detailNote}
  </div>

  <!-- ── METODOLOGÍA ── -->
  <div class="section" data-section="metodologia" id="metodologia">
    <div class="section-title"><span class="icon" style="background:#f5f3ff">📌</span> Metodología de cálculo</div>
    <div class="method-box">
      <p><strong>Fuente de datos:</strong> Reporte de regalías importado desde The Orchard / distribuidora.</p>
      <p><strong>Moneda:</strong> Todos los importes están expresados en USD según los datos del reporte fuente.</p>
      <p><strong>Distribución contractual:</strong> ${escHtml(artist)} recibe el ${split.artistPct}% del ingreso bruto. ${escHtml(labelName)} retiene el ${split.labelPct}% restante.</p>
      <p><strong>Fórmula:</strong> Ingreso artista = Ingresos brutos × ${split.artistPct / 100}</p>
      <p><strong>RPM:</strong> Revenue Per Mille = (Ingresos brutos ÷ Streams totales) × 1,000</p>
      <p><strong>Período:</strong> ${escHtml(periodStr)}</p>
      <p><strong>Generado:</strong> ${escHtml(generated)}</p>
      <p style="margin-top:12px;color:#9ca3af;font-size:12px">Este reporte es confidencial y fue generado automáticamente. Los datos corresponden exclusivamente a ${escHtml(artist)}. No contiene información de otros artistas.</p>
    </div>
  </div>

</div><!-- /page-wrap -->

<!-- Back to top -->
<a href="#cover" class="back-top" title="Volver al inicio">↑</a>

<script>${JS}</script>
</body>
</html>`
}

// ─── Download helper ─────────────────────────────────────────────────────────

export function downloadOrchardHTML(
  artist:  string,
  records: OrchardRecord[],
  split:   ArtistSplit,
  logoBase64?: string,
) {
  const html     = generateOrchardArtistHTML(artist, records, split, logoBase64)
  const blob     = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url      = URL.createObjectURL(blob)
  const periods  = [...new Set(records.filter(r => r.artist === artist).map(r => r.sale_period))].sort()
  const period   = periods[0] ?? 'reporte'
  const safeName = artist.replace(/[^a-zA-Z0-9 _\-]/g, '').trim().replace(/\s+/g, '_')
  const a        = document.createElement('a')
  a.href         = url
  a.download     = `Liquidacion_${safeName}_${period}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
