export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  message: string
  ts: number
}

export class Logger {
  private entries: LogEntry[] = []
  private startTime = Date.now()

  log(level: LogLevel, message: string) {
    this.entries.push({ level, message, ts: Date.now() })
  }
  info(msg: string)  { this.log('info', msg) }
  warn(msg: string)  { this.log('warn', `⚠ ${msg}`) }
  error(msg: string) { this.log('error', `❌ ${msg}`) }

  elapsed(): number { return Date.now() - this.startTime }

  getEntries(): LogEntry[] { return this.entries }

  toStrings(): string[] {
    return this.entries.map(e => `[${e.level.toUpperCase()}] ${e.message}`)
  }

  summary(): string {
    const errors = this.entries.filter(e => e.level === 'error').length
    const warns  = this.entries.filter(e => e.level === 'warn').length
    return `Procesado en ${this.elapsed()}ms · ${errors} errores · ${warns} advertencias`
  }
}
