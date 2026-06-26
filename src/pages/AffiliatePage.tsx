import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAffiliateCommissions } from '../hooks/useCommissions'
import AffiliateBalanceCard from '../components/referrals/AffiliateBalanceCard'
import type { CommissionStatus } from '../types/referrals'
import { Loader2, Link2, Copy, Check, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

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
  const [copied, setCopied] = useState(false)

  // Fetch this user's referral link
  const { data: referralLink, isLoading: linkLoading } = useQuery<{ referral_code: string } | null>({
    queryKey: ['my-referral-link', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await db
        .from('referral_links')
        .select('referral_code')
        .eq('affiliate_id', user!.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data ?? null
    },
  })

  const baseUrl = window.location.origin
  const fullLink = referralLink ? `${baseUrl}/suscripcion?ref=${referralLink.referral_code}` : null

  const copyLink = () => {
    if (!fullLink) return
    navigator.clipboard.writeText(fullLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Guard — page is accessible to all authenticated users (admins and regular users with referral links)
  if (!profile) {
    return (
      <div className="p-8 text-center">
        <p className="text-text-secondary text-sm">Cargando...</p>
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

      {/* Referral link card */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-text-primary">Tu link de referido</h2>
        </div>

        {linkLoading ? (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Cargando link...
          </div>
        ) : fullLink ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-2.5 font-mono text-xs text-text-secondary truncate">
              {fullLink}
            </div>
            <button
              onClick={copyLink}
              className="btn-secondary flex items-center gap-2 text-sm flex-shrink-0"
            >
              {copied
                ? <><Check className="w-4 h-4 text-success" /> Copiado</>
                : <><Copy className="w-4 h-4" /> Copiar</>
              }
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-text-muted text-sm bg-surface-2 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Aún no tienes un link de referido asignado. Contacta al administrador.</span>
          </div>
        )}

        {referralLink && (
          <p className="text-text-muted text-xs">
            Comparte este link. Cuando alguien se suscriba a través de él, recibirás una comisión automáticamente.
          </p>
        )}
      </div>

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
