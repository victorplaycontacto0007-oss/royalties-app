export function detectSeparator(sample: string): string {
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 }
  for (const c of Object.keys(counts) as (keyof typeof counts)[]) {
    counts[c] = (sample.match(new RegExp(`\\${c === '\t' ? 't' : c}`, 'g')) ?? []).length
  }
  // Special handle tab
  counts['\t'] = (sample.match(/\t/g) ?? []).length
  counts[','] = (sample.match(/,/g) ?? []).length
  counts[';'] = (sample.match(/;/g) ?? []).length
  counts['|'] = (sample.match(/\|/g) ?? []).length
  const max = Math.max(...Object.values(counts))
  if (counts['\t'] === max) return '\t'
  if (counts[';'] === max) return ';'
  if (counts['|'] === max) return '|'
  return ','
}
