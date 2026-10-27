import cors from 'cors'
import mongoSanitize from 'express-mongo-sanitize'
import hpp from 'hpp'
import rateLimit from 'express-rate-limit'
import { safeEqual } from '../modules/auth/auth.utils.js'

export function createCorsMiddleware(clientOrigin) {
  return cors({
    origin(origin, callback) {
      if (!origin || origin === clientOrigin) return callback(null, true)
      return callback(Object.assign(new Error('Origen no permitido.'), { status: 403, code: 'ORIGIN_NOT_ALLOWED' }))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    maxAge: 600,
  })
}

export function trustedOrigin(clientOrigin) {
  return function trustedOriginMiddleware(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    if (req.get('origin') === clientOrigin) return next()
    return res.status(403).json({ ok: false, data: null, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origen de solicitud no permitido.' } })
  }
}

export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const cookieToken = req.cookies?.csrf_token
  const headerToken = req.get('x-csrf-token')
  if (safeEqual(cookieToken, headerToken)) return next()
  return res.status(403).json({ ok: false, data: null, error: { code: 'CSRF_INVALID', message: 'La solicitud expiró. Recarga la página e inténtalo de nuevo.' } })
}

export function sanitizeMongoInput(req, res, next) {
  // Express 5 exposes req.query through a getter. Give the sanitizer a writable copy.
  Object.defineProperty(req, 'query', {
    configurable: true, enumerable: true, writable: true, value: { ...req.query },
  })
  return mongoSanitize({ onSanitize: ({ key }) => {
    req.log?.warn({ input: key }, 'Se eliminaron operadores MongoDB de la solicitud')
  } })(req, res, next)
}

export const parameterPollutionGuard = hpp()

export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, data: null, error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Intente más tarde.' } },
})

export const sensitiveRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, data: null, error: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Intente más tarde.' } },
})
