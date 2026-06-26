/**
 * DebugViewer.tsx
 *
 * Modal "Ver Auditoría" — Debug Mode view for the Royalty Engine V2.
 *
 * Displays:
 *   1. Detected provider + calculation column used
 *   2. Table of detected columns (canonical field → header → index)
 *   3. First 20 raw data rows
 *   4. Last 20 raw data rows
 *   5. Accumulated net total (full precision) vs. displayed total (2 dec)
 *   6. Validation error list (WARN=yellow, ERROR=red)
 *   + Discrepancy banner when audit.status === 'discrepancy'
 *
 * Requirement: 11
 */

import { useEffect, useRef } from 'react'
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import type { AuditReport, DebugSnapshot } from '../royalty-engine/AuditReport'
import type { ValidationIssue } from '../royalty-engine/RowValidator'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DebugViewerProps {
  debug:   DebugSnapshot
  audit:   AuditReport
  isOpen:  boolean
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formats a Decimal(20,8) string to a 2-decimal display string. */
function fmtNet(raw: string): string {
  const n = parseFloat(raw)
  if (!isFinite(n)) return raw
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Maps ValidationIssue.type to a severity level.
 * 'corrupt' and 'non_numeric' are hard errors; everything else is a warning.
 */
function issueLevel(type: ValidationIssue['type']): 'error' | 'warn' {
  return type === 'corrupt' || type === 'non_numeric' ? 'error' : 'warn'
}

/** Human-readable label for each issue type. */
const ISSUE_TYPE_LABEL: Record<ValidationIssue['type'], string> = {
  empty_field:       'WARN',
  non_numeric:       'ERROR',
  negative:          'WARN',
  duplicate:         'WARN',
  currency_mismatch: 'WARN',
  corrupt:           'ERROR',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Section divider with a title. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1">
        {title}
      </h3>
      {children}
    </div>
  )
}

/** Horizontally-scrollable table wrapper. */
function ScrollTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-xs text-left min-w-max">
        {children}
      </table>
    </div>
  )
}

/** Standard <th> cell. */
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 bg-surface-2 text-text-muted font-semibold border-b border-border whitespace-nowrap">
      {children}
    </th>
  )
}

/** Standard <td> cell. */
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-3 py-1.5 text-text-secondary border-b border-border/50 whitespace-nowrap ${className ?? ''}`}>
      {children}
    </td>
  )
}

/** Renders a raw-row table (first 20 or last 20). */
function RawRowTable({ rows }: { rows: string[][] }) {
  if (rows.length === 0) {
    return (
      <p className="text-xs text-text-muted px-1 py-2">Sin datos disponibles.</p>
    )
  }

  // Determine column count from the widest row
  const colCount = Math.max(...rows.map(r => r.length))
  const colIndices = Array.from({ length: colCount }, (_, i) => i)

  return (
    <ScrollTable>
      <thead>
        <tr>
          <Th>#</Th>
          {colIndices.map(i => <Th key={i}>[{i}]</Th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className="hover:bg-surface-2/50">
            <Td className="text-text-muted font-mono">{ri + 1}</Td>
            {colIndices.map(ci => (
              <Td key={ci} className="font-mono max-w-[180px] truncate">
                {row[ci] ?? ''}
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
    </ScrollTable>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DebugViewer({ debug, audit, isOpen, onClose }: DebugViewerProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  // Prevent body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  // ── Derived values ──────────────────────────────────────────────────────────
  const isDiscrepancy  = audit.status === 'discrepancy'
  const columnEntries  = Object.entries(debug.columnMap)
  const warnCount      = debug.validationErrors.filter(e => issueLevel(e.type) === 'warn').length
  const errorCount     = debug.validationErrors.filter(e => issueLevel(e.type) === 'error').length
  const totalIssues    = debug.validationErrors.length

  // Discrepancy breakdown: parse from discrepancyNote or compute inline
  const accFloat       = parseFloat(debug.accumulatedNet)
  const netFloat       = parseFloat(audit.netTotal)
  const diff           = isFinite(accFloat) && isFinite(netFloat)
    ? (accFloat - netFloat).toFixed(8)
    : '—'

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="debug-viewer-title"
    >
      {/* Modal panel */}
      <div
        ref={dialogRef}
        className="w-full max-w-4xl bg-surface border border-border rounded-2xl shadow-card-hover my-6 animate-slide-up"
      >

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border sticky top-0 bg-surface rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔍</span>
            <h2 id="debug-viewer-title" className="font-semibold text-text-primary text-sm">
              Modo Debug — Auditoría
            </h2>
            <span className="badge-primary ml-1">{audit.provider || debug.provider || '—'}</span>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 rounded-lg"
            aria-label="Cerrar auditoría"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* ── Discrepancy banner ──────────────────────────────────────── */}
          {isDiscrepancy && (
            <div className="flex items-start gap-3 px-4 py-3 bg-warning/8 border border-warning/30 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold text-warning">Discrepancia detectada</p>
                <div className="text-text-secondary text-xs space-y-0.5">
                  <p>
                    <span className="font-medium text-text-primary">Columna usada:</span>{' '}
                    &ldquo;{debug.earningsColUsed}&rdquo; [col {debug.earningsColIdx}]
                  </p>
                  <p>
                    <span className="font-medium text-text-primary">Total calculado:</span>{' '}
                    {debug.accumulatedNet}
                  </p>
                  <p>
                    <span className="font-medium text-text-primary">Diferencia:</span>{' '}
                    {diff}
                  </p>
                  {audit.discrepancyNote && (
                    <p className="text-text-muted pt-0.5">{audit.discrepancyNote}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── 1. Provider + calculation column ───────────────────────── */}
          <Section title="Proveedor y columna de cálculo">
            <div className="bg-surface-2 rounded-xl px-4 py-3 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex items-baseline gap-2">
                <span className="text-text-muted text-xs w-36 shrink-0">Proveedor detectado</span>
                <span className="text-text-primary font-semibold">
                  {debug.provider || audit.provider || '—'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-text-muted text-xs w-36 shrink-0">Columna de cálculo</span>
                <span className="text-text-primary font-semibold">
                  &ldquo;{debug.earningsColUsed}&rdquo;{' '}
                  <span className="text-text-muted font-normal">[col {debug.earningsColIdx}]</span>
                </span>
              </div>
            </div>
          </Section>

          {/* ── 2. Detected columns table ───────────────────────────────── */}
          <Section title={`Columnas detectadas (${columnEntries.length})`}>
            {columnEntries.length === 0 ? (
              <p className="text-xs text-text-muted px-1">No se detectaron columnas mapeadas.</p>
            ) : (
              <ScrollTable>
                <thead>
                  <tr>
                    <Th>Campo canónico</Th>
                    <Th>Nombre de columna</Th>
                    <Th>Índice</Th>
                    <Th>Estado</Th>
                  </tr>
                </thead>
                <tbody>
                  {columnEntries.map(([field, { colIdx, header }]) => {
                    const isEarnings = field === 'net_total'
                    return (
                      <tr key={field} className="hover:bg-surface-2/50">
                        <Td>
                          <span className={`font-mono ${isEarnings ? 'text-primary font-semibold' : ''}`}>
                            {field}
                          </span>
                        </Td>
                        <Td>
                          <span className={isEarnings ? 'font-medium text-text-primary' : ''}>
                            &ldquo;{header}&rdquo;
                          </span>
                        </Td>
                        <Td className="text-text-muted font-mono">{colIdx}</Td>
                        <Td>
                          <span className="text-success">✅</span>
                        </Td>
                      </tr>
                    )
                  })}
                </tbody>
              </ScrollTable>
            )}
          </Section>

          <hr className="border-border" />

          {/* ── 3. First 20 rows ────────────────────────────────────────── */}
          <Section title="Primeras 20 filas (datos brutos)">
            <RawRowTable rows={debug.first20Rows} />
          </Section>

          {/* ── 4. Last 20 rows ─────────────────────────────────────────── */}
          <Section title="Últimas 20 filas (datos brutos)">
            <RawRowTable rows={debug.last20Rows} />
          </Section>

          <hr className="border-border" />

          {/* ── 5. Total precision comparison ───────────────────────────── */}
          <Section title="Precisión del total">
            <div className="bg-surface-2 rounded-xl px-4 py-3 space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-text-muted text-xs w-44 shrink-0">Total acumulado (completo)</span>
                <span className="font-mono text-text-primary text-xs">
                  {debug.accumulatedNet}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-text-muted text-xs w-44 shrink-0">Total mostrado (2 decimales)</span>
                <span className="font-mono text-text-primary font-semibold">
                  {fmtNet(debug.accumulatedNet)}
                </span>
              </div>
              {isDiscrepancy && (
                <div className="flex items-baseline justify-between gap-4 pt-1 border-t border-border/50">
                  <span className="text-warning text-xs w-44 shrink-0">Diferencia detectada</span>
                  <span className="font-mono text-warning font-semibold text-xs">
                    {diff}
                  </span>
                </div>
              )}
              {!isDiscrepancy && (
                <div className="flex items-center gap-1.5 pt-1 border-t border-border/50">
                  <CheckCircle className="w-3.5 h-3.5 text-success" />
                  <span className="text-success text-xs">Sin discrepancia</span>
                </div>
              )}
            </div>
          </Section>

          <hr className="border-border" />

          {/* ── 6. Validation errors ─────────────────────────────────────── */}
          <Section title={`Errores de validación (${totalIssues})`}>
            {totalIssues === 0 ? (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-success/5 border border-success/20 rounded-xl text-sm text-success">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>No se encontraron errores de validación.</span>
              </div>
            ) : (
              <>
                {/* Summary counts */}
                <div className="flex gap-3 mb-2">
                  {warnCount > 0 && (
                    <span className="badge-warning">
                      {warnCount} advertencia{warnCount !== 1 ? 's' : ''}
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="badge-error">
                      {errorCount} error{errorCount !== 1 ? 'es' : ''}
                    </span>
                  )}
                </div>

                {/* Error list */}
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border/50 max-h-72 overflow-y-auto">
                  {debug.validationErrors.map((issue, idx) => {
                    const level = issueLevel(issue.type)
                    const tag   = ISSUE_TYPE_LABEL[issue.type]
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-2.5 px-3 py-2 text-xs
                          ${level === 'error' ? 'bg-error/5' : 'bg-warning/5'}`}
                      >
                        {level === 'error'
                          ? <AlertTriangle className="w-3.5 h-3.5 text-error mt-0.5 flex-shrink-0" />
                          : <Info className="w-3.5 h-3.5 text-warning mt-0.5 flex-shrink-0" />
                        }
                        <span className={`font-semibold w-12 shrink-0 ${level === 'error' ? 'text-error' : 'text-warning'}`}>
                          [{tag}]
                        </span>
                        <span className="text-text-muted font-mono w-16 shrink-0">
                          fila {issue.rowIndex}
                        </span>
                        <span className="text-text-secondary flex-1">
                          {issue.message}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </Section>

        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-border rounded-b-2xl bg-surface-2/50 text-xs text-text-muted">
          <div className="flex items-center gap-4">
            <span>
              <span className="font-medium text-text-secondary">{audit.totalRows.toLocaleString()}</span> filas totales
            </span>
            <span>
              <span className="font-medium text-text-secondary">{audit.totalColumns}</span> columnas
            </span>
            <span>
              <span className="font-medium text-text-secondary">{audit.processingTimeMs.toLocaleString()} ms</span> procesamiento
            </span>
          </div>
          <button
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-1.5"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  )
}
