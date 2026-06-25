/** Detects the distributor/provider from filename or header signature */

const PROVIDERS: Array<{ name: string; signals: string[] }> = [
  { name: 'Ditto',         signals: ['ditto', 'tenant_id', 'confirmation_report_date'] },
  { name: 'DistroKid',     signals: ['distrokid', 'you earned', 'bank'] },
  { name: 'TuneCore',      signals: ['tunecore'] },
  { name: 'CD Baby',       signals: ['cdbaby', 'cd baby'] },
  { name: 'Believe',       signals: ['believe'] },
  { name: 'FUGA',          signals: ['fuga'] },
  { name: 'Symphonic',     signals: ['symphonic'] },
  { name: 'ONErpm',        signals: ['onerpm'] },
  { name: 'TooLost',       signals: ['toolost', 'too lost'] },
  { name: 'Amuse',         signals: ['amuse'] },
  { name: 'RouteNote',     signals: ['routenote'] },
  { name: 'UnitedMasters', signals: ['unitedmasters'] },
  { name: 'SoundOn',       signals: ['soundon', 'final royalty', 'units of sold'] },
  { name: 'TuneOrchard',   signals: ['tuneorchard', 'track artists', 'collaborator share'] },
  { name: 'Spotify',       signals: ['spotify'] },
  { name: 'Apple Music',   signals: ['apple music', 'apple'] },
  { name: 'Amazon Music',  signals: ['amazon'] },
  { name: 'Tidal',         signals: ['tidal'] },
  { name: 'YouTube',       signals: ['youtube'] },
  { name: 'TikTok',        signals: ['tiktok'] },
  { name: 'Meta',          signals: ['meta', 'facebook'] },
]

export function detectProvider(fileName: string, headers: string[]): string {
  const nameLower = fileName.toLowerCase()
  const headerStr = headers.join(' ').toLowerCase()
  const combined  = nameLower + ' ' + headerStr

  for (const p of PROVIDERS) {
    if (p.signals.some(s => combined.includes(s))) return p.name
  }
  return 'Unknown'
}
