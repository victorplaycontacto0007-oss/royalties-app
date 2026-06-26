import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Commission, CommissionHistory } from '../../types/referrals'
import { X, Loader2, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const ACTION_LABELS: Record<string, string> = {
  created:   'Creada',
  approved:  'Aprobada',
  rejected:  'Rechazada',
  cancelled: 'Cancelada',
  edited:    'Editada',
  paid:      'Pagada',
  deleted:   'Eliminada',
}

interface Props {
  commission: Commission
  onClose: () => void
}

export default function AuditLogDrawer({ commission, onClose }: Props) {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [history, setHistory] = useState<CommissionHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.from('commission_history')
      .select(`*, admin:profiles!commission_history_admin_id_fkey(id, full_name, email)`)
      .eq('commission_id', commission.id)
      .order('changed_at', { ascending: false })
      .then(({ data }: { data: CommissionHistory[] | null }) => {
        setHistory(data ?? [])
        setLoading(false)
      })
  }, [commission.id])

  const fmtDate = (d: string) => format(new Date(d), "dd MMM yyyy, HH:mm", { locale: es })

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="bg-surface border-l border-border w-full max-w-md flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-semibold text-text-primary text-sm">Historial de auditoría</h2>
            <p className="text-text-muted text-xs mt-0.5 font-mono">{commission.id.slice(0,8)}...</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-8">Sin historial registrado.</p>
          ) : (
            history.map(h => (
              <div key={h.id} className="card-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="badge badge-primary text-[10px]">
                    {ACTION_LABELS[h.action] ?? h.action}
                  </span>
                  <span className="text-text-muted text-[10px] flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {fmtDate(h.changed_at)}
                  </span>
                </div>

                <p className="text-xs text-text-secondary">
                  <span className="font-medium">Admin:</span>{' '}
                  {(h as any).admin?.full_name ?? (h as any).admin?.email ?? h.admin_id}
                </p>

                {/* IP — only shown to admins */}
                {isAdmin && h.ip_address && (
                  <p className="text-xs text-text-muted">
                    <span className="font-medium">IP:</span> {h.ip_address}
                  </p>
                )}

                {h.field_changed && (
                  <p className="text-xs text-text-secondary mt-1">
                    <span className="font-medium">Campo:</span> {h.field_changed}
                  </p>
                )}

                {(h.old_value || h.new_value) && (
                  <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px]">
                    {h.old_value && (
                      <div className="bg-error/5 border border-error/10 rounded-lg px-2 py-1">
                        <p className="text-text-muted mb-0.5">Anterior</p>
                        <p className="text-text-primary font-medium">{h.old_value}</p>
                      </div>
                    )}
                    {h.new_value && (
                      <div className="bg-success/5 border border-success/10 rounded-lg px-2 py-1">
                        <p className="text-text-muted mb-0.5">Nuevo</p>
                        <p className="text-text-primary font-medium">{h.new_value}</p>
                      </div>
                    )}
                  </div>
                )}

                {h.reason && (
                  <p className="text-xs text-text-muted mt-1.5">
                    <span className="font-medium">Motivo:</span> {h.reason}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
