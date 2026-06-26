import type { Logger } from './Logger'

export function detectSeparator(sample: string, logger?: Logger): string {
  const counts: Record<string, number> = {
    ',': (sample.match(/,/g) ?? []).length,
    ';': (sample.match(/;/g) ?? []).length,
    '\t': (sample.match(/\t/g) ?? []).length,
    '|': (sample.match(/\|/g) ?? []).length,
  }

  const max = Math.max(...Object.values(counts))

  // Explicit fallback: if no separator was found at all, default to comma
  if (max === 0) {
    logger?.info('No se detectó separador, usando coma')
    return ','
  }

  if (counts['\t'] === max) return '\t'
  if (counts[';'] === max) return ';'
  if (counts['|'] === max) return '|'
  return ','
}
