import { Link, useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'
import { useAuth } from '../AuthContext'

export function DashboardPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const date = new Intl.DateTimeFormat('es-CO', { dateStyle: 'full', timeZone: 'America/Bogota' }).format(new Date())

  async function logout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <main className="min-h-screen bg-primary px-4 py-6 text-ink sm:px-8 sm:py-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-card sm:px-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="h-12 w-12 rounded-full object-contain" />
          <div><p className="font-extrabold">Quesos San Francisco</p><p className="text-xs text-slate-500">Ubaté · Vereda Soaga</p></div>
        </div>
        <div className="flex items-center gap-2">
          <nav aria-label="Módulos" className="hidden flex-wrap gap-1 md:flex">
            <Link className="rounded-lg bg-brand px-3 py-2 text-sm font-bold text-white hover:bg-brand-dark" to="/quote">Nueva cotización</Link>
            <Link className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary" to="/stores">Almacenes</Link>
            <Link className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary" to="/cheeses">Quesos</Link>
            <Link className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-primary" to="/prices">Precios</Link>
          </nav>
          <button onClick={logout} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cerrar sesión</button>
        </div>
      </header>
      <section className="mx-auto mt-8 max-w-6xl">
        <p className="text-sm font-semibold capitalize text-brand">{date}</p>
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Hola, {user?.name}</h1>
        <p className="mt-2 text-slate-600">Tu cuenta está lista para trabajar.</p>
        <Link to="/quote" className="mt-6 inline-flex rounded-xl bg-brand px-5 py-3 font-bold text-white shadow-sm hover:bg-brand-dark">Nueva cotización</Link>
        <div className="mt-8 rounded-2xl border border-white bg-white/80 p-6 shadow-card sm:p-8">
          <p className="text-sm font-bold uppercase tracking-wider text-brand">Acceso</p>
          <p className="mt-2 text-lg font-bold">{user?.role === 'admin' ? 'Administrador' : 'Vendedor'}</p>
          <p className="mt-1 text-sm text-slate-600">{user?.email}</p>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-600">La sesión está protegida con cookies seguras, renovación automática y expiración controlada. Administra el catálogo y las tarifas desde estos accesos.</p>
        </div>
        <nav aria-label="Accesos a gestión" className="mt-5 grid gap-3 sm:grid-cols-3 md:hidden">
          <Link className="rounded-xl bg-brand p-4 text-center font-bold text-white shadow-card sm:col-span-3" to="/quote">Nueva cotización</Link>
          <Link className="rounded-xl bg-white p-4 text-center font-bold text-brand shadow-card" to="/stores">Almacenes</Link>
          <Link className="rounded-xl bg-white p-4 text-center font-bold text-brand shadow-card" to="/cheeses">Quesos</Link>
          <Link className="rounded-xl bg-white p-4 text-center font-bold text-brand shadow-card" to="/prices">Precios</Link>
        </nav>
      </section>
    </main>
  )
}
