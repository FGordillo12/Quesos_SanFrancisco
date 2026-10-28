import { logger } from '../lib/logger.js'

const databaseErrorNames = new Set([
  'MongooseServerSelectionError',
  'MongoServerSelectionError',
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoNotConnectedError',
])

export function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, data: null, error: { code: 'NOT_FOUND', message: 'Recurso no encontrado.' } })
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  const databaseUnavailable = databaseErrorNames.has(error.name)
    || (error.name === 'MongooseError' && /buffering timed out|connection.*closed/i.test(error.message ?? ''))
  const status = databaseUnavailable ? 503 : Number.isInteger(error.status) && error.status >= 400 && error.status < 600
    ? error.status
    : error.type === 'entity.too.large' ? 413 : 500

  if (status >= 500) logger.error({ name: error.name, code: error.code, method: req.method, path: req.path }, 'Error de solicitud')
  else logger.info({ status, method: req.method, path: req.path }, 'Solicitud rechazada')

  const messages = {
    400: 'Solicitud inválida.',
    413: 'El contenido supera el tamaño permitido.',
    415: 'Tipo de contenido no permitido.',
    503: 'No hay conexión con la base de datos en este momento. Inténtalo de nuevo en unos segundos.',
  }
  const message = messages[status] ?? (status >= 500 ? 'Ocurrió un error interno.' : 'Solicitud no válida.')
  return res.status(status).json({
    ok: false,
    data: null,
    error: { code: databaseUnavailable ? 'DATABASE_UNAVAILABLE' : status >= 500 ? 'INTERNAL_ERROR' : (error.code ?? 'BAD_REQUEST'), message },
  })
}
