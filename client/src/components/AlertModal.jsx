export function AlertModal({ message, variant = 'success', title, onClose }) {
  if (!message) return null
  const error = variant === 'error'
  const heading = title || (error ? 'No se pudo completar' : variant === 'info' ? 'Aviso' : 'Cambios guardados')
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4 py-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
    <section role={error ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="feedback-modal-title" aria-describedby="feedback-modal-description" className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl sm:p-8">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold ${error ? 'bg-rose-100 text-rose-700' : variant === 'info' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`} aria-hidden="true">{error ? '!' : variant === 'info' ? 'i' : '✓'}</div>
      <h2 id="feedback-modal-title" className="mt-4 text-xl font-extrabold">{heading}</h2>
      <p id="feedback-modal-description" className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
      <button type="button" autoFocus onClick={onClose} className="mt-6 rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark">Entendido</button>
    </section>
  </div>
}
