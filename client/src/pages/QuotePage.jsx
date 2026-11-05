import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { AlertModal } from '../components/AlertModal'

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
// Temporalmente se puede reactivar desde el entorno del cliente con VITE_CLOUD_SAVE_ENABLED=true.
const CLOUD_SAVE_ENABLED = import.meta.env.VITE_CLOUD_SAVE_ENABLED === 'true'
const emptyNewStore = { name: '', nit: '', address: '', city: '', phone: '', email: '', contactName: '' }
const homeButtonClass = 'inline-flex cursor-pointer whitespace-nowrap rounded-xl border border-rose-700 bg-rose-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 motion-reduce:transform-none motion-reduce:transition-none'

function currentBogotaDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function toMilli(value) {
  if (!/^\d{1,7}$/.test(value)) return null
  const result = BigInt(value) * 1000n
  return result > 0n && result <= 1_000_000_000n ? Number(result) : null
}

function fromMilli(value) { return String(Math.round(value / 1000)) }

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
  const [generalPrices, setGeneralPrices] = useState(new Map())
  const [items, setItems] = useState([])
  const [newStore, setNewStore] = useState(emptyNewStore)
  const [selectedCheeseId, setSelectedCheeseId] = useState('')
  const [addOneTimeProducts, setAddOneTimeProducts] = useState(false)
  const [draftUnitPrice, setDraftUnitPrice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(currentBogotaDate)
  const [loading, setLoading] = useState(true)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [loadingGeneralPrices, setLoadingGeneralPrices] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [driveBusy, setDriveBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [savedQuote, setSavedQuote] = useState(null)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)

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
      if (alive) setError(requestError.response?.data?.error?.message || 'No se pudieron cargar clientes y productos.')
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

  useEffect(() => {
    if (mode !== 'registered' || !addOneTimeProducts || generalPrices.size > 0) return undefined
    let alive = true
    setLoadingGeneralPrices(true)
    api.get('/prices/general').then(({ data }) => {
      if (alive) setGeneralPrices(new Map(data.data.map((row) => [String(row.cheeseId), row])))
    }).catch((requestError) => {
      if (alive) setError(requestError.response?.data?.error?.message || 'No se pudo cargar la tarifa general para el producto adicional.')
    }).finally(() => { if (alive) setLoadingGeneralPrices(false) })
    return () => { alive = false }
  }, [mode, addOneTimeProducts, generalPrices.size])

  const selectedStore = useMemo(() => stores.find((store) => store._id === storeId), [stores, storeId])
  const availableCheeses = useMemo(() => {
    if (mode === 'new') return cheeses
    return cheeses.filter((cheese) => {
      const cheeseId = String(cheese._id)
      if (selectedStore?.excludedCheeses?.some((id) => String(id) === cheeseId)) return false
      if (!selectedStore?.productsConfigured) return true
      const assigned = selectedStore.allowedProducts?.some((id) => String(id) === cheeseId) || false
      return addOneTimeProducts ? !assigned : assigned
    })
  }, [cheeses, mode, selectedStore, addOneTimeProducts])
  const selectedCheese = useMemo(() => availableCheeses.find((cheese) => cheese._id === selectedCheeseId), [availableCheeses, selectedCheeseId])
  const selectedPrice = selectedCheese ? prices.get(selectedCheese._id)?.price : null
  const selectedGeneralPrice = selectedCheese ? generalPrices.get(String(selectedCheese._id))?.price : null
  const usesCustomProductPrice = mode === 'new' || (mode === 'registered' && addOneTimeProducts)
  useEffect(() => {
    const price = mode === 'registered' && addOneTimeProducts ? selectedGeneralPrice : selectedPrice
    setDraftUnitPrice(price == null ? '' : String(price))
  }, [selectedCheeseId, selectedPrice, selectedGeneralPrice, mode, addOneTimeProducts])
  useEffect(() => {
    if (selectedCheeseId && !availableCheeses.some((cheese) => cheese._id === selectedCheeseId)) setSelectedCheeseId('')
  }, [availableCheeses, selectedCheeseId])
  const previewTotal = items.reduce((sum, item) => sum + lineTotal(item.unitPrice, toMilli(item.quantity) || 0), 0)
  const canSave = !loadingPrices && !saving && (mode !== 'registered' || Boolean(storeId))

  function setDestination(nextMode) {
    setMode(nextMode)
    setAddOneTimeProducts(false)
    setItems([])
    setSelectedCheeseId('')
    setSavedQuote(null)
    setMessage('')
    setError('')
    setFeedback(null)
  }

  function addItem() {
    setError('')
    setMessage('')
    if (!selectedCheese) { setError('Selecciona un producto.'); return }
    const row = prices.get(selectedCheese._id)
    let price
    if (usesCustomProductPrice) {
      price = Number(draftUnitPrice)
      if (!Number.isSafeInteger(price) || price < 1 || price > 1_000_000_000) {
        setError('Ingresa un precio unitario entero en pesos colombianos, mayor que cero.')
        return
      }
    } else {
      if (row?.price == null) { setError(`No hay precio configurado para ${selectedCheese.name} en este cliente.`); return }
      price = row.price
    }
    const quantityMilli = toMilli(quantity)
    if (!quantityMilli) {
      setError('La cantidad de unidades debe ser un entero positivo.')
      return
    }
    if (lineTotal(price, quantityMilli) < 1) { setError('La cantidad produce un subtotal menor a $1 COP.'); return }
    setItems((current) => {
      const existing = current.find((item) => item.cheeseId === selectedCheese._id)
      if (!existing) return [...current, { cheeseId: selectedCheese._id, name: selectedCheese.name, unit: selectedCheese.unit, unitPrice: price, quantity: fromMilli(quantityMilli), oneTime: mode === 'registered' && addOneTimeProducts }]
      const combined = (toMilli(existing.quantity) || 0) + quantityMilli
      return current.map((item) => item.cheeseId === selectedCheese._id ? { ...item, unitPrice: price, quantity: fromMilli(combined) } : item)
    })
    setQuantity('1')
  }

  function updateQuantity(cheeseId, value) {
    setItems((current) => current.map((item) => item.cheeseId === cheeseId ? { ...item, quantity: value } : item))
  }

  function updateNewStore(event) {
    setNewStore((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  function validateQuote() {
    setError('')
    setMessage('')
    setFeedback(null)
    if (mode === 'new' && newStore.name.trim().length < 2) {
      const message = newStore.name.trim() ? 'El nombre del cliente debe tener al menos 2 caracteres.' : 'No se puede crear la factura ni generar el PDF: falta el nombre del cliente nuevo.'
      setError(message)
      setFeedback({ variant: 'error', message })
      document.getElementById('new-store-name')?.focus()
      return false
    }
    if (items.length === 0) {
      const message = 'Agrega al menos un producto antes de generar la factura.'
      setError(message)
      setFeedback({ variant: 'error', message })
      return false
    }
    for (const item of items) {
      const quantityMilli = toMilli(item.quantity)
      if (!quantityMilli || lineTotal(item.unitPrice, quantityMilli) < 1) {
        setError(`Revisa la cantidad de ${item.name}.`)
        setFeedback({ variant: 'error', message: `Revisa la cantidad de ${item.name}.` })
        return false
      }
    }
    return true
  }

  function requestSaveQuote() {
    if (validateQuote()) setShowSaveConfirm(true)
  }

  async function saveQuote() {
    setSaving(true)
    const payload = {
      storeMode: mode,
      ...(mode === 'registered' ? { storeId } : { newStore }),
      items: items.map(({ cheeseId, quantity: amount, unitPrice, oneTime }) => ({ cheeseId, quantity: amount, ...(mode === 'new' || oneTime ? { unitPrice } : {}), ...(oneTime ? { oneTime: true } : {}) })),
      notes,
      date,
    }
    try {
      const { data } = await api.post('/quotes', payload)
      let quote = data.data
      setItems([])
      if (!CLOUD_SAVE_ENABLED) {
        setMessage(`Factura ${quote.number} guardada. Ya puedes descargar el PDF.`)
        setFeedback({ variant: 'success', message: `La factura ${quote.number} se guardó correctamente. La subida a Google Drive está temporalmente inactiva; descarga el PDF en este dispositivo.` })
        setSavedQuote(quote)
        return
      }
      setDriveBusy(true)
      try {
        const { data: driveResponse } = await api.post(`/quotes/${quote._id}/drive`)
        quote = { ...quote, driveFile: driveResponse.data.driveFile }
        setMessage(`Factura ${quote.number} guardada en Google Drive. Puedes descargar el PDF.`)
        setFeedback({ variant: 'success', message: `La factura ${quote.number} se guardó correctamente en Google Drive.` })
      } catch (driveError) {
        const message = driveError.response?.data?.error?.message || 'La factura se creó, pero no se pudo guardar en Google Drive. Puedes reintentar desde la descarga.'
        setError(message)
        setFeedback({ variant: 'error', message })
      } finally {
        setDriveBusy(false)
        setSavedQuote(quote)
      }
    } catch (requestError) {
      const message = requestError.response?.data?.error?.message || 'No se pudo guardar la factura.'
      setError(message)
      setFeedback({ variant: 'error', message })
    } finally { setSaving(false) }
  }

  async function downloadQuotePdf() {
    if (!savedQuote) return
    setError('')
    setPdfBusy(true)
    try {
      if (CLOUD_SAVE_ENABLED && !savedQuote.driveFile?.id) {
        setDriveBusy(true)
        const { data: driveResponse } = await api.post(`/quotes/${savedQuote._id}/drive`)
        setSavedQuote((current) => ({ ...current, driveFile: driveResponse.data.driveFile }))
      }
      const pdfResponse = await api.get(`/quotes/${savedQuote._id}/pdf`, { responseType: 'blob' })
      const { data } = pdfResponse
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
      const anchor = document.createElement('a')
      anchor.href = url
      const disposition = pdfResponse.headers['content-disposition'] || ''
      const serverFilename = disposition.match(/filename="([^"]+)"/i)?.[1]
      anchor.download = serverFilename || savedQuote.pdfFileName || `${savedQuote.number}.pdf`
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      setMessage(`Factura ${savedQuote.number} descargada.`)
      setFeedback({ variant: 'success', message: `El PDF de la factura ${savedQuote.number} se descargó correctamente.` })
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (requestError) {
      const message = requestError.response?.data?.error?.message || 'No se pudo generar el PDF.'
      setError(message)
      setFeedback({ variant: 'error', message })
    } finally { setPdfBusy(false); setDriveBusy(false) }
  }

  function startNewQuote() {
    setSavedQuote(null)
    setItems([])
    setNotes('')
    setDate(currentBogotaDate())
    setMessage('')
    setError('')
    setFeedback(null)
    setShowSaveConfirm(false)
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-primary text-ink" role="status">Cargando el cotizador…</main>

  if (savedQuote) return <main className="min-h-screen bg-primary px-4 py-8 text-ink sm:px-8">
    <section className="mx-auto max-w-3xl rounded-3xl bg-white p-6 shadow-card sm:p-10">
      <Link to="/" className={homeButtonClass}>Volver al inicio</Link>
      <div className="mt-8 rounded-2xl bg-emerald-50 p-6 text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-emerald-700">Factura guardada</p>
        <h1 className="mt-2 text-3xl font-extrabold">{savedQuote.number}</h1>
        <p className="mt-3 text-2xl font-extrabold text-brand-dark">{money.format(savedQuote.total)}</p>
        <p className="mt-2 text-sm text-slate-600">{savedQuote.store.name} · {savedQuote.store.city}</p>
      </div>
      {!CLOUD_SAVE_ENABLED && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">El guardado en Google Drive está temporalmente inactivo. La factura quedó guardada y puedes descargar el PDF directamente.</p>}
      <div className="mt-6 divide-y divide-slate-100">
        {savedQuote.items.map((item) => <div key={item.cheese} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{item.cheeseName} · {item.quantity} {item.unit}<span className="ml-2 text-xs text-slate-500">{money.format(item.unitPrice)} / {item.unit}</span></span><span className="font-semibold">{money.format(item.lineTotal)}</span></div>)}
      </div>
      {error && <ErrorNotice>{error}</ErrorNotice>}
      <div className="mt-6 grid gap-3">
        <button type="button" onClick={downloadQuotePdf} disabled={pdfBusy || driveBusy} className="rounded-xl border border-brand px-5 py-3 font-bold text-brand transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50">{driveBusy ? 'Guardando en Drive…' : pdfBusy ? 'Generando PDF…' : 'Descargar PDF'}</button>
      </div>
      {savedQuote.driveFile?.id && <a href={savedQuote.driveFile.webViewLink || `https://drive.google.com/file/d/${savedQuote.driveFile.id}/view`} target="_blank" rel="noreferrer" className="mt-3 block rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-center font-bold text-emerald-800 hover:bg-emerald-100">PDF guardado en Google Drive · Abrir</a>}
      <button onClick={startNewQuote} className="mt-6 w-full rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark">Crear otra factura</button>
    </section>
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => {
      setFeedback(null)
      if (mode === 'new' && !newStore.name.trim()) window.setTimeout(() => document.getElementById('new-store-name')?.focus(), 0)
    }} />
  </main>

  return <main className="min-h-screen bg-primary px-4 py-6 pb-36 text-ink sm:px-8 sm:py-10 sm:pb-36">
    <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between">
      <div><Link to="/" className={homeButtonClass}>Volver al inicio</Link><h1 className="mt-2 text-3xl font-extrabold">Crear factura</h1><p className="mt-1 text-sm text-slate-600">Selecciona un cliente del catálogo o crea una factura para un cliente nuevo.</p></div>
    </header>
    <section className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <article className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-extrabold">Destino de la factura</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button type="button" aria-pressed={mode === 'registered'} onClick={() => setDestination('registered')} className={`rounded-xl border p-4 text-left transition ${mode === 'registered' ? 'border-brand bg-primary ring-2 ring-brand/20' : 'border-slate-200 hover:bg-slate-50'}`}><span className="block font-bold">Cliente del catálogo</span><span className="mt-1 block text-sm text-slate-600">Elige un cliente registrado y se aplicarán sus precios.</span></button>
            <button type="button" aria-pressed={mode === 'new'} onClick={() => setDestination('new')} className={`rounded-xl border p-4 text-left transition ${mode === 'new' ? 'border-brand bg-primary ring-2 ring-brand/20' : 'border-slate-200 hover:bg-slate-50'}`}><span className="block font-bold">Nuevo (solo esta factura)</span><span className="mt-1 block text-sm text-slate-600">No se registra en el catálogo de clientes; puedes ajustar el precio base por producto.</span></button>
          </div>
          {mode === 'registered' ? <div className="mt-4">
            {stores.length ? <Field label="Cliente"><select value={storeId} onChange={(event) => { setStoreId(event.target.value); setSelectedCheeseId(''); setItems([]); setSavedQuote(null) }} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15">{stores.map((store) => <option key={store._id} value={store._id}>{store.name} · {store.city}</option>)}</select></Field> : <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">No hay clientes registrados activos. Puedes crear esta factura para un cliente nuevo.</p>}
          </div> : <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Input label="Nombre del cliente" name="name" value={newStore.name} onChange={updateNewStore} required minLength={2} maxLength={120} id="new-store-name" />
            <p className="self-end rounded-xl bg-primary px-4 py-3 text-sm leading-5 text-brand-dark">Este cliente solo aparecerá en esta factura y no se agregará al catálogo. NIT, dirección, ciudad, teléfono y contacto aparecerán vacíos en el PDF.</p>
          </div>}
        </article>

        <article className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-extrabold">Agregar producto</h2>
          {loadingPrices && <p className="mt-3 text-sm text-slate-500">Cargando precios…</p>}
          {!loadingPrices && <div className={`mt-4 grid items-end gap-3 ${mode === 'new' || addOneTimeProducts ? 'sm:grid-cols-[minmax(0,1fr)_150px_150px_auto]' : 'sm:grid-cols-[minmax(0,1fr)_150px_auto]'}`}>
            <Field label="Producto"><select value={selectedCheeseId} onChange={(event) => setSelectedCheeseId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"><option value="">Selecciona un producto</option>{availableCheeses.map((cheese) => { const row = addOneTimeProducts ? generalPrices.get(String(cheese._id)) : prices.get(cheese._id); return <option key={cheese._id} value={cheese._id}>{cheese.name}{row?.price == null ? (mode === 'new' || addOneTimeProducts ? ' · sin precio base' : ' · sin precio') : ''}</option> })}</select></Field>
            {mode === 'new' && <Input label="Precio unitario COP" name="draftUnitPrice" type="number" min="1" max="1000000000" step="1" inputMode="numeric" value={draftUnitPrice} onChange={(event) => setDraftUnitPrice(event.target.value)} placeholder="Ej. 25000" />}
            <Input label={`Cantidad${selectedCheese ? ' (und)' : ''}`} name="quantity" type="text" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="1" />
            {addOneTimeProducts && mode === 'registered' && <Input label="Precio para esta factura (COP)" name="draftUnitPrice" type="number" min="1" max="1000000000" step="1" inputMode="numeric" value={draftUnitPrice} onChange={(event) => setDraftUnitPrice(event.target.value)} placeholder={loadingGeneralPrices ? 'Cargando tarifa…' : 'Ej. 25000'} />}
            <button type="button" onClick={addItem} disabled={!selectedCheese || (!usesCustomProductPrice && selectedPrice == null) || (addOneTimeProducts && loadingGeneralPrices) || loadingPrices} className="rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">Agregar</button>
          </div>}
          {mode === 'registered' && selectedStore?.productsConfigured && <button type="button" onClick={() => { setAddOneTimeProducts((value) => !value); setSelectedCheeseId(''); setDraftUnitPrice('') }} className="mt-4 cursor-pointer rounded-xl border border-brand px-4 py-2 text-sm font-bold text-brand transition-colors hover:bg-primary">{addOneTimeProducts ? 'Volver a productos asignados' : '＋ Agregar producto solo para esta factura'}</button>}
          {selectedCheese && mode === 'registered' && <p className="mt-3 text-sm text-slate-600">{addOneTimeProducts ? 'Precio de referencia general, editable para esta factura:' : 'Precio unitario del cliente:'} <strong className="text-ink">{addOneTimeProducts ? (selectedGeneralPrice == null ? 'Sin precio general; ingrésalo arriba' : `${money.format(selectedGeneralPrice)} / ${selectedCheese.unit}`) : (selectedPrice == null ? 'Sin definir para este cliente' : `${money.format(selectedPrice)} / ${selectedCheese.unit}`)}</strong></p>}
          {mode === 'new' && <p className="mt-3 text-sm text-slate-600">El precio base se carga automáticamente si existe. Puedes ajustarlo para esta factura; el cambio no modifica el catálogo de precios.</p>}
          {addOneTimeProducts && mode === 'registered' && <p className="mt-2 text-sm text-slate-600">Este producto y su precio se incluirán únicamente en esta factura; no cambiarán los productos asignados al cliente.</p>}
          {cheeses.length === 0 && <p className="mt-3 text-sm text-slate-500">No hay productos activos. Administra el catálogo desde <Link className="font-bold text-brand" to="/cheeses">Productos</Link>.</p>}
          {mode === 'registered' && cheeses.length > 0 && availableCheeses.length === 0 && !addOneTimeProducts && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Este cliente no tiene productos asignados. Puedes configurar su lista en Productos por cliente o agregar un producto solo para esta factura.</p>}
        </article>

        <article className="rounded-2xl bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-lg font-extrabold">Productos de la factura</h2>
          {items.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Agrega uno o más productos para calcular el total.</p> : <div className="mt-3 divide-y divide-slate-100">
            {items.map((item) => {
              const milli = toMilli(item.quantity) || 0
              return <div key={item.cheeseId} className="grid grid-cols-[minmax(0,1fr)_auto_36px] items-center gap-x-3 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_130px_120px_40px] sm:gap-x-3 sm:py-4">
                <div className="col-span-2 min-w-0 sm:col-span-1"><p className="text-sm font-semibold leading-5 sm:text-base">{item.name}{item.oneTime && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Solo esta factura</span>}</p><p className="mt-0.5 text-xs text-slate-500">{money.format(item.unitPrice)} por {item.unit}</p></div>
                <button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.cheeseId !== item.cheeseId))} aria-label={`Eliminar ${item.name}`} className="col-start-3 row-start-1 flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 p-0 text-base font-bold leading-none text-rose-700 hover:bg-rose-100 sm:col-start-4 sm:h-auto sm:w-auto sm:rounded-lg sm:px-3 sm:py-2 sm:text-lg">×</button>
                <label className="col-start-1 row-start-2 block text-xs font-semibold text-ink sm:col-start-2 sm:row-start-1 sm:text-sm"><span className="mb-1 block">Cantidad (und)</span><input aria-label={`Cantidad de ${item.name}`} type="text" inputMode="numeric" value={item.quantity} onChange={(event) => updateQuantity(item.cheeseId, event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" /></label>
                <div className="col-start-2 row-start-2 self-end whitespace-nowrap pb-2 text-right sm:col-start-3 sm:row-start-1 sm:self-center sm:pb-0"><p className="text-xs text-slate-500">Subtotal</p><p className="text-sm font-extrabold sm:text-base">{milli ? money.format(lineTotal(item.unitPrice, milli)) : 'Revisa cantidad'}</p></div>
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
        <button type="button" onClick={requestSaveQuote} disabled={!canSave || driveBusy} className="min-w-40 rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">{saving || driveBusy ? 'Guardando…' : 'Guardar factura'}</button>
      </div>
    </div>
    {showSaveConfirm && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !driveBusy) setShowSaveConfirm(false) }}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="save-confirm-title" aria-describedby="save-confirm-description" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-xl font-bold text-sky-700" aria-hidden="true">?</div>
        <h2 id="save-confirm-title" className="mt-4 text-xl font-extrabold">¿Confirmas guardar esta factura?</h2>
        <p id="save-confirm-description" className="mt-2 text-sm leading-6 text-slate-600">Se creará la factura para <strong>{mode === 'registered' ? selectedStore?.name : newStore.name}</strong>{CLOUD_SAVE_ENABLED ? ', se guardará en Google Drive y después podrás descargar el PDF.' : ' y después podrás descargar el PDF. El guardado en Google Drive está temporalmente inactivo.'}</p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setShowSaveConfirm(false)} disabled={saving || driveBusy} className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={() => { setShowSaveConfirm(false); saveQuote() }} disabled={saving || driveBusy} className="cursor-pointer rounded-xl bg-brand px-4 py-2.5 font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">{saving || driveBusy ? 'Guardando…' : 'Sí, guardar factura'}</button>
        </div>
      </section>
    </div>}
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => {
      setFeedback(null)
      if (mode === 'new' && !newStore.name.trim()) window.setTimeout(() => document.getElementById('new-store-name')?.focus(), 0)
    }} />
  </main>
}
