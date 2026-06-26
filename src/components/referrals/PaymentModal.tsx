import { useState } from 'react'
import { useMarkCommissionPaid } from '../../hooks/useCommissions'
import type { Commission, PaymentMethod, MarkPaidPayload } from '../../types/referrals'
import { X, Loader2 } from 'lucide-react'

const PAYMENT_METHODS: PaymentMethod[] = ['PayPal', 'Bold', 'Transferencia', 'Otro']

interface Props {
  commission: Commission
  onClose: () => void
  onSuccess?: () => void
}

export default function PaymentModal({ commission, onClose, onSuccess }: Props) {
  const markPaidMutation = useMarkCommissionPaid()

  const [paidAt, setPaidAt]           = useState('')
  const [method, setMethod]           = useState<PaymentMethod>('Transferencia')
  const [proof, setProof]             = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [dateError, setDateError]     = useState('')
  const [submitError, setSubmitError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    setDateError('')

    if (!paidAt) {
      setDateError('La fecha de pago es obligatoria')
      return
    }

    const payload: MarkPaidPayload = {
      paid_at:        new Date(paidAt).toISOString(),
      payment_method: method,
      payment_proof:  proof.trim() || undefined,
      payment_notes:  paymentNotes.trim() || undefined,
    }

    try {
      await markPaidMutation.mutateAsync({ id: commission.id, payload })
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error al registrar el pago')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="font-semibold text-text-primary text-sm">Registrar pago</h2>
            <p className="text-text-muted text-xs mt-0.5">
              Comisión de ${commission.commission_amount.toFixed(2)} USD
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Fecha del pago *</label>
              <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)}
                className="input" />
              {dateError && <p className="text-error text-xs mt-1">{dateError}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Método de pago</label>
              <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}
                className="input">
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Comprobante <span className="text-text-muted font-normal">(URL o referencia, opcional)</span>
              </label>
              <input type="text" value={proof} onChange={e => setProof(e.target.value)}
                placeholder="https://... o código de transacción" className="input" />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Observaciones</label>
              <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)}
                rows={2} className="input resize-none" />
            </div>

            {submitError && (
              <p className="text-error text-xs bg-error/10 border border-error/20 rounded-lg px-3 py-2">
                {submitError}
              </p>
            )}
          </div>

          <div className="flex gap-3 px-6 py-4 border-t border-border">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={markPaidMutation.isPending} className="btn-primary flex-1">
              {markPaidMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Guardando...</>
                : 'Confirmar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
