import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { motion } from 'framer-motion'
import {
  Music2, Upload, BarChart3, PieChart, FileText,
  Globe, ShieldCheck, ChevronRight, Star, Zap, Crown, Sparkles,
  Play, Check, ArrowRight, Menu, X,
} from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ─────────────────────────────────────────────────
interface PlanRow {
  id: string
  name: string
  slug: string
  price: number
  currency: string
  duration_days: number
  badge: string | null
  display_order: number
}

// ── Helpers ────────────────────────────────────────────────
const PLAN_META: Record<string, {
  icon: React.ReactNode
  color: string
  gradient: string
  emoji: string
}> = {
  daily:     { icon: <Zap className="w-5 h-5" />,      color: 'text-yellow-400', gradient: 'from-yellow-500/20 to-orange-500/20',  emoji: '⚡' },
  monthly:   { icon: <Star className="w-5 h-5" />,     color: 'text-indigo-400', gradient: 'from-indigo-500/20 to-violet-500/20',  emoji: '⭐' },
  quarterly: { icon: <Crown className="w-5 h-5" />,    color: 'text-cyan-400',   gradient: 'from-cyan-500/20 to-blue-500/20',      emoji: '👑' },
  annual:    { icon: <Sparkles className="w-5 h-5" />, color: 'text-emerald-400',gradient: 'from-emerald-500/20 to-teal-500/20',   emoji: '✨' },
}

const NAV_LINKS = ['Inicio', 'Funciones', 'Precios', 'Recursos', 'Contacto']

const FEATURES = [
  { icon: <Upload className="w-6 h-6" />,    title: 'Importa tus reportes',      desc: 'Sube tus reportes de DistroKid, TuneCore, CD Baby, SoundOn y más en segundos.', color: 'bg-violet-500/20 text-violet-400' },
  { icon: <BarChart3 className="w-6 h-6" />, title: 'Análisis automático',        desc: 'Procesamos tus datos y te mostramos métricas claras y poderosas.',              color: 'bg-emerald-500/20 text-emerald-400' },
  { icon: <PieChart className="w-6 h-6" />,  title: 'Reportes visuales',          desc: 'Gráficos interactivos para que entiendas cómo crecen tus ingresos.',            color: 'bg-pink-500/20 text-pink-400' },
  { icon: <FileText className="w-6 h-6" />,  title: 'Contratos & Splits',         desc: 'Gestiona tus splits, contratos y porcentajes de regalías de cada proyecto.',   color: 'bg-blue-500/20 text-blue-400' },
  { icon: <Globe className="w-6 h-6" />,     title: 'Datos globales',             desc: 'Visualiza tus ingresos por país, moneda y plataforma en un solo lugar.',       color: 'bg-amber-500/20 text-amber-400' },
  { icon: <ShieldCheck className="w-6 h-6" />, title: 'Seguro y privado',         desc: 'Tus datos están protegidos con cifrado y respaldos automáticos.',             color: 'bg-teal-500/20 text-teal-400' },
]

const DISTRIBUTORS = ['DistroKid', 'TuneCore', 'CD Baby', 'SoundOn', 'Spotify', 'Apple Music', 'YouTube', 'Amazon Music', 'TIDAL']

const PLAN_FEATURES = [
  'Dashboard de regalías completo',
  'Subida de reportes ilimitada',
  'Análisis por canción, artista, plataforma y país',
  'Detección de streams fraudulentos',
  'Exportación en Excel, CSV y PDF',
  'Gestión de contratos y splits',
  'Soporte completo',
]

// ── Sub-components ─────────────────────────────────────────
function Navbar({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'backdrop-blur-xl border-b border-white/10' : ''
    }`} style={{ background: scrolled ? 'rgba(15,12,41,0.85)' : 'transparent' }}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30"
            style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            <Music2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">Royalties</p>
            <p className="text-white/40 text-[10px] leading-tight">Music Analytics</p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(link => (
            <a key={link} href={`#${link.toLowerCase()}`}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                link === 'Inicio' ? 'text-indigo-400' : 'text-white/60 hover:text-white'
              }`}>
              {link}
            </a>
          ))}
        </nav>

        {/* CTA buttons */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <button onClick={() => onNavigate('/dashboard')}
              className="text-sm text-white/70 hover:text-white transition-colors">
              Ir al Dashboard
            </button>
          ) : (
            <>
              <button onClick={() => onNavigate('/login')}
                className="text-sm text-white/70 hover:text-white transition-colors">
                Iniciar sesión
              </button>
              <button onClick={() => onNavigate('/subscription')}
                className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                Comenzar gratis
              </button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden text-white/70 hover:text-white" onClick={() => setMenuOpen(v => !v)}>
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/10 px-6 py-4 space-y-2"
          style={{ background: 'rgba(15,12,41,0.97)' }}>
          {NAV_LINKS.map(link => (
            <a key={link} href={`#${link.toLowerCase()}`} onClick={() => setMenuOpen(false)}
              className="block py-2 text-sm text-white/70 hover:text-white transition-colors">
              {link}
            </a>
          ))}
          <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
            {user ? (
              <button onClick={() => onNavigate('/dashboard')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                Ir al Dashboard
              </button>
            ) : (
              <>
                <button onClick={() => onNavigate('/login')}
                  className="w-full py-2.5 rounded-lg text-sm text-white/70 border border-white/20">
                  Iniciar sesión
                </button>
                <button onClick={() => onNavigate('/subscription')}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                  Comenzar gratis
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}

// ── Hero Section ───────────────────────────────────────────
function HeroSection({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section id="inicio" className="relative min-h-screen flex items-center pt-16">
      <div className="max-w-7xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full">
        {/* Left */}
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white leading-tight mb-6">
            Entiende tus regalías.{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Impulsa tu carrera.
            </span>
          </h1>
          <p className="text-white/60 text-lg mb-8 max-w-md">
            La plataforma todo en uno para analizar, administrar y maximizar tus ingresos musicales en todas las plataformas.
          </p>
          <div className="flex flex-wrap gap-3 mb-10">
            <button onClick={() => onNavigate('/subscription')}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 shadow-lg shadow-indigo-500/30"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              Comenzar gratis <ArrowRight className="w-4 h-4" />
            </button>
            <button className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white text-sm border border-white/20 hover:border-white/40 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <Play className="w-4 h-4" /> Ver demo
            </button>
          </div>
          <div className="flex flex-wrap gap-5 text-xs text-white/50 mb-8">
            {['Importa reportes fácilmente', 'Análisis automáticos', 'Datos 100% seguros'].map(t => (
              <span key={t} className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-400" /> {t}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm text-white/50">
            <span className="text-yellow-400">★★★★★</span>
            <span>Más de 500 artistas ya confían en nosotros</span>
          </div>
        </motion.div>

        {/* Right — App screenshot mock */}
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
          className="hidden lg:block">
          <div className="rounded-2xl border border-white/10 overflow-hidden shadow-2xl shadow-indigo-500/10"
            style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}>
            {/* Fake window chrome */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
              <div className="ml-3 flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background:'rgba(99,102,241,0.3)' }}>
                  <Music2 className="w-3 h-3 text-indigo-300" />
                </div>
                <div>
                  <p className="text-white text-xs font-semibold">Royalties</p>
                  <p className="text-white/40 text-[10px]">Music Analytics</p>
                </div>
              </div>
            </div>
            {/* Mock dashboard */}
            <div className="flex" style={{ minHeight: 380 }}>
              {/* Sidebar */}
              <div className="w-36 border-r border-white/10 p-3 space-y-1 flex-shrink-0">
                {['Dashboard','Subir Reporte','Mis Reportes','Contratos','Analytics','Artistas','Canciones','Plataformas'].map((item,i) => (
                  <div key={item} className={`text-[10px] px-2.5 py-1.5 rounded-lg ${i===0?'text-indigo-300 bg-indigo-500/20 font-semibold':'text-white/40'}`}>
                    {item}
                  </div>
                ))}
              </div>
              {/* Content */}
              <div className="flex-1 p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-white text-sm font-semibold">Hola, Victor 👋</p>
                    <p className="text-white/40 text-[10px]">Resumen de tus regalías musicales.</p>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white" style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
                    + Subir Reporte
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[['Ingresos totales','$7,842.55','$'],['Total streams','3,215,876','📈'],['Canciones','348','🎵'],['Países','142','🌍']].map(([label,val,icon]) => (
                    <div key={label} className="rounded-lg p-2.5 border border-white/10" style={{background:'rgba(255,255,255,0.04)'}}>
                      <p className="text-white/40 text-[9px] mb-1">{label}</p>
                      <p className="text-white text-xs font-bold">{val}</p>
                      <span className="text-[10px]">{icon}</span>
                    </div>
                  ))}
                </div>
                {/* Chart placeholder */}
                <div className="rounded-lg border border-white/10 p-3" style={{background:'rgba(255,255,255,0.03)'}}>
                  <p className="text-white/50 text-[10px] mb-2">Ingresos por mes</p>
                  <div className="flex items-end gap-1 h-14">
                    {[30,45,35,60,50,80,65,90,75,85,70,95].map((h,i) => (
                      <div key={i} className="flex-1 rounded-sm" style={{
                        height:`${h}%`,
                        background: i === 11 ? 'linear-gradient(to top,#6366f1,#8b5cf6)' : 'rgba(99,102,241,0.25)'
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ── Features Section ───────────────────────────────────────
function FeaturesSection() {
  return (
    <section id="funciones" className="py-24 relative">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Todo lo que necesitas para gestionar{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              tus regalías
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className="rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all group"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.color}`}>
                {f.icon}
              </div>
              <h3 className="text-white font-semibold mb-2 text-sm">{f.title}</h3>
              <p className="text-white/50 text-xs leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Distributors */}
        <div className="mt-20 text-center">
          <p className="text-white/40 text-sm mb-8">Compatible con las principales distribuidoras y plataformas</p>
          <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
            {DISTRIBUTORS.map(d => (
              <span key={d} className="text-white/30 font-semibold text-sm hover:text-white/60 transition-colors cursor-default">
                {d}
              </span>
            ))}
            <span className="text-white/20 text-sm">y más...</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Pricing Section ────────────────────────────────────────
function PricingSection({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.from('plans')
      .select('id,name,slug,price,currency,duration_days,badge,display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .then(({ data }: { data: PlanRow[] | null }) => {
        setPlans(data ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <section id="precios" className="py-24">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Elige tu plan</h2>
          <p className="text-white/50 text-base max-w-lg mx-auto">
            Todos los planes incluyen acceso completo a todas las funciones. Sin límites, sin restricciones.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            {plans.map((plan, i) => {
              const meta = PLAN_META[plan.slug] ?? PLAN_META['monthly']
              const isPopular = plan.badge === 'Popular'
              return (
                <motion.div key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className={`relative rounded-2xl p-6 border transition-all flex flex-col ${
                    isPopular
                      ? 'border-indigo-500/60 shadow-lg shadow-indigo-500/20'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  style={{ background: isPopular ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)' }}>
                  {plan.badge && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap"
                      style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' }}>
                      {plan.badge}
                    </span>
                  )}
                  <div className={`text-xl mb-3 ${meta.color}`}>{meta.emoji}</div>
                  <p className="text-white font-bold text-base mb-1">{plan.name}</p>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-extrabold text-white">${plan.price}</span>
                    <span className="text-white/40 text-sm">{plan.currency}</span>
                  </div>
                  <p className="text-white/40 text-xs mb-5">
                    {plan.duration_days === 1 ? '24 horas de acceso' : `${plan.duration_days} días de acceso`}
                  </p>
                  <button onClick={() => onNavigate('/subscription')}
                    className={`mt-auto w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      isPopular
                        ? 'text-white hover:opacity-90'
                        : 'text-white/80 border border-white/20 hover:border-white/40'
                    }`}
                    style={isPopular ? { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' } : { background: 'rgba(255,255,255,0.06)' }}>
                    Comenzar ahora
                  </button>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Features included */}
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
      </div>
    </section>
  )
}

// ── Footer ─────────────────────────────────────────────────
function Footer({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <footer className="border-t border-white/10 py-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
            <Music2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Royalties</p>
            <p className="text-white/30 text-[10px]">Music Analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs text-white/40">
          {['Inicio','Funciones','Precios'].map(link => (
            <a key={link} href={`#${link.toLowerCase()}`} className="hover:text-white/70 transition-colors">{link}</a>
          ))}
          <button onClick={() => onNavigate('/login')} className="hover:text-white/70 transition-colors">Iniciar sesión</button>
        </div>
        <p className="text-white/30 text-xs">© {new Date().getFullYear()} Royalties. Todos los derechos reservados.</p>
      </div>
    </footer>
  )
}

// ── Main LandingPage ────────────────────────────────────────
export default function LandingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const handleNavigate = (path: string) => navigate(path)

  return (
    <div className="relative" style={{ background: 'linear-gradient(135deg,#0f0c29 0%,#1a1040 40%,#0d1b3e 100%)', minHeight: '100vh' }}>
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle,#6366f1 0%,transparent 70%)' }} />
        <div className="absolute top-[30%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle,#8b5cf6 0%,transparent 70%)' }} />
        <div className="absolute bottom-[10%] left-[20%] w-[300px] h-[300px] rounded-full opacity-8"
          style={{ background: 'radial-gradient(circle,#06b6d4 0%,transparent 70%)' }} />
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '60px 60px' }} />
      </div>

      <div className="relative" style={{ zIndex: 1 }}>
        <Navbar onNavigate={handleNavigate} />
        <HeroSection onNavigate={handleNavigate} />

        {/* Subtle divider */}
        <div className="max-w-7xl mx-auto px-6">
          <div className="border-t border-white/10" />
        </div>

        <FeaturesSection />

        <div className="max-w-7xl mx-auto px-6">
          <div className="border-t border-white/10" />
        </div>

        <PricingSection onNavigate={handleNavigate} />

        {/* CTA banner */}
        <div className="max-w-7xl mx-auto px-6 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-3xl p-10 text-center border border-white/10"
            style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.15))' }}>
            <h2 className="text-3xl font-bold text-white mb-3">
              Listo para gestionar tus regalías como un profesional?
            </h2>
            <p className="text-white/50 mb-8 max-w-lg mx-auto">
              Únete a más de 500 artistas que ya confían en Royalties para administrar sus ingresos musicales.
            </p>
            <button onClick={() => handleNavigate(user ? '/dashboard' : '/subscription')}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-90 shadow-lg shadow-indigo-500/30"
              style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
              {user ? 'Ir al Dashboard' : 'Comenzar gratis'} <ChevronRight className="w-4 h-4" />
            </button>
          </motion.div>
        </div>

        <Footer onNavigate={handleNavigate} />
      </div>
    </div>
  )
}
