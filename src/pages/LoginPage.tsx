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
    if (existing) { setPaypalReady(true); return }
    const script = document.createElement('script')
    script.id  = 'paypal-sdk-login'
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD&components=buttons`
    script.onload = () => setPaypalReady(true)
    document.body.appendChild(script)
  }, [step])

  // Render PayPal button
  useEffect(() => {
    if (!paypalReady || !(window as any).paypal || step !== 'pay') return
    const container = document.getElementById('paypal-btn-login')
    if (!container) return
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
      onError: () => setSubError('Error con PayPal. Intenta de nuevo.'),
    }).render('#paypal-btn-login')
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

            {/* STEP 2: PayPal */}
            {step === 'pay' && (
              <motion.div key="pay" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}}>
                <button onClick={()=>setStep('form')} className="text-white/40 hover:text-white/70 text-xs mb-4 flex items-center gap-1">← Volver</button>
                <h2 className="text-xl font-bold text-white mb-1">Pagar con PayPal</h2>
                <p className="text-white/50 text-xs mb-4">Se creará tu cuenta automáticamente tras el pago</p>

                <div className="rounded-xl p-3 mb-4 border border-white/10" style={{background:'rgba(255,255,255,0.06)'}}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-white/60 text-sm flex items-center gap-1.5"><span className={plan.color}>{plan.icon}</span>{plan.label}</span>
                    <span className="text-white font-bold">${plan.price} USD</span>
                  </div>
                  <p className="text-white/40 text-xs">{regEmail}</p>
                </div>

                {processing ? (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <Loader2 className="w-8 h-8 text-primary animate-spin"/>
                    <p className="text-white/60 text-sm">Creando cuenta y activando suscripción...</p>
                  </div>
                ) : !paypalReady ? (
                  <div className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 text-white/40 animate-spin"/></div>
                ) : (
                  <div id="paypal-btn-login"/>
                )}

                {subError && <p className="mt-3 text-red-300 text-xs text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{subError}</p>}
                <p className="text-white/20 text-[10px] text-center mt-3 flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3 h-3"/> Pago seguro vía PayPal
                </p>
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
