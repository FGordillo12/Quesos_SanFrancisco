import logo from './assets/logo.png'

export default function App() {
  return (
    <main className="min-h-screen bg-primary px-5 py-12 text-ink sm:px-8">
      <section className="mx-auto flex min-h-[70vh] max-w-5xl flex-col items-center justify-center gap-10 rounded-3xl border border-white/80 bg-white/80 p-8 text-center shadow-card sm:flex-row sm:p-14 sm:text-left">
        <img className="h-40 w-40 rounded-full object-contain sm:h-56 sm:w-56" src={logo} alt="Logo de Quesos San Francisco" />
        <div className="max-w-xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand">Ubaté · Vereda Soaga</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">Quesos San Francisco</h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">Tu espacio de trabajo para cotizaciones y gestión comercial.</p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-brand-dark">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Fase 1 · Base visual lista
          </div>
        </div>
      </section>
    </main>
  )
}
