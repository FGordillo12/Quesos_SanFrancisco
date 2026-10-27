import express from 'express'
import helmet from 'helmet'
import { env } from './config/env.js'
import { databaseIsReady } from './config/database.js'
import { requestLogger } from './lib/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import {
  createCorsMiddleware,
  globalRateLimit,
  parameterPollutionGuard,
  sanitizeMongoInput,
  trustedOrigin,
} from './middleware/security.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', env.trustProxyHops)
  app.use(requestLogger)
  app.use((req, res, next) => {
    if (env.isProduction && !req.secure) {
      return res.status(400).json({ ok: false, data: null, error: { code: 'HTTPS_REQUIRED', message: 'La conexión segura es obligatoria.' } })
    }
    return next()
  })
  app.use(helmet({
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
    },
    hsts: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }))
  app.use(createCorsMiddleware(env.clientUrl))
  app.use(express.json({ limit: '100kb', strict: true, type: 'application/json' }))
  app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 100 }))
  app.use(sanitizeMongoInput)
  app.use(parameterPollutionGuard)
  app.use(trustedOrigin(env.clientUrl))
  app.use('/api', globalRateLimit)

  app.get('/api/health', (req, res) => {
    const ready = databaseIsReady()
    return res.status(ready ? 200 : 503).json({ ok: ready, data: { status: ready ? 'ready' : 'database_unavailable' }, error: null })
  })
  app.use('/api', notFoundHandler)
  app.use(errorHandler)
  return app
}
