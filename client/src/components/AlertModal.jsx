export function AlertModal({ message, variant = 'success', title, onClose, onRetry, retryLabel = 'Reintentar' }) {
  if (!message) return null
  const error = variant === 'error'
  const heading = title || (error ? 'No se pudo completar' : variant === 'info' ? 'Aviso' : 'Cambios guardados')
  return <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/50 px-4 py-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
    <section role={error ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="feedback-modal-title" aria-describedby="feedback-modal-description" className="my-auto w-full max-w-[min(28rem,calc(100vw-2rem))] rounded-2xl bg-white p-5 text-center shadow-2xl sm:p-8">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold ${error ? 'bg-rose-100 text-rose-700' : variant === 'info' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`} aria-hidden="true">{error ? '!' : variant === 'info' ? 'i' : '✓'}</div>
      <h2 id="feedback-modal-title" className="mt-4 text-xl font-extrabold">{heading}</h2>
      <p id="feedback-modal-description" className="mt-2 break-words text-sm leading-6 text-slate-600">{message}</p>
      {onRetry ? <div className="mt-6 flex flex-col-reverse justify-center gap-3 sm:flex-row"><button type="button" onClick={onClose} className="cursor-pointer rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Entendido</button><button type="button" autoFocus onClick={onRetry} className="cursor-pointer rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark">{retryLabel}</button></div> : <button type="button" autoFocus onClick={onClose} className="mt-6 cursor-pointer rounded-xl bg-brand px-5 py-2.5 font-bold text-white hover:bg-brand-dark">Entendido</button>}
    </section>
  </div>
}
