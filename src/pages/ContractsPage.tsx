import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate } from '../lib/utils'
import {
  FileText, Plus, Pencil, Trash2, Loader2, X, Check,
  Users, Calendar, ChevronDown, ChevronUp
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Contract, ContractSplit } from '../types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const ROLE_COLORS: Record<string, string> = {
  artist:   'text-primary bg-primary/10',
  label:    'text-accent bg-accent/10',
  producer: 'text-success bg-success/10',
  other:    'text-text-secondary bg-surface-3',
}

const ROLE_LABELS: Record<string, string> = {
  artist: 'Artista', label: 'Sello', producer: 'Productor', other: 'Otro',
}

export default function ContractsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm]     = useState(false)
  const [editContract, setEdit]     = useState<Contract | null>(null)
  const [expanded, setExpanded]     = useState<string | null>(null)
  const [deleteId, setDeleteId]     = useState<string | null>(null)
  const [deleting, setDeleting]     = useState(false)

  const { data: contracts, isLoading } = useQuery<Contract[]>({
    queryKey: ['contracts', user?.id],
    queryFn: async () => {
      const { data: cs, error } = await db
        .from('contracts')
        .select('*, splits:contract_splits(*)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (cs ?? []) as Contract[]
    },
    enabled: !!user,
  })

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    await db.from('contracts').delete().eq('id', deleteId)
    queryClient.invalidateQueries({ queryKey: ['contracts'] })
    setDeleteId(null)
    setDeleting(false)
  }

  const totalPct = (splits: ContractSplit[]) =>
    splits.reduce((a, s) => a + Number(s.percentage), 0)

  return (
    <div className="p-8">
      <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }}
        className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" /> Contratos & Splits
          </h1>
          <p className="text-text-muted mt-1">Define cómo se distribuyen las regalías por artista</p>
        </div>
        <button onClick={() => { setEdit(null); setShowForm(true) }}
          className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo contrato
        </button>
      </motion.div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>
      ) : !contracts?.length ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 bg-surface-2 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-text-muted" />
          </div>
          <h3 className="text-text-primary font-semibold mb-2">Sin contratos</h3>
          <p className="text-text-muted text-sm mb-6 max-w-sm mx-auto">
            Crea contratos para definir el porcentaje de regalías por artista, sello y productor.
          </p>
          <button onClick={() => setShowForm(true)} className="btn-primary">Crear primer contrato</button>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c, i) => {
            const splits  = c.splits ?? []
            const pct     = totalPct(splits)
            const isOpen  = expanded === c.id
            return (
              <motion.div key={c.id}
                initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                transition={{ delay:i*0.04 }}
                className="card p-0 overflow-hidden">
                {/* Header row */}
                <div className="flex items-center gap-4 px-6 py-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-text-primary font-medium">{c.artist_name}</p>
                      <span className={`badge ${c.is_active ? 'badge-success' : 'badge-error'}`}>
                        {c.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-text-muted text-xs">{c.label}</p>
                      {c.start_date && (
                        <p className="text-text-muted text-xs flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Desde {formatDate(c.start_date)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Split pills */}
                  <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">
                    {splits.map(s => (
                      <span key={s.id} className={`badge ${ROLE_COLORS[s.role] ?? ROLE_COLORS.other}`}>
                        {s.participant} {s.percentage}%
                      </span>
                    ))}
                    {pct !== 100 && (
                      <span className="badge badge-warning">⚠ {pct}% / 100%</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEdit(c); setShowForm(true) }}
                      className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteId(c.id)}
                      className="p-1.5 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setExpanded(isOpen ? null : c.id)}
                      className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors ml-1">
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div initial={{ height:0 }} animate={{ height:'auto' }} exit={{ height:0 }}
                      className="overflow-hidden border-t border-border">
                      <div className="px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Split table */}
                          <div>
                            <p className="text-text-secondary text-xs font-semibold mb-3">Distribución de regalías</p>
                            <div className="space-y-2">
                              {splits.map(s => (
                                <div key={s.id} className="flex items-center gap-3">
                                  <span className={`badge ${ROLE_COLORS[s.role] ?? ROLE_COLORS.other} text-xs`}>
                                    {ROLE_LABELS[s.role] ?? s.role}
                                  </span>
                                  <span className="text-text-primary text-sm flex-1">{s.participant}</span>
                                  <div className="w-24 h-2 bg-surface-3 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full bg-primary"
                                      style={{ width:`${s.percentage}%` }} />
                                  </div>
                                  <span className="text-text-primary text-sm font-semibold w-12 text-right">
                                    {s.percentage}%
                                  </span>
                                </div>
                              ))}
                              {pct !== 100 && (
                                <p className="text-warning text-xs mt-2">
                                  ⚠ El total es {pct}% — debe sumar 100%
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Example calculation */}
                          <div>
                            <p className="text-text-secondary text-xs font-semibold mb-3">Ejemplo de liquidación ($100 brutos)</p>
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-sm">
                                <span className="text-text-muted">💰 Ingresos brutos</span>
                                <span className="text-text-primary font-semibold">$100.00</span>
                              </div>
                              {splits.map(s => (
                                <div key={s.id} className="flex justify-between text-sm">
                                  <span className="text-text-secondary">
                                    {s.role === 'label' ? '🏢' : s.role === 'artist' ? '🎤' : '🎵'} {s.participant} ({s.percentage}%)
                                  </span>
                                  <span className="text-primary font-medium">${(100 * Number(s.percentage) / 100).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        {c.notes && (
                          <p className="text-text-muted text-xs mt-4 border-t border-border pt-3">{c.notes}</p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Contract Form Modal */}
      <AnimatePresence>
        {showForm && (
          <ContractFormModal
            contract={editContract}
            userId={user!.id}
            onClose={() => { setShowForm(false); setEdit(null) }}
            onSuccess={() => {
              setShowForm(false); setEdit(null)
              queryClient.invalidateQueries({ queryKey: ['contracts'] })
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDeleteId(null)}>
            <motion.div initial={{ scale:0.95 }} animate={{ scale:1 }} exit={{ scale:0.95 }}
              className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}>
              <h3 className="text-text-primary font-semibold mb-2">¿Eliminar contrato?</h3>
              <p className="text-text-muted text-sm mb-6">Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleDelete} disabled={deleting}
                  className="btn-danger flex-1 flex items-center justify-center gap-2">
                  {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Contract Form Modal ────────────────────────────────────────
interface SplitRow { participant: string; role: string; percentage: string }

function ContractFormModal({ contract, userId, onClose, onSuccess }: {
  contract: Contract | null
  userId: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [artistName, setArtistName] = useState(contract?.artist_name ?? '')
  const [label,      setLabel]      = useState(contract?.label ?? 'Mi Sello')
  const [notes,      setNotes]      = useState(contract?.notes ?? '')
  const [startDate,  setStartDate]  = useState(contract?.start_date ?? '')
  const [endDate,    setEndDate]    = useState(contract?.end_date ?? '')
  const [isActive,   setIsActive]   = useState(contract?.is_active ?? true)

  const initSplits = (): SplitRow[] =>
    contract?.splits?.map(s => ({
      participant: s.participant,
      role: s.role,
      percentage: String(s.percentage),
    })) ?? [
      { participant: 'Sello', role: 'label', percentage: '60' },
      { participant: 'Artista', role: 'artist', percentage: '40' },
    ]

  const [splits,  setSplits]  = useState<SplitRow[]>(initSplits)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const totalPct = splits.reduce((a, s) => a + (parseFloat(s.percentage) || 0), 0)

  const addSplit = () => setSplits([...splits, { participant: '', role: 'other', percentage: '0' }])
  const removeSplit = (i: number) => setSplits(splits.filter((_, idx) => idx !== i))
  const updateSplit = (i: number, field: keyof SplitRow, val: string) =>
    setSplits(splits.map((s, idx) => idx === i ? { ...s, [field]: val } : s))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!artistName.trim()) { setError('El nombre del artista es requerido'); return }
    if (Math.abs(totalPct - 100) > 0.01) { setError(`Los porcentajes deben sumar 100% (actualmente ${totalPct.toFixed(1)}%)`); return }

    setLoading(true); setError('')
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db2 = supabase as any
      let contractId = contract?.id

      if (contract) {
        await db2.from('contracts').update({
          artist_name: artistName, label, notes: notes || null,
          start_date: startDate || null, end_date: endDate || null, is_active: isActive,
        }).eq('id', contract.id)
        await db2.from('contract_splits').delete().eq('contract_id', contract.id)
      } else {
        const { data, error: err } = await db2.from('contracts').insert({
          user_id: userId, artist_name: artistName, label,
          notes: notes || null, start_date: startDate || null,
          end_date: endDate || null, is_active: isActive,
        }).select().single()
        if (err) throw err
        contractId = data.id
      }

      const splitRows = splits.map(s => ({
        contract_id: contractId,
        participant: s.participant,
        role: s.role,
        percentage: parseFloat(s.percentage),
      }))
      await db2.from('contract_splits').insert(splitRows)
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}>
      <motion.div initial={{ scale:0.95, y:10 }} animate={{ scale:1, y:0 }} exit={{ scale:0.95 }}
        className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg my-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-text-primary font-semibold">
            {contract ? 'Editar contrato' : 'Nuevo contrato'}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Artist info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Artista *</label>
              <input value={artistName} onChange={e => setArtistName(e.target.value)}
                className="input" placeholder="eminenvic" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Sello / Empresa</label>
              <input value={label} onChange={e => setLabel(e.target.value)}
                className="input" placeholder="Mi Sello" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Fecha inicio</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Fecha fin (opcional)</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input" />
            </div>
          </div>

          {/* Splits */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-text-secondary">Distribución de regalías</label>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${Math.abs(totalPct-100) < 0.01 ? 'text-success' : 'text-warning'}`}>
                  {totalPct.toFixed(1)}% / 100%
                </span>
                <button type="button" onClick={addSplit}
                  className="text-xs text-primary hover:text-primary-hover flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Añadir
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {splits.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={s.participant} onChange={e => updateSplit(i,'participant',e.target.value)}
                    placeholder="Nombre" className="input text-sm py-2 flex-1" />
                  <select value={s.role} onChange={e => updateSplit(i,'role',e.target.value)}
                    className="input text-sm py-2 w-28">
                    <option value="artist">Artista</option>
                    <option value="label">Sello</option>
                    <option value="producer">Productor</option>
                    <option value="other">Otro</option>
                  </select>
                  <div className="relative w-20">
                    <input type="number" min="0" max="100" step="0.01"
                      value={s.percentage} onChange={e => updateSplit(i,'percentage',e.target.value)}
                      className="input text-sm py-2 pr-5 text-right" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted text-xs">%</span>
                  </div>
                  <button type="button" onClick={() => removeSplit(i)}
                    className="p-1.5 text-text-muted hover:text-error transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Live preview */}
            {splits.length > 0 && (
              <div className="mt-3 p-3 bg-surface-2 rounded-lg">
                <p className="text-text-muted text-xs mb-2">Vista previa con $100 brutos:</p>
                <div className="space-y-1">
                  {splits.map((s, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-text-secondary">
                        {s.role === 'label' ? '🏢' : s.role === 'artist' ? '🎤' : '🎵'} {s.participant || '—'} ({s.percentage || 0}%)
                      </span>
                      <span className="text-primary font-medium">
                        ${(100 * (parseFloat(s.percentage)||0) / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Notas (opcional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="input resize-none" rows={2} placeholder="Condiciones especiales, observaciones..." />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => setIsActive(!isActive)}
                className={`w-9 h-5 rounded-full transition-colors ${isActive ? 'bg-primary' : 'bg-surface-3'} relative`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-text-secondary text-sm">Contrato activo</span>
            </label>
          </div>

          {error && (
            <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2">
              <p className="text-error text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {contract ? 'Guardar cambios' : 'Crear contrato'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
