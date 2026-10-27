import pino from 'pino'
import pinoHttp from 'pino-http'
import { env } from '../config/env.js'

export const logger = pino({
  level: env.isProduction ? 'info' : 'debug',
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
    censor: '[REDACTADO]',
  },
})

export const requestLogger = pinoHttp({
  logger,
  serializers: {
    req: (req) => ({
      method: req.method,
      path: new URL(req.url, 'http://localhost').pathname,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
})
