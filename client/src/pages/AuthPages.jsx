import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import logo from '../assets/logo.png'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { AlertModal } from '../components/AlertModal'
import { PasswordInput } from '../components/PasswordInput'

const commonPasswords = new Set(['password', 'password1', 'password12', 'password123', 'password1234', 'password123!', 'p@ssw0rd!', 'qwerty123', 'qwerty12345', 'qwerty123!', 'admin123', 'admin12345', 'letmein123', 'letmein1234', 'welcome123', 'welcome1234', 'iloveyou123', 'abc1234567', '1234567890', '123456789a', '1q2w3e4r5t', 'q1w2e3r4t5', 'changeme123', 'secret12345', 'trustno1234', 'monkey12345', 'dragon12345', 'football1234', 'sunshine1234', 'princess1234', 'superman1234', 'whatever1234', 'colombia123', 'colombia2024!', 'sanfrancisco1', 'quesos12345', 'ubate2024!'])
const strongPassword = z.string().min(10, 'Usa al menos 10 caracteres.').max(72, 'Máximo 72 caracteres.')
  .regex(/[A-Z]/, 'Agrega una mayúscula.')
  .regex(/[a-z]/, 'Agrega una minúscula.')
  .regex(/[0-9]/, 'Agrega un número.')
  .regex(/[^A-Za-z0-9]/, 'Agrega un símbolo.')
  .refine((value) => !commonPasswords.has(value.toLowerCase()), 'Elige una contraseña menos común.')

const loginSchema = z.object({ email: z.string().trim().email('Ingresa un correo válido.'), password: z.string().min(1, 'Ingresa tu contraseña.'), rememberMe: z.boolean().default(false) })
const registerSchema = z.object({
  name: z.string().trim().min(2, 'Ingresa tu nombre completo.').max(100),
  email: z.string().trim().email('Ingresa un correo válido.'),
  password: strongPassword,
  confirmPassword: z.string(),
}).refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'], message: 'Las contraseñas no coinciden.' })
const emailSchema = z.object({ email: z.string().trim().email('Ingresa un correo válido.') })
const resetSchema = z.object({ password: strongPassword, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, { path: ['confirmPassword'], message: 'Las contraseñas no coinciden.' })

function getError(error, fallback) {
  return error.response?.data?.error?.message || fallback
}

function FormInput({ label, error, ...props }) {
  const id = props.id || props.name
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>
      <input {...props} id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-4 focus:ring-brand/15" />
      {error && <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-700">{error}</p>}
    </div>
  )
}

function AuthLayout({ title, subtitle, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-primary px-4 py-8 text-ink sm:px-6">
      <section className="w-full max-w-md rounded-3xl border border-white bg-white p-6 shadow-card sm:p-9">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logo} alt="Logo de Quesos San Francisco" className="mb-4 h-24 w-24 rounded-full object-contain" />
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">Quesos San Francisco</p>
          <h1 className="mt-2 text-2xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>}
        </div>
        {children}
      </section>
    </main>
  )
}

function Notice({ children, type = 'info' }) {
  const style = type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-brand/20 bg-primary text-brand-dark'
  return <div role="status" className={`rounded-xl border px-4 py-3 text-sm leading-6 ${style}`}>{children}</div>
}

function SubmitButton({ children, busy }) {
  return <button type="submit" disabled={busy} className="w-full rounded-xl bg-brand px-5 py-3 font-bold text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">{busy ? 'Un momento…' : children}</button>
}

export function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [notice, setNotice] = useState('')
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '', rememberMe: false } })
  const submit = form.handleSubmit(async (values) => {
    setNotice('')
    try { await signIn(values); navigate('/', { replace: true }) }
    catch (error) { setNotice(getError(error, 'Credenciales inválidas.')) }
  })

  return <AuthLayout title="Iniciar sesión" subtitle="Ingresa a tu espacio de trabajo.">
    <form onSubmit={submit} className="space-y-5" noValidate>
      <FormInput label="Correo electrónico" type="email" autoComplete="email" inputMode="email" {...form.register('email')} error={form.formState.errors.email?.message} />
      <PasswordInput label="Contraseña" autoComplete="current-password" {...form.register('password')} error={form.formState.errors.password?.message} />
      <div className="flex items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" className="h-4 w-4 accent-brand" {...form.register('rememberMe')} /> Recordarme</label>
        <Link className="font-semibold text-brand hover:text-brand-dark" to="/forgot-password">¿Olvidaste tu contraseña?</Link>
      </div>
      {notice && <Notice type="error">{notice}</Notice>}
      <SubmitButton busy={form.formState.isSubmitting}>Iniciar sesión</SubmitButton>
    </form>
    <p className="mt-6 text-center text-sm text-slate-600">¿No tienes cuenta? <Link className="font-bold text-brand hover:text-brand-dark" to="/register">Crear cuenta</Link></p>
  </AuthLayout>
}

const passwordRules = [
  ['Al menos 10 caracteres', (value) => value.length >= 10],
  ['Una letra mayúscula', (value) => /[A-Z]/.test(value)],
  ['Una letra minúscula', (value) => /[a-z]/.test(value)],
  ['Un número', (value) => /[0-9]/.test(value)],
  ['Un símbolo', (value) => /[^A-Za-z0-9]/.test(value)],
]

export function RegisterPage() {
  const [notice, setNotice] = useState('')
  const [success, setSuccess] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const form = useForm({ resolver: zodResolver(registerSchema), defaultValues: { name: '', email: '', password: '', confirmPassword: '' } })
  const password = form.watch('password') || ''
  const submit = form.handleSubmit(async ({ name, email, password: newPassword }) => {
    setNotice('')
    try {
      await api.post('/auth/register', { name, email, password: newPassword })
      setSuccess(true)
      setFeedback({ variant: 'success', message: 'La cuenta se creó correctamente. Ya puedes iniciar sesión.' })
    } catch (error) {
      const message = getError(error, 'No se pudo crear la cuenta. Inténtalo de nuevo.')
      setNotice(message)
      setFeedback({ variant: 'error', message })
    }
  })

  if (success) return <AuthLayout title="Cuenta creada" subtitle="Tu cuenta ya está lista para iniciar sesión.">
    <Notice>Se creó con permisos de vendedor. Un administrador puede cambiar el rol cuando sea necesario.</Notice>
    <p className="mt-6 text-center text-sm"><Link className="font-bold text-brand" to="/login">Volver al inicio de sesión</Link></p>
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => setFeedback(null)} />
  </AuthLayout>

  return <AuthLayout title="Crear cuenta" subtitle="Completa tus datos para comenzar.">
    <form onSubmit={submit} className="space-y-4" noValidate>
      <FormInput label="Nombre completo" autoComplete="name" {...form.register('name')} error={form.formState.errors.name?.message} />
      <FormInput label="Correo electrónico" type="email" autoComplete="email" inputMode="email" {...form.register('email')} error={form.formState.errors.email?.message} />
      <PasswordInput label="Contraseña" autoComplete="new-password" {...form.register('password')} error={form.formState.errors.password?.message} />
      <div className="rounded-xl bg-primary/70 px-4 py-3">
        <div className="mb-2 flex gap-1" aria-label={`${passwordRules.filter(([, check]) => check(password)).length} de 5 reglas cumplidas`}>
          {passwordRules.map(([label, check]) => <span key={label} className={`h-1.5 flex-1 rounded-full ${check(password) ? 'bg-emerald-500' : 'bg-slate-200'}`} />)}
        </div>
        <ul className="grid grid-cols-1 gap-1 text-xs text-slate-600 sm:grid-cols-2">
          {passwordRules.map(([label, check]) => <li key={label} className={check(password) ? 'font-semibold text-emerald-700' : ''}>{check(password) ? '✓' : '•'} {label}</li>)}
        </ul>
      </div>
      <PasswordInput label="Confirmar contraseña" autoComplete="new-password" {...form.register('confirmPassword')} error={form.formState.errors.confirmPassword?.message} />
      {notice && <Notice type="error">{notice}</Notice>}
      <SubmitButton busy={form.formState.isSubmitting}>Crear cuenta</SubmitButton>
    </form>
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => setFeedback(null)} />
    <p className="mt-6 text-center text-sm text-slate-600">¿Ya tienes cuenta? <Link className="font-bold text-brand" to="/login">Iniciar sesión</Link></p>
  </AuthLayout>
}

export function ForgotPasswordPage() {
  const [notice, setNotice] = useState('')
  const [sent, setSent] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const form = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } })
  const submit = form.handleSubmit(async (values) => {
    setNotice('')
    try {
      const { data } = await api.post('/auth/forgot-password', values)
      setNotice(data.data.message)
      setSent(true)
      setFeedback({ variant: 'success', message: data.data.message })
    } catch (error) {
      const message = getError(error, 'No se pudo procesar la solicitud.')
      setNotice(message)
      setFeedback({ variant: 'error', message })
    }
  })
  return <AuthLayout title="Recuperar contraseña" subtitle="Te enviaremos un enlace si el correo está registrado.">
    {!sent && <form onSubmit={submit} className="space-y-5" noValidate>
      <FormInput label="Correo electrónico" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
      {notice && <Notice type="error">{notice}</Notice>}
      <SubmitButton busy={form.formState.isSubmitting}>Enviar instrucciones</SubmitButton>
    </form>}
    {sent && <Notice>{notice}</Notice>}
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => setFeedback(null)} />
    <p className="mt-6 text-center text-sm"><Link className="font-bold text-brand" to="/login">Volver al inicio de sesión</Link></p>
  </AuthLayout>
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [notice, setNotice] = useState('')
  const [success, setSuccess] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '', confirmPassword: '' } })
  const submit = form.handleSubmit(async ({ password }) => {
    setNotice('')
    try {
      const { data } = await api.post('/auth/reset-password', { token, password })
      setNotice(data.data.message)
      setSuccess(true)
      setFeedback({ variant: 'success', message: data.data.message })
    } catch (error) {
      const message = getError(error, 'No se pudo cambiar la contraseña.')
      setNotice(message)
      setFeedback({ variant: 'error', message })
    }
  })
  return <AuthLayout title="Nueva contraseña" subtitle="Elige una contraseña segura para tu cuenta.">
    {!token && <Notice type="error">Falta el enlace de recuperación. Solicita uno nuevo.</Notice>}
    {token && !success && <form onSubmit={submit} className="space-y-4" noValidate>
      <PasswordInput label="Nueva contraseña" autoComplete="new-password" {...form.register('password')} error={form.formState.errors.password?.message} />
      <PasswordInput label="Confirmar contraseña" autoComplete="new-password" {...form.register('confirmPassword')} error={form.formState.errors.confirmPassword?.message} />
      {notice && <Notice type="error">{notice}</Notice>}
      <SubmitButton busy={form.formState.isSubmitting}>Guardar contraseña</SubmitButton>
    </form>}
    {success && <Notice>{notice}</Notice>}
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => setFeedback(null)} />
    <p className="mt-6 text-center text-sm"><Link className="font-bold text-brand" to="/login">Ir a iniciar sesión</Link></p>
  </AuthLayout>
}

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [notice, setNotice] = useState('Pulsa el botón para confirmar tu correo.')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  async function verify() {
    if (!token || busy) return
    setBusy(true)
    try {
      const { data } = await api.post('/auth/verify-email', { token })
      setNotice(data.data.message)
      setError(false)
      setFeedback({ variant: 'success', message: data.data.message })
    } catch (err) {
      const message = getError(err, 'El enlace no es válido o ya venció.')
      setNotice(message)
      setError(true)
      setFeedback({ variant: 'error', message })
    } finally { setBusy(false) }
  }
  return <AuthLayout title="Verificar correo" subtitle="Confirma el correo electrónico asociado a tu cuenta.">
    <Notice type={error ? 'error' : 'info'}>{!token ? 'El enlace no contiene un token de verificación.' : notice}</Notice>
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => setFeedback(null)} />
    {token && !error && notice.startsWith('Pulsa') && <button onClick={verify} disabled={busy} className="mt-5 w-full rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-60">{busy ? 'Verificando…' : 'Verificar correo'}</button>}
    <p className="mt-6 text-center text-sm"><Link className="font-bold text-brand" to="/login">Ir a iniciar sesión</Link></p>
  </AuthLayout>
}
