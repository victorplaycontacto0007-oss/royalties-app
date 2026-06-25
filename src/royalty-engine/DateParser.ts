/** Normalizes any date/period string to YYYY-MM */
const MONTHS: Record<string, string> = {
  jan:'01',january:'01',enero:'01',
  feb:'02',february:'02',febrero:'02',
  mar:'03',march:'03',marzo:'03',
  apr:'04',april:'04',abril:'04',
  may:'05',mayo:'05',
  jun:'06',june:'06',junio:'06',
  jul:'07',july:'07',julio:'07',
  aug:'08',august:'08',agosto:'08',
  sep:'09',september:'09',septiembre:'09',
  oct:'10',october:'10',octubre:'10',
  nov:'11',november:'11',noviembre:'11',
  dec:'12',december:'12',diciembre:'12',
}

export function normalizePeriod(raw: string): string {
  if (!raw || raw === 'Unknown') return 'Unknown'
  const s = raw.trim()

  // YYYY-MM or YYYY/MM
  const iso = s.match(/\b(20\d{2})[-\/](0?[1-9]|1[0-2])\b/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}`

  // MILL: 2026M3
  const mill = s.match(/^(20\d{2})\s*[Mm](0?[1-9]|1[0-2])$/)
  if (mill) return `${mill[1]}-${mill[2].padStart(2,'0')}`

  // Jan-26 / Jan-2026
  const monyr = s.match(/^([A-Za-z]{3,})[-\s](20\d{2}|\d{2})$/)
  if (monyr) {
    const mon = MONTHS[monyr[1].toLowerCase()]
    if (mon) {
      const yr = monyr[2].length === 2 ? `20${monyr[2]}` : monyr[2]
      return `${yr}-${mon}`
    }
  }

  // March 2026 / March, 2026
  const fullmon = s.match(/^([A-Za-z]+)[,\s]+(\d{4})$/)
  if (fullmon) {
    const mon = MONTHS[fullmon[1].toLowerCase()]
    if (mon) return `${fullmon[2]}-${mon}`
  }

  // 2026-01-01~2026-01-31
  if (s.includes('~')) return s.split('~')[0].slice(0,7)

  // Full date 2026-01-15
  if (s.length > 7 && /^\d{4}-\d{2}/.test(s)) return s.slice(0,7)

  return s
}
