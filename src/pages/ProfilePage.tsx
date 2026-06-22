import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  User, Mail, Calendar, Clock, Crown,
  RefreshCw, ShieldCheck, AlertTriangle, Zap, Star, Sparkles,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { format, differenceInSeconds, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

const PLAN_LABELS: Record<string, string> = {
  daily: 'Plan Diario',
  monthly: 'Plan Mensual',
  quarterly: 'Plan Trimestral',
  annual: 'Plan Anual',
}

const PLAN_ICONS: Record<string, React.ReactNode> = {
  daily:     <Zap className="w-5 h-5 text-yellow-400" />,
  monthly:   <Star className="w-5 h-5 text-primary" />,
  quarterly: <Crown className="w-5 h-5 text-cyan-400" />,
  annual:    <Sparkles className="w-5 h-5 text-emerald-400" />,
}

function useCountdown(targetDate: string | null) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (!targetDate) return
    const update = () => {
      const secs = differenceInSeconds(new Date(targetDate), new Date())
      setRemaining(Math.max(0, secs))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [targetDate])

  const days    = Math.floor(remaining / 86400)
  const hours   = Math.floor((remaining % 86400) / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)
  const seconds = remaining % 60

  return { days, hours, minutes, seconds, remaining }
}

function CountdownBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white tabular-nums"
        style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}>
        {String(value).padStart(2, '0')}
      </div>
      <span className="text-text-muted text-xs mt-1.5">{label}</span>
    </div>
  )
}

export default function ProfilePage() {
  const { profile, subscription } = useAuth()
  const navigate = useNavigate()

  const countdown = useCountdown(subscription?.expires_at ?? null)
  const pct = subscription
    ? (() => {
        const total = differenceInSeconds(new Date(subscription.expires_at), new Date(subscription.started_at))
        const elapsed = differenceInSeconds(new Date(), new Date(subscription.started_at))
        return Math.min(100, Math.max(0, (elapsed / total) * 100))
      })()
    : 0

  const isExpiringSoon = countdown.remaining > 0 && countdown.remaining < 86400 * 3 // < 3 days

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">Mi Perfil</h1>
        <p className="text-text-muted mt-1">Información de tu cuenta y suscripción</p>
      </motion.div>

      {/* Profile card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="card mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0">
            <span className="text-primary text-2xl font-bold">
              {profile?.full_name?.[0] ?? profile?.email?.[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-text-primary font-semibold text-lg truncate">
              {profile?.full_name ?? 'Usuario'}
            </p>
            <div className="flex items-center gap-1.5 text-text-muted text-sm mt-0.5">
              <Mail className="w-3.5 h-3.5" />
              <span className="truncate">{profile?.email}</span>
            </div>
          </div>
          {profile?.role === 'admin' && (
            <span className="text-xs bg-accent/10 text-accent px-2.5 py-1 rounded-full font-medium">Admin</span>
          )}
        </div>
      </motion.div>

      {/* Subscription card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }} className="card">
        <div className="flex items-center gap-2 mb-5">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="text-text-primary font-semibold">Suscripción</h2>
        </div>

        {!subscription ? (
          <div className="text-center py-8">
            <div className="w-14 h-14 bg-warning/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-warning" />
            </div>
            <p className="text-text-primary font-medium mb-1">Sin suscripción activa</p>
            <p className="text-text-muted text-sm mb-5">Elige un plan para acceder a todas las funciones</p>
            <button onClick={() => navigate('/subscription')}
              className="btn-primary flex items-center gap-2 mx-auto">
              <Crown className="w-4 h-4" /> Ver planes
            </button>
          </div>
        ) : (
          <>
            {/* Plan info */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-surface-2 mb-5">
              {PLAN_ICONS[subscription.plan]}
              <div className="flex-1">
                <p className="text-text-primary font-semibold">{PLAN_LABELS[subscription.plan]}</p>
                <p className="text-text-muted text-xs mt-0.5">
                  ${subscription.amount_usd} USD · Activo
                </p>
              </div>
              <span className="text-xs bg-success/10 text-success px-2.5 py-1 rounded-full font-medium">Activo</span>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-surface-2 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1">
                  <Calendar className="w-3.5 h-3.5" /> Inicio
                </div>
                <p className="text-text-primary text-sm font-medium">
                  {format(new Date(subscription.started_at), "d 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
              <div className="bg-surface-2 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1">
                  <Clock className="w-3.5 h-3.5" /> Vence
                </div>
                <p className="text-text-primary text-sm font-medium">
                  {format(new Date(subscription.expires_at), "d 'de' MMMM, yyyy", { locale: es })}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mb-5">
              <div className="flex justify-between text-xs text-text-muted mb-1.5">
                <span>Tiempo transcurrido</span>
                <span>{pct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#6366f1',
                  }}
                />
              </div>
            </div>

            {/* Countdown */}
            {countdown.remaining > 0 ? (
              <div>
                <p className={`text-sm font-medium mb-3 flex items-center gap-1.5 ${isExpiringSoon ? 'text-warning' : 'text-text-secondary'}`}>
                  {isExpiringSoon && <AlertTriangle className="w-4 h-4" />}
                  {isExpiringSoon ? 'Vence pronto' : 'Tiempo restante'}
                </p>
                <div className="flex items-center gap-3">
                  <CountdownBlock value={countdown.days}    label="días"     />
                  <span className="text-text-muted text-xl font-bold pb-5">:</span>
                  <CountdownBlock value={countdown.hours}   label="horas"    />
                  <span className="text-text-muted text-xl font-bold pb-5">:</span>
                  <CountdownBlock value={countdown.minutes} label="minutos"  />
                  <span className="text-text-muted text-xl font-bold pb-5">:</span>
                  <CountdownBlock value={countdown.seconds} label="segundos" />
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-error text-sm font-medium">Tu suscripción ha expirado</p>
              </div>
            )}

            {/* Renew button */}
            <div className="mt-5 pt-5 border-t border-border">
              <button onClick={() => navigate('/subscription?renew=1')}
                className="btn-secondary flex items-center gap-2 text-sm">
                <RefreshCw className="w-4 h-4" /> Renovar / cambiar plan
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
