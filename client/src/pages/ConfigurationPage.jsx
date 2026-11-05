import { Link } from 'react-router-dom'

const backButton = 'inline-flex cursor-pointer whitespace-nowrap rounded-xl border border-rose-700 bg-rose-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 motion-reduce:transform-none motion-reduce:transition-none'
const modules = [
  { title: 'Roles', description: 'Administra las cuentas registradas y asigna sus permisos.', to: '/roles' },
  { title: 'Empresa e impresión', description: 'Actualiza los datos de la empresa y el formato de las facturas.', to: '/settings/company' },
]

export default function ConfigurationPage() {
  return <main className="min-h-screen bg-primary px-4 py-8 text-ink sm:px-8">
    <section className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-card sm:p-10">
      <Link to="/" className={backButton}>Volver al inicio</Link>
      <h1 className="mt-5 text-3xl font-extrabold">Configuración</h1>
      <p className="mt-2 text-sm text-slate-600">Gestiona el acceso a la aplicación y los datos de la empresa.</p>
      <nav aria-label="Módulos de configuración" className="mt-6 grid gap-4 sm:grid-cols-2">
        {modules.map((module) => <Link key={module.to} to={module.to} className="group rounded-2xl border border-slate-200 p-5 transition-all hover:-translate-y-0.5 hover:border-brand hover:bg-primary/50 hover:shadow-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20">
          <span className="block text-lg font-extrabold text-brand group-hover:text-brand-dark">{module.title}</span>
          <span className="mt-2 block text-sm leading-6 text-slate-600">{module.description}</span>
        </Link>)}
      </nav>
    </section>
  </main>
}
