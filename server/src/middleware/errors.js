import { logger } from '../lib/logger.js'

export function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, data: null, error: { code: 'NOT_FOUND', message: 'Recurso no encontrado.' } })
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : error.type === 'entity.too.large' ? 413 : 500

  if (status >= 500) logger.error({ name: error.name, code: error.code, method: req.method, path: req.path }, 'Error de solicitud')
  else logger.info({ status, method: req.method, path: req.path }, 'Solicitud rechazada')

  const messages = { 400: 'Solicitud inválida.', 413: 'El contenido supera el tamaño permitido.', 415: 'Tipo de contenido no permitido.' }
  const message = status >= 500 ? 'Ocurrió un error interno.' : (messages[status] ?? 'Solicitud no válida.')
  return res.status(status).json({
    ok: false,
    data: null,
    error: { code: status >= 500 ? 'INTERNAL_ERROR' : (error.code ?? 'BAD_REQUEST'), message },
  })
}
