import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { AlertModal } from '../components/AlertModal'

const backButton = 'inline-flex cursor-pointer whitespace-nowrap rounded-xl border border-rose-700 bg-rose-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-md active:translate-y-0 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 motion-reduce:transform-none motion-reduce:transition-none'

function selectionFor(store, products) {
  if (!store) return []
  if (store.productsConfigured) return (store.allowedProducts || []).map(String)
  const excluded = new Set((store.excludedCheeses || []).map(String))
  return products.filter((product) => !excluded.has(String(product._id))).map((product) => String(product._id))
}

function ErrorNotice({ message }) {
  if (!message) return null
  return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{message}</p>
}

export default function ClientProductsPage() {
  const navigate = useNavigate()
  const [stores, setStores] = useState([])
  const [products, setProducts] = useState([])
  const [storeId, setStoreId] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [snapshot, setSnapshot] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)

  const selectedStore = useMemo(() => stores.find((store) => store._id === storeId), [stores, storeId])
  const excludedIds = useMemo(() => new Set((selectedStore?.excludedCheeses || []).map(String)), [selectedStore])
  const availableCount = products.filter((product) => !excludedIds.has(String(product._id))).length
  const dirty = selectedIds.length !== snapshot.length || selectedIds.some((id) => !snapshot.includes(id))

  useEffect(() => {
    if (!dirty) return undefined
    const warnBeforeLeave = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeLeave)
    return () => window.removeEventListener('beforeunload', warnBeforeLeave)
  }, [dirty])

  useEffect(() => {
    let active = true
    Promise.all([
      api.get('/stores', { params: { status: 'active' } }),
      api.get('/cheeses', { params: { status: 'active' } }),
    ]).then(([storeResponse, productResponse]) => {
      if (!active) return
      const storeList = storeResponse.data.data
      const productList = productResponse.data.data
      setStores(storeList)
      setProducts(productList)
      if (storeList.length) {
        const firstStore = storeList[0]
        const initial = selectionFor(firstStore, productList)
        setStoreId(firstStore._id)
        setSelectedIds(initial)
        setSnapshot(initial)
      }
    }).catch((requestError) => {
      if (active) setError(requestError.response?.data?.error?.message || 'No se pudieron cargar clientes y productos.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  function applyAction(action) {
    if (!action) return
    if (action.type === 'home') { navigate('/'); return }
    const store = stores.find((item) => item._id === action.storeId)
    const nextSelection = selectionFor(store, products)
    setStoreId(action.storeId)
    setSelectedIds(nextSelection)
    setSnapshot(nextSelection)
    setError('')
    setFeedback(null)
  }

  function requestAction(action) {
    if (dirty) { setPendingAction(action); return true }
    applyAction(action)
    return false
  }

  function confirmDiscard() {
    const action = pendingAction
    setPendingAction(null)
    applyAction(action)
  }

  function toggleProduct(productId) {
    setSelectedIds((current) => current.includes(productId)
      ? current.filter((id) => id !== productId)
      : [...current, productId])
  }

  function selectAvailableProducts(select) {
    const available = products.filter((product) => !excludedIds.has(String(product._id))).map((product) => String(product._id))
    setSelectedIds(select ? available : [])
  }

  async function saveAssignment() {
    if (!storeId || saving) return
    setSaving(true)
    setError('')
    setFeedback(null)
    try {
      const { data } = await api.put(`/stores/${storeId}/products`, { productIds: selectedIds })
      const updatedStore = data.data
      setStores((current) => current.map((store) => store._id === storeId ? updatedStore : store))
      setSnapshot(selectedIds)
      setFeedback({ variant: 'success', message: `Los productos de ${updatedStore.name} se guardaron correctamente.` })
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo guardar la asignación de productos.')
      setFeedback({ variant: 'error', message: requestError.response?.data?.error?.message || 'No se pudo guardar la asignación de productos.' })
    } finally { setSaving(false) }
  }

  return <main className="min-h-screen bg-primary px-4 py-6 text-ink sm:px-8 sm:py-10">
    <header className="mx-auto mb-6 flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><Link to="/" onClick={(event) => { if (requestAction({ type: 'home' })) event.preventDefault() }} className={backButton}>Volver al inicio</Link><h1 className="mt-3 text-3xl font-extrabold">Productos por cliente</h1><p className="mt-1 text-sm text-slate-600">Asigna los productos que se mostrarán al crear facturas para cada cliente.</p></div>
    </header>

    <section className="mx-auto max-w-6xl space-y-5">
      <article className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <label className="block max-w-2xl text-sm font-semibold">Cliente<select value={storeId} onChange={(event) => requestAction({ type: 'store', storeId: event.target.value })} disabled={loading || saving || stores.length === 0} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:bg-slate-50">{stores.length === 0 ? <option value="">No hay clientes activos</option> : stores.map((store) => <option key={store._id} value={store._id}>{store.name} · {store.city}</option>)}</select></label>
        {selectedStore && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary px-4 py-3 text-sm text-brand-dark"><span>{selectedStore.productsConfigured ? 'Asignación personalizada: solo estos productos aparecerán en la factura.' : 'Este cliente aún no tiene una asignación personalizada. Por ahora se muestran todos los productos disponibles.'}</span><strong>{selectedIds.length} de {availableCount} seleccionados</strong></div>}
      </article>

      <article className="rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-extrabold">Productos disponibles</h2><p className="mt-1 text-sm text-slate-600">Marca los que este cliente suele comprar. La factura solo mostrará los seleccionados.</p></div><div className="flex gap-2"><button type="button" onClick={() => selectAvailableProducts(true)} disabled={!storeId || saving} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Seleccionar todos</button><button type="button" onClick={() => selectAvailableProducts(false)} disabled={!storeId || saving} className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Quitar selección</button></div></div>
        {error && <div className="mb-4"><ErrorNotice message={error} /></div>}
        {loading ? <p className="py-8 text-center text-sm text-slate-500">Cargando clientes y productos…</p> : products.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No hay productos activos para asignar.</p> : !storeId ? <p className="py-8 text-center text-sm text-slate-500">Agrega un cliente antes de asignar productos.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const id = String(product._id)
            const excluded = excludedIds.has(id)
            return <label key={id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${excluded ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-70' : selectedIds.includes(id) ? 'border-brand bg-primary' : 'border-slate-200 hover:bg-slate-50'}`}>
              <input type="checkbox" checked={selectedIds.includes(id)} disabled={excluded || saving} onChange={() => toggleProduct(id)} className="mt-1 h-4 w-4 accent-sky-700" />
              <span className="min-w-0"><span className="block break-words text-sm font-bold">{product.name}</span><span className="mt-1 block text-xs text-slate-500">{excluded ? 'No disponible para este cliente' : selectedIds.includes(id) ? 'Aparecerá en la factura' : 'No aparecerá en la factura'}</span></span>
            </label>
          })}
        </div>}
        {selectedStore && <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">{dirty ? 'Tienes cambios sin guardar.' : 'La asignación está guardada.'}</p><button type="button" onClick={saveAssignment} disabled={!dirty || saving || loading} className="cursor-pointer rounded-xl bg-brand px-5 py-3 font-bold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar productos'}</button></div>}
      </article>
    </section>

    {pendingAction && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 py-6"><section role="alertdialog" aria-modal="true" aria-labelledby="discard-products-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-xl font-bold text-amber-700" aria-hidden="true">!</div><h2 id="discard-products-title" className="mt-4 text-xl font-extrabold">¿Salir sin guardar?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Los cambios de productos que hiciste se perderán.</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setPendingAction(null)} className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Seguir editando</button><button type="button" onClick={confirmDiscard} className="cursor-pointer rounded-xl bg-rose-600 px-4 py-2.5 font-bold text-white hover:bg-rose-700">Salir sin guardar</button></div></section></div>}
    <AlertModal message={feedback?.message} variant={feedback?.variant} onClose={() => setFeedback(null)} />
  </main>
}
