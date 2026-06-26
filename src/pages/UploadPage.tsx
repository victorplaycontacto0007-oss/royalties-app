import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { supabase } from '../lib/supabase'
import { saveCurrencyRecords } from '../lib/currencyRecords'
import { useAuth } from '../contexts/AuthContext'
import { detectAvailablePeriods, normalizeSalePeriod } from '../lib/distrokid-parser'
import { parseFile } from '../royalty-engine'
import type { RUPEStats, AuditReport, DebugSnapshot } from '../royalty-engine'
import {
  FileText, CheckCircle, XCircle, Loader2, CloudUpload,
  AlertTriangle, Calendar, ChevronRight,
} from 'lucide-react'
import AuditSummary from '../components/AuditSummary'
import DebugViewer from '../components/DebugViewer'
import CurrencyTab from '../components/CurrencyTab'
import { convertCurrencies, type TargetCurrency, type ConversionResult } from '../royalty-engine/CurrencyConverter'
import { motion, AnimatePresence } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

type UploadStatus = 'idle' | 'detecting' | 'selecting' | 'uploading' | 'processing' | 'saving' | 'success' | 'discrepancy' | 'error'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

function sortPeriods(periods: string[]): string[] {
  return [...periods].sort((a, b) => normalizeSalePeriod(a).localeCompare(normalizeSalePeriod(b)))
}

function fmt(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function UploadPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const [status, setStatus]         = useState<UploadStatus>('idle')
  const [error, setError]           = useState('')
  const [progress, setProgress]     = useState('')
  const [reportId, setReportId]     = useState('')
  const [stats, setStats]           = useState<RUPEStats | null>(null)
  const [audit, setAudit]           = useState<AuditReport | null>(null)
  const [debug, setDebug]           = useState<DebugSnapshot | null>(null)
  const [isDebugOpen, setIsDebugOpen] = useState(false)

  // payment-column-strategy: currency tab state
  const [activeTab, setActiveTab]             = useState<'audit' | 'currencies'>('audit')
  const [converting, setConverting]           = useState(false)
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null)
  const [conversionError, setConversionError]   = useState<string | null>(null)

  const [pendingFile, setPendingFile]               = useState<File | null>(null)
  const [availablePeriods, setAvailablePeriods]     = useState<string[]>([])
  const [officialTotal, setOfficialTotal]           = useState<number | null>(null)
  const [selectedPeriods, setSelectedPeriods]       = useState<Set<string>>(new Set())

  // STEP 1: detect periods
  const handleFileDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0]
    if (!file || !user) return
    setStatus('detecting'); setError(''); setStats(null); setPendingFile(file)
    try {
      const result = await detectAvailablePeriods(file)
      const sorted = sortPeriods(result.availablePeriods)
      setAvailablePeriods(sorted)
      setOfficialTotal(result.officialTotal)
      setSelectedPeriods(new Set(sorted))
      setStatus('selecting')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al leer el archivo')
      setStatus('error')
    }
  }, [user])

  const togglePeriod = (p: string) => {
    setSelectedPeriods(prev => { const n = new Set(prev); n.has(p) ? n.delete(p) : n.add(p); return n })
  }
  const selectAll  = () => setSelectedPeriods(new Set(availablePeriods))
  const selectNone = () => setSelectedPeriods(new Set())

  // STEP 3: parse and save using RUPE
  const processFile = async () => {
    if (!user || !pendingFile) return
    if (selectedPeriods.size === 0) { setError('Selecciona al menos un período.'); return }

    setStatus('uploading'); setError('')
    try {
      // 1. Upload to Storage
      setProgress('Subiendo archivo...')
      const filePath = `${user.id}/${Date.now()}-${pendingFile.name}`
      const { error: storageError } = await supabase.storage.from('reports').upload(filePath, pendingFile)
      if (storageError) throw storageError

      // 2. Create report record
      setProgress('Registrando reporte...')
      const { data: report, error: reportError } = await db.from('reports').insert({
        user_id: user.id, file_name: pendingFile.name, file_path: filePath,
        file_size: pendingFile.size,
        file_type: pendingFile.type || pendingFile.name.split('.').pop() || 'unknown',
        status: 'processing',
      }).select().single()
      if (reportError) throw reportError

      // 3. Parse with RUPE
      setStatus('processing'); setProgress('Analizando reporte con RUPE...')
      const { rows: allRows, stats: parsedStats, audit: parsedAudit, debug: parsedDebug } = await parseFile(pendingFile, {
        onProgress: (processed, total) => {
          setProgress(`Procesando... ${processed.toLocaleString()} / ${total > 0 ? total.toLocaleString() : '?'} filas`)
        },
      })

      // Filter by selected periods
      const selNorm = new Set([...selectedPeriods].map(p => normalizeSalePeriod(p)))
      const rows = selNorm.size > 0
        ? allRows.filter(r => selNorm.has(r.sale_period))
        : allRows

      if (rows.length === 0) throw new Error('No se encontraron datos válidos para los períodos seleccionados.')

      // 4. Insert in parallel batches
      setStatus('saving')
      setProgress(`Guardando ${rows.length.toLocaleString()} registros...`)
      const BATCH = 1000, CONCURRENCY = 5
      const batches: object[][] = []
      for (let i = 0; i < rows.length; i += BATCH) {
        batches.push(rows.slice(i, i + BATCH).map(r => ({
          report_id:   report.id,
          user_id:     user.id,
          sale_period: r.sale_period,
          store:       r.platform,
          country:     r.country,
          artist_name: r.artist,
          song_title:  r.track,
          album_name:  r.album,
          quantity:    r.quantity,
          earnings_usd: r.net_total,
        })))
      }
      let done = 0
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const chunk = batches.slice(i, i + CONCURRENCY)
        const results = await Promise.all(chunk.map(b => db.from('royalty_records').insert(b)))
        for (const { error: insErr } of results) {
          if (insErr) {
            await db.from('reports').update({ status: 'error', error_message: insErr.message }).eq('id', report.id)
            throw new Error(`Error al guardar: ${insErr.message}`)
          }
        }
        done += chunk.reduce((s, b) => s + b.length, 0)
        setProgress(`Guardando... ${Math.min(done, rows.length).toLocaleString()}/${rows.length.toLocaleString()}`)
      }

      // 5. Mark complete with V2 audit fields
      await db.from('reports').update({
        status: 'completed',
        processed_at: new Date().toISOString(),
        provider: parsedStats.provider,
        currency: parsedStats.currency,
        net_total: parsedStats.totalNet,
        gross_total: parsedStats.totalGross,
        taxes: parsedStats.totalTaxes,
        channel_costs: parsedStats.totalCosts,
        other_costs: 0,
        audit_status: parsedAudit.status,
        discrepancy_note: parsedAudit.discrepancyNote,
        processing_ms: parsedAudit.processingTimeMs,
        reported_month: parsedAudit.reportedMonth,
        total_columns: parsedAudit.totalColumns,
        error_rows: parsedAudit.errorRows,
      }).eq('id', report.id)

      // 5b. Save currency records (payment-column-currency-strategy, Req 9.2, 9.3)
      void saveCurrencyRecords(
        report.id,
        user.id,
        parsedStats.provider,
        parsedStats.paymentColumnUsed ?? '',
        parsedStats.currencyGroups ?? [],
      ).catch(console.error)

      // 6. Activity log
      await db.from('activity_logs').insert({
        user_id: user.id, action: 'report_uploaded',
        details: {
          file_name: pendingFile.name, records: rows.length, report_id: report.id,
          total_net: parsedStats.totalNet, currency: parsedStats.currency,
          provider: parsedStats.provider, selected_periods: [...selectedPeriods],
        },
      })

      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['reports-count'] })
      queryClient.invalidateQueries({ queryKey: ['reports'] })

      setStats({ ...parsedStats, totalRows: rows.length })
      setReportId(report.id)
      setAudit(parsedAudit)
      setDebug(parsedDebug ?? null)
      setStatus(parsedAudit.status === 'discrepancy' ? 'discrepancy' : 'success')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo')
      setStatus('error')
    }
  }

  const handleConvert = async (target: TargetCurrency) => {
    if (!stats || converting) return
    setConverting(true)
    setConversionError(null)
    try {
      const result = await convertCurrencies(stats.currencyGroups, target)
      setConversionResult(result)
    } catch {
      setConversionError('Error al obtener tasas de cambio. Intenta de nuevo.')
    } finally {
      setConverting(false)
    }
  }

  const reset = () => {
    setStatus('idle'); setError(''); setProgress(''); setReportId('')
    setStats(null); setAudit(null); setDebug(null); setIsDebugOpen(false)
    setPendingFile(null); setAvailablePeriods([]); setSelectedPeriods(new Set()); setOfficialTotal(null)
    setActiveTab('audit'); setConversionResult(null); setConversionError(null)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      'text/csv': ['.csv'], 'text/tab-separated-values': ['.tsv'],
      'text/plain': ['.txt', '.tsv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
    },
    maxFiles: 1, disabled: status !== 'idle',
  })

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
                    <p className="text-text-muted text-xs mt-3">CSV, TSV, XLS, XLSX, ODS · DistroKid, TuneOrchard, SoundOn y más</p>
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

        /* ── STEP 3: UPLOADING / PROCESSING / SAVING ─────────────── */
        ) : status === 'uploading' || status === 'processing' || status === 'saving' ? (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="card text-center py-12">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
              <p className="text-text-primary font-medium">{progress}</p>
              <p className="text-text-muted text-sm mt-1">Por favor espera...</p>
            </div>
          </motion.div>

        /* ── SUCCESS ──────────────────────────────────────────── */
        ) : status === 'success' ? (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
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

            {stats && audit && (
              <AuditSummary
                audit={audit}
                stats={stats}
                onViewAudit={() => setIsDebugOpen(true)}
                onViewAnalysis={() => navigate(`/reports/${reportId}`)}
              />
            )}

            {/* Processing log */}
            {stats && stats.processingLog.length > 0 && (
              <details className="rounded-xl border border-border overflow-hidden text-xs font-mono">
                <summary className="bg-surface-2 px-3 py-2 cursor-pointer text-text-secondary font-semibold">
                  🔍 Log de procesamiento ({stats.processingLog.length} entradas)
                </summary>
                <div className="px-3 py-2 space-y-0.5 max-h-48 overflow-y-auto">
                  {stats.processingLog.map((line, i) => (
                    <p key={i} className={`text-[10px] leading-relaxed ${
                      line.includes('[ERROR]') ? 'text-error' :
                      line.includes('[WARN]')  ? 'text-warning' : 'text-text-muted'
                    }`}>{line}</p>
                  ))}
                </div>
              </details>
            )}

            {/* Debug Viewer modal */}
            {debug && audit && (
              <DebugViewer
                debug={debug}
                audit={audit}
                isOpen={isDebugOpen}
                onClose={() => setIsDebugOpen(false)}
              />
            )}
          </motion.div>

        /* ── DISCREPANCY ──────────────────────────────────────── */
        ) : status === 'discrepancy' ? (
          <motion.div key="discrepancy" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="card text-center py-10">
              <div className="w-16 h-16 bg-warning/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-warning" />
              </div>
              <h3 className="text-text-primary font-semibold text-lg mb-1">Reporte importado con advertencia</h3>
              <p className="text-text-muted text-sm mb-3">Los datos se guardaron, pero se detectó una discrepancia en los totales.</p>
              {audit?.discrepancyNote && (
                <p className="text-warning text-xs bg-warning/5 border border-warning/20 rounded-xl px-4 py-2 mx-auto max-w-sm mb-6">
                  {audit.discrepancyNote}
                </p>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={reset} className="btn-secondary">Subir otro</button>
                <button onClick={() => setIsDebugOpen(true)} className="btn-primary">Ver Auditoría</button>
              </div>
            </div>

            {stats && audit && (
              <>
                {stats.currencyGroups && stats.currencyGroups.length > 0 && (
                  <div className="flex gap-1 border-b border-border mb-2">
                    {(['audit', 'currencies'] as const).map(tab => (
                      <button key={tab} onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                          activeTab === tab
                            ? 'border-primary text-primary'
                            : 'border-transparent text-text-secondary hover:text-text-primary'
                        }`}>
                        {tab === 'audit' ? 'Auditoría' : (
                          <>Monedas <span className="badge badge-primary ml-1">{stats.currencyGroups.length}</span></>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {activeTab === 'audit' && (
                  <AuditSummary audit={audit} stats={stats}
                    onViewAudit={() => setIsDebugOpen(true)}
                    onViewAnalysis={() => navigate(`/reports/${reportId}`)} />
                )}
                {activeTab === 'currencies' && (
                  <CurrencyTab groups={stats.currencyGroups} onConvert={handleConvert}
                    converting={converting} conversionResult={conversionResult}
                    conversionError={conversionError} />
                )}
              </>
            )}

            {/* Processing log */}
            {stats && stats.processingLog.length > 0 && (
              <details className="rounded-xl border border-border overflow-hidden text-xs font-mono">
                <summary className="bg-surface-2 px-3 py-2 cursor-pointer text-text-secondary font-semibold">
                  🔍 Log de procesamiento ({stats.processingLog.length} entradas)
                </summary>
                <div className="px-3 py-2 space-y-0.5 max-h-48 overflow-y-auto">
                  {stats.processingLog.map((line, i) => (
                    <p key={i} className={`text-[10px] leading-relaxed ${
                      line.includes('[ERROR]') ? 'text-error' :
                      line.includes('[WARN]')  ? 'text-warning' : 'text-text-muted'
                    }`}>{line}</p>
                  ))}
                </div>
              </details>
            )}

            {/* Debug Viewer modal */}
            {debug && audit && (
              <DebugViewer
                debug={debug}
                audit={audit}
                isOpen={isDebugOpen}
                onClose={() => setIsDebugOpen(false)}
              />
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
