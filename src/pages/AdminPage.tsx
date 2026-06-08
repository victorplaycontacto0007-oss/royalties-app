import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatDate } from '../lib/utils'
import {
  Users, Plus, Pencil, Trash2, Power, Loader2,
  Shield, Activity, X, Check, Clock
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Profile } from '../types/database'

/** Formatea la duración en segundos a "Xd Xh Xm Xs" */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/** Reloj en tiempo real desde la fecha de creación del usuario */
function TimeSince({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)
  )

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [createdAt])

  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-text-muted font-mono tabular-nums"
      title={`Creado el ${formatDate(createdAt)}`}
    >
      <Clock className="w-3 h-3 flex-shrink-0" />
      {formatDuration(elapsed)}
    </span>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

interface UserModal {
  mode: 'create' | 'edit'
  user?: Profile
}

export default function AdminPage() {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [modal, setModal] = useState<UserModal | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { data: users, isLoading } = useQuery<Profile[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data, error } = await db.from('profiles').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Profile[]
    },
  })

  const { data: activity } = useQuery<Array<{ id: string; action: string; created_at: string }>>({
    queryKey: ['activity-logs'],
    queryFn: async () => {
      const { data } = await db
        .from('activity_logs')
        .select('id, action, created_at')
        .order('created_at', { ascending: false })
        .limit(20)
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

  return (
    <div className="p-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
            <Shield className="w-6 h-6 text-accent" /> Administración
          </h1>
          <p className="text-text-muted mt-1">Gestión de usuarios y actividad</p>
        </div>
        <button onClick={() => setModal({ mode: 'create' })} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Crear usuario
        </button>
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
                {users?.map(u => (
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
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`badge ${u.role === 'admin' ? 'badge-primary' : 'bg-surface-3 text-text-secondary'}`}>
                        {u.role}
                      </span>
                      <span className={`badge ${u.is_active ? 'badge-success' : 'badge-error'}`}>
                        {u.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                      <span className="text-text-muted text-xs">{fileCounts?.[u.id] ?? 0} archivos</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setModal({ mode: 'edit', user: u })}
                        className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        className={`p-1.5 rounded-lg transition-colors ${u.is_active ? 'hover:bg-error/10 text-text-muted hover:text-error' : 'hover:bg-success/10 text-text-muted hover:text-success'}`}
                        title={u.is_active ? 'Desactivar' : 'Activar'}
                        disabled={u.id === currentUser?.id}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteId(u.id)}
                        className="p-1.5 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors"
                        title="Eliminar"
                        disabled={u.id === currentUser?.id}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
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

      {/* User Modal */}
      <AnimatePresence>
        {modal && (
          <UserFormModal
            mode={modal.mode}
            user={modal.user}
            onClose={() => setModal(null)}
            onSuccess={() => {
              setModal(null)
              queryClient.invalidateQueries({ queryKey: ['admin-users'] })
            }}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDeleteId(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-surface border border-border rounded-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
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

function UserFormModal({ mode, user, onClose, onSuccess }: {
  mode: 'create' | 'edit'
  user?: Profile
  onClose: () => void
  onSuccess: () => void
}) {
  const [fullName, setFullName] = useState(user?.full_name ?? '')
  const [role, setRole] = useState<'admin' | 'user'>(user?.role ?? 'user')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (mode === 'create') {
        setError('Para crear usuarios, ve al panel de Supabase → Authentication → Add user, y luego edita el perfil aquí para asignar nombre y rol.')
        setLoading(false)
        return
      } else if (user) {
        const { error: updateError } = await db.from('profiles').update({ full_name: fullName, role }).eq('id', user.id)
        if (updateError) throw updateError
      }
      onSuccess()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95 }}
        className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-text-primary font-semibold">
            {mode === 'create' ? 'Crear usuario' : 'Editar usuario'}
          </h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nombre completo</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} className="input" placeholder="Juan Pérez" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Rol</label>
            <select value={role} onChange={e => setRole(e.target.value as 'admin' | 'user')} className="input">
              <option value="user">Usuario</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && (
            <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
              <p className="text-warning text-sm">{error}</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {mode === 'create' ? 'Ver instrucciones' : 'Guardar'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
