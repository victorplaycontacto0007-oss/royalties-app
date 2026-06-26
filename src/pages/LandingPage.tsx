import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { motion, useInView, useAnimation, AnimatePresence } from 'framer-motion'
import {
  Music2, Upload, BarChart3, PieChart, FileText, Globe, ShieldCheck,
  ChevronRight, Star, Zap, Crown, Sparkles, Check, ArrowRight,
  Menu, X, ChevronDown, TrendingUp, Users, MapPin, Disc3,
  Play, Pause,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ──────────────────────────────────────────────────
interface PlanRow {
  id: string; name: string; slug: string; price: number
  currency: string; duration_days: number; badge: string | null; display_order: number
}

// ── Constants ──────────────────────────────────────────────
const NAV_LINKS = ['Inicio', 'Funciones', 'Plataforma', 'Precios', 'FAQ']

const PLAN_META: Record<string, { icon: React.ReactNode; color: string; gradient: string; emoji: string }> = {
  daily:     { icon: <Zap className="w-5 h-5" />,      color: 'text-yellow-400', gradient: 'from-yellow-500/20 to-orange-500/20',  emoji: '⚡' },
  monthly:   { icon: <Star className="w-5 h-5" />,     color: 'text-indigo-400', gradient: 'from-indigo-500/20 to-violet-500/20',  emoji: '⭐' },
  quarterly: { icon: <Crown className="w-5 h-5" />,    color: 'text-cyan-400',   gradient: 'from-cyan-500/20 to-blue-500/20',      emoji: '👑' },
  annual:    { icon: <Sparkles className="w-5 h-5" />, color: 'text-emerald-400',gradient: 'from-emerald-500/20 to-teal-500/20',   emoji: '✨' },
}

const PLAN_FEATURES = [
  'Dashboard de regalías completo', 'Subida de reportes ilimitada',
  'Análisis por canción, artista, plataforma y país', 'Detección de streams fraudulentos',
  'Exportación en Excel, CSV y PDF', 'Gestión de contratos y splits', 'Soporte completo',
]

const FEATURES = [
  { icon: <Upload className="w-6 h-6" />,      title: 'Importa tus reportes',   desc: 'Sube reportes de DistroKid, TuneCore, CD Baby, Ditto y más en segundos.',         color: 'bg-violet-500/20 text-violet-400' },
  { icon: <BarChart3 className="w-6 h-6" />,   title: 'Análisis automático',     desc: 'Procesamos tus datos y te mostramos métricas claras y accionables.',               color: 'bg-emerald-500/20 text-emerald-400' },
  { icon: <PieChart className="w-6 h-6" />,    title: 'Reportes visuales',       desc: 'Gráficos interactivos para entender cómo crecen tus ingresos mes a mes.',          color: 'bg-pink-500/20 text-pink-400' },
  { icon: <FileText className="w-6 h-6" />,    title: 'Contratos & Splits',      desc: 'Gestiona splits, contratos y porcentajes de regalías por proyecto.',               color: 'bg-blue-500/20 text-blue-400' },
  { icon: <Globe className="w-6 h-6" />,       title: 'Datos globales',          desc: 'Visualiza tus ingresos por país, moneda y plataforma en un solo lugar.',           color: 'bg-amber-500/20 text-amber-400' },
  { icon: <ShieldCheck className="w-6 h-6" />, title: 'Seguro y privado',        desc: 'Tus datos están protegidos con cifrado de extremo a extremo y respaldos.',        color: 'bg-teal-500/20 text-teal-400' },
]

const DISTRIBUTORS = [
  'DistroKid','TuneCore','CD Baby','SoundOn','Ditto','ONErpm',
  'Believe','Symphonic','RouteNote','UnitedMasters','Too Lost',
  'Spotify','Apple Music','Amazon Music','YouTube','TIDAL',
]

const HOW_STEPS = [
  { num: '01', title: 'Sube tu reporte', desc: 'Arrastra o selecciona tu archivo CSV, XLSX, TSV u ODS desde cualquier distribuidora.',        icon: <Upload className="w-7 h-7" /> },
  { num: '02', title: 'Análisis automático', desc: 'El motor detecta el proveedor, normaliza columnas y suma los datos con precisión decimal.', icon: <Zap className="w-7 h-7" /> },
  { num: '03', title: 'Visualiza estadísticas', desc: 'Explora gráficos por canción, artista, país, plataforma y período de tiempo.',           icon: <BarChart3 className="w-7 h-7" /> },
  { num: '04', title: 'Toma mejores decisiones', desc: 'Entiende tus ingresos reales y optimiza tu estrategia de distribución musical.',        icon: <TrendingUp className="w-7 h-7" /> },
]

const SCREENSHOTS = [
  { label: 'Dashboard',      bg: 'from-indigo-500/30 to-violet-500/30' },
  { label: 'Mis Reportes',   bg: 'from-cyan-500/30 to-blue-500/30' },
  { label: 'Subir Reporte',  bg: 'from-violet-500/30 to-pink-500/30' },
  { label: 'Contratos',      bg: 'from-emerald-500/30 to-teal-500/30' },
  { label: 'Analytics',      bg: 'from-amber-500/30 to-orange-500/30' },
]

const TESTIMONIALS = [
  { name: 'Alejandro M.',  role: 'Artista independiente',  text: 'Ahora entiendo exactamente cuánto genera cada canción en cada plataforma. Antes me perdía en Excel, ahora todo está claro.', stars: 5, avatar: 'AM' },
  { name: 'Carolina V.',   role: 'Productora musical',     text: 'Subí mis reportes de 3 distribuidoras diferentes y en minutos tuve todo consolidado. El motor es increíblemente preciso.',     stars: 5, avatar: 'CV' },
  { name: 'Rodrigo T.',    role: 'Manager de artistas',    text: 'La función de splits y contratos me ahorra horas cada mes. Indispensable para cualquier equipo musical profesional.',           stars: 5, avatar: 'RT' },
  { name: 'Valentina P.',  role: 'Cantautora',             text: 'Nunca había tenido tanta claridad sobre mis regalías. Los gráficos son hermosos y muy fáciles de interpretar.',               stars: 5, avatar: 'VP' },
  { name: 'Diego F.',      role: 'Sello independiente',    text: 'Manejo 20 artistas y esta plataforma centraliza todo. El análisis por país me ayudó a enfocar campañas de marketing.',        stars: 5, avatar: 'DF' },
]

const FAQ_ITEMS = [
  { q: '¿Qué distribuidoras son compatibles?', a: 'Soportamos más de 15 distribuidoras incluyendo DistroKid, TuneCore, CD Baby, Ditto, ONErpm, Believe, Symphonic, RouteNote, UnitedMasters, Too Lost y más. El motor detecta el proveedor automáticamente.' },
  { q: '¿Cómo funciona el análisis automático?', a: 'El motor lee el archivo, detecta el proveedor por el nombre y los encabezados, normaliza las columnas y suma los valores usando la columna correcta según la estrategia de cada distribuidora.' },
  { q: '¿Cómo se calculan las regalías?', a: 'Nunca recalculamos las regalías. Simplemente sumamos la columna de ingresos netos que el proveedor ya calculó. Transparencia total.' },
  { q: '¿Puedo subir varios reportes?', a: 'Sí. Puedes subir tantos reportes como quieras. Todos se almacenan en tu historial y puedes compararlos por período.' },
  { q: '¿Cómo funcionan las suscripciones?', a: 'Ofrecemos planes Diario, Mensual, Trimestral y Anual. El pago se procesa vía PayPal o Bold. Tu cuenta se activa automáticamente al completar el pago.' },
  { q: '¿Mis datos están seguros?', a: 'Sí. Toda la información se almacena en Supabase con cifrado en reposo y Row Level Security. Solo tú puedes acceder a tus reportes.' },
]

// ── Animated Counter ──────────────────────────────────────
function AnimatedCounter({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    if (!inView) return
    let start = 0
    const duration = 2000
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setCount(target); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [inView, target])

  const fmt = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
    return n.toString()
  }

  return <span ref={ref}>{fmt(count)}{suffix}</span>
}

// ── Fade-in wrapper ───────────────────────────────────────
const FadeUp = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <motion.div
    initial={{ opacity: 0, y: 32 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    className={className}
  >
    {children}
  </motion.div>
)

// ── Navbar ────────────────────────────────────────────────
function Navbar({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'backdrop-blur-xl border-b border-white/8' : ''}`}
      style={{ background: scrolled ? 'rgba(10,8,30,0.88)' : 'transparent' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onNavigate('/')}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/40"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            <Music2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">Royalties</p>
            <p className="text-white/40 text-[10px] leading-tight">Music Analytics</p>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace('ó','o').replace('á','a')}`}
              className="px-4 py-2 text-sm text-white/60 hover:text-white rounded-lg hover:bg-white/5 transition-all">{l}</a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <button onClick={() => onNavigate('/dashboard')}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>Ir al Dashboard</button>
          ) : (
            <>
              <button onClick={() => onNavigate('/login')} className="text-sm text-white/60 hover:text-white transition-colors">Iniciar sesión</button>
              <button onClick={() => onNavigate('/login?signup=true')}
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all hover:opacity-90 shadow-lg shadow-indigo-500/30"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>Suscríbete</button>
            </>
          )}
        </div>
        <button className="md:hidden text-white/60 hover:text-white" onClick={() => setOpen(v => !v)}>
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-white/10 px-6 py-4 space-y-1"
          style={{ background: 'rgba(10,8,30,0.97)' }}>
          {NAV_LINKS.map(l => (
            <a key={l} href={`#${l.toLowerCase().replace('ó','o').replace('á','a')}`}
              onClick={() => setOpen(false)}
              className="block py-2 text-sm text-white/60 hover:text-white">{l}</a>
          ))}
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
            <button onClick={() => onNavigate('/login')} className="py-2.5 rounded-lg text-sm text-white/70 border border-white/20">Iniciar sesión</button>
            <button onClick={() => onNavigate('/login?signup=true')}
              className="py-2.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>Suscríbete</button>
          </div>
        </div>
      )}
    </header>
  )
}

// ── Hero ──────────────────────────────────────────────────
function HeroSection({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { user } = useAuth()
  return (
    <section id="inicio" className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Animated glow blobs */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div animate={{ scale: [1,1.15,1], opacity: [0.12,0.2,0.12] }} transition={{ duration: 8, repeat: Infinity }}
          className="absolute top-[-15%] left-[-8%] w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle,#6366f1 0%,transparent 70%)' }} />
        <motion.div animate={{ scale: [1,1.1,1], opacity: [0.08,0.15,0.08] }} transition={{ duration: 10, repeat: Infinity, delay: 2 }}
          className="absolute top-[20%] right-[-10%] w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle,#8b5cf6 0%,transparent 70%)' }} />
        <motion.div animate={{ scale: [1,1.2,1], opacity: [0.06,0.12,0.06] }} transition={{ duration: 12, repeat: Infinity, delay: 4 }}
          className="absolute bottom-[5%] left-[25%] w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle,#06b6d4 0%,transparent 70%)' }} />
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center w-full">
        {/* Left */}
        <div>
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-indigo-500/30 mb-6 text-xs text-indigo-300"
            style={{ background: 'rgba(99,102,241,0.1)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Motor de análisis V2.0 · Ahora disponible
          </motion.div>

          <motion.h1 initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.1] mb-6">
            Entiende tus regalías.{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc,#67e8f9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Impulsa tu carrera musical.
            </span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="text-white/60 text-lg leading-relaxed mb-8 max-w-lg">
            Analiza automáticamente tus reportes de regalías, descubre cuánto genera cada canción, artista, plataforma y país desde un único lugar.
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-wrap gap-3 mb-10">
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate('/login?signup=true')}
              className="flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-white text-sm shadow-xl shadow-indigo-500/40 hover:shadow-indigo-500/60 transition-shadow"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              Suscríbete <ArrowRight className="w-4 h-4" />
            </motion.button>
            {user && (
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate('/dashboard')}
                className="flex items-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-white text-sm border border-white/20 hover:border-white/40 transition-all"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <Play className="w-4 h-4" /> Ir al Dashboard
              </motion.button>
            )}
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/50">
            {['Compatible con múltiples distribuidoras','Procesamiento automático','Datos seguros','Análisis en segundos'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />{t}
              </span>
            ))}
          </motion.div>
        </div>

        {/* Right — Dashboard mock */}
        <motion.div initial={{ opacity: 0, x: 40, y: 20 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }}
          className="hidden lg:block">
          <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            className="relative">
            <div className="absolute inset-0 rounded-2xl blur-3xl opacity-30" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }} />
            <div className="relative rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-indigo-500/20"
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}>
              {/* Window chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
                <div className="ml-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.3)' }}>
                    <Music2 className="w-3 h-3 text-indigo-300" />
                  </div>
                  <span className="text-white text-xs font-semibold">Royalties · Dashboard</span>
                </div>
              </div>
              {/* Mock dashboard content */}
              <div className="flex" style={{ minHeight: 380 }}>
                <div className="w-36 border-r border-white/10 p-3 space-y-1 flex-shrink-0">
                  {['Dashboard','Subir Reporte','Reportes','Contratos','Analytics','Artistas','Canciones','Plataformas'].map((item,i) => (
                    <div key={item} className={`text-[10px] px-2.5 py-1.5 rounded-lg ${i===0?'text-indigo-300 bg-indigo-500/20 font-semibold':'text-white/40'}`}>{item}</div>
                  ))}
                </div>
                <div className="flex-1 p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-white text-sm font-semibold">Hola, Victor 👋</p>
                      <p className="text-white/40 text-[10px]">Resumen de tus regalías</p>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>+ Subir</div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[['Ingresos','$7,842','↑12%'],['Streams','3.2M','↑8%'],['Canciones','348','↑3'],['Países','142','🌍']].map(([l,v,s]) => (
                      <div key={l} className="rounded-lg p-2.5 border border-white/10" style={{background:'rgba(255,255,255,0.04)'}}>
                        <p className="text-white/40 text-[9px] mb-1">{l}</p>
                        <p className="text-white text-xs font-bold">{v}</p>
                        <p className="text-emerald-400 text-[9px]">{s}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg border border-white/10 p-3" style={{background:'rgba(255,255,255,0.03)'}}>
                    <p className="text-white/50 text-[10px] mb-2">Ingresos por mes</p>
                    <div className="flex items-end gap-1 h-16">
                      {[30,45,35,60,50,80,65,90,75,85,70,95].map((h,i) => (
                        <div key={i} className="flex-1 rounded-sm transition-all" style={{
                          height:`${h}%`,
                          background: i===11 ? 'linear-gradient(to top,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.25)'
                        }} />
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 p-2.5" style={{background:'rgba(255,255,255,0.03)'}}>
                    <p className="text-white/50 text-[10px] mb-2">Top canciones</p>
                    {[['Midnight Drive','Spotify','$842'],['Neon Lights','Apple Music','$634'],['Rhythm Flow','YouTube','$521']].map(([s,p,e]) => (
                      <div key={s} className="flex items-center justify-between py-1 border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded bg-indigo-500/30 flex items-center justify-center"><Disc3 className="w-2.5 h-2.5 text-indigo-300"/></div>
                          <div><p className="text-white text-[9px] font-medium">{s}</p><p className="text-white/30 text-[8px]">{p}</p></div>
                        </div>
                        <span className="text-emerald-400 text-[9px] font-bold">{e}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

// ── Stats counters ────────────────────────────────────────
const STATS_DEFAULT = [
  { label: 'Streams Analizados', target: 2500000, icon: <TrendingUp className="w-5 h-5" />, color: 'text-indigo-400' },
  { label: 'Registros Procesados', target: 500000, icon: <BarChart3 className="w-5 h-5" />, color: 'text-violet-400' },
  { label: 'Países Analizados', target: 150, icon: <MapPin className="w-5 h-5" />, color: 'text-cyan-400' },
  { label: 'Distribuidoras Compatibles', target: 40, icon: <Globe className="w-5 h-5" />, color: 'text-emerald-400' },
  { label: 'Artistas Analizados', target: 1000, icon: <Users className="w-5 h-5" />, color: 'text-pink-400' },
]

function StatsSection() {
  return (
    <section className="py-20 relative">
      <div className="absolute inset-0 opacity-30" style={{ background: 'linear-gradient(180deg,transparent,rgba(99,102,241,0.08),transparent)' }} />
      <div className="max-w-7xl mx-auto px-6">
        <FadeUp className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Confiado por artistas en todo el mundo</h2>
          <p className="text-white/50 max-w-lg mx-auto">Procesamos millones de registros con precisión para que tus números siempre sean exactos.</p>
        </FadeUp>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {STATS_DEFAULT.map((s, i) => (
            <FadeUp key={s.label} delay={i * 0.08}>
              <motion.div whileHover={{ scale: 1.04, y: -4 }} transition={{ type: 'spring', stiffness: 300 }}
                className="rounded-2xl p-6 border border-white/10 hover:border-white/20 text-center transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className={`flex justify-center mb-3 ${s.color}`}>{s.icon}</div>
                <p className="text-3xl font-extrabold text-white mb-1">
                  +<AnimatedCounter target={s.target} />
                </p>
                <p className="text-white/50 text-xs leading-tight">{s.label}</p>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────
function FeaturesSection() {
  return (
    <section id="funciones" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <FadeUp className="text-center mb-16">
          <span className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3 block">Funciones</span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Todo lo que necesitas para{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              gestionar tus regalías
            </span>
          </h2>
        </FadeUp>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <FadeUp key={f.title} delay={i * 0.07}>
              <motion.div whileHover={{ scale: 1.02, y: -4 }} transition={{ type: 'spring', stiffness: 300 }}
                className="rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all h-full"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>{f.icon}</div>
                <h3 className="text-white font-semibold mb-2 text-sm">{f.title}</h3>
                <p className="text-white/50 text-xs leading-relaxed">{f.desc}</p>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────
function HowSection() {
  return (
    <section className="py-24 relative">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />
      <div className="max-w-7xl mx-auto px-6">
        <FadeUp className="text-center mb-16">
          <span className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3 block">¿Cómo funciona?</span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Cuatro pasos, resultados inmediatos</h2>
          <p className="text-white/50 max-w-lg mx-auto">Desde subir tu archivo hasta tener un análisis completo, todo en menos de un minuto.</p>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {HOW_STEPS.map((s, i) => (
            <FadeUp key={s.num} delay={i * 0.1}>
              <motion.div whileHover={{ scale: 1.03, y: -6 }} transition={{ type: 'spring', stiffness: 280 }}
                className="relative rounded-2xl p-6 border border-white/10 hover:border-indigo-500/40 transition-all group"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="absolute top-4 right-4 text-5xl font-black text-white/5 group-hover:text-white/8 transition-all select-none">{s.num}</div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 text-indigo-400"
                  style={{ background: 'rgba(99,102,241,0.15)' }}>{s.icon}</div>
                <h3 className="text-white font-semibold mb-2">{s.title}</h3>
                <p className="text-white/50 text-xs leading-relaxed">{s.desc}</p>
                {i < HOW_STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-px bg-indigo-500/40" />
                )}
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Screenshots ───────────────────────────────────────────
function ScreenshotsSection() {
  const [active, setActive] = useState(0)
  return (
    <section id="plataforma" className="py-24">
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
      <div className="max-w-7xl mx-auto px-6">
        <FadeUp className="text-center mb-14">
          <span className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3 block">La plataforma</span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Explora la plataforma</h2>
          <p className="text-white/50 max-w-lg mx-auto">Una interfaz diseñada para músicos y managers. Potente pero intuitiva.</p>
        </FadeUp>
        {/* Tab nav */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {SCREENSHOTS.map((s, i) => (
            <motion.button key={s.label} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
              onClick={() => setActive(i)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${active===i ? 'text-white' : 'text-white/50 hover:text-white/80 border border-white/10 hover:border-white/20'}`}
              style={active===i ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : { background: 'rgba(255,255,255,0.04)' }}>
              {s.label}
            </motion.button>
          ))}
        </div>
        {/* Preview card */}
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}>
            <div className={`relative rounded-2xl border border-white/10 overflow-hidden bg-gradient-to-br ${SCREENSHOTS[active].bg} min-h-[360px] flex items-center justify-center`}
              style={{ backdropFilter: 'blur(12px)' }}>
              <div className="absolute inset-0 bg-black/40" />
              <div className="relative z-10 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white"
                  style={{ background: 'rgba(255,255,255,0.1)' }}>
                  <BarChart3 className="w-8 h-8" />
                </div>
                <p className="text-white text-2xl font-bold mb-2">{SCREENSHOTS[active].label}</p>
                <p className="text-white/50 text-sm">Vista previa disponible tras suscribirte</p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

// ── Distributors infinite scroll ──────────────────────────
function DistributorsSection() {
  const items = [...DISTRIBUTORS, ...DISTRIBUTORS]
  return (
    <section className="py-16 overflow-hidden">
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="max-w-7xl mx-auto px-6 mb-10 text-center">
        <FadeUp>
          <p className="text-white/40 text-sm font-medium tracking-wider uppercase">Compatible con las principales distribuidoras y plataformas</p>
        </FadeUp>
      </div>
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(90deg,#0f0c29,transparent)' }} />
        <div className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(-90deg,#0f0c29,transparent)' }} />
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
          className="flex gap-8 items-center whitespace-nowrap">
          {items.map((d, i) => (
            <div key={i} className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <Disc3 className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <span className="text-white/60 text-sm font-medium">{d}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

// ── Pricing ───────────────────────────────────────────────
function PricingSection({ onNavigate }: { onNavigate: (p: string) => void }) {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    db.from('plans').select('id,name,slug,price,currency,duration_days,badge,display_order')
      .eq('is_active', true).order('display_order', { ascending: true })
      .then(({ data }: { data: PlanRow[] | null }) => { setPlans(data ?? []); setLoading(false) })
  }, [])
  return (
    <section id="precios" className="py-24">
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
      <div className="max-w-5xl mx-auto px-6">
        <FadeUp className="text-center mb-14">
          <span className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3 block">Precios</span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Elige tu plan</h2>
          <p className="text-white/50 max-w-lg mx-auto">Acceso completo a todas las funciones. Sin límites, sin restricciones.</p>
        </FadeUp>
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {plans.map((plan, i) => {
              const meta = PLAN_META[plan.slug] ?? PLAN_META['monthly']
              const isPopular = plan.badge === 'Popular'
              return (
                <FadeUp key={plan.id} delay={i * 0.08}>
                  <motion.div whileHover={{ scale: 1.03, y: -6 }} transition={{ type: 'spring', stiffness: 280 }}
                    className={`relative rounded-2xl p-6 border flex flex-col h-full transition-all ${isPopular ? 'border-indigo-500/60 shadow-xl shadow-indigo-500/20' : 'border-white/10 hover:border-white/20'}`}
                    style={{ background: isPopular ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)' }}>
                    {plan.badge && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap"
                        style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}>{plan.badge}</span>
                    )}
                    <div className={`text-xl mb-3 ${meta.color}`}>{meta.emoji}</div>
                    <p className="text-white font-bold text-base mb-1">{plan.name}</p>
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-3xl font-extrabold text-white">${plan.price}</span>
                      <span className="text-white/40 text-sm">{plan.currency}</span>
                    </div>
                    <p className="text-white/40 text-xs mb-5 flex-1">
                      {plan.duration_days === 1 ? '24 horas de acceso' : `${plan.duration_days} días de acceso`}
                    </p>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => onNavigate('/login?signup=true')}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${isPopular ? 'text-white hover:opacity-90' : 'text-white/80 border border-white/20 hover:border-white/40'}`}
                      style={isPopular ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : { background: 'rgba(255,255,255,0.06)' }}>
                      Suscríbete
                    </motion.button>
                  </motion.div>
                </FadeUp>
              )
            })}
          </div>
        )}
        <FadeUp>
          <div className="rounded-2xl p-6 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <p className="text-white font-semibold mb-5 text-sm text-center">Incluido en todos los planes</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {PLAN_FEATURES.map(f => (
                <div key={f} className="flex items-center gap-2.5">
                  <div className="w-4 h-4 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                  </div>
                  <span className="text-white/60 text-xs">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

// ── Testimonials ──────────────────────────────────────────
interface TestimonialRow {
  id: string; name: string; role: string; comment: string; stars: number
}

function TestimonialsSection() {
  const [items, setItems] = useState<TestimonialRow[]>([])
  const [idx, setIdx] = useState(0)
  const [showForm, setShowForm] = useState(false)
  // Form state
  const [name, setName]       = useState('')
  const [role, setRole]       = useState('')
  const [comment, setComment] = useState('')
  const [stars, setStars]     = useState(5)
  const [hover, setHover]     = useState(0)
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [formErr, setFormErr] = useState('')

  // Load approved testimonials from Supabase, fallback to hardcoded
  useEffect(() => {
    db.from('testimonials')
      .select('id,name,role,comment,stars')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .then(({ data }: { data: TestimonialRow[] | null }) => {
        if (data && data.length > 0) setItems(data)
        else setItems(TESTIMONIALS.map((t, i) => ({ id: String(i), name: t.name, role: t.role, comment: t.text, stars: t.stars })))
      })
  }, [])

  // Auto-advance carousel
  useEffect(() => {
    if (items.length === 0) return
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 4500)
    return () => clearInterval(t)
  }, [items.length])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormErr('')
    if (!name.trim()) return setFormErr('Escribe tu nombre.')
    if (!comment.trim() || comment.trim().length < 20) return setFormErr('El comentario debe tener al menos 20 caracteres.')
    setSending(true)
    const { error } = await db.from('testimonials').insert({ name: name.trim(), role: role.trim(), comment: comment.trim(), stars })
    setSending(false)
    if (error) return setFormErr('Error al enviar. Intenta de nuevo.')
    setSent(true)
    setName(''); setRole(''); setComment(''); setStars(5)
  }

  return (
    <section className="py-24">
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
      <div className="max-w-4xl mx-auto px-6">
        <FadeUp className="text-center mb-14">
          <span className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3 block">Testimonios</span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Lo que opinan nuestros usuarios</h2>
        </FadeUp>

        {/* Carousel */}
        {items.length > 0 && (
          <div className="relative mb-10">
            <AnimatePresence mode="wait">
              <motion.div key={idx} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.4 }}
                className="rounded-2xl p-8 border border-white/10 text-center"
                style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-white font-bold text-lg"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  {items[idx].name.slice(0,2).toUpperCase()}
                </div>
                <div className="flex justify-center gap-0.5 mb-4">
                  {Array.from({ length: items[idx].stars }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-white/80 text-base leading-relaxed mb-6 max-w-2xl mx-auto italic">"{items[idx].comment}"</p>
                <p className="text-white font-semibold">{items[idx].name}</p>
                {items[idx].role && <p className="text-white/40 text-sm">{items[idx].role}</p>}
              </motion.div>
            </AnimatePresence>
            <div className="flex justify-center gap-2 mt-6">
              {items.map((_, i) => (
                <button key={i} onClick={() => setIdx(i)}
                  className={`h-2 rounded-full transition-all ${i===idx ? 'bg-indigo-400 w-6' : 'bg-white/20 hover:bg-white/40 w-2'}`} />
              ))}
            </div>
          </div>
        )}

        {/* CTA to open form */}
        {!showForm && !sent && (
          <FadeUp className="text-center">
            <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white/80 border border-white/20 hover:border-indigo-500/50 hover:text-white transition-all"
              style={{ background: 'rgba(255,255,255,0.05)' }}>
              <Star className="w-4 h-4 text-yellow-400" /> Dejar mi opinión
            </motion.button>
          </FadeUp>
        )}

        {/* Submission form */}
        <AnimatePresence>
          {showForm && !sent && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}
              className="mt-6 rounded-2xl border border-white/10 p-8"
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}>
              <h3 className="text-white font-bold text-lg mb-1">Comparte tu experiencia</h3>
              <p className="text-white/50 text-sm mb-6">Tu opinión será revisada antes de publicarse.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/60 text-xs mb-1.5 block">Tu nombre *</label>
                    <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Carlos M."
                      className="w-full px-4 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 text-sm"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} required />
                  </div>
                  <div>
                    <label className="text-white/60 text-xs mb-1.5 block">Rol / cargo (opcional)</label>
                    <input value={role} onChange={e => setRole(e.target.value)} placeholder="Ej. Artista independiente"
                      className="w-full px-4 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 text-sm"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} />
                  </div>
                </div>
                {/* Star picker */}
                <div>
                  <label className="text-white/60 text-xs mb-2 block">Calificación *</label>
                  <div className="flex gap-1.5">
                    {[1,2,3,4,5].map(s => (
                      <button key={s} type="button" onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(0)} onClick={() => setStars(s)}>
                        <Star className={`w-6 h-6 transition-colors ${(hover||stars) >= s ? 'text-yellow-400 fill-yellow-400' : 'text-white/20'}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Tu comentario * (mín. 20 caracteres)</label>
                  <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4}
                    placeholder="Cuéntanos cómo te ha ayudado Royalties Music Analytics..."
                    className="w-full px-4 py-2.5 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 text-sm resize-none"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} required />
                </div>
                {formErr && <p className="text-red-300 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{formErr}</p>}
                <div className="flex gap-3">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} type="submit" disabled={sending}
                    className="flex-1 py-3 rounded-xl font-semibold text-white text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                    {sending ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Enviando...</> : 'Enviar opinión'}
                  </motion.button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-5 py-3 rounded-xl text-sm text-white/50 hover:text-white border border-white/10 hover:border-white/20 transition-all">
                    Cancelar
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* Success state */}
          {sent && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}
              className="mt-6 rounded-2xl border border-emerald-500/30 p-8 text-center"
              style={{ background: 'rgba(16,185,129,0.06)' }}>
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-white font-semibold mb-1">¡Gracias por tu opinión!</p>
              <p className="text-white/50 text-sm">Será revisada y publicada pronto.</p>
              <button onClick={() => { setSent(false); setShowForm(false) }} className="mt-4 text-xs text-white/40 hover:text-white/70 transition-colors">
                Dejar otra opinión
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────
function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section id="faq" className="py-24">
      <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
      <div className="max-w-3xl mx-auto px-6">
        <FadeUp className="text-center mb-14">
          <span className="text-xs font-semibold text-indigo-400 tracking-widest uppercase mb-3 block">FAQ</span>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Preguntas frecuentes</h2>
        </FadeUp>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <FadeUp key={i} delay={i * 0.05}>
              <motion.div whileHover={{ scale: 1.005 }}
                className="rounded-2xl border border-white/10 hover:border-white/20 overflow-hidden transition-all"
                style={{ background: 'rgba(255,255,255,0.04)' }}>
                <button className="w-full flex items-center justify-between px-6 py-4 text-left" onClick={() => setOpen(open===i ? null : i)}>
                  <span className="text-white font-medium text-sm pr-4">{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-white/40 flex-shrink-0 transition-transform ${open===i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {open === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}>
                      <div className="px-6 pb-4 border-t border-white/8">
                        <p className="text-white/60 text-sm leading-relaxed pt-3">{item.a}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CTA Final ─────────────────────────────────────────────
function CTASection({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { user } = useAuth()
  return (
    <section className="py-24">
      <div className="max-w-4xl mx-auto px-6">
        <FadeUp>
          <motion.div whileHover={{ scale: 1.01 }} transition={{ type: 'spring', stiffness: 200 }}
            className="relative rounded-3xl p-12 text-center border border-white/10 overflow-hidden"
            style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.12),rgba(6,182,212,0.08))' }}>
            {/* glow */}
            <div className="absolute inset-0 opacity-20 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 0%,#6366f1 0%,transparent 70%)' }} />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

            <div className="relative z-10">
              <motion.div animate={{ rotate: [0,5,-5,0] }} transition={{ duration: 4, repeat: Infinity }}
                className="text-4xl mb-6 inline-block">🎵</motion.div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
                Empieza a entender tus regalías como un profesional.
              </h2>
              <p className="text-white/60 max-w-xl mx-auto mb-8 text-base leading-relaxed">
                Centraliza todos tus reportes, analiza tus ingresos y toma mejores decisiones desde una única plataforma.
              </p>
              <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate(user ? '/dashboard' : '/login?signup=true')}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-white text-base shadow-2xl shadow-indigo-500/40 hover:shadow-indigo-500/60 transition-shadow"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                {user ? 'Ir al Dashboard' : 'Suscríbete'} <ChevronRight className="w-5 h-5" />
              </motion.button>
              <p className="text-white/30 text-xs mt-4">Sin compromisos · Actívate al instante</p>
            </div>
          </motion.div>
        </FadeUp>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────
function Footer({ onNavigate }: { onNavigate: (p: string) => void }) {
  return (
    <footer className="border-t border-white/10 py-14">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                <Music2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Royalties</p>
                <p className="text-white/30 text-[10px]">Music Analytics</p>
              </div>
            </div>
            <p className="text-white/40 text-xs leading-relaxed">La plataforma definitiva para analizar y gestionar tus regalías musicales.</p>
          </div>
          <div>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-4">Producto</p>
            <div className="space-y-2">
              {['Funciones','Precios','Plataforma'].map(l => (
                <a key={l} href={`#${l.toLowerCase()}`} className="block text-white/40 text-sm hover:text-white/70 transition-colors">{l}</a>
              ))}
            </div>
          </div>
          <div>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-4">Cuenta</p>
            <div className="space-y-2">
              <button onClick={() => onNavigate('/login')} className="block text-white/40 text-sm hover:text-white/70 transition-colors">Iniciar sesión</button>
              <button onClick={() => onNavigate('/login?signup=true')} className="block text-white/40 text-sm hover:text-white/70 transition-colors">Suscribirse</button>
            </div>
          </div>
          <div>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider mb-4">Legal</p>
            <div className="space-y-2">
              {['Política de privacidad','Términos de uso','Soporte'].map(l => (
                <a key={l} href="#" className="block text-white/40 text-sm hover:text-white/70 transition-colors">{l}</a>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-white/25 text-xs">© {new Date().getFullYear()} Royalties Music Analytics. Todos los derechos reservados.</p>
          <div className="flex gap-4 text-xs text-white/30">
            <a href="#inicio" className="hover:text-white/60 transition-colors">↑ Volver arriba</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ── Main export ───────────────────────────────────────────
export default function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const nav = (path: string) => navigate(path)

  return (
    <div className="relative" style={{ background: 'linear-gradient(135deg,#0a081e 0%,#110d2e 35%,#0b1630 70%,#08101f 100%)', minHeight: '100vh' }}>
      {/* Global background grid */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute inset-0 opacity-[0.018]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '72px 72px' }} />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>
        <Navbar onNavigate={nav} />

        <HeroSection onNavigate={nav} />

        <div className="max-w-7xl mx-auto px-6"><div className="border-t border-white/8" /></div>

        <StatsSection />

        <div className="max-w-7xl mx-auto px-6"><div className="border-t border-white/8" /></div>

        <FeaturesSection />

        <div className="max-w-7xl mx-auto px-6"><div className="border-t border-white/8" /></div>

        <HowSection />

        <div className="max-w-7xl mx-auto px-6"><div className="border-t border-white/8" /></div>

        <ScreenshotsSection />

        <DistributorsSection />

        <div className="max-w-7xl mx-auto px-6"><div className="border-t border-white/8" /></div>

        <PricingSection onNavigate={nav} />

        <div className="max-w-7xl mx-auto px-6"><div className="border-t border-white/8" /></div>

        <TestimonialsSection />

        <div className="max-w-7xl mx-auto px-6"><div className="border-t border-white/8" /></div>

        <FAQSection />

        <CTASection onNavigate={nav} />

        <Footer onNavigate={nav} />
      </div>
    </div>
  )
}
