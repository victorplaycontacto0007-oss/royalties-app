import { useState } from 'react'
import { useCommissions } from '../../hooks/useCommissions'
import type { Commission, CommissionFilters, CommissionStatus } from '../../types/referrals'
import { Search, ChevronLeft, ChevronRight, Loader2, History, Edit2, Check, X, Trash2, CreditCard } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const STATUS_COLORS: Record<CommissionStatus, string> = {
  Pendiente:  'bg-warning/10 text-warning',
  Aprobada:   'bg-success/10 text-success',
  Pagada:     'bg-primary/10 text-primary',
  Rechazada:  'bg-error/10 text-error',
  Cancelada:  'bg-text-muted/10 text-text-muted',
}

interface CommissionListProps {
  onEdit?:       (c: Commission) => void
  onApprove?:    (c: Commission) => void
  onReject?:     (c: Commission) => void
  onMarkPaid?:   (c: Commission) => void
  onDelete?:     (c: Commission) => void
  onHistory?:    (c: Commission) => void
}

export default function CommissionList({
  onEdit, onApprove, onReject, onMarkPaid, onDelete, onHistory,
}: CommissionListProps) {
  const [buyerSearch, setBuyerSearch]         = useState('')
  const [affiliateSearch, setAffiliateSearch] = useState('')
  const [status, setStatus]                   = useState<CommissionStatus | ''>('')
  const [page, setPage]                       = useState(1)

  const filters: CommissionFilters = { buyerSearch, affiliateSearch, status: status || undefined, page }
  const { data: commissions = [], isLoading, isError } = useCommissions(filters)

  const fmtDate = (d: string) => format(new Date(d), 'dd MMM yyyy', { locale: es })

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input value={affiliateSearch} onChange={e => { setAffiliateSearch(e.target.value); setPage(1) }}
            placeholder="Buscar afiliado..." className="input pl-9 text-sm" />
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input value={buyerSearch} onChange={e => { setBuyerSearch(e.target.value); setPage(1) }}
            placeholder="Buscar usuario comprador..." className="input pl-9 text-sm" />
        </div>
        <select value={status} onChange={e => { setStatus(e.target.value as CommissionStatus | ''); setPage(1) }}
          className="input text-sm min-w-[140px]">
          <option value="">Todos los estados</option>
          {(['Pendiente','Aprobada','Pagada','Rechazada','Cancelada'] as CommissionStatus[]).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : isError ? (
        <p className="text-error text-sm text-center py-8">Error al cargar las comisiones.</p>
      ) : commissions.length === 0 ? (
        <p className="text-text-muted text-sm text-center py-8">No se encontraron comisiones.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 border-b border-border">
              <tr>
                {['Afiliado','Comprador','Monto','%','Comisión','Método','Estado','Fecha','Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-text-secondary whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {commissions.map(c => (
                <tr key={c.id} className="hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-medium text-text-primary text-xs">{c.affiliate?.full_name ?? '—'}</p>
                    <p className="text-text-muted text-[10px]">{c.affiliate?.email}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <p className="font-medium text-text-primary text-xs">{c.buyer?.full_name ?? '—'}</p>
                    <p className="text-text-muted text-[10px]">{c.buyer?.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-text-primary whitespace-nowrap">
                    ${c.purchase_amount_usd.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{c.commission_percentage}%</td>
                  <td className="px-4 py-3 text-xs font-bold text-success whitespace-nowrap">
                    ${c.commission_amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-secondary">{c.payment_method}</td>
                  <td className="px-4 py-3">
                    <span className={`badge text-[10px] ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                    {fmtDate(c.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {onHistory && (
                        <button onClick={() => onHistory(c)} title="Historial"
                          className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-primary transition-colors">
                          <History className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onEdit && (
                        <button onClick={() => onEdit(c)} title="Editar"
                          className="p-1.5 rounded-lg hover:bg-surface-3 text-text-muted hover:text-text-primary transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onApprove && c.status === 'Pendiente' && (
                        <button onClick={() => onApprove(c)} title="Aprobar"
                          className="p-1.5 rounded-lg hover:bg-success/10 text-text-muted hover:text-success transition-colors">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onReject && (c.status === 'Pendiente' || c.status === 'Aprobada') && (
                        <button onClick={() => onReject(c)} title="Rechazar / Cancelar"
                          className="p-1.5 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onMarkPaid && c.status === 'Aprobada' && (
                        <button onClick={() => onMarkPaid(c)} title="Registrar pago"
                          className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors">
                          <CreditCard className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDelete && c.status !== 'Pagada' && (
                        <button onClick={() => onDelete(c)} title="Eliminar"
                          className="p-1.5 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Página {page}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="btn-secondary px-2 py-1.5 disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setPage(p => p + 1)} disabled={commissions.length === 0}
            className="btn-secondary px-2 py-1.5 disabled:opacity-40">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
