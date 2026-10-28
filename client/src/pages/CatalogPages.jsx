import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { AlertModal } from '../components/AlertModal'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const emptyStore = { name: '', nit: '', address: '', city: '', phone: '', email: '', contactName: '' }
const emptyCheese = { name: '', description: '', unit: 'kg' }

function CatalogHeader({ title, description, children }) {
  return <header className="mx-auto mb-6 flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div><Link to="/" className="text-sm font-bold text-brand hover:text-brand-dark">← Volver al inicio</Link><h1 className="mt-3 text-3xl font-extrabold">{title}</h1><p className="mt-1 text-sm text-slate-600">{description}</p></div>
    {children}
  </header>
}

function Field({ label, children }) {
  return <label className="block text-sm font-semibold text-ink"><span className="mb-1.5 block">{label}</span>{children}</label>
}

function TextField({ label, name, value, onChange, required = false, type = 'text', ...props }) {
  return <Field label={label}><input name={name} type={type} value={value} onChange={onChange} required={required} {...props} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" /></Field>
}

function SelectField({ label, name, value, onChange, children, ...props }) {
  return <Field label={label}><select name={name} value={value} onChange={onChange} {...props} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">{children}</select></Field>
}

function Notice({ message, error = false, onClose }) {
  return <AlertModal message={message} variant={error ? 'error' : 'success'} onClose={onClose} />
}

function getError(error, fallback) { return error.response?.data?.error?.message || fallback }

function AdminOnlyNote() {
  return <p className="rounded-xl bg-primary px-4 py-3 text-sm text-brand-dark">Solo administración puede agregar o modificar este catálogo.</p>
}

export function StoresPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [stores, setStores] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [form, setForm] = useState(emptyStore)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadStores() {
    setLoading(true)
    try {
      const { data } = await api.get('/stores', { params: { status, ...(search ? { search } : {}) } })
      setStores(data.data)
    } catch (requestError) { setError(true); setMessage(getError(requestError, 'No se pudieron cargar los almacenes.')) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadStores() }, [status])

  function changeField(event) { setForm((value) => ({ ...value, [event.target.name]: event.target.value })) }
  function beginEdit(store) {
    setEditingId(store._id)
    setForm(Object.fromEntries(Object.keys(emptyStore).map((key) => [key, store[key] || ''])))
    setMessage('')
  }
  function cancelEdit() { setEditingId(null); setForm(emptyStore) }

  async function save(event) {
    event.preventDefault()
    setMessage('')
    setError(false)
    try {
      if (editingId) await api.put(`/stores/${editingId}`, form)
      else await api.post('/stores', form)
      setMessage(editingId ? 'Almacén actualizado.' : 'Almacén agregado.')
      cancelEdit()
      await loadStores()
    } catch (requestError) { setError(true); setMessage(getError(requestError, 'No se pudo guardar el almacén.')) }
  }

  async function deactivate(store) {
    if (!window.confirm(`¿Desactivar ${store.name}? Sus registros se conservarán.`)) return
    try {
      await api.delete(`/stores/${store._id}`)
      setMessage('Almacén desactivado; sus datos se conservaron.')
      setError(false)
      await loadStores()
    } catch (requestError) { setMessage(getError(requestError, 'No se pudo desactivar el almacén.')); setError(true) }
  }

  async function activate(store) {
    try { await api.put(`/stores/${store._id}`, { isActive: true }); setMessage('Almacén activado.'); setError(false); await loadStores() }
    catch (requestError) { setMessage(getError(requestError, 'No se pudo activar el almacén.')); setError(true) }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-CO')
    if (!query) return stores
    return stores.filter((store) => [store.name, store.nit, store.city, store.contactName].some((value) => value?.toLocaleLowerCase('es-CO').includes(query)))
  }, [search, stores])

  return <main className="min-h-screen bg-primary px-4 py-6 text-ink sm:px-8 sm:py-10">
    <CatalogHeader title="Almacenes" description="Administra los establecimientos registrados y su información de contacto." />
    <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl bg-white p-4 shadow-card sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <TextField label="Buscar" name="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, NIT, ciudad o contacto" />
          <SelectField label="Estado" name="status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></SelectField>
        </div>
        <Notice message={message} error={error} onClose={() => { setMessage(''); setError(false) }} />
        {loading ? <p className="py-8 text-center text-sm text-slate-500">Cargando almacenes…</p> : filtered.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No hay almacenes para mostrar.</p> : <div className="space-y-3">
          {filtered.map((store) => <article key={store._id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-bold">{store.name}</h2><p className="mt-1 text-sm text-slate-600">{store.address} · {store.city}</p><p className="mt-1 text-xs text-slate-500">{store.nit ? `NIT/CC ${store.nit} · ` : ''}{store.phone || 'Sin teléfono'}{store.contactName ? ` · ${store.contactName}` : ''}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${store.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{store.isActive ? 'Activo' : 'Inactivo'}</span>
            </div>
            {isAdmin && <div className="mt-3 flex gap-2"><button onClick={() => beginEdit(store)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">Editar</button>{store.isActive ? <button onClick={() => deactivate(store)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">Desactivar</button> : <button onClick={() => activate(store)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Activar</button>}</div>}
          </article>)}
        </div>}
      </div>
      <aside className="h-fit rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <h2 className="mb-4 text-lg font-extrabold">{editingId ? 'Editar almacén' : 'Agregar almacén'}</h2>
        {isAdmin ? <form onSubmit={save} className="space-y-3">
          <TextField label="Nombre del almacén" name="name" value={form.name} onChange={changeField} required maxLength={120} />
          <TextField label="NIT o cédula" name="nit" value={form.nit} onChange={changeField} maxLength={30} />
          <TextField label="Dirección" name="address" value={form.address} onChange={changeField} required maxLength={200} />
          <TextField label="Ciudad" name="city" value={form.city} onChange={changeField} required maxLength={100} />
          <TextField label="Teléfono" name="phone" value={form.phone} onChange={changeField} maxLength={40} />
          <TextField label="Correo" type="email" name="email" value={form.email} onChange={changeField} maxLength={254} />
          <TextField label="Persona de contacto" name="contactName" value={form.contactName} onChange={changeField} maxLength={120} />
          <div className="flex gap-2 pt-2"><button type="submit" className="flex-1 rounded-xl bg-brand px-4 py-2.5 font-bold text-white hover:bg-brand-dark">{editingId ? 'Guardar cambios' : 'Agregar almacén'}</button>{editingId && <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-200 px-4 py-2.5 font-semibold">Cancelar</button>}</div>
        </form> : <AdminOnlyNote />}
      </aside>
    </section>
  </main>
}

export function CheesesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [cheeses, setCheeses] = useState([])
  const [status, setStatus] = useState('active')
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyCheese)
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadCheeses() {
    setLoading(true)
    try { const { data } = await api.get('/cheeses', { params: { status } }); setCheeses(data.data) }
    catch (requestError) { setMessage(getError(requestError, 'No se pudieron cargar los quesos.')); setError(true) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadCheeses() }, [status])

  function changeField(event) { setForm((value) => ({ ...value, [event.target.name]: event.target.value })) }
  function edit(cheese) { setEditingId(cheese._id); setForm({ name: cheese.name, description: cheese.description || '', unit: cheese.unit }); setMessage('') }
  function cancel() { setEditingId(null); setForm(emptyCheese) }
  async function save(event) {
    event.preventDefault(); setMessage(''); setError(false)
    try {
      if (editingId) await api.put(`/cheeses/${editingId}`, form)
      else await api.post('/cheeses', form)
      setMessage(editingId ? 'Queso actualizado.' : 'Queso agregado.')
      cancel(); await loadCheeses()
    } catch (requestError) { setMessage(getError(requestError, 'No se pudo guardar el queso.')); setError(true) }
  }
  async function deactivate(cheese) {
    if (!window.confirm(`¿Desactivar ${cheese.name}?`)) return
    try { await api.delete(`/cheeses/${cheese._id}`); setMessage('Queso desactivado.'); setError(false); await loadCheeses() }
    catch (requestError) { setMessage(getError(requestError, 'No se pudo desactivar el queso.')); setError(true) }
  }
  async function activate(cheese) {
    try { await api.put(`/cheeses/${cheese._id}`, { isActive: true }); setMessage('Queso activado.'); setError(false); await loadCheeses() }
    catch (requestError) { setMessage(getError(requestError, 'No se pudo activar el queso.')); setError(true) }
  }
  const filtered = useMemo(() => cheeses.filter((cheese) => cheese.name.toLocaleLowerCase('es-CO').includes(search.trim().toLocaleLowerCase('es-CO'))), [cheeses, search])

  return <main className="min-h-screen bg-primary px-4 py-6 text-ink sm:px-8 sm:py-10">
    <CatalogHeader title="Tipos de queso" description="Define los productos y sus unidades para las cotizaciones." />
    <section className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl bg-white p-4 shadow-card sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <TextField label="Buscar" name="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre del queso" />
          <SelectField label="Estado" name="status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></SelectField>
        </div>
        <Notice message={message} error={error} onClose={() => { setMessage(''); setError(false) }} />
        {loading ? <p className="py-8 text-center text-sm text-slate-500">Cargando productos…</p> : filtered.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No hay productos para mostrar.</p> : <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((cheese) => <article key={cheese._id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2"><div><h2 className="font-bold">{cheese.name}</h2><p className="mt-1 text-sm text-slate-600">{cheese.description || 'Sin descripción'} · {cheese.unit === 'kg' ? 'Kilogramo' : 'Unidad'}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${cheese.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{cheese.isActive ? 'Activo' : 'Inactivo'}</span></div>
            {isAdmin && <div className="mt-3 flex gap-2"><button onClick={() => edit(cheese)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50">Editar</button>{cheese.isActive ? <button onClick={() => deactivate(cheese)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">Desactivar</button> : <button onClick={() => activate(cheese)} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Activar</button>}</div>}
          </article>)}
        </div>}
      </div>
      <aside className="h-fit rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <h2 className="mb-4 text-lg font-extrabold">{editingId ? 'Editar queso' : 'Agregar queso'}</h2>
        {isAdmin ? <form onSubmit={save} className="space-y-3">
          <TextField label="Nombre" name="name" value={form.name} onChange={changeField} required maxLength={100} />
          <TextField label="Descripción" name="description" value={form.description} onChange={changeField} maxLength={500} />
          <SelectField label="Unidad de medida" name="unit" value={form.unit} onChange={changeField}><option value="kg">Kilogramo (kg)</option><option value="und">Unidad (und)</option></SelectField>
          <div className="flex gap-2 pt-2"><button type="submit" className="flex-1 rounded-xl bg-brand px-4 py-2.5 font-bold text-white hover:bg-brand-dark">{editingId ? 'Guardar cambios' : 'Agregar queso'}</button>{editingId && <button type="button" onClick={cancel} className="rounded-xl border border-slate-200 px-4 py-2.5 font-semibold">Cancelar</button>}</div>
        </form> : <AdminOnlyNote />}
      </aside>
    </section>
  </main>
}

export function PricesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [scope, setScope] = useState('general')
  const [stores, setStores] = useState([])
  const [storeId, setStoreId] = useState('')
  const [rows, setRows] = useState([])
  const [history, setHistory] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/stores', { params: { status: 'active' } }).then(({ data }) => {
      setStores(data.data)
      if (data.data.length) setStoreId((current) => current || data.data[0]._id)
    }).catch((requestError) => { setError(true); setMessage(getError(requestError, 'No se pudieron cargar los almacenes.')) })
  }, [])

  async function loadMatrix() {
    if (scope === 'store' && !storeId) { setRows([]); return }
    setLoading(true); setMessage(''); setError(false)
    try {
      const { data } = scope === 'general' ? await api.get('/prices/general') : await api.get('/prices', { params: { store: storeId } })
      setRows(data.data.map((row) => ({ ...row, value: row.price == null ? '' : String(row.price) })))
    } catch (requestError) { setMessage(getError(requestError, 'No se pudieron cargar los precios.')); setError(true) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadMatrix() }, [scope, storeId])

  async function loadHistory() {
    try {
      const params = scope === 'general' ? { scope: 'general', limit: 20 } : { scope: 'store', store: storeId, limit: 20 }
      const { data } = await api.get('/prices/history', { params })
      setHistory(data.data)
    } catch { setHistory([]) }
  }
  useEffect(() => { loadHistory() }, [scope, storeId])

  function updatePrice(cheeseId, value) {
    setRows((current) => current.map((row) => row.cheeseId === cheeseId ? { ...row, value } : row))
  }

  async function savePrices() {
    setSaving(true); setMessage(''); setError(false)
    const updates = []
    for (const row of rows) {
      if (row.value === '') continue
      const value = Number(row.value)
      if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000_000) {
        setMessage(`Revisa el precio de ${row.name}. Debe ser un valor entero positivo en COP.`); setError(true); setSaving(false); return
      }
      updates.push({ cheeseId: row.cheeseId, price: value })
    }
    if (!updates.length) { setMessage('Ingresa al menos un precio antes de guardar.'); setError(true); setSaving(false); return }
    try {
      const endpoint = scope === 'general' ? '/prices/general' : '/prices'
      const body = scope === 'general' ? { updates } : { storeId, updates }
      const { data } = await api.put(endpoint, body)
      await Promise.all([loadMatrix(), loadHistory()])
      setMessage(`Precios guardados correctamente. ${data.data.changed} cambio(s) registrado(s) en el historial.`)
    } catch (requestError) { setMessage(getError(requestError, 'No se pudieron guardar los precios.')); setError(true) }
    finally { setSaving(false) }
  }

  const storeLabel = useMemo(() => stores.find((store) => store._id === storeId)?.name || '', [stores, storeId])

  return <main className="min-h-screen bg-primary px-4 py-6 text-ink sm:px-8 sm:py-10">
    <CatalogHeader title="Precios" description="Configura la tarifa general y los valores particulares por almacén." />
    <section className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Tipo de tarifa" name="scope" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="general">Tarifa general · almacenes nuevos</option>
            <option value="store">Tarifa particular · almacén registrado</option>
          </SelectField>
          {scope === 'store' && <SelectField label="Almacén" name="storeId" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
            {stores.length === 0 ? <option value="">No hay almacenes activos</option> : stores.map((store) => <option key={store._id} value={store._id}>{store.name} · {store.city}</option>)}
          </SelectField>}
        </div>
        <p className="mt-4 rounded-xl bg-primary px-4 py-3 text-sm leading-6 text-brand-dark">{scope === 'general' ? 'Esta tarifa se aplicará a facturas de almacenes nuevos que no estén en el catálogo. Solo administración puede modificarla.' : `Estos precios se usarán para ${storeLabel || 'el almacén seleccionado'}. Si falta un precio, ese queso no podrá agregarse a la cotización.`}</p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-card sm:p-6">
        <Notice message={message} error={error} onClose={() => { setMessage(''); setError(false) }} />
        {loading ? <p className="py-8 text-center text-sm text-slate-500">Cargando matriz de precios…</p> : rows.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Agrega quesos activos para configurar la tarifa.</p> : <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Queso</th><th className="px-3 py-3">Unidad</th><th className="px-3 py-3">Precio actual</th><th className="px-3 py-3">Nuevo precio COP</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.cheeseId} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3 font-semibold">{row.name}</td><td className="px-3 py-3 text-slate-600">{row.unit}</td><td className="px-3 py-3 text-slate-600">{row.price == null ? 'Sin definir' : money.format(row.price)}</td><td className="px-3 py-3"><input aria-label={`Precio COP para ${row.name}`} type="number" min="1" max="1000000000" step="1" inputMode="numeric" value={row.value} onChange={(event) => updatePrice(row.cheeseId, event.target.value)} disabled={!isAdmin} placeholder="Ej. 25000" className="w-44 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:bg-slate-50 disabled:text-slate-500" /></td></tr>)}</tbody>
          </table>
        </div>}
        {isAdmin && rows.length > 0 && <div className="mt-5 flex justify-end"><button disabled={saving || loading} onClick={savePrices} className="rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar cambios'}</button></div>}
        {!isAdmin && <p className="mt-4 text-sm text-slate-500">Los vendedores pueden consultar precios, pero no modificarlos.</p>}
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <h2 className="text-lg font-extrabold">Historial de cambios</h2>
        <p className="mt-1 text-sm text-slate-600">Últimos cambios de {scope === 'general' ? 'la tarifa general' : storeLabel || 'el almacén'}.</p>
        {history.length === 0 ? <p className="mt-4 text-sm text-slate-500">Todavía no hay cambios registrados.</p> : <div className="mt-4 divide-y divide-slate-100">
          {history.map((item) => <div key={item._id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><span className="font-semibold">{item.cheese?.name || 'Queso'}</span><span className="text-slate-500"> · {item.changedBy?.name || 'Usuario'} · {new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(item.changedAt))}</span></div><p className="font-semibold">{item.oldPrice == null ? 'Nuevo' : money.format(item.oldPrice)} → {money.format(item.newPrice)}</p></div>)}
        </div>}
      </div>
    </section>
  </main>
}
