import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-primary text-ink" role="status">Cargando tu sesión…</main>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const role = user.role === 'vendedor' ? 'trabajador' : user.role
  if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/" replace />
  return <Outlet />
}
