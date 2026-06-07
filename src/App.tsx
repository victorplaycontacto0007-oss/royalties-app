import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import DashboardPage from './pages/DashboardPage'
import UploadPage from './pages/UploadPage'
import ReportsPage from './pages/ReportsPage'
import ReportDetailPage from './pages/ReportDetailPage'
import AdminPage from './pages/AdminPage'
import ContractsPage from './pages/ContractsPage'
import Layout from './components/Layout'

const Spinner = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
)

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, profile, loading } = useAuth()

  if (loading) return <Spinner />

  // Not logged in
  if (!user) return <Navigate to="/login" replace />

  // Logged in but profile still loading — show spinner instead of redirecting
  if (!profile) return <Spinner />

  if (!profile.is_active) return (
    <div className="min-h-screen bg-background flex items-center justify-center text-text-secondary">
      Tu cuenta está desactivada. Contacta al administrador.
    </div>
  )

  if (adminOnly && profile.role !== 'admin') return <Navigate to="/dashboard" replace />

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/:id" element={<ReportDetailPage />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/admin" element={
            <ProtectedRoute adminOnly>
              <AdminPage />
            </ProtectedRoute>
          } />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
