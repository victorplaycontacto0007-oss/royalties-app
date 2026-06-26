import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  Music2, Check, Zap, Crown, Star, Sparkles,
  Loader2, ShieldCheck, ArrowLeft,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { captureReferralCodeFromURL, useReferralCode, clearReferralCode } from '../hooks/useReferralCode'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── PayPal client ID (replace with your own) ──────────────────────────────
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID ?? 'sb'
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const PAYPAL_SANDBOX_ID = import.meta.env.VITE_PAYPAL_SANDBOX_ID ?? 'sb'
const EFFECTIVE_PAYPAL_ID = IS_LOCAL ? PAYPAL_SANDBOX_ID : PAYPAL_CLIENT_ID

// ── Plan type (derived from Supabase `plans` table) ───────────────────────
export interface Plan {
  id: string          // slug: 'daily' | 'monthly' | 'quarterly' | 'annual'
  label: string
  price: number
  days: number
  icon: React.ReactNode
  badge?: string
  color: string
  gradient: string
}

// Static visual metadata keyed by slug — never contains pricing
const PLAN_VISUAL: Record<string, Omit<Plan, 'id' | 'label' | 'price' | 'days' | 'badge'>> = {
  daily:     { icon: <Zap className="w-6 h-6" />,      color: 'text-yellow-400', gradient: 'from-yellow-500/20 to-orange-500/20' },
  monthly:   { icon: <Star className="w-6 h-6" />,     color: 'text-primary',    gradient: 'from-primary/20 to-violet-500/20'   },
  quarterly: { icon: <Crown className="w-6 h-6" />,    color: 'text-cyan-400',   gradient: 'from-cyan-500/20 to-blue-500/20'    },
  annual:    { icon: <Sparkles className="w-6 h-6" />, color: 'text-emerald-400',gradient: 'from-emerald-500/20 to-teal-500/20' },
}

function mapRowToPlan(row: {
  id: string; name: string; slug: string; price: number;
  duration_days: number; badge: string | null
}): Plan {
  const visual = PLAN_VISUAL[row.slug] ?? PLAN_VISUAL['monthly']
  return {
    id:     row.slug,
    label:  `Plan ${row.name}`,
    price:  row.price,
    days:   row.duration_days,
    badge:  row.badge ?? undefined,
    ...visual,
  }
}

const FEATURES = [
  'Dashboard de regalías completo',
  'Subida de reportes ilimitada',
  'Análisis por canción, artista, plataforma y país',
  'Detección de streams fraudulentos',
  'Exportación en Excel, CSV y PDF',
  'Gestión de contratos y splits',
  'Soporte completo',
]

export default function SubscriptionPage() {
  const { user, profile, hasActiveSubscription, subscription, refreshSubscription } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [plans, setPlans]       = useState<Plan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [selected, setSelected] = useState<Plan | null>(null)
  const [paypalReady, setPaypalReady] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // Capture referral code from URL on mount
  useEffect(() => { captureReferralCodeFromURL() }, [])
  const referralCode = useReferralCode()

  // Load plans from Supabase
  useEffect(() => {
    db.from('plans')
      .select('id,name,slug,price,currency,duration_days,badge,display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }: { data: Array<{id:string;name:string;slug:string;price:number;currency:string;duration_days:number;badge:string|null;display_order:number}> | null }) => {
        const mapped = (data ?? []).map(mapRowToPlan)
        setPlans(mapped)
        // Default to 'monthly' if available, otherwise first plan
        const defaultPlan = mapped.find(p => p.id === 'monthly') ?? mapped[0] ?? null
        setSelected(defaultPlan)
        setPlansLoading(false)
      })
  }, [])

  // If not logged in, redirect to login with signup panel open
  useEffect(() => {
    if (!user && !plansLoading) {
      navigate('/login?signup=true', { replace: true })
    }
  }, [user, plansLoading])

  // If already has active subscription, redirect to dashboard
  useEffect(() => {
    if (hasActiveSubscription && !searchParams.get('renew')) {
      navigate('/dashboard', { replace: true })
    }
  }, [hasActiveSubscription])

  // Load PayPal SDK
  useEffect(() => {
    if (document.getElementById('paypal-sdk')) { setPaypalReady(true); return }
    const script = document.createElement('script')
    script.id = 'paypal-sdk'
    script.src = `https://www.paypal.com/sdk/js?client-id=${EFFECTIVE_PAYPAL_ID}&currency=USD&components=buttons`
    script.onload = () => setPaypalReady(true)
    document.body.appendChild(script)
  }, [])

  // Render PayPal button whenever plan or readiness changes
  useEffect(() => {
    if (!paypalReady || !(window as any).paypal || !selected) return
    const container = document.getElementById('paypal-button-container')
    if (!container) return
    container.innerHTML = ''

    ;(window as any).paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay', height: 48 },

      createOrder: async (_data: any, actions: any) => {
        // Always fetch fresh price from Supabase before creating the order
        const { data: freshPlan } = await db
          .from('plans')
          .select('price,name')
          .eq('slug', selected.id)
          .eq('is_active', true)
          .single()
        const livePrice = freshPlan?.price ?? selected.price
        const liveName  = freshPlan?.name  ?? selected.label
        return actions.order.create({
          purchase_units: [{
            amount: { value: livePrice.toFixed(2), currency_code: 'USD' },
            description: `Royalties App — Plan ${liveName}`,
          }],
        })
      },

      onApprove: async (_data: any, actions: any) => {
        setProcessing(true)
        setError('')
        try {
          const order = await actions.order.capture()
          await activateSubscription(order.id)
        } catch (err) {
          setError('Error al procesar el pago. Intenta de nuevo.')
          console.error(err)
        } finally {
          setProcessing(false)
        }
      },

      onError: (err: any) => {
        console.error('PayPal error:', err)
        setError('Error con PayPal. Intenta de nuevo.')
      },
    }).render('#paypal-button-container')
  }, [paypalReady, selected, user])

  const activateSubscription = async (paypalOrderId: string) => {
    if (!user || !selected) throw new Error('No autenticado o plan no seleccionado')

    // Fetch latest price from Supabase — never trust frontend-stored price
    const { data: freshPlan, error: planErr } = await db
      .from('plans')
      .select('price,duration_days,slug')
      .eq('slug', selected.id)
      .eq('is_active', true)
      .single()
    if (planErr || !freshPlan) throw new Error('Plan no encontrado')

    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + freshPlan.duration_days)

    const { error: insErr } = await db.from('subscriptions').insert({
      user_id:         user.id,
      plan:            freshPlan.slug,
      status:          'active',
      started_at:      now.toISOString(),
      expires_at:      expiresAt.toISOString(),
      paypal_order_id: paypalOrderId,
      amount_usd:      freshPlan.price,
      referral_code:   referralCode ?? null,
    })

    if (insErr) throw new Error(insErr.message)

    clearReferralCode()

    await refreshSubscription()
    setSuccess(true)

    setTimeout(() => navigate('/dashboard', { replace: true }), 2500)
  }

  if (success) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b3e 100%)' }}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="text-center px-8">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <ShieldCheck className="w-10 h-10 text-emerald-400" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2">¡Suscripción activada!</h2>
        <p className="text-white/60">Redirigiendo al dashboard...</p>
      </motion.div>
    </div>
  )

  // Show spinner while plans load
  if (plansLoading || !selected) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b3e 100%)' }}>
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b3e 100%)' }}>

      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }} />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/40">
              <Music2 className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="font-bold text-white text-lg">Royalties</p>
              <p className="text-white/50 text-xs">Music Analytics</p>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Elige tu plan
          </h1>
          <p className="text-white/60 text-lg max-w-xl mx-auto">
            Todos los planes incluyen acceso completo a todas las funciones.
            Sin límites, sin restricciones.
          </p>
          {user && (
            <button onClick={() => navigate('/dashboard')}
              className="mt-4 text-white/40 hover:text-white/70 text-sm flex items-center gap-1.5 mx-auto transition-colors">
              <ArrowLeft className="w-4 h-4" /> Volver al dashboard
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Plans grid */}
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {plans.map(plan => (
                <motion.button
                  key={plan.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelected(plan)}
                  className={`relative text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
                    selected.id === plan.id
                      ? 'border-primary shadow-lg shadow-primary/20'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  style={{ background: selected.id === plan.id
                    ? 'rgba(99,102,241,0.15)'
                    : 'rgba(255,255,255,0.04)' }}
                >
                  {plan.badge && (
                    <span className="absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }}>
                      {plan.badge}
                    </span>
                  )}
                  <div className={`mb-3 ${plan.color}`}>{plan.icon}</div>
                  <p className="text-white font-semibold text-lg mb-1">{plan.label}</p>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold text-white">${plan.price}</span>
                    <span className="text-white/40 text-sm">USD</span>
                  </div>
                  <p className="text-white/50 text-xs">
                    {plan.days === 1 ? '24 horas de acceso' : `${plan.days} días de acceso`}
                  </p>
                  {selected.id === plan.id && (
                    <div className="absolute top-3 left-3 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </motion.button>
              ))}
            </div>

            {/* Features list */}
            <div className="rounded-2xl p-5 border border-white/10"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-white font-semibold mb-4 text-sm">Incluido en todos los planes</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FEATURES.map(f => (
                  <div key={f} className="flex items-center gap-2.5">
                    <div className="w-4 h-4 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                    </div>
                    <span className="text-white/70 text-xs">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Checkout panel */}
          <div className="lg:col-span-1">
            <div className="sticky top-8 rounded-2xl p-6 border border-white/10"
              style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>
              <p className="text-white/60 text-xs font-medium uppercase tracking-wider mb-4">Resumen</p>

              <div className={`rounded-xl p-4 mb-5 bg-gradient-to-br ${selected.gradient} border border-white/10`}>
                <div className={`mb-2 ${selected.color}`}>{selected.icon}</div>
                <p className="text-white font-bold text-lg">{selected.label}</p>
                <p className="text-white/60 text-xs mt-1">
                  {selected.days === 1 ? '24 horas' : `${selected.days} días`} · Acceso completo
                </p>
              </div>

              <div className="flex justify-between items-center mb-6 py-3 border-t border-b border-white/10">
                <span className="text-white/60 text-sm">Total</span>
                <span className="text-white text-2xl font-bold">${selected.price} USD</span>
              </div>

              {!user ? (
                <div className="text-center">
                  <p className="text-white/50 text-xs mb-4">Debes iniciar sesión para suscribirte</p>
                  <button onClick={() => navigate('/login')}
                    className="w-full py-3 rounded-xl font-semibold text-white transition-all"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                    Iniciar sesión
                  </button>
                </div>
              ) : (
                <>
                  <AnimatePresence mode="wait">
                    {processing ? (
                      <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="flex flex-col items-center gap-3 py-6">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                        <p className="text-white/60 text-sm">Procesando pago...</p>
                      </motion.div>
                    ) : (
                      <motion.div key="paypal" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        {!paypalReady ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
                          </div>
                        ) : (
                          <div id="paypal-button-container" />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {error && (
                    <p className="mt-3 text-red-300 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}
                </>
              )}

              <p className="text-white/30 text-xs text-center mt-4 flex items-center justify-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Pago seguro vía PayPal
              </p>
            </div>
          </div>
        </div>

        {/* Login link */}
        {!user && (
          <p className="text-center text-white/40 text-sm mt-8">
            ¿Ya tienes cuenta?{' '}
            <button onClick={() => navigate('/login')}
              className="text-primary hover:underline">
              Inicia sesión
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
