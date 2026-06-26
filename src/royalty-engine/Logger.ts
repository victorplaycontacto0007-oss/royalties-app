export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  message: string
  ts: number
}

export class Logger {
  private entries: LogEntry[] = []
  private startTime = Date.now()

  // Summary stats set externally after processing completes (Requirement 17.5)
  private _rowsProcessed: number | null = null
  private _rowsSkipped: number | null = null
  private _totalErrors: number | null = null

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

  /**
   * Store processing counters to be emitted in the summary line.
   * Call this after processing completes (Requirement 17.5).
   */
  setSummaryStats(processed: number, skipped: number, errors: number): void {
    this._rowsProcessed = processed
    this._rowsSkipped   = skipped
    this._totalErrors   = errors
  }

  summary(): string {
    const logErrors = this.entries.filter(e => e.level === 'error').length
    const warns     = this.entries.filter(e => e.level === 'warn').length

    const processed = this._rowsProcessed ?? 0
    const skipped   = this._rowsSkipped   ?? 0
    const errors    = this._totalErrors   ?? logErrors

    const summaryLine =
      `[INFO] Resumen: ${processed} filas procesadas · ${skipped} filas omitidas · ${errors} errores totales`

    this.log('info', summaryLine.replace('[INFO] ', ''))

    return (
      `Procesado en ${this.elapsed()}ms · ` +
      `${processed} filas procesadas · ` +
      `${skipped} filas omitidas · ` +
      `${errors} errores totales · ` +
      `${warns} advertencias`
    )
  }
}
