import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import {
  Music2, Mail, Lock, Eye, EyeOff, Loader2,
  Check, Zap, Star, Crown, Sparkles, ShieldCheck, User,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID ?? 'sb'
// En localhost usar sandbox automáticamente para evitar bloqueo de PayPal Live
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
const PAYPAL_SANDBOX_ID = import.meta.env.VITE_PAYPAL_SANDBOX_ID ?? 'sb'
const EFFECTIVE_PAYPAL_ID = IS_LOCAL ? PAYPAL_SANDBOX_ID : PAYPAL_CLIENT_ID

const PLANS = [
  { id: 'daily',     label: 'Diario',     price: 3,  days: 1,   icon: <Zap className="w-4 h-4" />,      color: 'text-yellow-400' },
  { id: 'monthly',   label: 'Mensual',    price: 10, days: 30,  icon: <Star className="w-4 h-4" />,     color: 'text-primary',   badge: 'Popular' },
  { id: 'quarterly', label: 'Trimestral', price: 25, days: 90,  icon: <Crown className="w-4 h-4" />,    color: 'text-cyan-400'   },
  { id: 'annual',    label: 'Anual',      price: 75, days: 365, icon: <Sparkles className="w-4 h-4" />, color: 'text-emerald-400', badge: 'Mejor precio' },
] as const
type PlanId = typeof PLANS[number]['id']

export default function LoginPage() {
  const { signIn, resetPassword, refreshSubscription } = useAuth()
  const navigate = useNavigate()

  // Panel state: false=login, true=signup+plans
  const [active,  setActive]  = useState(false)
  const [subMode, setSubMode] = useState<'login'|'forgot'>('login')

  // Login fields
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  // Signup+subscription fields
  const [regName,    setRegName]    = useState('')
  const [regEmail,   setRegEmail]   = useState('')
  const [regPwd,     setRegPwd]     = useState('')
  const [showRegPwd, setShowRegPwd] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('monthly')

  // Checkout state
  const [step,       setStep]       = useState<'form'|'pay'|'done'>('form')
  const [paypalReady, setPaypalReady] = useState(false)
  const [processing,  setProcessing]  = useState(false)
  const [subError,    setSubError]    = useState('')
  const [formError,   setFormError]   = useState('')

  // Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await signIn(email, password) }
    catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error'
      if (msg.includes('Invalid login credentials')) setError('Correo o contraseña incorrectos.')
      else if (msg.includes('Email not confirmed'))  setError('Debes confirmar tu correo.')
      else setError(msg)
    } finally { setLoading(false) }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await resetPassword(email); setSuccess('Te enviamos un email para restablecer tu contraseña.') }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error') }
    finally { setLoading(false) }
  }

  // Step 1: validate form and proceed to PayPal
  const handleProceedToPay = (e: React.FormEvent) => {
    e.preventDefault(); setFormError('')
    if (!regName.trim())  return setFormError('Ingresa tu nombre.')
    if (!regEmail.trim()) return setFormError('Ingresa tu correo.')
    if (regPwd.length < 6) return setFormError('La contraseña debe tener al menos 6 caracteres.')
    setStep('pay')
  }

  // Load PayPal SDK when step=pay
  useEffect(() => {
    if (step !== 'pay') return
    const existing = document.getElementById('paypal-sdk-login')
    if (existing) {
      // Script already in DOM — poll until paypal is available
      const poll = setInterval(() => {
        if ((window as any).paypal) { setPaypalReady(true); clearInterval(poll) }
      }, 100)
      return () => clearInterval(poll)
    }
    const script = document.createElement('script')
    script.id  = 'paypal-sdk-login'
    script.src = `https://www.paypal.com/sdk/js?client-id=${EFFECTIVE_PAYPAL_ID}&currency=USD&components=buttons`
    script.onload = () => setPaypalReady(true)
    script.onerror = () => setSubError('No se pudo cargar el SDK de PayPal. Verifica tu conexión.')
    document.body.appendChild(script)
  }, [step])

  // Render PayPal button — small delay to ensure DOM is ready
  useEffect(() => {
    if (!paypalReady || !(window as any).paypal || step !== 'pay') return
    // Wait for React to render the container div
    const timer = setTimeout(() => {
      const container = document.getElementById('paypal-btn-login')
      if (!container) {
        setSubError('No se pudo cargar PayPal. Recarga la página.')
        return
      }
      container.innerHTML = ''
      const plan = PLANS.find(p => p.id === selectedPlan)!
      ;(window as any).paypal.Buttons({
        style: { layout:'vertical', color:'gold', shape:'pill', label:'pay', height:44 },
        createOrder: (_d: any, actions: any) => actions.order.create({
          purchase_units: [{ amount: { value: plan.price.toFixed(2), currency_code:'USD' },
            description: `Royalties App — ${plan.label}` }],
        }),
        onApprove: async (_d: any, actions: any) => {
          setProcessing(true); setSubError('')
          try { const order = await actions.order.capture(); await createUserAndSubscribe(order.id) }
          catch (err: any) { setSubError(err.message ?? 'Error al procesar el pago.') }
          finally { setProcessing(false) }
        },
        onError: (err: any) => {
          console.error('PayPal error:', err)
          setSubError('Error con PayPal. Verifica tu cuenta o intenta de nuevo.')
        },
      }).render('#paypal-btn-login').catch((err: any) => {
        console.error('PayPal render error:', err)
        setSubError('No se pudo inicializar PayPal. Intenta de nuevo.')
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [paypalReady, step, selectedPlan])

  // Step 2: PayPal approved → create account → activate subscription → login
  const createUserAndSubscribe = async (paypalOrderId: string) => {
    const plan = PLANS.find(p => p.id === selectedPlan)!

    // 1. Create user via Supabase Auth
    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email:    regEmail.trim(),
      password: regPwd,
      options:  { data: { full_name: regName.trim() } },
    })
    if (signUpErr) throw new Error(signUpErr.message)
    const userId = signUpData.user?.id
    if (!userId) throw new Error('No se pudo crear el usuario.')

    // 2. Wait briefly for the DB trigger to create the profile
    await new Promise(r => setTimeout(r, 1200))

    // 3. Create subscription
    const now = new Date()
    const expiresAt = new Date(now)
    expiresAt.setDate(expiresAt.getDate() + plan.days)

    const { error: subErr } = await db.from('subscriptions').insert({
      user_id:         userId,
      plan:            plan.id,
      status:          'active',
      started_at:      now.toISOString(),
      expires_at:      expiresAt.toISOString(),
      paypal_order_id: paypalOrderId,
      amount_usd:      plan.price,
    })
    if (subErr) throw new Error(`Cuenta creada pero error en suscripción: ${subErr.message}`)

    // 4. Sign in automatically
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: regEmail.trim(), password: regPwd,
    })
    if (signInErr) throw new Error(signInErr.message)

    await refreshSubscription()
    setStep('done')
    setTimeout(() => navigate('/dashboard', { replace: true }), 2000)
  }

  const plan = PLANS.find(p => p.id === selectedPlan)!

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background:'linear-gradient(135deg,#0f0c29 0%,#1a1040 40%,#0d1b3e 100%)' }}>

      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background:'radial-gradient(circle,#6366f1 0%,transparent 70%)', animation:'float1 8s ease-in-out infinite' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-15"
          style={{ background:'radial-gradient(circle,#8b5cf6 0%,transparent 70%)', animation:'float2 10s ease-in-out infinite' }} />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage:'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize:'60px 60px' }} />
        {['♪','♫','♩','♬','♭'].map((note,i) => (
          <div key={i} className="absolute text-white/10 select-none"
            style={{ fontSize:`${24+i*10}px`, left:`${10+i*18}%`, top:`${15+(i%3)*25}%`,
              animation:`floatNote${i%3+1} ${6+i}s ease-in-out infinite`, animationDelay:`${i*1.2}s` }}>
            {note}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes float1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(30px,-30px) scale(1.05)}}
        @keyframes float2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-20px,20px) scale(1.03)}}
        @keyframes floatNote1{0%,100%{transform:translateY(0px) rotate(-5deg);opacity:0.06}50%{transform:translateY(-20px) rotate(5deg);opacity:0.12}}
        @keyframes floatNote2{0%,100%{transform:translateY(0px) rotate(5deg);opacity:0.05}50%{transform:translateY(-30px) rotate(-5deg);opacity:0.1}}
        @keyframes floatNote3{0%,100%{transform:translateY(0px);opacity:0.04}50%{transform:translateY(-15px);opacity:0.09}}
      `}</style>

      {/* Card */}
      <div className="relative w-full max-w-3xl min-h-[520px] rounded-2xl shadow-2xl overflow-hidden"
        style={{ background:'rgba(255,255,255,0.04)', backdropFilter:'blur(24px)',
          border:'1px solid rgba(255,255,255,0.1)',
          boxShadow:'0 25px 60px rgba(0,0,0,0.5),0 0 0 1px rgba(99,102,241,0.15),inset 0 1px 0 rgba(255,255,255,0.08)' }}>

        {/* ── LEFT: Login ── */}
        <motion.div animate={{ x: active ? '-100%' : '0%' }} transition={{ type:'spring', stiffness:280, damping:30 }}
          className="absolute inset-0 flex" style={{ width:'100%' }}>
          <div className="w-full md:w-1/2 h-full flex flex-col justify-center px-8 md:px-12 py-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
                <Music2 className="w-5 h-5 text-white" />
              </div>
              <div><p className="font-semibold text-white">Royalties</p><p className="text-white/50 text-xs">Music Analytics</p></div>
            </div>
            <AnimatePresence mode="wait">
              {subMode === 'login' ? (
                <motion.div key="login" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.2}}>
                  <h2 className="text-2xl font-bold text-white mb-1">Iniciar sesión</h2>
                  <p className="text-white/50 text-sm mb-7">Bienvenido de vuelta</p>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Correo electrónico"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60"
                        style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)'}} required autoComplete="email"/>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input type={showPwd?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Contraseña"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60"
                        style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)'}} required autoComplete="current-password"/>
                      <button type="button" onClick={()=>setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                        {showPwd?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
                      </button>
                    </div>
                    {error && <p className="text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                    <button type="button" onClick={()=>{setSubMode('forgot');setError('')}} className="text-xs text-white/40 hover:text-primary transition-colors block">¿Olvidaste tu contraseña?</button>
                    <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
                      style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 4px 20px rgba(99,102,241,0.4)'}}>
                      {loading && <Loader2 className="w-4 h-4 animate-spin"/>}
                      {loading ? 'Ingresando...' : 'Iniciar sesión'}
                    </button>
                  </form>
                  <button onClick={()=>setActive(true)} className="mt-5 text-xs text-white/40 hover:text-primary transition-colors block md:hidden text-center">¿Nuevo? Suscríbete →</button>
                </motion.div>
              ) : (
                <motion.div key="forgot" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.2}}>
                  <h2 className="text-2xl font-bold text-white mb-1">Recuperar contraseña</h2>
                  <p className="text-white/50 text-sm mb-7">Te enviaremos un link por email</p>
                  {success ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-300 text-sm">{success}</div>
                  ) : (
                    <form onSubmit={handleReset} className="space-y-4">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"/>
                        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60"
                          style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)'}} required/>
                      </div>
                      {error && <p className="text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                      <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
                        style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 4px 20px rgba(99,102,241,0.4)'}}>
                        {loading && <Loader2 className="w-4 h-4 animate-spin"/>}Enviar email
                      </button>
                    </form>
                  )}
                  <button onClick={()=>{setSubMode('login');setError('');setSuccess('')}} className="mt-4 text-xs text-white/40 hover:text-primary transition-colors block">← Volver al login</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── RIGHT: Signup + Plans + PayPal ── */}
        <motion.div animate={{ x: active ? '0%' : '100%' }} transition={{ type:'spring', stiffness:280, damping:30 }}
          className="absolute inset-0 w-full md:w-1/2 flex flex-col justify-center px-6 md:px-8 py-8 overflow-y-auto" style={{ left:0 }}>
          <AnimatePresence mode="wait">

            {/* DONE */}
            {step === 'done' && (
              <motion.div key="done" initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} className="text-center py-10">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-8 h-8 text-emerald-400"/>
                </div>
                <h3 className="text-white text-xl font-bold mb-2">¡Cuenta activada!</h3>
                <p className="text-white/50 text-sm">Accediendo al dashboard...</p>
              </motion.div>
            )}

            {/* STEP 1: Form + plan selector */}
            {step === 'form' && (
              <motion.div key="form" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:active?0.15:0}}>
                <h2 className="text-xl font-bold text-white mb-0.5">Crea tu cuenta</h2>
                <p className="text-white/50 text-xs mb-4">Elige un plan y paga con PayPal</p>

                {/* Account fields */}
                <form onSubmit={handleProceedToPay} className="space-y-2.5 mb-4">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"/>
                    <input type="text" value={regName} onChange={e=>setRegName(e.target.value)} placeholder="Tu nombre"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60 text-sm"
                      style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)'}} required/>
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"/>
                    <input type="email" value={regEmail} onChange={e=>setRegEmail(e.target.value)} placeholder="Correo electrónico"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60 text-sm"
                      style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)'}} required/>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"/>
                    <input type={showRegPwd?'text':'password'} value={regPwd} onChange={e=>setRegPwd(e.target.value)} placeholder="Contraseña (mín. 6 caracteres)"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60 text-sm"
                      style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.12)'}} required minLength={6}/>
                    <button type="button" onClick={()=>setShowRegPwd(!showRegPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                      {showRegPwd?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}
                    </button>
                  </div>

                  {/* Plans */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {PLANS.map(p => (
                      <button key={p.id} type="button" onClick={()=>setSelectedPlan(p.id)}
                        className={`relative text-left p-2.5 rounded-xl border-2 transition-all ${selectedPlan===p.id?'border-primary/70 bg-primary/10':'border-white/10 hover:border-white/20 bg-white/5'}`}>
                        {p.badge && <span className="absolute top-1 right-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{background:'rgba(99,102,241,0.3)',color:'#a5b4fc'}}>{p.badge}</span>}
                        {selectedPlan===p.id && <div className="absolute top-1 left-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white"/></div>}
                        <div className={`mb-1 mt-1 ${p.color}`}>{p.icon}</div>
                        <p className="text-white text-xs font-semibold">{p.label}</p>
                        <p className="text-white font-bold text-sm">${p.price}</p>
                        <p className="text-white/40 text-[10px]">{p.days===1?'1 día':`${p.days} días`}</p>
                      </button>
                    ))}
                  </div>

                  {formError && <p className="text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formError}</p>}

                  <button type="submit" className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 mt-1"
                    style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)',boxShadow:'0 4px 20px rgba(99,102,241,0.4)'}}>
                    Continuar al pago →
                  </button>
                </form>

                <button onClick={()=>setActive(false)} className="w-full text-xs text-white/40 hover:text-primary transition-colors text-center py-1">
                  ← Ya tengo cuenta, iniciar sesión
                </button>
              </motion.div>
            )}

            {/* STEP 2: PayPal + Bold */}
            {step === 'pay' && (
              <motion.div key="pay" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}>
                <button onClick={()=>setStep('form')} className="text-white/40 hover:text-white/70 text-xs mb-3 flex items-center gap-1">← Volver</button>
                <h2 className="text-xl font-bold text-white mb-1">Elige cómo pagar</h2>
                <p className="text-white/50 text-xs mb-3">Tu cuenta se crea automáticamente tras el pago</p>

                {/* Resumen */}
                <div className="rounded-xl p-3 mb-3 border border-white/10" style={{background:'rgba(255,255,255,0.06)'}}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white/60 text-sm flex items-center gap-1.5"><span className={plan.color}>{plan.icon}</span>{plan.label}</span>
                    <span className="text-white font-bold">${plan.price} USD</span>
                  </div>
                  <p className="text-white/40 text-xs">{regEmail}</p>
                </div>

                {/* PayPal */}
                <div className="rounded-xl border border-white/10 p-3 mb-3" style={{background:'rgba(255,255,255,0.04)'}}>
                  <p className="text-white/70 text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-yellow-400"/> Pagar con PayPal
                  </p>
                  {processing ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Loader2 className="w-7 h-7 text-primary animate-spin"/>
                      <p className="text-white/60 text-xs">Creando cuenta y activando suscripción...</p>
                    </div>
                  ) : !paypalReady ? (
                    <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 text-white/40 animate-spin"/></div>
                  ) : (
                    <div id="paypal-btn-login"/>
                  )}
                  {subError && <p className="mt-2 text-red-300 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5">{subError}</p>}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 h-px bg-white/10"/>
                  <span className="text-white/30 text-xs">o también</span>
                  <div className="flex-1 h-px bg-white/10"/>
                </div>

                {/* Bold */}
                <div className="rounded-xl border border-[#00C8A0]/30 p-4 mb-2"
                  style={{background:'linear-gradient(135deg,rgba(0,200,160,0.08),rgba(0,160,200,0.06))'}}>
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white flex-shrink-0"
                      style={{background:'linear-gradient(135deg,#00C8A0,#0099CC)'}}>B</div>
                    <div>
                      <p className="text-white text-sm font-semibold">Paga de forma segura con Bold</p>
                      <p className="text-white/50 text-[10px]">Tarjetas, PSE y más métodos disponibles</p>
                    </div>
                  </div>
                  <div className="space-y-1 mb-3">
                    {['Tenga fondos disponibles','No esté bloqueada ni restringida','Habilitada para compras internacionales','Cupo suficiente para completar la compra'].map(txt => (
                      <div key={txt} className="flex items-start gap-1.5">
                        <span className="text-[#00C8A0] text-xs flex-shrink-0">✅</span>
                        <p className="text-white/60 text-[10px] leading-tight">Verifica que tu método de pago: {txt}</p>
                      </div>
                    ))}
                  </div>
                  <a href="https://checkout.bold.co/payment/LNK_VJ98U4N2KZ" target="_blank" rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-white text-sm mb-3 transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{background:'linear-gradient(135deg,#00C8A0,#0099CC)',boxShadow:'0 4px 16px rgba(0,200,160,0.3)'}}>
                    <span className="font-black text-base">B</span> Pagar con Bold
                  </a>
                  <div className="rounded-lg p-2.5 border border-white/10" style={{background:'rgba(0,0,0,0.25)'}}>
                    <p className="text-white/70 text-[10px] font-semibold mb-1.5">Después de pagar, envía por WhatsApp:</p>
                    {['📸 Captura de la transacción','📧 Tu correo electrónico','🔑 La contraseña que deseas asignar'].map(i => (
                      <p key={i} className="text-white/50 text-[10px] mb-0.5">{i}</p>
                    ))}
                    <a href="https://wa.me/573026021232?text=Hola%2C+realic%C3%A9+un+pago+con+Bold+y+adjunto+mi+comprobante."
                      target="_blank" rel="noopener noreferrer"
                      className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-white text-xs font-semibold hover:opacity-90 transition-all"
                      style={{background:'#25D366'}}>
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      Enviar comprobante · +57 302 602 1232
                    </a>
                    <p className="text-[#00C8A0] text-[10px] text-center mt-2 font-medium">
                      Tu acceso será activado una vez se confirme el pago.
                    </p>
                  </div>
                </div>

              </motion.div>
            )}

          </AnimatePresence>
        </motion.div>

        {/* ── Purple overlay panel ── */}
        <motion.div animate={{ x: active ? '100%' : '0%' }} transition={{ type:'spring', stiffness:280, damping:30 }}
          className="absolute top-0 right-0 bottom-0 hidden md:flex flex-col items-center justify-center text-center px-10"
          style={{ width:'50%', background:'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)', borderRadius:'0 1rem 1rem 0' }}>
          <AnimatePresence mode="wait">
            {!active ? (
              <motion.div key="p1" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.2}} className="space-y-6">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto"><Music2 className="w-8 h-8 text-white"/></div>
                <div>
                  <h3 className="text-white text-2xl font-bold mb-3">¡Bienvenido!</h3>
                  <p className="text-white/70 text-sm leading-relaxed">¿Eres nuevo? Crea tu cuenta, elige un plan y paga con PayPal.</p>
                </div>
                <button onClick={()=>setActive(true)} className="border-2 border-white text-white font-semibold px-8 py-2.5 rounded-xl hover:bg-white hover:text-primary transition-all w-full">
                  Suscribirse
                </button>
              </motion.div>
            ) : (
              <motion.div key="p2" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.2}} className="space-y-6">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto"><Music2 className="w-8 h-8 text-white"/></div>
                <div>
                  <h3 className="text-white text-2xl font-bold mb-3">¿Ya tienes cuenta?</h3>
                  <p className="text-white/70 text-sm leading-relaxed">Inicia sesión con tus credenciales.</p>
                </div>
                <button onClick={()=>setActive(false)} className="border-2 border-white text-white font-semibold px-8 py-2.5 rounded-xl hover:bg-white hover:text-primary transition-all w-full">
                  Iniciar sesión
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

      </div>
    </div>
  )
}
