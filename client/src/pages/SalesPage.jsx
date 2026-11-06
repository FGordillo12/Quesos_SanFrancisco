import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { AlertModal } from '../components/AlertModal'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const backButton = 'inline-flex cursor-pointer whitespace-nowrap rounded-xl border border-rose-700 bg-rose-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 motion-reduce:transform-none motion-reduce:transition-none'

function createdAtLabel(value) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value))
}

export default function SalesPage() {
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyQuote, setBusyQuote] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [preview, setPreview] = useState(null)
  const [feedback, setFeedback] = useState(null)

  async function loadQuotes({ silent = false } = {}) {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const { data } = await api.get('/quotes/recent')
      setQuotes(data.data.quotes)
    } catch (error) {
      setFeedback({ variant: 'error', message: error.response?.data?.error?.message || 'No se pudieron cargar las ventas recientes.' })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { void loadQuotes() }, [])
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url) }, [preview?.url])

  async function openPreview(quote) {
    setBusyQuote(quote._id)
    try {
      const { data } = await api.get(`/quotes/recent/${quote._id}/pdf?disposition=inline`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      setPreview({ quote, url })
    } catch (error) {
      setFeedback({ variant: 'error', message: error.response?.data?.error?.message || 'No se pudo abrir el PDF de esta factura.' })
    } finally { setBusyQuote('') }
  }

  async function download(quote) {
    setBusyQuote(quote._id)
    try {
      const { data } = await api.get(`/quotes/recent/${quote._id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = quote.pdfFileName || `${quote.store?.name || 'Factura'}_${quote.number}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setFeedback({ variant: 'success', message: `Se descargó el PDF ${quote.number}.` })
    } catch (error) {
      setFeedback({ variant: 'error', message: error.response?.data?.error?.message || 'No se pudo descargar el PDF.' })
    } finally { setBusyQuote('') }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusyQuote(deleting._id)
    try {
      const { data } = await api.delete(`/quotes/recent/${deleting._id}`)
      const driveDeleted = data.data.driveDeleted
      setDeleting(null)
      setFeedback({ variant: driveDeleted ? 'success' : 'info', message: driveDeleted ? `La factura ${deleting.number} se eliminó.` : `La factura ${deleting.number} se eliminó de Ventas, pero su copia de Google Drive no pudo eliminarse. La limpieza del módulo ya se completó.` })
      await loadQuotes({ silent: true })
    } catch (error) {
      setFeedback({ variant: 'error', message: error.response?.data?.error?.message || 'No se pudo eliminar la factura.' })
    } finally { setBusyQuote('') }
  }

  return <main className="min-h-screen bg-primary px-4 py-8 pb-12 text-ink sm:px-8">
    <section className="mx-auto max-w-5xl rounded-3xl bg-white p-5 shadow-card sm:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className={backButton}>Volver al inicio</Link>
        <button type="button" onClick={() => void loadQuotes({ silent: true })} disabled={refreshing} className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">{refreshing ? 'Actualizando…' : 'Actualizar'}</button>
      </div>
      <h1 className="mt-5 text-3xl font-extrabold">Ventas recientes</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Consulta las tres facturas más recientes creadas por cualquier cuenta. Al crear una cuarta, la más antigua se retira automáticamente del sistema.</p>
      {loading ? <p className="mt-8 rounded-xl bg-primary p-5 text-center text-sm text-slate-600" role="status">Cargando ventas…</p> : quotes.length === 0 ? <p className="mt-8 rounded-xl bg-primary p-5 text-center text-sm text-slate-600">Todavía no hay facturas registradas.</p> : <div className="mt-6 space-y-4">
        {quotes.map((quote) => <article key={quote._id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-wider text-brand">{quote.number}</p><h2 className="mt-1 text-lg font-extrabold">{quote.store?.name || 'Cliente'}</h2><p className="mt-1 text-sm text-slate-600">Creada {createdAtLabel(quote.createdAt)} · Por {quote.createdBy?.name || 'Usuario'}</p></div>
            <p className="text-xl font-extrabold text-brand-dark">{money.format(quote.total)}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void openPreview(quote)} disabled={busyQuote === quote._id} className="cursor-pointer rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">{busyQuote === quote._id ? 'Cargando…' : 'Ver factura'}</button>
            <button type="button" onClick={() => void download(quote)} disabled={busyQuote === quote._id} className="cursor-pointer rounded-xl border border-brand px-4 py-2 text-sm font-bold text-brand transition-colors hover:bg-primary disabled:cursor-wait disabled:opacity-60">Descargar PDF</button>
            <button type="button" onClick={() => setDeleting(quote)} disabled={busyQuote === quote._id} className="cursor-pointer rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-60">Eliminar</button>
          </div>
        </article>)}
      </div>}
    </section>
    {deleting && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget && busyQuote !== deleting._id) setDeleting(null) }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="delete-sale-title" aria-describedby="delete-sale-description" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-xl font-bold text-rose-700" aria-hidden="true">!</div>
        <h2 id="delete-sale-title" className="mt-4 text-xl font-extrabold">¿Eliminar esta factura?</h2>
        <p id="delete-sale-description" className="mt-2 text-sm leading-6 text-slate-600">Se eliminará <strong>{deleting.number}</strong> del historial de ventas y ya no podrá descargarse desde la aplicación.</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setDeleting(null)} disabled={busyQuote === deleting._id} className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={() => void confirmDelete()} disabled={busyQuote === deleting._id} className="cursor-pointer rounded-xl bg-rose-600 px-4 py-2.5 font-bold text-white hover:bg-rose-700 disabled:opacity-50">{busyQuote === deleting._id ? 'Eliminando…' : 'Sí, eliminar'}</button>
        </div>
      </section>
    </div>}
    {preview && <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/70 p-2 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) { URL.revokeObjectURL(preview.url); setPreview(null) } }}>
      <section role="dialog" aria-modal="true" aria-labelledby="preview-sale-title" className="flex h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-3 sm:px-5"><h2 id="preview-sale-title" className="font-extrabold">Factura {preview.quote.number}</h2><button type="button" onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null) }} className="cursor-pointer rounded-lg px-3 py-2 font-bold text-rose-700 hover:bg-rose-50">Cerrar</button></div>
        <iframe title={`Vista previa de factura ${preview.quote.number}`} src={preview.url} className="min-h-0 flex-1 bg-slate-100" />
      </section>
    </div>}
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => setFeedback(null)} />
  </main>
}
