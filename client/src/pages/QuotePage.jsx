import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const emptyNewStore = { name: '', nit: '', address: '', city: '', phone: '', email: '', contactName: '' }

function currentBogotaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function toMilli(value) {
  if (!/^\d{1,7}(?:\.\d{1,3})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const result = BigInt(whole) * 1000n + BigInt((fraction + '000').slice(0, 3))
  return result > 0n && result <= 1_000_000_000n ? Number(result) : null
}

function fromMilli(value) {
  const whole = Math.floor(value / 1000)
  const fraction = value % 1000
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}`
}

function lineTotal(price, quantityMilli) {
  return Number((BigInt(price) * BigInt(quantityMilli) + 500n) / 1000n)
}

function ErrorNotice({ children }) {
  if (!children) return null
  return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{children}</p>
}

function Field({ label, children }) {
  return <label className="block text-sm font-semibold text-ink"><span className="mb-1.5 block">{label}</span>{children}</label>
}

function Input({ label, name, value, onChange, required = false, type = 'text', ...props }) {
  return <Field label={label}><input name={name} type={type} value={value} onChange={onChange} required={required} {...props} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" /></Field>
}

export function QuotePage() {
  const [mode, setMode] = useState('registered')
  const [stores, setStores] = useState([])
  const [storeId, setStoreId] = useState('')
  const [cheeses, setCheeses] = useState([])
  const [prices, setPrices] = useState(new Map())
  const [items, setItems] = useState([])
  const [newStore, setNewStore] = useState(emptyNewStore)
  const [selectedCheeseId, setSelectedCheeseId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(currentBogotaDate)
  const [loading, setLoading] = useState(true)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [driveBusy, setDriveBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [savedQuote, setSavedQuote] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.get('/stores', { params: { status: 'active' } }),
      api.get('/cheeses', { params: { status: 'active' } }),
    ]).then(([storeResponse, cheeseResponse]) => {
      if (!alive) return
      setStores(storeResponse.data.data)
      setCheeses(cheeseResponse.data.data)
      if (storeResponse.data.data.length) setStoreId(storeResponse.data.data[0]._id)
    }).catch((requestError) => {
      if (alive) setError(requestError.response?.data?.error?.message || 'No se pudieron cargar almacenes y quesos.')
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (mode === 'registered' && !storeId) { setPrices(new Map()); return }
    let alive = true
    setLoadingPrices(true)
    setError('')
    const request = mode === 'new'
      ? api.get('/prices/general')
      : api.get('/prices', { params: { store: storeId } })
    request.then(({ data }) => {
      if (alive) setPrices(new Map(data.data.map((row) => [row.cheeseId, row])))
    }).catch((requestError) => {
      if (alive) { setPrices(new Map()); setError(requestError.response?.data?.error?.message || 'No se pudieron cargar los precios para el destino.') }
    }).finally(() => { if (alive) setLoadingPrices(false) })
    return () => { alive = false }
  }, [mode, storeId])

  const selectedCheese = useMemo(() => cheeses.find((cheese) => cheese._id === selectedCheeseId), [cheeses, selectedCheeseId])
  const selectedPrice = selectedCheese ? prices.get(selectedCheese._id)?.price : null
  const previewTotal = items.reduce((sum, item) => sum + lineTotal(item.unitPrice, toMilli(item.quantity) || 0), 0)
  const newStoreValid = newStore.name.trim().length >= 2 && newStore.address.trim().length >= 2 && newStore.city.trim().length >= 2
  const canSave = items.length > 0 && !loadingPrices && !saving && (mode === 'registered' ? Boolean(storeId) : newStoreValid)

  function setDestination(nextMode) {
    setMode(nextMode)
    setItems([])
    setSavedQuote(null)
    setMessage('')
    setError('')
  }

  function addItem() {
    setError('')
    setMessage('')
    if (!selectedCheese) { setError('Selecciona un tipo de queso.'); return }
    const row = prices.get(selectedCheese._id)
    if (row?.price == null) { setError(`No hay precio configurado para ${selectedCheese.name} en este destino.`); return }
    const quantityMilli = toMilli(quantity)
    if (!quantityMilli || (selectedCheese.unit === 'und' && quantityMilli % 1000 !== 0)) {
      setError(selectedCheese.unit === 'und' ? 'La cantidad de unidades debe ser un entero positivo.' : 'Ingresa una cantidad positiva con máximo 3 decimales.')
      return
    }
    const price = row.price
    if (lineTotal(price, quantityMilli) < 1) { setError('La cantidad produce un subtotal menor a $1 COP.'); return }
    setItems((current) => {
      const existing = current.find((item) => item.cheeseId === selectedCheese._id)
      if (!existing) return [...current, { cheeseId: selectedCheese._id, name: selectedCheese.name, unit: selectedCheese.unit, unitPrice: price, quantity: fromMilli(quantityMilli) }]
      const combined = (toMilli(existing.quantity) || 0) + quantityMilli
      return current.map((item) => item.cheeseId === selectedCheese._id ? { ...item, quantity: fromMilli(combined) } : item)
    })
    setQuantity('1')
  }

  function updateQuantity(cheeseId, value) {
    setItems((current) => current.map((item) => item.cheeseId === cheeseId ? { ...item, quantity: value } : item))
  }

  function updateNewStore(event) {
    setNewStore((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function saveQuote() {
    setError('')
    setMessage('')
    for (const item of items) {
      const quantityMilli = toMilli(item.quantity)
      if (!quantityMilli || (item.unit === 'und' && quantityMilli % 1000 !== 0) || lineTotal(item.unitPrice, quantityMilli) < 1) {
        setError(`Revisa la cantidad de ${item.name}.`)
        return
      }
    }
    setSaving(true)
    const payload = {
      storeMode: mode,
      ...(mode === 'registered' ? { storeId } : { newStore }),
      items: items.map(({ cheeseId, quantity: amount }) => ({ cheeseId, quantity: amount })),
      notes,
      date,
    }
    try {
      const { data } = await api.post('/quotes', payload)
      const quote = data.data
      setSavedQuote(quote)
      setMessage(`Cotización ${quote.number} guardada. Guardando PDF en Google Drive…`)
      setItems([])
      setDriveBusy(true)
      try {
        const upload = await api.post(`/quotes/${quote._id}/drive`)
        const updatedQuote = { ...quote, driveFile: upload.data.data.driveFile }
        setSavedQuote(updatedQuote)
        setMessage(`Cotización ${quote.number} guardada y PDF enviado a Google Drive.`)
      } catch (driveError) {
        setError(driveError.response?.data?.error?.message || 'La cotización se guardó, pero no se pudo guardar su PDF en Google Drive. Puedes reintentar desde esta pantalla.')
        setMessage(`Cotización ${quote.number} guardada.`)
      } finally { setDriveBusy(false) }
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo guardar la cotización.')
    } finally { setSaving(false) }
  }

  async function openQuotePdf(print = false) {
    setError('')
    const printWindow = print ? window.open('', '_blank') : null
    if (print && !printWindow) { setError('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e inténtalo de nuevo.'); return }
    setPdfBusy(true)
    try {
      const { data } = await api.get(`/quotes/${savedQuote._id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      if (printWindow) {
        printWindow.location.href = url
        printWindow.addEventListener('load', () => printWindow.print(), { once: true })
      } else {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${savedQuote.number}.pdf`
        document.body.appendChild(anchor); anchor.click(); anchor.remove()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (requestError) {
      printWindow?.close()
      setError(requestError.response?.data?.error?.message || 'No se pudo generar el PDF.')
    } finally { setPdfBusy(false) }
  }

  async function savePdfToDrive() {
    setError('')
    setDriveBusy(true)
    try {
      const { data } = await api.post(`/quotes/${savedQuote._id}/drive`)
      setSavedQuote((current) => ({ ...current, driveFile: data.data.driveFile }))
      setMessage('PDF guardado en Google Drive.')
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo guardar el PDF en Google Drive.')
    } finally { setDriveBusy(false) }
  }

  function startNewQuote() {
    setSavedQuote(null)
    setItems([])
    setNotes('')
    setDate(currentBogotaDate())
    setMessage('')
    setError('')
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-primary text-ink" role="status">Cargando el cotizador…</main>

  if (savedQuote) return <main className="min-h-screen bg-primary px-4 py-8 text-ink sm:px-8">
    <section className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-card sm:p-10">
      <Link to="/" className="text-sm font-bold text-brand">← Volver al inicio</Link>
      <div className="mt-8 rounded-2xl bg-emerald-50 p-6 text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Cotización guardada</p>
        <h1 className="mt-2 text-3xl font-extrabold">{savedQuote.number}</h1>
        <p className="mt-3 text-2xl font-extrabold text-brand-dark">{money.format(savedQuote.total)}</p>
        <p className="mt-2 text-sm text-slate-600">{savedQuote.store.name} · {savedQuote.store.city}</p>
      </div>
      <div className="mt-6 divide-y divide-slate-100">
        {savedQuote.items.map((item) => <div key={item.cheese} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{item.cheeseName} · {item.quantity} {item.unit}<span className="ml-2 text-xs text-slate-500">{money.format(item.unitPrice)} / {item.unit}</span></span><span className="font-semibold">{money.format(item.lineTotal)}</span></div>)}
      </div>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => openQuotePdf(false)} disabled={pdfBusy} className="rounded-xl border border-brand px-5 py-3 font-bold text-brand hover:bg-primary disabled:opacity-50">{pdfBusy ? 'Generando PDF…' : 'Descargar PDF'}</button>
        <button type="button" onClick={() => openQuotePdf(true)} disabled={pdfBusy} className="rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50">Imprimir</button>
      </div>
      {savedQuote.driveFile?.id ? <a href={savedQuote.driveFile.webViewLink || `https://drive.google.com/file/d/${savedQuote.driveFile.id}/view`} target="_blank" rel="noreferrer" className="mt-3 block rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-center font-bold text-emerald-800 hover:bg-emerald-100">PDF guardado en Google Drive · Abrir</a> : <button type="button" onClick={savePdfToDrive} disabled={driveBusy} className="mt-3 w-full rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{driveBusy ? 'Guardando en Google Drive…' : 'Guardar PDF en Google Drive'}</button>}
      <button onClick={startNewQuote} className="mt-6 w-full rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark">Nueva cotización</button>
    </section>
  </main>

  return <main className="min-h-screen bg-primary px-4 py-6 pb-36 text-ink sm:px-8 sm:py-10 sm:pb-36">
    <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between">
      <div><Link to="/" className="text-sm font-bold text-brand">← Volver al inicio</Link><h1 className="mt-2 text-3xl font-extrabold">Nueva cotización</h1><p className="mt-1 text-sm text-slate-600">Un solo cotizador para almacenes registrados y nuevos.</p></div>
    </header>
    <section className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <article className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-extrabold">Destino de la cotización</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button type="button" aria-pressed={mode === 'registered'} onClick={() => setDestination('registered')} className={`rounded-xl border p-4 text-left transition ${mode === 'registered' ? 'border-brand bg-primary ring-2 ring-brand/20' : 'border-slate-200 hover:bg-slate-50'}`}><span className="block font-bold">Almacén registrado</span><span className="mt-1 block text-sm text-slate-600">Seleccionar del catálogo y usar su tarifa particular.</span></button>
            <button type="button" aria-pressed={mode === 'new'} onClick={() => setDestination('new')} className={`rounded-xl border p-4 text-left transition ${mode === 'new' ? 'border-brand bg-primary ring-2 ring-brand/20' : 'border-slate-200 hover:bg-slate-50'}`}><span className="block font-bold">Almacén nuevo</span><span className="mt-1 block text-sm text-slate-600">Datos solo para esta factura; usará la tarifa general.</span></button>
          </div>
          {mode === 'registered' ? <div className="mt-4">
            {stores.length ? <Field label="Almacén"><select value={storeId} onChange={(event) => { setStoreId(event.target.value); setItems([]); setSavedQuote(null) }} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">{stores.map((store) => <option key={store._id} value={store._id}>{store.name} · {store.city}</option>)}</select></Field> : <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">No hay almacenes registrados activos. Puedes crear esta factura con datos de un almacén nuevo.</p>}
          </div> : <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Input label="Nombre del almacén" name="name" value={newStore.name} onChange={updateNewStore} required maxLength={120} />
            <Input label="NIT o cédula" name="nit" value={newStore.nit} onChange={updateNewStore} maxLength={30} />
            <Input label="Dirección" name="address" value={newStore.address} onChange={updateNewStore} required maxLength={200} />
            <Input label="Ciudad" name="city" value={newStore.city} onChange={updateNewStore} required maxLength={100} />
            <Input label="Teléfono" name="phone" value={newStore.phone} onChange={updateNewStore} maxLength={40} />
            <Input label="Correo" type="email" name="email" value={newStore.email} onChange={updateNewStore} maxLength={254} />
            <Input label="Persona de contacto" name="contactName" value={newStore.contactName} onChange={updateNewStore} maxLength={120} />
            <p className="self-end rounded-xl bg-primary px-4 py-3 text-sm leading-5 text-brand-dark sm:col-span-2">Estos datos quedan como snapshot de esta cotización; el almacén no se agrega al catálogo.</p>
          </div>}
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-extrabold">Agregar queso</h2>
          {loadingPrices && <p className="mt-3 text-sm text-slate-500">Cargando precios…</p>}
          {!loadingPrices && <div className="mt-4 grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
            <Field label="Tipo de queso"><select value={selectedCheeseId} onChange={(event) => setSelectedCheeseId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"><option value="">Selecciona un queso</option>{cheeses.map((cheese) => { const row = prices.get(cheese._id); return <option key={cheese._id} value={cheese._id}>{cheese.name}{row?.price == null ? ' · sin precio' : ''}</option> })}</select></Field>
            <Input label={`Cantidad${selectedCheese ? ` (${selectedCheese.unit})` : ''}`} name="quantity" type="text" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder={selectedCheese?.unit === 'und' ? '1' : '1.250'} />
            <button type="button" onClick={addItem} disabled={!selectedCheese || selectedPrice == null || loadingPrices} className="rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">Agregar</button>
          </div>}
          {selectedCheese && <p className="mt-3 text-sm text-slate-600">Precio unitario: <strong className="text-ink">{selectedPrice == null ? 'Sin definir para este destino' : `${money.format(selectedPrice)} / ${selectedCheese.unit}`}</strong></p>}
          {cheeses.length === 0 && <p className="mt-3 text-sm text-slate-500">No hay tipos de queso activos. Administra el catálogo desde <Link className="font-bold text-brand" to="/cheeses">Quesos</Link>.</p>}
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-extrabold">Productos de la cotización</h2>
          {items.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Agrega uno o más quesos para calcular el total.</p> : <div className="mt-3 divide-y divide-slate-100">
            {items.map((item) => {
              const milli = toMilli(item.quantity) || 0
              return <div key={item.cheeseId} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_130px_120px_40px] sm:items-center">
                <div><p className="font-bold">{item.name}</p><p className="mt-1 text-xs text-slate-500">{money.format(item.unitPrice)} por {item.unit}</p></div>
                <Field label="Cantidad"><input aria-label={`Cantidad de ${item.name}`} type="text" inputMode="decimal" value={item.quantity} onChange={(event) => updateQuantity(item.cheeseId, event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" /></Field>
                <div><p className="text-xs text-slate-500">Subtotal</p><p className="font-extrabold">{milli ? money.format(lineTotal(item.unitPrice, milli)) : 'Revisa cantidad'}</p></div>
                <button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.cheeseId !== item.cheeseId))} aria-label={`Eliminar ${item.name}`} className="rounded-lg px-3 py-2 text-lg font-bold text-rose-700 hover:bg-rose-50">×</button>
              </div>
            })}
          </div>}
        </article>
      </div>

      <aside className="h-fit space-y-5 lg:sticky lg:top-5">
        <article className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-extrabold">Detalles</h2>
          <div className="mt-4 space-y-4">
            <Input label="Fecha" name="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <Field label="Observaciones"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={4} className="w-full resize-y rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" placeholder="Opcional" /></Field>
          </div>
        </article>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
      </aside>
    </section>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(11,18,51,0.08)] backdrop-blur sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total estimado</p><p className="text-2xl font-extrabold text-brand-dark">{money.format(previewTotal)}</p><p className="hidden text-xs text-slate-500 sm:block">El servidor vuelve a calcular precios y total al guardar.</p></div>
        <button type="button" onClick={saveQuote} disabled={!canSave} className="min-w-40 rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar cotización'}</button>
      </div>
    </div>
  </main>
}
