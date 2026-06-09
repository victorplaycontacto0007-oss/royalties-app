import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  detectAvailablePeriods,
  parseDistroKidFileWithSummary,
  normalizeSalePeriod,
  ReportSummary,
} from '../lib/distrokid-parser'
import {
  FileText, CheckCircle, XCircle, Loader2, CloudUpload,
  AlertTriangle, Info, Calendar, ChevronRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

type UploadStatus = 'idle' | 'detecting' | 'selecting' | 'uploading' | 'processing' | 'success' | 'error'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/** Sort period strings: "2026-03" style first, then raw strings */
function sortPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => {
    const na = normalizeSalePeriod(a)
    const nb = normalizeSalePeriod(b)
    return na.localeCompare(nb)
  })
}

export default function UploadPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [status, setStatus]             = useState<UploadStatus>('idle')
  const [error, setError]               = useState('')
  const [progress, setProgress]         = useState('')
  const [reportId, setReportId]         = useState('')
  const [summary, setSummary]           = useState<ReportSummary | null>(null)

  // Step 1 → Step 2 state
  const [pendingFile, setPendingFile]   = useState<File | null>(null)
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([])
  const [officialTotal, setOfficialTotal] = useState<number | null>(null)
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set())

  // ── STEP 1: detect periods ────────────────────────────────────────────────
  const handleFileDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (!file || !user) return

    setStatus('detecting')
    setError('')
    setSummary(null)
    setPendingFile(file)

    try {
      const result = await detectAvailablePeriods(file)
      const sorted = sortPeriods(result.availablePeriods)
      setAvailablePeriods(sorted)
      setOfficialTotal(result.officialTotal)
      // Pre-select all periods by default
      setSelectedPeriods(new Set(sorted))
      setStatus('selecting')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al leer el archivo')
      setStatus('error')
    }
  }, [user])

  // ── STEP 2: toggle period selection ──────────────────────────────────────
  const togglePeriod = (p: string) => {
    setSelectedPeriods(prev => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const selectAll  = () => setSelectedPeriods(new Set(availablePeriods))
  const selectNone = () => setSelectedPeriods(new Set())

  // ── STEP 3: process with selected periods ─────────────────────────────────
  const processFile = async () => {
    if (!user || !pendingFile) return
    if (selectedPeriods.size === 0) {
      setError('Selecciona al menos un período.')
      return
    }

    setStatus('uploading')
    setError('')

    try {
      // 1. Upload to Storage
      setProgress('Subiendo archivo...')
      const filePath = `${user.id}/${Date.now()}-${pendingFile.name}`
      const { error: storageError } = await supabase.storage
        .from('reports')
        .upload(filePath, pendingFile)
      if (storageError) throw storageError

      // 2. Create report record
      setProgress('Registrando reporte...')
      const { data: report, error: reportError } = await db
        .from('reports')
        .insert({
          user_id:   user.id,
          file_name: pendingFile.name,
          file_path: filePath,
          file_size: pendingFile.size,
          file_type: pendingFile.type || pendingFile.name.split('.').pop() || 'unknown',
          status:    'processing',
        })
        .select()
        .single()
      if (reportError) throw reportError

      // 3. Parse with selected periods
      setStatus('processing')
      setProgress('Procesando datos de regalías...')
      const { rows, summary: parsedSummary } = await parseDistroKidFileWithSummary(
        pendingFile,
        [...selectedPeriods]
      )
      if (rows.length === 0) throw new Error('No se encontraron datos válidos para los períodos seleccionados.')

      // 4. Insert in parallel batches
      setProgress(`Guardando ${rows.length.toLocaleString()} registros...`)
      const BATCH = 1000
      const CONCURRENCY = 5
      const batches: object[][] = []
      for (let i = 0; i < rows.length; i += BATCH) {
        batches.push(rows.slice(i, i + BATCH).map(r => ({ ...r, report_id: report.id, user_id: user.id })))
      }

      let done = 0
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const chunk = batches.slice(i, i + CONCURRENCY)
        const results = await Promise.all(chunk.map(batch => db.from('royalty_records').insert(batch)))
        for (const { error: insertError } of results) {
          if (insertError) {
            await db.from('reports').update({ status: 'error', error_message: insertError.message }).eq('id', report.id)
            throw new Error(`Error al guardar registros: ${insertError.message}`)
          }
        }
        done += chunk.reduce((s, b) => s + b.length, 0)
        setProgress(`Guardando registros... ${Math.min(done, rows.length).toLocaleString()}/${rows.length.toLocaleString()}`)
      }

      // 5. Mark complete
      await db.from('reports').update({ status: 'completed', processed_at: new Date().toISOString() }).eq('id', report.id)

      // 6. Activity log
      const summaryWithSaved: ReportSummary = { ...parsedSummary, savedRows: rows.length }
      await db.from('activity_logs').insert({
        user_id: user.id,
        action: 'report_uploaded',
        details: {
          file_name:     pendingFile.name,
          records:       rows.length,
          report_id:     report.id,
          official_total: parsedSummary.officialReportTotal,
          detail_total:  parsedSummary.detailRowsTotal,
          currency:      parsedSummary.currency,
          summary_status: parsedSummary.status,
          selected_periods: [...selectedPeriods],
        },
      })

      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['reports-count'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })

      setSummary(summaryWithSaved)
      setReportId(report.id)
      setStatus('success')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo')
      setStatus('error')
    }
  }

  const reset = () => {
    setStatus('idle')
    setError('')
    setProgress('')
    setReportId('')
    setSummary(null)
    setPendingFile(null)
    setAvailablePeriods([])
    setSelectedPeriods(new Set())
    setOfficialTotal(null)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      'text/csv': ['.csv'],
      'text/tab-separated-values': ['.tsv'],
      'text/plain': ['.txt', '.tsv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    disabled: status !== 'idle',
  })

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 8 })

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Subir reporte</h1>
        <p className="text-text-muted mt-1">Sube tu reporte de DistroKid, TuneOrchard u otro distribuidor en formato CSV o Excel.</p>
      </motion.div>

      <AnimatePresence mode="wait">

        {/* ── STEP 1: DROPZONE ──────────────────────────────────── */}
        {status === 'idle' || status === 'detecting' ? (
          <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-border-light hover:bg-surface-2'}
                ${status === 'detecting' ? 'pointer-events-none opacity-70' : ''}
              `}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-4">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${isDragActive ? 'bg-primary/20' : 'bg-surface-2'}`}>
                  {status === 'detecting'
                    ? <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    : <CloudUpload className={`w-8 h-8 ${isDragActive ? 'text-primary' : 'text-text-muted'}`} />
                  }
                </div>
                {status === 'detecting' ? (
                  <div>
                    <p className="text-text-primary font-medium">Leyendo períodos disponibles...</p>
                    <p className="text-text-muted text-sm mt-1">Por favor espera...</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-text-primary font-medium">
                      {isDragActive ? 'Suelta el archivo aquí' : 'Arrastra tu reporte aquí'}
                    </p>
                    <p className="text-text-muted text-sm mt-1">o haz clic para seleccionar</p>
                    <p className="text-text-muted text-xs mt-3">CSV, TSV, XLS, XLSX · DistroKid, TuneOrchard, SoundOn y más</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 card-sm">
              <p className="text-text-secondary text-sm font-medium mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Formatos soportados
              </p>
              <ul className="text-text-muted text-sm space-y-1 list-disc list-inside">
                <li><strong className="text-text-secondary">DistroKid</strong> — CSV/TSV de Bank → Download earnings</li>
                <li><strong className="text-text-secondary">TuneOrchard / Global Sound Stars</strong> — Excel (.xlsx)</li>
                <li><strong className="text-text-secondary">SoundOn, TuneCore, CD Baby</strong> — CSV o Excel</li>
              </ul>
            </div>
          </motion.div>

        /* ── STEP 2: PERIOD SELECTION ──────────────────────────── */
        ) : status === 'selecting' ? (
          <motion.div key="selecting" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* File info */}
            <div className="card flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-text-primary text-sm font-medium truncate">{pendingFile?.name}</p>
                <p className="text-text-muted text-xs mt-0.5">
                  {availablePeriods.length} período{availablePeriods.length !== 1 ? 's' : ''} detectado{availablePeriods.length !== 1 ? 's' : ''}
                  {officialTotal !== null && <span className="ml-2">· Total oficial: <strong>{fmt(officialTotal)}</strong></span>}
                </p>
              </div>
            </div>

            {/* Period picker */}
            <div className="card space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-text-secondary text-sm font-medium flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Períodos disponibles
                </p>
                <div className="flex gap-2 text-xs">
                  <button onClick={selectAll}  className="text-primary hover:underline">Todos</button>
                  <span className="text-border">·</span>
                  <button onClick={selectNone} className="text-text-muted hover:underline">Ninguno</button>
                </div>
              </div>

              {availablePeriods.length === 0 ? (
                <p className="text-text-muted text-sm">No se detectaron períodos en este archivo.</p>
              ) : (
                <div className="space-y-1.5">
                  {availablePeriods.map(p => {
                    const isSelected = selectedPeriods.has(p)
                    const normalized = normalizeSalePeriod(p)
                    return (
                      <button
                        key={p}
                        onClick={() => togglePeriod(p)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors
                          ${isSelected
                            ? 'bg-primary/10 border border-primary/30'
                            : 'bg-surface-2 border border-transparent hover:border-border'
                          }`}
                      >
                        <span className={`text-lg leading-none ${isSelected ? 'opacity-100' : 'opacity-30'}`}>
                          {isSelected ? '✅' : '⬜'}
                        </span>
                        <span className="flex-1">
                          <span className={`text-sm font-medium ${isSelected ? 'text-text-primary' : 'text-text-muted'}`}>
                            {p}
                          </span>
                          {normalized !== p && (
                            <span className="text-xs text-text-muted ml-2">→ {normalized}</span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {error && (
                <p className="text-error text-xs">{error}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={reset} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button
                onClick={processFile}
                disabled={selectedPeriods.size === 0}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Analizar {selectedPeriods.size} período{selectedPeriods.size !== 1 ? 's' : ''}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>

        /* ── STEP 3: UPLOADING / PROCESSING ───────────────────── */
        ) : status === 'uploading' || status === 'processing' ? (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="card text-center py-12">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
              <p className="text-text-primary font-medium">{progress}</p>
              <p className="text-text-muted text-sm mt-1">Por favor espera...</p>
            </div>
          </motion.div>

        /* ── SUCCESS ──────────────────────────────────────────── */
        ) : status === 'success' ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4"
          >
            <div className="card text-center py-10">
              <div className="w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-text-primary font-semibold text-lg mb-1">¡Reporte procesado!</h3>
              <p className="text-text-muted text-sm mb-6">Los datos han sido analizados y guardados correctamente.</p>
              <div className="flex gap-3 justify-center">
                <button onClick={reset} className="btn-secondary">Subir otro</button>
                <button onClick={() => navigate(`/reports/${reportId}`)} className="btn-primary">Ver análisis</button>
              </div>
            </div>

            {summary && (
              <div className="card space-y-3">
                <p className="text-text-secondary text-sm font-medium flex items-center gap-2">
                  <Info className="w-4 h-4" /> Resumen del reporte
                </p>

                {/* Period breakdown panel */}
                {summary.periodBreakdown && (
                  <div className="rounded-xl border border-border overflow-hidden text-xs font-mono">
                    <div className="bg-surface-2 px-3 py-2 border-b border-border">
                      <p className="font-semibold text-text-primary">
                        PERÍODO BUSCADO: {summary.reportPeriod ?? [...selectedPeriods].join(', ')}
                      </p>
                    </div>
                    <div className="px-3 py-2 border-b border-border space-y-0.5">
                      <p className="font-semibold text-success mb-1">✅ PERÍODOS INCLUIDOS:</p>
                      {summary.periodBreakdown.included.map(p => (
                        <p key={p.period} className="text-text-secondary pl-2">
                          {p.period}
                          <span className="text-text-muted ml-2">({p.rows.toLocaleString()} filas)</span>
                        </p>
                      ))}
                    </div>
                    {summary.periodBreakdown.excluded.length > 0 && (
                      <div className="px-3 py-2 border-b border-border space-y-0.5">
                        <p className="font-semibold text-error mb-1">❌ PERÍODOS EXCLUIDOS:</p>
                        {summary.periodBreakdown.excluded.map(p => (
                          <p key={p} className="text-text-muted pl-2">{p}</p>
                        ))}
                      </div>
                    )}
                    <div className="bg-surface-2 px-3 py-2 space-y-0.5">
                      <p className="text-text-secondary">
                        REGISTROS ANALIZADOS: <strong className="text-text-primary">{summary.parsedRows?.toLocaleString()}</strong>
                      </p>
                      <p className="text-text-secondary">
                        TOTAL STREAMS: <strong className="text-text-primary">{summary.periodBreakdown.totalStreams.toLocaleString()}</strong>
                      </p>
                      <p className="text-text-secondary">
                        TOTAL REGALÍAS: <strong className="text-text-primary">{fmt(summary.periodBreakdown.totalEarnings)}</strong>
                      </p>
                    </div>
                  </div>
                )}

                {/* Truncation warning */}
                {summary.truncated && (
                  <div className="flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <div>
                      <p className="text-text-secondary text-xs font-medium">Archivo grande — limitado a 50,000 filas</p>
                      <p className="text-text-muted text-xs mt-0.5">
                        Se procesaron las primeras <strong className="text-text-secondary">{summary.parsedRows?.toLocaleString()}</strong> filas.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {summary.officialReportTotal !== null && (
                    <div className="bg-surface-2 rounded-xl p-3">
                      <p className="text-text-muted text-xs mb-1">Total oficial</p>
                      <p className="text-text-primary font-semibold text-base">{fmt(summary.officialReportTotal)}</p>
                      <p className="text-text-muted text-xs mt-0.5 opacity-70">{summary.source} · {summary.sheet} {summary.cell}</p>
                    </div>
                  )}
                  <div className="bg-surface-2 rounded-xl p-3">
                    <p className="text-text-muted text-xs mb-1">Suma de filas</p>
                    <p className="text-text-primary font-semibold text-base">{fmt(summary.detailRowsTotal)}</p>
                    <p className="text-text-muted text-xs mt-0.5 opacity-70">{summary.currency}</p>
                  </div>
                </div>

                {summary.officialReportTotal !== null && Math.abs(summary.difference) > 0.001 && (
                  <div className="flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                    <div>
                      <p className="text-text-secondary text-xs font-medium">Diferencia detectada</p>
                      <p className="text-text-muted text-xs mt-0.5">
                        El total oficial difiere en <strong className="text-text-secondary">{fmt(Math.abs(summary.difference))}</strong> ({summary.differencePercent}%)
                      </p>
                    </div>
                  </div>
                )}

                {summary.officialReportTotal === null && (
                  <div className="flex items-start gap-2 bg-surface-2 rounded-xl p-3">
                    <Info className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
                    <p className="text-text-muted text-xs">No se encontró un total oficial. Se usa la suma de las filas de detalle.</p>
                  </div>
                )}
              </div>
            )}
          </motion.div>

        /* ── ERROR ────────────────────────────────────────────── */
        ) : (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card text-center py-12"
          >
            <div className="w-16 h-16 bg-error/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-error" />
            </div>
            <h3 className="text-text-primary font-semibold text-lg mb-2">Error al procesar</h3>
            <p className="text-text-muted text-sm mb-6 max-w-sm mx-auto">{error}</p>
            <button onClick={reset} className="btn-primary">Intentar de nuevo</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
