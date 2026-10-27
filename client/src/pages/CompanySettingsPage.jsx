import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../AuthContext'

const defaults = { name: '', location: '', nit: '', phone: '', email: '', representative: '', printProfile: { format: 'letter', marginMm: 10, fontSize: 9, showLogo: true } }

export function CompanySettingsPage() {
  const { user } = useAuth()
  const [form, setForm] = useState(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const admin = user?.role === 'admin'

  useEffect(() => {
    api.get('/settings/company').then(({ data }) => setForm({ ...defaults, ...data.data, printProfile: { ...defaults.printProfile, ...data.data.printProfile } }))
      .catch((err) => setError(err.response?.data?.error?.message || 'No se pudo cargar la configuración.'))
      .finally(() => setLoading(false))
  }, [])

  function setField(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })) }
  function setProfile(event) {
    const { name, value, type, checked } = event.target
    setForm((current) => ({ ...current, printProfile: { ...current.printProfile, [name]: type === 'checkbox' ? checked : ['marginMm', 'fontSize'].includes(name) ? Number(value) : value } }))
  }
  async function save(event) {
    event.preventDefault(); setSaving(true); setNotice(''); setError('')
    try { const { data } = await api.put('/settings/company', form); setForm({ ...form, ...data.data, printProfile: { ...form.printProfile, ...data.data.printProfile } }); setNotice('Configuración guardada. Las cotizaciones nuevas usarán este perfil.') }
    catch (err) { setError(err.response?.data?.error?.message || 'No se pudo guardar la configuración.') }
    finally { setSaving(false) }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-primary text-ink" role="status">Cargando configuración…</main>
  const input = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:bg-slate-100'
  return <main className="min-h-screen bg-primary px-4 py-8 text-ink sm:px-8">
    <section className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-card sm:p-10">
      <Link to="/" className="text-sm font-bold text-brand">← Volver al inicio</Link>
      <h1 className="mt-5 text-3xl font-extrabold">Empresa e impresión</h1>
      <p className="mt-2 text-sm text-slate-600">Estos datos aparecerán en los PDF. El perfil se guarda en cada cotización nueva.</p>
      {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
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
          {form.printProfile.format === 'thermal58' && <p className="mt-3 rounded-lg bg-primary p-3 text-xs leading-5 text-brand-dark">Optimizado para la GOOJPRT PT-210: rollo de 58 mm y área imprimible de 48 mm (384 px a 203 DPI), centrada automáticamente. La altura se ajusta al contenido; selecciona escala 100 % o tamaño real en el diálogo de impresión.</p>}
          <p className="mt-3 text-xs leading-5 text-slate-500">El perfil seleccionado se copia al guardar cada cotización. Cambiarlo después solo aplica a las nuevas.</p>
        </fieldset>
        {admin ? <button disabled={saving} className="rounded-xl bg-brand px-5 py-3 font-bold text-white hover:bg-brand-dark disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar configuración'}</button> : <p className="text-sm text-slate-600">Solo el administrador puede modificar estos datos.</p>}
      </form>
    </section>
  </main>
}
