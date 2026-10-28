import { logger } from '../../lib/logger.js'
import { deleteQuotePdf } from './drive.service.js'
import { Quote } from './models/Quote.js'

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000

export function oneCalendarMonthBefore(value = new Date()) {
  const result = new Date(value)
  const originalDay = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() - 1)
  const lastDayOfTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))
  return result
}

export async function cleanupExpiredQuotes(now = new Date()) {
  const cutoff = oneCalendarMonthBefore(now)
  let deleted = 0
  let deferred = 0
  const expired = Quote.find({ createdAt: { $lte: cutoff } })
    .select('_id createdAt driveFile.id')
    .lean()
    .cursor()

  for await (const quote of expired) {
    try {
      if (quote.driveFile?.id) await deleteQuotePdf(quote.driveFile.id)
      const result = await Quote.deleteOne({ _id: quote._id, createdAt: { $lte: cutoff } })
      deleted += result.deletedCount
    } catch (error) {
      deferred += 1
      logger.warn({ code: error.code ?? error.name }, 'Se aplazó la eliminación de una factura vencida')
    }
  }

  if (deleted || deferred) logger.info({ deleted, deferred }, 'Limpieza mensual de facturas terminada')
  return { deleted, deferred }
}

export function scheduleQuoteRetentionCleanup() {
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await cleanupExpiredQuotes()
    } catch (error) {
      logger.error({ name: error.name, code: error.code }, 'Falló la limpieza mensual de facturas')
    } finally {
      running = false
    }
  }

  void run()
  const timer = setInterval(run, CLEANUP_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}
