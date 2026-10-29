import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import { ProtectedRoute } from './ProtectedRoute'

const ForgotPasswordPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.ForgotPasswordPage })))
const LoginPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.LoginPage })))
const RegisterPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.RegisterPage })))
const ResetPasswordPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.ResetPasswordPage })))
const VerifyEmailPage = lazy(() => import('./pages/AuthPages.jsx').then((module) => ({ default: module.VerifyEmailPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx').then((module) => ({ default: module.DashboardPage })))
const CheesesPage = lazy(() => import('./pages/CatalogPages.jsx').then((module) => ({ default: module.CheesesPage })))
const PricesPage = lazy(() => import('./pages/CatalogPages.jsx').then((module) => ({ default: module.PricesPage })))
const StoresPage = lazy(() => import('./pages/CatalogPages.jsx').then((module) => ({ default: module.StoresPage })))
const RolesPage = lazy(() => import('./pages/CatalogPages.jsx').then((module) => ({ default: module.RolesPage })))
const QuotePage = lazy(() => import('./pages/QuotePage.jsx').then((module) => ({ default: module.QuotePage })))
const CompanySettingsPage = lazy(() => import('./pages/CompanySettingsPage.jsx').then((module) => ({ default: module.CompanySettingsPage })))

function SignedInRedirect({ children }) {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/" replace />
  return children
}

function AppRoutes() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-primary px-4 text-sm font-semibold text-ink" role="status" aria-live="polite">Cargando módulo…</main>}>
    <Routes>
      <Route path="/login" element={<SignedInRedirect><LoginPage /></SignedInRedirect>} />
      <Route path="/register" element={<SignedInRedirect><RegisterPage /></SignedInRedirect>} />
      <Route path="/forgot-password" element={<SignedInRedirect><ForgotPasswordPage /></SignedInRedirect>} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/quote" element={<QuotePage />} />
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route path="/stores" element={<StoresPage />} />
          <Route path="/cheeses" element={<CheesesPage />} />
          <Route path="/prices" element={<PricesPage />} />
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/settings/company" element={<CompanySettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
