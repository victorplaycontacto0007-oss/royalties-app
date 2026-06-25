/**
 * HeaderNormalizer.ts
 * Normalizes column header strings for alias matching.
 * Removes: spaces, accents, hyphens, underscores, parens, special chars.
 * Lowercases everything.
 */

const ACCENT_MAP: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a', ã: 'a',
  é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o', õ: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u',
  ñ: 'n', ç: 'c',
  // UTF-8 corruption patterns
  'Ã±': 'n', 'Ã©': 'e', '√ë': 'n', '√©': 'e',
}

export function normalizeHeader(raw: string): string {
  if (!raw) return ''
  let s = raw.toLowerCase()
  // Replace accented chars
  for (const [from, to] of Object.entries(ACCENT_MAP)) {
    s = s.split(from).join(to)
  }
  // Remove all non-alphanumeric characters (spaces, hyphens, underscores, parens, etc.)
  s = s.replace(/[^a-z0-9]/g, '')
  return s
}

/**
 * Normalize all headers in a row.
 */
export function normalizeHeaders(headers: string[]): string[] {
  return headers.map(h => normalizeHeader((h ?? '').toString()))
}
