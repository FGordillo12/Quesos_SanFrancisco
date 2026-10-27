import { useState } from 'react'

export function PasswordInput({ label, error, ...props }) {
  const [visible, setVisible] = useState(false)
  const id = props.id || props.name
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">{label}</label>
      <div className="relative">
        <input
          {...props}
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-20 text-ink shadow-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          className="absolute inset-y-0 right-3 my-auto h-9 rounded-lg px-2 text-sm font-semibold text-brand hover:bg-primary"
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {error && <p id={`${id}-error`} className="mt-1.5 text-sm text-rose-700">{error}</p>}
    </div>
  )
}
