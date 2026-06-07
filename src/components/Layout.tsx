import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  LayoutDashboard, Upload, FileText, LogOut,
  Music2, ChevronRight, Shield, FileSignature
} from 'lucide-react'
import { cn } from '../lib/utils'
import { motion } from 'framer-motion'

const navItems = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard'      },
  { to: '/upload',     icon: Upload,          label: 'Subir Reporte'  },
  { to: '/reports',    icon: FileText,        label: 'Mis Reportes'   },
  { to: '/contracts',  icon: FileSignature,   label: 'Contratos'      },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-surface border-r border-border flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Music2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-text-primary text-sm">Royalties</p>
              <p className="text-text-muted text-xs">Music Analytics</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {isActive && <ChevronRight className="w-3 h-3" />}
                </>
              )}
            </NavLink>
          ))}

          {profile?.role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              )}
            >
              {({ isActive }) => (
                <>
                  <Shield className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">Admin</span>
                  {isActive && <ChevronRight className="w-3 h-3" />}
                </>
              )}
            </NavLink>
          )}
        </nav>

        {/* User footer */}
        <div className="px-3 py-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-primary text-xs font-semibold">
                {profile?.full_name?.[0] ?? profile?.email?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-text-primary text-sm font-medium truncate">
                {profile?.full_name ?? 'Usuario'}
              </p>
              <p className="text-text-muted text-xs truncate">{profile?.email}</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-error hover:bg-error/10 transition-all duration-200"
          >
            <LogOut className="w-4 h-4" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
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
