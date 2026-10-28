import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { AlertModal } from '../components/AlertModal'

const defaults = { name: '', location: '', nit: '', phone: '', email: '', representative: '', printProfile: { format: 'letter', marginMm: 10, fontSize: 9, showLogo: true } }

function openGooglePicker(accessToken, apiKey, appId, onPicked) {
  const loadScript = () => new Promise((resolve, reject) => {
    if (window.gapi?.load) return resolve()
    const existing = document.querySelector('script[data-google-picker]')
    if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return }
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.dataset.googlePicker = 'true'
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
  return loadScript().then(() => new Promise((resolve, reject) => {
    window.gapi.load('picker', {
      callback: () => {
        try {
          const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true)
          const picker = new window.google.picker.PickerBuilder()
            .setAppId(appId)
            .setDeveloperKey(apiKey)
            .setOAuthToken(accessToken)
            .addView(view)
            .setTitle('Selecciona la carpeta para las cotizaciones')
            .setCallback(async (data) => {
              if (data.action === window.google.picker.Action.PICKED) await onPicked(data.docs?.[0])
              resolve()
            })
            .build()
          picker.setVisible(true)
        } catch (error) { reject(error) }
      },
    })
  }))
}

export function CompanySettingsPage() {
  const { user } = useAuth()
  const [form, setForm] = useState(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [driveStatus, setDriveStatus] = useState({ configured: false, connected: false, accountEmail: '', folderName: '', redirectUri: null, pickerApiKey: null, pickerAppId: null })
  const [driveBusy, setDriveBusy] = useState(false)
  const admin = user?.role === 'admin'

  useEffect(() => {
    api.get('/settings/company').then(({ data }) => setForm({ ...defaults, ...data.data, printProfile: { ...defaults.printProfile, ...data.data.printProfile } }))
      .catch((err) => setError(err.response?.data?.error?.message || 'No se pudo cargar la configuración.'))
      .finally(() => setLoading(false))
    if (admin) api.get('/drive/oauth/status').then(({ data }) => setDriveStatus(data.data)).catch(() => {})
    const result = new URLSearchParams(window.location.search).get('drive')
    if (result === 'connected') setNotice('Google Drive conectado. Las cotizaciones nuevas se guardarán automáticamente en la carpeta configurada.')
    if (result && result !== 'connected') setError(({ not_configured: 'Agrega las credenciales OAuth y la configuración de Google Picker al .env del servidor y reinícialo.', refresh_token_missing: 'Google no entregó un token de renovación. Vuelve a conectar y acepta el acceso solicitado.', cancelled: 'Se canceló la conexión con Google Drive.', invalid_state: 'La conexión expiró o no se pudo validar. Inténtalo de nuevo.', admin_required: 'Solo un administrador puede conectar Google Drive.', token_exchange_failed: 'Google no pudo completar la autorización. Revisa el ID, secreto y URI de retorno OAuth.', connection_failed: 'No se pudo completar la conexión con Google Drive.' })[result] || 'No se pudo conectar Google Drive.')
    if (result) window.history.replaceState({}, '', `${window.location.pathname}${window.location.hash}`)
  }, [])

  function setField(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })) }
  function setProfile(event) {
    const { name, value, type, checked } = event.target
    setForm((current) => ({ ...current, printProfile: { ...current.printProfile, [name]: type === 'checkbox' ? checked : ['marginMm', 'fontSize'].includes(name) ? Number(value) : value } }))
  }
  async function save(event) {
    event.preventDefault(); setSaving(true); setNotice(''); setError('')
    const payload = {
      name: form.name,
      location: form.location,
      nit: form.nit,
      phone: form.phone,
      email: form.email,
      representative: form.representative,
      printProfile: form.printProfile,
    }
    try {
      const { data } = await api.put('/settings/company', payload)
      setForm({ ...form, ...data.data, printProfile: { ...form.printProfile, ...data.data.printProfile } })
      setNotice('La información de la empresa y el perfil de impresión se guardaron correctamente. Los cambios se aplican a las nuevas facturas.')
    }
    catch (err) { setError(err.response?.data?.error?.message || 'No se pudo guardar la configuración.') }
    finally { setSaving(false) }
  }

  async function disconnectDrive() {
    setDriveBusy(true); setError(''); setNotice('')
    try { await api.post('/drive/oauth/disconnect'); setDriveStatus((current) => ({ ...current, connected: false, accountEmail: '' })); setNotice('Google Drive desconectado.') }
    catch (err) { setError(err.response?.data?.error?.message || 'No se pudo desconectar Google Drive.') }
    finally { setDriveBusy(false) }
  }

  async function selectDriveFolder() {
    setDriveBusy(true); setError(''); setNotice('')
    try {
      const { data } = await api.get('/drive/oauth/picker-token')
      await openGooglePicker(data.data.accessToken, data.data.apiKey, data.data.appId, async (folder) => {
        if (!folder?.id) return
        setDriveBusy(true)
        try {
          const saved = await api.post('/drive/oauth/folder', { folderId: folder.id })
          setDriveStatus((current) => ({ ...current, folderId: saved.data.data.folderId, folderName: saved.data.data.folderName }))
          setNotice(`Carpeta “${saved.data.data.folderName}” seleccionada. Las nuevas cotizaciones se guardarán allí.`)
        } catch (err) { setError(err.response?.data?.error?.message || 'No se pudo guardar la carpeta seleccionada.') }
        finally { setDriveBusy(false) }
      })
    } catch (err) { setError(err.response?.data?.error?.message || 'No se pudo abrir el selector de carpetas de Google.') }
    finally { setDriveBusy(false) }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-primary text-ink" role="status">Cargando configuración…</main>
  const input = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:bg-slate-100'
  return <main className="min-h-screen bg-primary px-4 py-8 text-ink sm:px-8">
    <section className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-card sm:p-10">
      <Link to="/" className="text-sm font-bold text-brand">← Volver al inicio</Link>
      <h1 className="mt-5 text-3xl font-extrabold">Empresa e impresión</h1>
      <p className="mt-2 text-sm text-slate-600">Estos datos aparecerán en los PDF. El perfil se guarda en cada cotización nueva.</p>
      <AlertModal message={error || notice} variant={error ? 'error' : 'success'} onClose={() => { setError(''); setNotice('') }} />
      {admin && <section className="mt-6 rounded-2xl border border-slate-200 p-5">
        <h2 className="font-extrabold">Google Drive</h2>
        <p className="mt-1 text-sm text-slate-600">{driveStatus.connected ? `Conectado${driveStatus.accountEmail ? ` como ${driveStatus.accountEmail}` : ''}. ${driveStatus.folderName ? `Carpeta: ${driveStatus.folderName}.` : 'Selecciona la carpeta donde se guardarán los PDF.'}` : 'Conecta tu cuenta personal de Google para guardar automáticamente los PDF de las cotizaciones.'}</p>
          {!driveStatus.configured && <p className="mt-3 text-xs text-amber-800">Faltan las credenciales OAuth, la API key de Google Picker o el ID numérico del proyecto en el .env del servidor.</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          {!driveStatus.connected && <button type="button" disabled={!driveStatus.configured || driveBusy} onClick={() => { window.location.href = `${api.defaults.baseURL}/drive/oauth/start` }} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">Conectar Google Drive</button>}
          {driveStatus.connected && <button type="button" disabled={driveBusy} onClick={selectDriveFolder} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50">{driveBusy ? 'Abriendo selector…' : driveStatus.folderId ? 'Cambiar carpeta' : 'Seleccionar carpeta'}</button>}
          {driveStatus.connected && <button type="button" disabled={driveBusy} onClick={disconnectDrive} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{driveBusy ? 'Desconectando…' : 'Desconectar Google Drive'}</button>}
        </div>
        {driveStatus.configured && <p className="mt-3 text-xs text-slate-500">URI de retorno para Google Cloud: <code className="break-all">{driveStatus.redirectUri}</code></p>}
      </section>}
      <form onSubmit={save} className="mt-6 space-y-7">
        <fieldset disabled={!admin} className="grid gap-4 sm:grid-cols-2">
          {[["name", "Nombre de la empresa", true], ["location", "Dirección / ubicación", true], ["nit", "NIT", false], ["phone", "Teléfono", false], ["email", "Correo", false], ["representative", "Representante", false]].map(([name, label, required]) => <label key={name} className="text-sm font-semibold">{label}<input className={`${input} mt-1.5`} name={name} value={form[name] || ''} onChange={setField} required={required} maxLength={name === 'location' ? 240 : 254} /></label>)}
        </fieldset>
        <fieldset disabled={!admin} className="rounded-2xl border border-slate-200 p-5">
          <legend className="px-2 font-extrabold">Perfil de impresora</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-semibold">Formato<select name="format" value={form.printProfile.format} onChange={setProfile} className={`${input} mt-1.5`}><option value="letter">Carta</option><option value="thermal80">Térmica 80 mm</option><option value="thermal58">Térmica 58 mm</option></select></label>
            <label className="text-sm font-semibold">Margen (mm)<input className={`${input} mt-1.5`} name="marginMm" type="number" min="0" max="25" step="1" value={form.printProfile.marginMm} onChange={setProfile} /></label>
            <label className="text-sm font-semibold">Tamaño de letra<input className={`${input} mt-1.5`} name="fontSize" type="number" min="8" max="14" step="1" value={form.printProfile.fontSize} onChange={setProfile} /></label>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="showLogo" checked={form.printProfile.showLogo} onChange={setProfile} /> Incluir logo en el PDF</label>
          <p className="mt-3 rounded-lg bg-primary p-3 text-xs leading-5 text-brand-dark">Este perfil solo define el formato del PDF y la impresión; no cambia el tamaño ni la distribución de las páginas de la aplicación. Para la GOOJPRT PT-210, selecciona Térmica 58 mm: usa rollo de 58 mm y área imprimible de 48 mm.</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">El perfil seleccionado se copia al guardar cada cotización. Cambiarlo después solo aplica a las nuevas.</p>
        </fieldset>
        {admin ? <button disabled={saving} className="rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar configuración'}</button> : <p className="text-sm text-slate-600">Solo el administrador puede modificar estos datos.</p>}
      </form>
    </section>
  </main>
}
