import { useAuth } from '../contexts/AuthContext'
import { useAffiliateCommissions } from '../hooks/useCommissions'
import AffiliateBalanceCard from '../components/referrals/AffiliateBalanceCard'
import type { CommissionStatus } from '../types/referrals'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const STATUS_COLORS: Record<CommissionStatus, string> = {
  Pendiente:  'bg-warning/10 text-warning',
  Aprobada:   'bg-success/10 text-success',
  Pagada:     'bg-primary/10 text-primary',
  Rechazada:  'bg-error/10 text-error',
  Cancelada:  'bg-text-muted/10 text-text-muted',
}

// Statuses that do NOT count toward available balance
const NOT_CREDITED: CommissionStatus[] = ['Pendiente', 'Rechazada', 'Cancelada']

export default function AffiliatePage() {
  const { user, profile } = useAuth()
  const { data: commissions = [], isLoading } = useAffiliateCommissions(user?.id)

  // Guard — only affiliates (and admins) can access this page
  if (profile && profile.role !== 'admin' && (profile as any).role !== 'affiliate') {
    return (
      <div className="p-8 text-center">
        <p className="text-text-secondary text-sm">
          El programa de afiliados no está disponible para esta cuenta.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Mis referidos</h1>
        <p className="text-text-secondary text-sm mt-0.5">Historial de comisiones y saldo acumulado</p>
      </div>

      <AffiliateBalanceCard />

      {/* Commission history */}
      <div>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Historial de comisiones</h2>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : commissions.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-text-muted text-sm">Aún no tienes comisiones registradas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 border-b border-border">
                <tr>
                  {['Monto compra','%','Comisión','Método','Estado','Fecha'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {commissions.map(c => {
                  const notCredited = NOT_CREDITED.includes(c.status)
                  return (
                    <tr key={c.id} className={`hover:bg-surface-2 transition-colors ${notCredited ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3 text-xs font-semibold">${c.purchase_amount_usd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{c.commission_percentage}%</td>
                      <td className="px-4 py-3 text-xs font-bold text-success">
                        ${c.commission_amount.toFixed(2)}
                        {notCredited && (
                          <span className="ml-1.5 text-[9px] text-text-muted font-normal">(no acreditado)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-secondary">{c.payment_method}</td>
                      <td className="px-4 py-3">
                        <span className={`badge text-[10px] ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                        {format(new Date(c.created_at), 'dd MMM yyyy', { locale: es })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
