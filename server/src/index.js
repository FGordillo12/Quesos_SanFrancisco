import mongoose from 'mongoose'
import { env } from './config/env.js'
import { connectDatabase } from './config/database.js'
import { createApp } from './app.js'
import { logger } from './lib/logger.js'
import { scheduleQuoteRetentionCleanup } from './modules/quotes/quote-retention.service.js'

try {
  await connectDatabase(env.mongoUri)
  const app = createApp()
  const server = app.listen(env.port, () => logger.info({ port: env.port }, 'API de Quesos San Francisco lista'))
  const stopQuoteRetentionCleanup = scheduleQuoteRetentionCleanup()

  async function shutdown(signal) {
    logger.info({ signal }, 'Cerrando API')
    stopQuoteRetentionCleanup()
    server.close(async () => {
      await mongoose.disconnect()
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000).unref()
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
} catch (error) {
  logger.fatal({ name: error.name, code: error.code }, 'No se pudo iniciar el servidor')
  process.exit(1)
}
