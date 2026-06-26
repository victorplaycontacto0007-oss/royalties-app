import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { AffiliateBalance } from '../../types/referrals'
import { Wallet, Loader2 } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export default function AffiliateBalanceCard() {
  const { user, profile } = useAuth()
  const [balance, setBalance] = useState<AffiliateBalance | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    db.from('affiliate_balances')
      .select('*')
      .eq('affiliate_id', user.id)
      .maybeSingle()
      .then(({ data }: { data: AffiliateBalance | null }) => {
        setBalance(data)
        setLoading(false)
      })
  }, [user])

  if (loading) return (
    <div className="card flex items-center justify-center py-6">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
    </div>
  )

  if (!balance) return (
    <div className="card text-center py-6">
      <p className="text-text-muted text-sm">El programa de afiliados no está disponible para esta cuenta.</p>
    </div>
  )

  return (
    <div className="card flex items-center gap-4">
      <div className="w-12 h-12 bg-success/10 rounded-xl flex items-center justify-center flex-shrink-0">
        <Wallet className="w-6 h-6 text-success" />
      </div>
      <div>
        <p className="text-text-muted text-xs font-medium">Saldo disponible</p>
        <p className="text-text-primary text-2xl font-bold">
          ${balance.available_balance.toFixed(2)}
          <span className="text-text-muted text-sm font-normal ml-1">USD</span>
        </p>
        <p className="text-text-muted text-xs mt-0.5">Solo incluye comisiones aprobadas</p>
      </div>
    </div>
  )
}
