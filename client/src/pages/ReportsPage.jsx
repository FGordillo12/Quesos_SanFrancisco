import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { AlertModal } from '../components/AlertModal'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const dateLabel = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' })
const backButton = 'inline-flex cursor-pointer rounded-xl border border-rose-700 bg-rose-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200'
const periods = [['todo', 'Todo el historial'], ['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['anio', 'Este año'], ['personalizado', 'Personalizado']]

function asDate(value) { return dateLabel.format(new Date(value)) }
function queryString(filters, extra = {}) { const params = new URLSearchParams(); Object.entries({ ...filters, ...extra }).forEach(([key, value]) => { if (value !== '' && value != null) params.set(key, String(value)) }); return params.toString() }

function SalesBars({ series = [], unit }) {
  const max = Math.max(1, ...series.map((point) => point.pagado + point.pendiente))
  const stride = Math.max(1, Math.ceil((series.length - 1) / 4))
  const tickLabel = (point, index) => {
    const date = new Date(point.fecha)
    if (unit === 'hora') return new Intl.DateTimeFormat('es-CO', { hour: '2-digit', timeZone: 'America/Bogota' }).format(date)
    if (unit === 'mes') return new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'America/Bogota' }).format(date)
    if (unit === 'año') return new Intl.DateTimeFormat('es-CO', { year: 'numeric', timeZone: 'America/Bogota' }).format(date)
    const day = new Intl.DateTimeFormat('es-CO', { day: 'numeric', timeZone: 'America/Bogota' }).format(date)
    return index === 0 ? `${day} ${new Intl.DateTimeFormat('es-CO', { month: 'short', timeZone: 'America/Bogota' }).format(date)}` : day
  }
  return <div className="mt-5">
    <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600"><span><i className="mr-2 inline-block h-3 w-3 rounded-sm bg-brand" />Pagado</span><span><i className="mr-2 inline-block h-3 w-3 rounded-sm bg-amber-400" />Pendiente</span></div>
    {series.every((point) => !point.pagado && !point.pendiente) ? <p className="grid h-44 place-items-center text-sm text-slate-500">No hay ventas en este período.</p> : <div className="mt-4 min-w-0">
      <div className="flex h-40 items-end gap-1 border-b border-slate-200 px-1 sm:gap-2">{series.map((point) => {
        const paid = point.pagado / max * 100; const due = point.pendiente / max * 100
        const tooltipDate = asDate(point.fecha)
        return <div key={point.fecha} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px" title={`${tooltipDate}: pagado ${money.format(point.pagado)}, pendiente ${money.format(point.pendiente)}`}><div className="w-1/2 max-w-5 rounded-t bg-brand" style={{ height: `${Math.max(paid, point.pagado ? 2 : 0)}%` }} /><div className="w-1/2 max-w-5 rounded-t bg-amber-400" style={{ height: `${Math.max(due, point.pendiente ? 2 : 0)}%` }} /></div>
      })}</div>
      <div className="grid min-w-0 pt-2 text-[10px] leading-4 text-slate-500" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}>{series.map((point, index) => <span key={point.fecha} className="overflow-visible text-center whitespace-nowrap">{index % stride === 0 || index === series.length - 1 ? tickLabel(point, index) : ''}</span>)}</div>
    </div>}
  </div>
}

function PaymentDonut({ summary }) {
  const paid = summary?.totalPagado || 0; const pending = summary?.totalPendiente || 0; const total = paid + pending; const percentage = total ? paid / total * 100 : 0
  return <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:justify-center"><div className="grid h-36 w-36 shrink-0 place-items-center rounded-full" style={{ background: total ? `conic-gradient(#0077B6 ${percentage}%, #fbbf24 ${percentage}% 100%)` : '#e2e8f0' }}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><span className="text-xl font-extrabold">{total ? Math.round(percentage) : 0}%</span><span className="text-[10px] text-slate-500">pagado</span></div></div><div className="space-y-3 text-sm"><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-brand" />Pagado <strong>{money.format(paid)}</strong></p><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-amber-400" />Pendiente <strong>{money.format(pending)}</strong></p>{!total && <p className="text-slate-500">Sin pagos en el período.</p>}</div></div>
}

export default function ReportsPage() {
  const [filters, setFilters] = useState({ periodo: 'todo', estado_pago: 'todos', desde: '', hasta: '' })
  const [search, setSearch] = useState(''); const [searchInput, setSearchInput] = useState('')
  const [sort, setSort] = useState({ ordenar: 'fecha', direccion: 'desc' })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [summary, setSummary] = useState(null); const [series, setSeries] = useState([]); const [rows, setRows] = useState([]); const [pagination, setPagination] = useState({ pagina: 1, paginas: 1, total: 0 })
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [selected, setSelected] = useState([]); const [confirm, setConfirm] = useState(null); const [feedback, setFeedback] = useState(null)
  const filtersQuery = useMemo(() => queryString(filters), [filters])

  const load = useCallback(async ({ page = 1, silent = false } = {}) => {
    if (filters.periodo === 'personalizado' && (!filters.desde || !filters.hasta || filters.desde > filters.hasta)) { setLoading(false); return }
    if (!silent) setLoading(true)
    try {
      const q = queryString(filters, { pagina: page, limite: 5, busqueda: search, ...sort })
      const [summaryRes, seriesRes, invoicesRes] = await Promise.all([api.get(`/reportes/resumen?${filtersQuery}`), api.get(`/reportes/ventas-por-periodo?${filtersQuery}`), api.get(`/reportes/facturas?${q}`)])
      setSummary(summaryRes.data.data); setSeries(seriesRes.data.data.serie); setRows(invoicesRes.data.data.facturas); setPagination(invoicesRes.data.data.paginacion); setSelected([])
    } catch (error) { setFeedback({ variant: 'error', message: error.response?.data?.error?.message || 'No se pudieron cargar los reportes.' }) }
    finally { setLoading(false) }
  }, [filters, filtersQuery, search, sort])

  useEffect(() => { void load({ page: 1 }) }, [load])
  useEffect(() => { const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300); return () => window.clearTimeout(timer) }, [searchInput])

  function setPeriod(periodo) { setFilters((old) => ({ ...old, periodo, desde: '', hasta: '' })); if (periodo === 'personalizado') setFiltersOpen(true) }
  function toggleSelected(id) { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) }
  function requestChange(ids, estado_pago) {
    const affected = rows.filter((row) => ids.includes(row.id) && row.estado_pago !== estado_pago)
    if (!affected.length) return setFeedback({ variant: 'info', message: 'Las facturas seleccionadas ya tienen ese estado.' })
    setConfirm({ ids: affected.map((item) => item.id), estado_pago, amount: affected.reduce((sum, item) => sum + item.total, 0) })
  }

  async function applyChange() {
    if (!confirm) return
    const action = confirm; setConfirm(null); setBusy(true)
    const oldRows = rows
    setRows((current) => current.map((row) => action.ids.includes(row.id) ? { ...row, estado_pago: action.estado_pago, fecha_pago: action.estado_pago === 'pagado' ? new Date().toISOString() : null } : row))
    try {
      if (action.ids.length === 1) await api.patch(`/reportes/facturas/${action.ids[0]}/estado-pago?${filtersQuery}`, { estado_pago: action.estado_pago })
      else await api.patch('/reportes/facturas/estado-pago', { ids: action.ids, estado_pago: action.estado_pago })
      setFeedback({ variant: 'success', message: 'Cambios guardados correctamente.' }); await load({ page: pagination.pagina, silent: true })
    } catch (error) {
      setRows(oldRows); setFeedback({ variant: 'error', message: error.response?.data?.error?.message || 'No se pudieron guardar los cambios. Inténtalo de nuevo.', retry: () => { setFeedback(null); setConfirm(action) } })
    } finally { setBusy(false) }
  }

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const cards = [['Total vendido', summary?.totalVendido], ['Total pagado', summary?.totalPagado], ['Por cobrar', summary?.totalPendiente], ['N.º de facturas', summary?.numeroFacturas, true]]

  return <main className="min-h-screen bg-primary px-4 py-7 pb-12 text-ink sm:px-8"><section className="mx-auto max-w-7xl rounded-3xl bg-white p-5 shadow-card sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link to="/" className={backButton}>Volver al inicio</Link><button type="button" onClick={() => void load({ page: pagination.pagina })} disabled={loading || busy} className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Actualizar</button></div>
    <h1 className="mt-5 text-3xl font-extrabold">Reportes de ventas</h1><p className="mt-1 text-sm text-slate-600">Ventas registradas en facturas · Zona horaria de Colombia.</p>

    <section aria-label="Filtros del reporte" className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 md:hidden">
        <label className="min-w-0 text-xs font-bold uppercase tracking-wide text-slate-500">Período<select value={filters.periodo} onChange={(event) => setPeriod(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-ink">{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button type="button" aria-expanded={filtersOpen} aria-controls="report-extra-filters" onClick={() => setFiltersOpen((open) => !open)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><span>Filtros</span><span aria-hidden="true" className="text-brand">{filtersOpen ? '−' : '+'}</span></button>
      </div>
      <div className="hidden flex-wrap gap-2 md:flex">{periods.map(([value, label]) => <button key={value} type="button" onClick={() => setPeriod(value)} aria-pressed={filters.periodo === value} className={`cursor-pointer rounded-lg px-3 py-2 text-sm font-bold ${filters.periodo === value ? 'bg-brand text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-primary'}`}>{label}</button>)}</div>
      <div id="report-extra-filters" className={`${filtersOpen ? 'grid' : 'hidden'} mt-4 gap-3 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_auto]`}>
        {filters.periodo === 'personalizado' && <><label className="text-sm font-semibold">Desde<input aria-label="Fecha desde" type="date" value={filters.desde} onChange={(event) => setFilters((old) => ({ ...old, desde: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3" /></label><label className="text-sm font-semibold">Hasta<input aria-label="Fecha hasta" type="date" value={filters.hasta} onChange={(event) => setFilters((old) => ({ ...old, hasta: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3" /></label></>}
        <label className="text-sm font-semibold">Estado de pago<select value={filters.estado_pago} onChange={(event) => setFilters((old) => ({ ...old, estado_pago: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3"><option value="todos">Todos</option><option value="pagado">Pagadas</option><option value="pendiente">Pendientes</option></select></label>
        <label className="text-sm font-semibold">Buscar factura o cliente<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Ej. QSF-000012 o nombre" className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3" /></label>
        <label className="text-sm font-semibold">Ordenar por<select value={sort.ordenar} onChange={(event) => setSort((old) => ({ ...old, ordenar: event.target.value }))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3"><option value="fecha">Fecha</option><option value="numero">Número</option><option value="cliente">Cliente</option><option value="total">Total</option><option value="estado">Estado</option></select></label>
        <div className="flex items-end gap-2"><button type="button" aria-label={`Orden ${sort.direccion === 'desc' ? 'descendente' : 'ascendente'}`} onClick={() => setSort((old) => ({ ...old, direccion: old.direccion === 'desc' ? 'asc' : 'desc' }))} className="cursor-pointer rounded-xl border border-slate-300 px-4 py-3 font-bold text-slate-700 hover:bg-white">{sort.direccion === 'desc' ? '↓' : '↑'}</button><button type="button" onClick={() => { setFilters({ periodo: 'todo', estado_pago: 'todos', desde: '', hasta: '' }); setSearchInput(''); setSearch(''); setSort({ ordenar: 'fecha', direccion: 'desc' }) }} className="cursor-pointer whitespace-nowrap rounded-xl border border-rose-300 px-4 py-3 text-sm font-bold text-rose-700 hover:bg-rose-50">Limpiar filtros</button></div>
      </div>
    </section>

    {filters.periodo === 'personalizado' && (!filters.desde || !filters.hasta || filters.desde > filters.hasta) ? <p className="mt-6 rounded-xl bg-primary p-5 text-center text-sm text-slate-600">Selecciona fechas válidas para consultar el período personalizado (máximo 366 días).</p> : loading ? <p role="status" className="mt-6 rounded-xl bg-primary p-5 text-center text-slate-600">Cargando reportes…</p> : <>
      <section aria-label="Indicadores de ventas" className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, integer]) => <article key={label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 break-words text-2xl font-extrabold text-ink">{value == null ? '—' : integer ? value : money.format(value)}</p>{label === 'Total vendido' && summary && Number.isFinite(summary.variacionPorcentual) && <p className={`mt-1 text-xs font-semibold ${summary.variacionPorcentual >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{summary.variacionPorcentual >= 0 ? '↑' : '↓'} {Math.abs(summary.variacionPorcentual)}% vs. período anterior</p>}</article>)}</section>
      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"><article className="min-w-0 rounded-2xl border border-slate-200 p-4 sm:p-5"><h2 className="text-lg font-extrabold">Ventas en el tiempo</h2><SalesBars series={series} unit={filters.periodo === 'hoy' ? 'hora' : filters.periodo === 'anio' ? 'mes' : filters.periodo === 'todo' ? 'año' : 'día'} /></article><article className="rounded-2xl border border-slate-200 p-4 sm:p-5"><h2 className="text-lg font-extrabold">Estado de pago</h2><PaymentDonut summary={summary} /></article></section>

      <section className="mt-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold">Facturas</h2><p className="text-sm text-slate-500">{pagination.total} resultados · Selecciona facturas para actualizar en grupo.</p><p className="mt-1 text-xs text-slate-500">Casilla junto al estado: marcada = pagada; desmarcada = pendiente. La casilla al inicio sirve para acciones masivas.</p></div>{selected.length > 0 && <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => requestChange(selected, 'pagado')} className="cursor-pointer rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Marcar pagadas ({selected.length})</button><button type="button" disabled={busy} onClick={() => requestChange(selected, 'pendiente')} className="cursor-pointer rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">Marcar pendientes</button></div>}</div>
        <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 md:block"><table className="w-full min-w-[790px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th className="p-3"><input aria-label="Seleccionar todas las facturas de esta página" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))} /></th><th className="p-3">N.º factura</th><th className="p-3">Fecha</th><th className="p-3">Cliente</th><th className="p-3">Total</th><th className="p-3">Estado de pago</th><th className="p-3">Fecha de pago</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="p-3"><input aria-label={`Seleccionar factura ${row.numero} para acción masiva`} type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelected(row.id)} /></td><td className="p-3 font-bold">{row.numero}</td><td className="p-3">{asDate(row.fecha)}</td><td className="max-w-56 truncate p-3" title={row.cliente}>{row.cliente}</td><td className="p-3 font-semibold">{money.format(row.total)}</td><td className="p-3"><label className="inline-flex cursor-pointer items-center gap-2"><input aria-label={`Facturas ${row.numero}: marcar como pagada`} type="checkbox" checked={row.estado_pago === 'pagado'} disabled={busy} onChange={() => requestChange([row.id], row.estado_pago === 'pagado' ? 'pendiente' : 'pagado')} className="h-5 w-5 cursor-pointer accent-emerald-700 disabled:cursor-wait" /><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${row.estado_pago === 'pagado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{row.estado_pago === 'pagado' ? 'Pagada' : 'Pendiente'}</span></label></td><td className="p-3">{row.fecha_pago ? asDate(row.fecha_pago) : '—'}</td></tr>)}</tbody></table></div>
        <div className="mt-4 space-y-3 md:hidden">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700"><input aria-label="Seleccionar todas las facturas de esta página" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))} />Seleccionar todas las de esta página</div>
          {rows.map((row) => <article key={row.id} className="min-w-0 rounded-2xl border border-slate-200 p-4 shadow-sm"><div className="flex min-w-0 items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-2"><input aria-label={`Seleccionar factura ${row.numero} para acción masiva`} type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelected(row.id)} className="mt-1 shrink-0" /><div className="min-w-0"><p className="break-all text-sm font-extrabold">{row.numero}</p><p className="mt-1 break-words text-sm text-slate-700">{row.cliente}</p></div></div><label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5"><input aria-label={`Factura ${row.numero}: marcar como pagada`} type="checkbox" checked={row.estado_pago === 'pagado'} disabled={busy} onChange={() => requestChange([row.id], row.estado_pago === 'pagado' ? 'pendiente' : 'pagado')} className="h-5 w-5 cursor-pointer accent-emerald-700 disabled:cursor-wait" /><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${row.estado_pago === 'pagado' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{row.estado_pago === 'pagado' ? 'Pagada' : 'Pendiente'}</span></label></div><div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs"><div><p className="text-slate-500">Fecha</p><p className="mt-1 font-semibold">{asDate(row.fecha)}</p></div><div><p className="text-slate-500">Total</p><p className="mt-1 break-words font-extrabold">{money.format(row.total)}</p></div><div className="col-span-2"><p className="text-slate-500">Fecha de pago</p><p className="mt-1 font-semibold">{row.fecha_pago ? asDate(row.fecha_pago) : '—'}</p></div></div></article>)}
        </div>
        {rows.length === 0 && <p className="mt-3 rounded-xl bg-primary p-5 text-center text-sm text-slate-600">No se encontraron facturas con estos filtros.</p>}
        <div className="mt-4 flex items-center justify-between gap-3 text-sm"><button type="button" disabled={pagination.pagina <= 1 || busy} onClick={() => void load({ page: pagination.pagina - 1 })} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Anterior</button><span>Página {pagination.pagina} de {Math.max(1, pagination.paginas)}</span><button type="button" disabled={pagination.pagina >= pagination.paginas || busy} onClick={() => void load({ page: pagination.pagina + 1 })} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Siguiente</button></div>
      </section>
    </>}
    {confirm && <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 py-5"><section role="alertdialog" aria-modal="true" aria-labelledby="report-confirm-title" className="my-auto w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-xl font-bold text-amber-800">?</div><h2 id="report-confirm-title" className="mt-4 text-xl font-extrabold">¿Confirmas el cambio?</h2><p className="mt-2 break-words text-sm leading-6 text-slate-600">Vas a marcar {confirm.ids.length} factura{confirm.ids.length !== 1 ? 's' : ''} como <strong>{confirm.estado_pago}</strong>. Monto afectado: <strong>{money.format(confirm.amount)}</strong>.</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" autoFocus onClick={() => setConfirm(null)} className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700">Cancelar</button><button type="button" onClick={() => void applyChange()} className="cursor-pointer rounded-xl bg-brand px-4 py-2.5 font-bold text-white hover:bg-brand-dark">Confirmar cambio</button></div></section></div>}
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => setFeedback(null)} onRetry={feedback?.retry} />
  </section></main>
}
