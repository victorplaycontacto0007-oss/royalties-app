import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Upload, FileText, LogOut,
  Music2, Shield, FileSignature, ChevronRight, User, Crown, GitMerge,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { motion } from 'framer-motion'
import { differenceInDays } from 'date-fns'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard'     },
  { to: '/upload',    icon: Upload,          label: 'Subir Reporte' },
  { to: '/reports',   icon: FileText,        label: 'Mis Reportes'  },
  { to: '/contracts', icon: FileSignature,   label: 'Contratos'     },
  { to: '/affiliate', icon: GitMerge,        label: 'Referidos'     },
]

export default function Layout() {
  const { profile, subscription, signOut } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const daysLeft = subscription
    ? Math.max(0, differenceInDays(new Date(subscription.expires_at), new Date()))
    : null

  const isExpiringSoon = daysLeft !== null && daysLeft <= 3

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-surface border-r border-border flex flex-col shadow-card">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-sm">
              <Music2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-text-primary text-sm">Royalties</p>
              <p className="text-text-muted text-xs">Music Analytics</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-primary-light text-primary font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              )}>
              {({ isActive }) => (
                <>
                  <Icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-primary' : 'text-text-muted group-hover:text-text-secondary')} />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 text-primary" />}
                </>
              )}
            </NavLink>
          ))}

          {profile?.role === 'admin' && (
            <NavLink to="/admin"
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group',
                isActive
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              )}>
              {({ isActive }) => (
                <>
                  <Shield className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-accent' : 'text-text-muted')} />
                  <span className="flex-1">Admin</span>
                  {isActive && <ChevronRight className="w-3 h-3 text-accent" />}
                </>
              )}
            </NavLink>
          )}
        </nav>

        {/* Subscription badge */}
        {daysLeft !== null && (
          <div className="px-3 pb-2">
            <button
              onClick={() => navigate('/profile')}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium transition-all',
                isExpiringSoon
                  ? 'bg-warning/10 text-warning hover:bg-warning/15'
                  : 'bg-primary/8 text-primary hover:bg-primary/12'
              )}>
              <Crown className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">
                {daysLeft === 0 ? 'Vence hoy' : `${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`}
              </span>
              <ChevronRight className="w-3 h-3 opacity-60" />
            </button>
          </div>
        )}

        {/* User footer */}
        <div className="px-3 py-4 border-t border-border">
          <NavLink to="/profile"
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2 rounded-xl mb-2 transition-all',
              isActive ? 'bg-primary-light' : 'bg-surface-2 hover:bg-surface-3'
            )}>
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-primary text-xs font-bold">
                {profile?.full_name?.[0] ?? profile?.email?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-xs font-semibold truncate">
                {profile?.full_name ?? 'Usuario'}
              </p>
              <p className="text-text-muted text-xs truncate">{profile?.email}</p>
            </div>
            <User className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          </NavLink>
          <button onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-error hover:bg-error/5 transition-all duration-150">
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesion</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-white">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="min-h-full"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}
