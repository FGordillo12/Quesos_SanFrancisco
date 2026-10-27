import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import { databaseIsReady } from './config/database.js'
import { requestLogger } from './lib/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import {
  createCorsMiddleware,
  csrfProtection,
  globalRateLimit,
  parameterPollutionGuard,
  sanitizeMongoInput,
  trustedOrigin,
} from './middleware/security.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { cheeseRouter, priceRouter, storeRouter } from './modules/catalog/catalog.routes.js'
import { quotesRouter } from './modules/quotes/quotes.routes.js'
import { settingsRouter } from './modules/settings/settings.routes.js'

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
  app.use(cookieParser())
  app.use(sanitizeMongoInput)
  app.use(parameterPollutionGuard)
  app.use(trustedOrigin(env.clientUrl))
  app.use('/api', globalRateLimit)
  app.use('/api', csrfProtection)

  app.get('/api/health', (req, res) => {
    const ready = databaseIsReady()
    return res.status(ready ? 200 : 503).json({ ok: ready, data: { status: ready ? 'ready' : 'database_unavailable' }, error: null })
  })
  app.use('/api/auth', authRouter)
  app.use('/api/cheeses', cheeseRouter)
  app.use('/api/stores', storeRouter)
  app.use('/api/prices', priceRouter)
  app.use('/api/quotes', quotesRouter)
  app.use('/api/settings', settingsRouter)
  app.use('/api', notFoundHandler)
  app.use(errorHandler)
  return app
}
