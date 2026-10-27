import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { ProtectedRoute } from './ProtectedRoute'
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/AuthPages'
import { DashboardPage } from './pages/DashboardPage'
import { CheesesPage, PricesPage, StoresPage } from './pages/CatalogPages'

function SignedInRedirect({ children }) {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  return <Routes>
    <Route path="/login" element={<SignedInRedirect><LoginPage /></SignedInRedirect>} />
    <Route path="/register" element={<SignedInRedirect><RegisterPage /></SignedInRedirect>} />
    <Route path="/forgot-password" element={<SignedInRedirect><ForgotPasswordPage /></SignedInRedirect>} />
    <Route path="/reset-password" element={<ResetPasswordPage />} />
    <Route path="/verify-email" element={<VerifyEmailPage />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/stores" element={<StoresPage />} />
      <Route path="/cheeses" element={<CheesesPage />} />
      <Route path="/prices" element={<PricesPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
