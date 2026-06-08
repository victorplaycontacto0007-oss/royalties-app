import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Music2, Mail, Lock, Eye, EyeOff, Loader2, MessageCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const WHATSAPP_NUMBER = '573026021232'
const WHATSAPP_MSG    = 'Hola, quiero solicitar acceso a la plataforma de regalías musicales.'

export default function LoginPage() {
  const { signIn, resetPassword } = useAuth()
  const [active,   setActive]   = useState(false) // false=login, true=access
  const [subMode,  setSubMode]  = useState<'login' | 'forgot'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await signIn(email, password)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error'
      if (msg.includes('Invalid login credentials')) setError('Correo o contraseña incorrectos.')
      else if (msg.includes('Email not confirmed'))  setError('Debes confirmar tu correo.')
      else setError(msg)
    } finally { setLoading(false) }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await resetPassword(email)
      setSuccess('Te enviamos un email para restablecer tu contraseña.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally { setLoading(false) }
  }

  const openWhatsApp = () => {
    window.open(
      `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MSG)}`,
      '_blank'
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #0d1b3e 100%)' }}>

      {/* Animated background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {/* Large orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)', animation: 'float1 8s ease-in-out infinite' }} />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)', animation: 'float2 10s ease-in-out infinite' }} />
        <div className="absolute top-[30%] right-[20%] w-[300px] h-[300px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)', animation: 'float3 7s ease-in-out infinite' }} />

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

        {/* Floating music notes */}
        {['♪','♫','♩','♬','♭'].map((note, i) => (
          <div key={i} className="absolute text-white/10 select-none"
            style={{
              fontSize: `${24 + i * 10}px`,
              left: `${10 + i * 18}%`,
              top: `${15 + (i % 3) * 25}%`,
              animation: `floatNote${i % 3 + 1} ${6 + i}s ease-in-out infinite`,
              animationDelay: `${i * 1.2}s`,
            }}>
            {note}
          </div>
        ))}

        {/* Thin glowing lines */}
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, transparent 60%, rgba(99,102,241,0.08) 100%)' }} />
      </div>

      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.05); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-20px, 20px) scale(1.03); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(15px, -15px); }
        }
        @keyframes floatNote1 {
          0%, 100% { transform: translateY(0px) rotate(-5deg); opacity: 0.06; }
          50% { transform: translateY(-20px) rotate(5deg); opacity: 0.12; }
        }
        @keyframes floatNote2 {
          0%, 100% { transform: translateY(0px) rotate(5deg); opacity: 0.05; }
          50% { transform: translateY(-30px) rotate(-5deg); opacity: 0.1; }
        }
        @keyframes floatNote3 {
          0%, 100% { transform: translateY(0px); opacity: 0.04; }
          50% { transform: translateY(-15px); opacity: 0.09; }
        }
      `}</style>

      {/* Main card */}
      <div
        className="relative w-full max-w-3xl min-h-[520px] rounded-2xl shadow-2xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* ── FORM PANELS (both sit side by side, shifted via translateX) ── */}

        {/* LOGIN FORM — always left */}
        <motion.div
          animate={{ x: active ? '-100%' : '0%' }}
          transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          className="absolute inset-0 flex"
          style={{ width: '100%' }}
        >
          {/* Login / forgot */}
          <div className="w-full md:w-1/2 h-full flex flex-col justify-center px-8 md:px-12 py-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
                <Music2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-white">Royalties</p>
                <p className="text-white/50 text-xs">Music Analytics</p>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {subMode === 'login' ? (
                <motion.div key="login"
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  exit={{ opacity:0, y:-8 }} transition={{ duration:0.2 }}>
                  <h2 className="text-2xl font-bold text-white mb-1">Iniciar sesión</h2>
                  <p className="text-white/50 text-sm mb-7">Bienvenido de vuelta</p>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="Correo electrónico"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60 transition-all"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                        required autoComplete="email" />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                      <input type={showPwd ? 'text' : 'password'} value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Contraseña"
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60 transition-all"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                        required autoComplete="current-password" />
                      <button type="button" onClick={() => setShowPwd(!showPwd)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {error && (
                      <p className="text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                    )}
                    <button type="button" onClick={() => { setSubMode('forgot'); setError('') }}
                      className="text-xs text-white/40 hover:text-primary transition-colors block">
                      ¿Olvidaste tu contraseña?
                    </button>
                    <button type="submit" disabled={loading}
                      className="w-full py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all"
                      style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
                      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                      {loading ? 'Ingresando...' : 'Iniciar sesión'}
                    </button>
                  </form>
                  <button onClick={() => setActive(true)}
                    className="mt-5 text-xs text-white/40 hover:text-primary transition-colors block md:hidden text-center">
                    ¿No tienes cuenta? Solicitar acceso →
                  </button>
                </motion.div>
              ) : (
                <motion.div key="forgot"
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  exit={{ opacity:0, y:-8 }} transition={{ duration:0.2 }}>
                  <h2 className="text-2xl font-bold text-white mb-1">Recuperar contraseña</h2>
                  <p className="text-white/50 text-sm mb-7">Te enviaremos un link por email</p>
                  {success ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-green-300 text-sm">{success}</div>
                  ) : (
                    <form onSubmit={handleReset} className="space-y-4">
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                          placeholder="tu@email.com"
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-primary/60 transition-all"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                          required />
                      </div>
                      {error && <p className="text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
                      <button type="submit" disabled={loading}
                        className="w-full py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Enviar email
                      </button>
                    </form>
                  )}
                  <button onClick={() => { setSubMode('login'); setError(''); setSuccess('') }}
                    className="mt-4 text-xs text-white/40 hover:text-primary transition-colors block">
                    ← Volver al login
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ACCESS REQUEST FORM — slides in from right */}
        <motion.div
          animate={{ x: active ? '0%' : '100%' }}
          transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          className="absolute inset-0 w-full md:w-1/2 flex flex-col justify-center px-8 md:px-12 py-10"
          style={{ left: 0 }}
        >
          <motion.div
            initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
            transition={{ delay: active ? 0.15 : 0 }}>
            <div className="w-14 h-14 bg-green-500/10 rounded-2xl flex items-center justify-center mb-6">
              <MessageCircle className="w-7 h-7 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Solicitar acceso</h2>
            <p className="text-white/50 text-sm mb-2 leading-relaxed">
              Esta plataforma es <span className="text-white/80 font-medium">privada</span>.
            </p>
            <p className="text-white/50 text-sm mb-8 leading-relaxed">
              Contacta al administrador para obtener una cuenta. Una vez creada, podrás iniciar sesión con tu correo y contraseña.
            </p>
            <div className="space-y-3">
              <button onClick={openWhatsApp}
                className="w-full flex items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white font-semibold px-5 py-3 rounded-xl transition-all duration-200 shadow-lg shadow-green-500/20">
                <MessageCircle className="w-5 h-5" />
                Solicitar por WhatsApp
              </button>
              <button onClick={() => setActive(false)}
                className="w-full text-xs text-white/40 hover:text-primary transition-colors text-center py-2">
                ← Ya tengo cuenta, iniciar sesión
              </button>
            </div>
          </motion.div>
        </motion.div>

        {/* ── OVERLAY PANEL (morado) — slides over the top ── */}
        <motion.div
          animate={{ x: active ? '100%' : '0%' }}
          transition={{ type: 'spring', stiffness: 280, damping: 30 }}
          className="absolute top-0 right-0 bottom-0 hidden md:flex flex-col items-center justify-center text-center px-10"
          style={{
            width: '50%',
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            borderRadius: '0 1rem 1rem 0',
          }}
        >
          <AnimatePresence mode="wait">
            {!active ? (
              <motion.div key="panel-login"
                initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                transition={{ duration:0.2 }}
                className="space-y-6">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto">
                  <Music2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-white text-2xl font-bold mb-3">¡Bienvenido!</h3>
                  <p className="text-white/70 text-sm leading-relaxed">
                    ¿Eres nuevo? Solicita acceso al administrador y empieza a analizar tus regalías.
                  </p>
                </div>
                <button onClick={() => setActive(true)}
                  className="border-2 border-white text-white font-semibold px-8 py-2.5 rounded-xl hover:bg-white hover:text-primary transition-all duration-200 w-full">
                  Solicitar acceso
                </button>
              </motion.div>
            ) : (
              <motion.div key="panel-access"
                initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
                transition={{ duration:0.2 }}
                className="space-y-6">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto">
                  <Music2 className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-white text-2xl font-bold mb-3">¿Ya tienes cuenta?</h3>
                  <p className="text-white/70 text-sm leading-relaxed">
                    Inicia sesión con tus credenciales para acceder al panel.
                  </p>
                </div>
                <button onClick={() => setActive(false)}
                  className="border-2 border-white text-white font-semibold px-8 py-2.5 rounded-xl hover:bg-white hover:text-primary transition-all duration-200 w-full">
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
