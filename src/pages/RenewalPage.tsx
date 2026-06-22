import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Music2, Clock, RefreshCw } from 'lucide-react'
import { motion } from 'framer-motion'
import { PLANS } from './SubscriptionPage'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function RenewalPage() {
  const { subscription, signOut } = useAuth()
  const navigate = useNavigate()

  const expiredAt = subscription?.expires_at
    ? formatDistanceToNow(new Date(subscription.expires_at), { addSuffix: true, locale: es })
    : null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b3e 100%)' }}>

      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #ef4444 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 w-full max-w-2xl text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <p className="font-bold text-white">Royalties</p>
            <p className="text-white/50 text-xs">Music Analytics</p>
          </div>
        </div>

        {/* Expired banner */}
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl p-8 mb-8 border border-red-500/20"
          style={{ background: 'rgba(239,68,68,0.08)' }}>
          <div className="w-16 h-16 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Tu suscripción ha expirado</h1>
          {expiredAt && (
            <p className="text-white/50 text-sm mb-1">Venció {expiredAt}</p>
          )}
          <p className="text-white/50 text-sm">
            Renueva tu plan para continuar accediendo al dashboard.
          </p>
        </motion.div>

        {/* Plans */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {PLANS.map((plan, i) => (
            <motion.button
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              onClick={() => navigate(`/subscription?renew=1`)}
              className="rounded-xl p-4 text-left border border-white/10 hover:border-primary/50 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className={`mb-2 ${plan.color}`}>{plan.icon}</div>
              <p className="text-white text-sm font-semibold">{plan.label}</p>
              <p className="text-white font-bold">${plan.price}</p>
              <p className="text-white/40 text-xs mt-1">
                {plan.days === 1 ? '1 día' : `${plan.days} días`}
              </p>
            </motion.button>
          ))}
        </div>

        <button
          onClick={() => navigate('/subscription?renew=1')}
          className="w-full max-w-xs mx-auto flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white transition-all mb-4"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
          <RefreshCw className="w-4 h-4" />
          Renovar suscripción
        </button>

        <button onClick={signOut}
          className="text-white/30 hover:text-white/60 text-sm transition-colors">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
