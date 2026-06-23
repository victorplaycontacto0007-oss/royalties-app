import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate } from '../lib/utils'
import {
  Users, Plus, Pencil, Trash2, Power, Loader2,
  Shield, Activity, X, Check, Clock, Crown,
  Calendar, RefreshCw, Zap, Star, Sparkles,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Profile, Subscription, SubscriptionPlan } from '../types/database'
import { differenceInDays, format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const PLAN_OPTIONS: { value: SubscriptionPlan; label: string; days: number; price: number }[] = [
  { value: 'daily',     label: 'Diario (1 día)',       days: 1,   price: 3  },
  { value: 'monthly',   label: 'Mensual (30 días)',    days: 30,  price: 10 },
  { value: 'quarterly', label: 'Trimestral (90 días)', days: 90,  price: 25 },
  { value: 'annual',    label: 'Anual (365 días)',      days: 365, price: 75 },
]

const PLAN_ICONS: Record<string, React.ReactNode> = {
  daily:     <Zap className="w-3.5 h-3.5 text-yellow-400" />,
  monthly:   <Star className="w-3.5 h-3.5 text-primary" />,
  quarterly: <Crown className="w-3.5 h-3.5 text-cyan-400" />,
  annual:    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />,
}

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0
  const days    = Math.floor(totalSeconds / 86400)
  const hours   = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (days > 0)    return `${days}d ${hours}h`
  if (hours > 0)   return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function TimeSince({ createdAt }: { createdAt: string }) {
  const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text-muted font-mono tabular-nums" title={formatDate(createdAt)}>
      <Clock className="w-3 h-3 flex-shrink-0" />{formatDuration(elapsed)}
    </span>
  )
}

type ProfileWithSub = Profile & { subscription?: Subscription | null }
type ModalMode = { type: 'create' } | { type: 'edit'; user: ProfileWithSub } | { type: 'subscription'; user: ProfileWithSub }

export default function AdminPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<ModalMode | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch users + their subscriptions
  const { data: users, isLoading } = useQuery<ProfileWithSub[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: profiles, error } = await db.from('profiles').select('*').order('created_at', { ascending: false })
      if (error) throw error

      // Fetch active subscriptions for all users
      const { data: subs } = await db
        .from('subscriptions')
        .select('*')
        .eq('status', 'active')
        .order('expires_at', { ascending: false })

      const subMap: Record<string, Subscription> = {}
      ;(subs ?? []).forEach((s: Subscription) => {
        // Keep the one with the latest expiry per user
        if (!subMap[s.user_id] || s.expires_at > subMap[s.user_id].expires_at) {
          subMap[s.user_id] = s
        }
      })

      return (profiles as Profile[]).map(p => ({ ...p, subscription: subMap[p.id] ?? null }))
    },
  })

  const { data: activity } = useQuery<Array<{ id: string; action: string; created_at: string }>>({
    queryKey: ['activity-logs'],
    queryFn: async () => {
      const { data } = await db.from('activity_logs').select('id, action, created_at')
        .order('created_at', { ascending: false }).limit(20)
      return (data ?? []) as Array<{ id: string; action: string; created_at: string }>
    },
  })

  const { data: fileCounts } = useQuery<Record<string, number>>({
    queryKey: ['file-counts'],
    queryFn: async () => {
      const { data } = await db.from('reports').select('user_id, status')
      const counts: Record<string, number> = {}
      ;(data ?? []).forEach((r: { user_id: string; status: string }) => {
        if (r.status === 'completed') counts[r.user_id] = (counts[r.user_id] ?? 0) + 1
      })
      return counts
    },
  })

  const toggleActive = async (profile: Profile) => {
    await db.from('profiles').update({ is_active: !profile.is_active }).eq('id', profile.id)
    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
  }

  const deleteUser = async (id: string) => {
    setLoading(true)
    await db.from('profiles').delete().eq('id', id)
    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    setDeleteId(null)
    setLoading(false)
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] })

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
            <Shield className="w-6 h-6 text-accent" /> Administración
          </h1>
          <p className="text-text-muted mt-1">Gestión de usuarios y suscripciones</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" /> Actualizar
          </button>
          <button onClick={() => setModal({ type: 'create' })} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Crear usuario
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users table */}
        <div className="lg:col-span-2">
          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4 text-text-muted" />
              <h2 className="text-sm font-semibold text-text-primary">Usuarios ({users?.length ?? 0})</h2>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
            ) : (
              <div className="divide-y divide-border">
                {users?.map(u => {
                  const sub = u.subscription
                  const daysLeft = sub ? differenceInDays(new Date(sub.expires_at), new Date()) : null
                  const isExpired = sub && new Date(sub.expires_at) < new Date()
                  const hasSub = sub && !isExpired

                  return (
                    <div key={u.id} className="px-6 py-4 flex items-center gap-4">
                      <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-primary text-sm font-semibold">
                          {u.full_name?.[0] ?? u.email[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-text-primary text-sm font-medium truncate">
                          {u.full_name ?? 'Sin nombre'}
                          {u.id === currentUser?.id && <span className="ml-2 text-xs text-text-muted">(tú)</span>}
                        </p>
                        <p className="text-text-muted text-xs truncate">{u.email}</p>
                        <TimeSince createdAt={u.created_at} />
                      </div>
                      {/* Subscription status */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-[100px]">
                        {hasSub ? (
                          <>
                            <div className="flex items-center gap-1">
                              {PLAN_ICONS[sub.plan]}
                              <span className="text-xs text-success font-medium">{daysLeft}d restantes</span>
                            </div>
                            <span className="text-text-muted text-[10px]">
                              Vence {format(new Date(sub.expires_at), 'd MMM', { locale: es })}
                            </span>
                          </>
                        ) : isExpired ? (
                          <span className="text-xs text-error font-medium">Expirada</span>
                        ) : (
                          <span className="text-xs text-text-muted">Sin suscripción</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`badge ${u.role === 'admin' ? 'badge-primary' : 'bg-surface-3 text-text-secondary'}`}>{u.role}</span>
                        <span className={`badge ${u.is_active ? 'badge-success' : 'badge-error'}`}>{u.is_active ? 'Activo' : 'Inactivo'}</span>
                        <span className="text-text-muted text-xs">{fileCounts?.[u.id] ?? 0} arch.</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Manage subscription */}
                        <button onClick={() => setModal({ type: 'subscription', user: u })}
                          className="p-1.5 rounded-lg hover:bg-primary/10 text-text-muted hover:text-primary transition-colors" title="Gestionar suscripción">
                          <Crown className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setModal({ type: 'edit', user: u })}
                          className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => toggleActive(u)}
                          className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'hover:bg-error/10 text-text-muted hover:text-error' : 'hover:bg-success/10 text-text-muted hover:text-success'}`}
                          title={u.is_active ? 'Desactivar' : 'Activar'} disabled={u.id === currentUser?.id}>
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteId(u.id)}
                          className="p-1.5 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors" title="Eliminar"
                          disabled={u.id === currentUser?.id}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Activity log */}
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Activity className="w-4 h-4 text-text-muted" />
            <h2 className="text-sm font-semibold text-text-primary">Actividad reciente</h2>
          </div>
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {activity?.map(log => (
              <div key={log.id} className="px-4 py-3">
                <p className="text-text-secondary text-xs font-medium">{log.action}</p>
                <p className="text-text-muted text-xs mt-0.5">{formatDate(log.created_at)}</p>
              </div>
            ))}
            {(!activity || activity.length === 0) && (
              <div className="px-4 py-8 text-center text-text-muted text-sm">Sin actividad</div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modal?.type === 'create' && (
          <CreateUserModal onClose={() => setModal(null)} onSuccess={() => { setModal(null); refresh() }} />
        )}
        {modal?.type === 'edit' && (
          <EditUserModal user={modal.user} onClose={() => setModal(null)} onSuccess={() => { setModal(null); refresh() }} />
        )}
        {modal?.type === 'subscription' && (
          <SubscriptionModal user={modal.user} onClose={() => setModal(null)} onSuccess={() => { setModal(null); refresh() }} />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDeleteId(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <h3 className="text-text-primary font-semibold mb-2">¿Eliminar usuario?</h3>
              <p className="text-text-muted text-sm mb-6">Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={() => deleteUser(deleteId)} disabled={loading} className="btn-danger flex-1 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Create User Modal ──────────────────────────────────────────────────────
function CreateUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState<'admin' | 'user'>('user')
  const [plan, setPlan]         = useState<SubscriptionPlan>('monthly')
  const [customDays, setCustomDays] = useState<number | ''>('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      // 1. Create auth user
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (signUpErr) throw new Error(signUpErr.message)
      const userId = data.user?.id
      if (!userId) throw new Error('No se pudo crear el usuario.')

      // 2. Wait for profile trigger
      await new Promise(r => setTimeout(r, 1500))

      // 3. Update profile role
      await db.from('profiles').update({ full_name: fullName.trim(), role }).eq('id', userId)

      // 4. Create subscription
      const selectedPlan = PLAN_OPTIONS.find(p => p.value === plan)!
      const days = customDays !== '' ? Number(customDays) : selectedPlan.days
      const now = new Date()
      const expiresAt = addDays(now, days)
      await db.from('subscriptions').insert({
        user_id:    userId,
        plan,
        status:     'active',
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        amount_usd: selectedPlan.price,
      })

      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al crear usuario')
    } finally { setLoading(false) }
  }

  return (
    <ModalWrapper onClose={onClose} title="Crear usuario" icon={<Plus className="w-5 h-5 text-primary" />}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nombre completo</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} className="input" placeholder="Juan Pérez" required />
          </div>
          <div>
            <label className="label">Rol</label>
            <select value={role} onChange={e => setRole(e.target.value as 'admin'|'user')} className="input">
              <option value="user">Usuario</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Correo electrónico</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" placeholder="usuario@email.com" required />
        </div>
        <div>
          <label className="label">Contraseña</label>
          <input type="text" value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="Mínimo 6 caracteres" required minLength={6} />
        </div>
        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-1.5">
            <Crown className="w-4 h-4 text-primary" /> Suscripción
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Plan</label>
              <select value={plan} onChange={e => setPlan(e.target.value as SubscriptionPlan)} className="input">
                {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Días personalizados (opcional)</label>
              <input type="number" value={customDays} onChange={e => setCustomDays(e.target.value === '' ? '' : Number(e.target.value))}
                className="input" placeholder={`Default: ${PLAN_OPTIONS.find(p => p.value === plan)?.days}`} min={1} />
            </div>
          </div>
          <p className="text-text-muted text-xs mt-2">
            Acceso hasta: <strong className="text-text-secondary">
              {format(addDays(new Date(), customDays !== '' ? Number(customDays) : PLAN_OPTIONS.find(p => p.value === plan)!.days), "d 'de' MMMM, yyyy", { locale: es })}
            </strong>
          </p>
        </div>
        {error && <p className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {loading ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </ModalWrapper>
  )
}

// ── Edit User Modal ────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSuccess }: { user: ProfileWithSub; onClose: () => void; onSuccess: () => void }) {
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [role, setRole]         = useState<'admin'|'user'>(user.role)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { error: err } = await db.from('profiles').update({ full_name: fullName, role }).eq('id', user.id)
      if (err) throw err
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setLoading(false) }
  }

  return (
    <ModalWrapper onClose={onClose} title="Editar usuario" icon={<Pencil className="w-5 h-5 text-primary" />}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Nombre completo</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)} className="input" placeholder="Juan Pérez" />
        </div>
        <div>
          <label className="label">Email</label>
          <input value={user.email} className="input opacity-50 cursor-not-allowed" disabled />
        </div>
        <div>
          <label className="label">Rol</label>
          <select value={role} onChange={e => setRole(e.target.value as 'admin'|'user')} className="input">
            <option value="user">Usuario</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {error && <p className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Guardar
          </button>
        </div>
      </form>
    </ModalWrapper>
  )
}

// ── Subscription Modal ─────────────────────────────────────────────────────
function SubscriptionModal({ user, onClose, onSuccess }: { user: ProfileWithSub; onClose: () => void; onSuccess: () => void }) {
  const sub = user.subscription
  const [plan, setPlan]         = useState<SubscriptionPlan>(sub?.plan ?? 'monthly')
  const [customDays, setCustomDays] = useState<number | ''>('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const selectedPlanInfo = PLAN_OPTIONS.find(p => p.value === plan)!
  const days = customDays !== '' ? Number(customDays) : selectedPlanInfo.days
  const expiresAt = addDays(new Date(), days)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      // Cancel existing active subscriptions
      await db.from('subscriptions').update({ status: 'cancelled' })
        .eq('user_id', user.id).eq('status', 'active')

      // Insert new one
      const now = new Date()
      await db.from('subscriptions').insert({
        user_id:    user.id,
        plan,
        status:     'active',
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        amount_usd: selectedPlanInfo.price,
      })
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally { setLoading(false) }
  }

  const handleRevoke = async () => {
    setLoading(true)
    await db.from('subscriptions').update({ status: 'cancelled' }).eq('user_id', user.id).eq('status', 'active')
    onSuccess()
  }

  return (
    <ModalWrapper onClose={onClose} title="Gestionar suscripción" icon={<Crown className="w-5 h-5 text-primary" />}>
      {/* Current status */}
      <div className="mb-4 p-3 rounded-xl bg-surface-2 border border-border">
        <p className="text-text-secondary text-sm font-medium mb-1">{user.full_name ?? user.email}</p>
        {sub && new Date(sub.expires_at) > new Date() ? (
          <div>
            <div className="flex items-center gap-2">
              {PLAN_ICONS[sub.plan]}
              <span className="text-success text-sm font-medium">
                {differenceInDays(new Date(sub.expires_at), new Date())} días restantes
              </span>
            </div>
            <p className="text-text-muted text-xs mt-0.5">
              Vence: {format(new Date(sub.expires_at), "d 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
        ) : (
          <p className="text-text-muted text-sm">Sin suscripción activa</p>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Plan</label>
            <select value={plan} onChange={e => setPlan(e.target.value as SubscriptionPlan)} className="input">
              {PLAN_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Días personalizados</label>
            <input type="number" value={customDays} onChange={e => setCustomDays(e.target.value === '' ? '' : Number(e.target.value))}
              className="input" placeholder={`${selectedPlanInfo.days} días`} min={1} />
          </div>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
          <div>
            <p className="text-text-secondary text-xs">Acceso hasta:</p>
            <p className="text-text-primary text-sm font-semibold">
              {format(expiresAt, "d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
        </div>

        {error && <p className="text-error text-sm bg-error/10 border border-error/20 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          {sub && new Date(sub.expires_at) > new Date() && (
            <button type="button" onClick={handleRevoke} disabled={loading}
              className="btn-secondary text-error hover:bg-error/10 flex items-center gap-1 px-3">
              <X className="w-4 h-4" /> Revocar
            </button>
          )}
          <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {sub ? 'Renovar' : 'Asignar'} acceso
          </button>
        </div>
      </form>
    </ModalWrapper>
  )
}

// ── Shared modal wrapper ───────────────────────────────────────────────────
function ModalWrapper({ children, onClose, title, icon }: {
  children: React.ReactNode; onClose: () => void; title: string; icon?: React.ReactNode
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-text-primary font-semibold flex items-center gap-2">{icon}{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}
