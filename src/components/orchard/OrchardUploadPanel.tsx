/**
 * OrchardUploadPanel.tsx
 *
 * File drop zone for Orchard TSV/CSV/XLSX reports.
 * Calls parseOrchardFile() on drop/selection, shows progress while parsing,
 * displays the import log afterward, and supports accumulating additional files.
 *
 * Requirements: 1.1, 2.3, 17.3, 17.4, 17.5
 */

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { CloudUpload, Loader2, CheckCircle, XCircle, AlertTriangle, FilePlus } from 'lucide-react'
import { parseOrchardFile } from '../../royalty-engine/StreamTypeClassifier'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface OrchardUploadPanelProps {
  onRecordsLoaded: (records: OrchardRecord[], fileName?: string) => void
  compact?: boolean
}

// ─── State types ─────────────────────────────────────────────────────────────

type PanelStatus = 'idle' | 'parsing' | 'success' | 'error'

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrchardUploadPanel({ onRecordsLoaded, compact = false }: OrchardUploadPanelProps) {
  const [status, setStatus]               = useState<PanelStatus>('idle')
  const [importLog, setImportLog]         = useState<string[]>([])
  const [unmappedColumns, setUnmappedColumns] = useState<string[]>([])
  const [lastFileName, setLastFileName]   = useState<string>('')
  const [recordCount, setRecordCount]     = useState<number>(0)
  const [hasImported, setHasImported]     = useState(false)

  // ── File handler ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setStatus('parsing')
    setImportLog([])
    setUnmappedColumns([])

    try {
      const { records, unmappedColumns: unmapped, importLog: log } = await parseOrchardFile(file)

      setImportLog(log)
      setUnmappedColumns(unmapped)
      setLastFileName(file.name)
      setRecordCount(records.length)

      // Detect error: empty records AND importLog contains "Error:"
      const hasError = records.length === 0 && log.some(l => l.startsWith('Error:'))

      if (hasError) {
        setStatus('error')
        return
      }

      setStatus('success')
      setHasImported(true)
      onRecordsLoaded(records, file.name)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setImportLog([`Error: ${message}`])
      setStatus('error')
    }
  }, [onRecordsLoaded])

  // ── Dropzone setup ────────────────────────────────────────────────────────

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    void handleFile(file)
  }, [handleFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv':                          ['.csv'],
      'text/tab-separated-values':         ['.tsv'],
      'text/plain':                        ['.tsv', '.txt'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    disabled: status === 'parsing',
  })

  // ── Reset to allow adding another file ────────────────────────────────────

  const handleAddAnother = () => {
    setStatus('idle')
    setImportLog([])
    setUnmappedColumns([])
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Drop zone — shown in idle, or re-shown after "Agregar otro archivo" ── */}
      {(status === 'idle' || status === 'parsing') && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all duration-200
            ${compact ? 'p-5' : 'p-12'}
            ${isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-border-light hover:bg-surface-2'}
            ${status === 'parsing' ? 'pointer-events-none opacity-70' : ''}
          `}
        >
          <input {...getInputProps()} />

          <div className="flex flex-col items-center gap-4">
            {/* Icon */}
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
              ${isDragActive ? 'bg-primary/20' : 'bg-surface-2'}`}>
              {status === 'parsing'
                ? <Loader2 className="w-8 h-8 text-primary animate-spin" />
                : <CloudUpload className={`w-8 h-8 ${isDragActive ? 'text-primary' : 'text-text-muted'}`} />
              }
            </div>

            {/* Text */}
            {status === 'parsing' ? (
              <div>
                <p className="text-text-primary font-medium">Procesando archivo...</p>
                <p className="text-text-muted text-sm mt-1">Por favor espera...</p>
              </div>
            ) : (
              <div>
                <p className="text-text-primary font-medium">
                  {isDragActive ? 'Suelta el archivo aquí' : 'Arrastra tu reporte Orchard aquí'}
                </p>
                <p className="text-text-muted text-sm mt-1">o haz clic para seleccionar</p>
                <p className="text-text-muted text-xs mt-3">TSV · CSV · XLSX</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Success state ─────────────────────────────────────────────────── */}
      {status === 'success' && (
        <div className="rounded-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-surface-2 border-b border-border">
            <CheckCircle className="w-5 h-5 text-success flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-sm font-medium truncate">{lastFileName}</p>
              <p className="text-text-muted text-xs mt-0.5">
                {recordCount.toLocaleString('en-US')} registro{recordCount !== 1 ? 's' : ''} importado{recordCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Unmapped columns warning */}
          {unmappedColumns.length > 0 && (
            <div className="flex items-start gap-2 px-4 py-3 bg-warning/5 border-b border-warning/20">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-warning text-xs font-semibold">Columnas no mapeadas</p>
                <p className="text-text-muted text-xs mt-0.5">
                  {unmappedColumns.join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Import log */}
          {importLog.length > 0 && (
            <details className="group">
              <summary className="px-4 py-2 cursor-pointer text-text-secondary text-xs font-semibold bg-surface-2 hover:bg-surface-3 transition-colors select-none">
                🔍 Log de importación ({importLog.length} entradas)
              </summary>
              <div className="px-4 py-2 space-y-0.5 max-h-40 overflow-y-auto bg-surface font-mono">
                {importLog.map((line, i) => (
                  <p
                    key={i}
                    className={`text-[10px] leading-relaxed ${
                      line.includes('[ERROR]') || line.startsWith('Error:') ? 'text-error' :
                      line.includes('[WARN]')  ? 'text-warning' : 'text-text-muted'
                    }`}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {status === 'error' && (
        <div className="rounded-2xl border border-error/30 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-error/5 border-b border-error/20">
            <XCircle className="w-5 h-5 text-error flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-sm font-medium truncate">
                {lastFileName || 'Error al importar'}
              </p>
              <p className="text-error text-xs mt-0.5">No se pudieron cargar registros</p>
            </div>
          </div>

          {/* Error log */}
          {importLog.length > 0 && (
            <div className="px-4 py-3 space-y-0.5 max-h-40 overflow-y-auto font-mono bg-surface">
              {importLog.map((line, i) => (
                <p
                  key={i}
                  className={`text-[10px] leading-relaxed ${
                    line.startsWith('Error:') ? 'text-error font-semibold' : 'text-text-muted'
                  }`}
                >
                  {line}
                </p>
              ))}
            </div>
          )}

          {/* Retry button */}
          <div className="px-4 py-3 bg-surface-2 border-t border-border">
            <button
              onClick={handleAddAnother}
              className="btn-secondary text-sm w-full"
            >
              Intentar con otro archivo
            </button>
          </div>
        </div>
      )}

      {/* ── "Add another file" button — shown after a successful import ───── */}
      {hasImported && status === 'success' && (
        <button
          onClick={handleAddAnother}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-border text-text-secondary text-sm font-medium hover:border-primary hover:text-primary hover:bg-primary/5 transition-all duration-200"
        >
          <FilePlus className="w-4 h-4" />
          Agregar otro archivo
        </button>
      )}
    </div>
  )
}
