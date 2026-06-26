import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useCommissionCalculator } from '../../hooks/useCommissionCalculator'
import { useCreateCommission } from '../../hooks/useCommissions'
import { useAuth } from '../../contexts/AuthContext'
import type { PaymentMethod, CreateCommissionPayload } from '../../types/referrals'
import { Loader2 } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface UserOption { id: string; label: string }

const PAYMENT_METHODS: PaymentMethod[] = ['PayPal', 'Bold', 'Transferencia', 'Otro']

export default function CommissionForm({ onSuccess }: { onSuccess?: () => void }) {
  const { profile } = useAuth()
  const createMutation = useCreateCommission()

  const [users, setUsers]               = useState<UserOption[]>([])
  const [affiliateId, setAffiliateId]   = useState('')
  const [buyerId, setBuyerId]           = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Bold')
  const [purchaseAmount, setPurchaseAmount] = useState<number>(0)
  const [percentage, setPercentage]     = useState<number>(20)
  const [notes, setNotes]               = useState('')
  const [errors, setErrors]             = useState<Record<string, string>>({})
  const [submitError, setSubmitError]   = useState('')

  const { commission, isManualOverride, setManualCommission } =
    useCommissionCalculator(purchaseAmount, percentage)

  // Load all profiles for selectors
  useEffect(() => {
    db.from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }: { data: Array<{ id: string; full_name: string | null; email: string }> | null }) => {
        setUsers((data ?? []).map(u => ({
          id:    u.id,
          label: `${u.full_name ?? '(sin nombre)'} — ${u.email}`,
        })))
      })
  }, [])

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!affiliateId)         e.affiliateId     = 'Selecciona un afiliado'
    if (!buyerId)             e.buyerId         = 'Selecciona el usuario comprador'
    if (affiliateId === buyerId && affiliateId)
                              e.buyerId         = 'El afiliado y el comprador deben ser distintos'
    if (purchaseAmount <= 0)  e.purchaseAmount  = 'El monto debe ser mayor a 0'
    if (percentage < 0.01 || percentage > 100)
                              e.percentage      = 'El porcentaje debe estar entre 0.01 y 100'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError('')
    if (!validate()) return

    const payload: CreateCommissionPayload = {
      affiliate_id:          affiliateId,
      buyer_id:              buyerId,
      purchase_amount_usd:   purchaseAmount,
      commission_percentage: percentage,
      commission_amount:     commission,
      payment_method:        paymentMethod,
      notes:                 notes.trim() || undefined,
    }

    try {
      await createMutation.mutateAsync(payload)
      // Reset form
      setAffiliateId('')
      setBuyerId('')
      setPurchaseAmount(0)
      setPercentage(20)
      setNotes('')
      setErrors({})
      onSuccess?.()
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error al registrar la comisión')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Afiliado */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Afiliado *</label>
        <select value={affiliateId} onChange={e => setAffiliateId(e.target.value)}
          className="input">
          <option value="">— Selecciona un afiliado —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
        {errors.affiliateId && <p className="text-error text-xs mt-1">{errors.affiliateId}</p>}
      </div>

      {/* Comprador */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Usuario que compró *</label>
        <select value={buyerId} onChange={e => setBuyerId(e.target.value)}
          className="input">
          <option value="">— Selecciona el comprador —</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
        {errors.buyerId && <p className="text-error text-xs mt-1">{errors.buyerId}</p>}
      </div>

      {/* Método de pago */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Método de pago *</label>
        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
          className="input">
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Monto + Porcentaje */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Monto de compra (USD) *</label>
          <input type="number" min="0.01" step="0.01" value={purchaseAmount || ''}
            onChange={e => setPurchaseAmount(parseFloat(e.target.value) || 0)}
            placeholder="0.00" className="input" />
          {errors.purchaseAmount && <p className="text-error text-xs mt-1">{errors.purchaseAmount}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Porcentaje (%) *</label>
          <input type="number" min="0.01" max="100" step="0.01" value={percentage || ''}
            onChange={e => setPercentage(parseFloat(e.target.value) || 0)}
            placeholder="20" className="input" />
          {errors.percentage && <p className="text-error text-xs mt-1">{errors.percentage}</p>}
        </div>
      </div>

      {/* Comisión calculada / editable */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">
          Comisión (USD)
          {isManualOverride && (
            <span className="ml-2 text-warning text-[10px]">· valor modificado manualmente</span>
          )}
        </label>
        <input type="number" min="0" step="0.01"
          value={commission || ''}
          onChange={e => setManualCommission(parseFloat(e.target.value) || 0)}
          className="input font-semibold" />
        <p className="text-text-muted text-[10px] mt-1">
          Calculado: ${(purchaseAmount * percentage / 100).toFixed(2)} USD
        </p>
      </div>

      {/* Observaciones */}
      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Observaciones</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          rows={3} placeholder="Notas opcionales..." className="input resize-none" />
      </div>

      {submitError && (
        <p className="text-error text-xs bg-error/10 border border-error/20 rounded-lg px-3 py-2">
          {submitError}
        </p>
      )}

      <button type="submit" disabled={createMutation.isPending} className="btn-primary w-full">
        {createMutation.isPending
          ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Registrando...</>
          : 'Guardar comisión'}
      </button>
    </form>
  )
}
