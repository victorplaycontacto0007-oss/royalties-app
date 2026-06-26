import { useState, useEffect } from 'react'
import { useUpdateCommission } from '../../hooks/useCommissions'
import type { Commission, CommissionStatus, UpdateCommissionPayload } from '../../types/referrals'
import { X, Loader2, AlertTriangle } from 'lucide-react'

const STATUSES: CommissionStatus[] = ['Pendiente', 'Aprobada', 'Pagada', 'Rechazada', 'Cancelada']

interface Props {
  commission: Commission
  onClose: () => void
  onSuccess?: () => void
}

export default function CommissionEditModal({ commission, onClose, onSuccess }: Props) {
  const updateMutation = useUpdateCommission()

  const [amount, setAmount]       = useState(commission.purchase_amount_usd)
  const [pct, setPct]             = useState(commission.commission_percentage)
  const [commAmt, setCommAmt]     = useState(commission.commission_amount)
  const [status, setStatus]       = useState<CommissionStatus>(commission.status)
  const [notes, setNotes]         = useState(commission.notes ?? '')
  const [confirmPaid, setConfirmPaid] = useState(false)
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')

  // Require explicit confirmation if already Pagada
  const isPaid = commission.status === 'Pagada'

  const validate = () => {
    const e: Record<string, string> = {}
    if (amount <= 0) e.amount = 'El monto debe ser mayor a 0'
    if (pct < 0.01 || pct > 100) e.pct = 'Porcentaje entre 0.01 y 100'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = async () => {
    setSubmitError('')
    if (isPaid && !confirmPaid) return
    if (!validate()) return

    const payload: UpdateCommissionPayload = {
      purchase_amount_usd:   amount,
      commission_percentage: pct,
      commission_amount:     commAmt,
      status,
      notes: notes.trim() || undefined,
    }

    try {
      await updateMutation.mutateAsync({ id: commission.id, payload })
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-text-primary text-sm">Editar comisión</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Warning for Pagada */}
          {isPaid && (
            <div className="flex gap-3 p-3 rounded-xl bg-warning/10 border border-warning/20">
              <AlertTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-warning text-xs font-semibold">Comisión ya pagada</p>
                <p className="text-text-secondary text-xs mt-0.5">
                  Estás editando una comisión marcada como Pagada. Confirma que deseas continuar.
                </p>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input type="checkbox" checked={confirmPaid} onChange={e => setConfirmPaid(e.target.checked)}
                    className="rounded" />
                  <span className="text-xs text-text-secondary">Sí, deseo editar esta comisión</span>
                </label>
              </div>
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Monto compra (USD)</label>
              <input type="number" min="0.01" step="0.01" value={amount}
                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                disabled={isPaid && !confirmPaid} className="input" />
              {errors.amount && <p className="text-error text-xs mt-1">{errors.amount}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Porcentaje (%)</label>
              <input type="number" min="0.01" max="100" step="0.01" value={pct}
                onChange={e => setPct(parseFloat(e.target.value) || 0)}
                disabled={isPaid && !confirmPaid} className="input" />
              {errors.pct && <p className="text-error text-xs mt-1">{errors.pct}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Comisión (USD)</label>
            <input type="number" min="0" step="0.01" value={commAmt}
              onChange={e => setCommAmt(parseFloat(e.target.value) || 0)}
              disabled={isPaid && !confirmPaid} className="input font-semibold" />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value as CommissionStatus)}
              disabled={isPaid && !confirmPaid} className="input">
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} disabled={isPaid && !confirmPaid} className="input resize-none" />
          </div>

          {submitError && (
            <p className="text-error text-xs bg-error/10 border border-error/20 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={handleSave}
            disabled={updateMutation.isPending || (isPaid && !confirmPaid)}
            className="btn-primary flex-1">
            {updateMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Guardando...</>
              : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
