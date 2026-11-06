import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/auth.middleware.js'
import { createQuote, deleteRecentSale, getQuote, getRecentSale, listRecentSales, listQuotes } from './quotes.service.js'
import { generateQuotePdf } from './pdf.service.js'
import { quotePdfFilename } from './pdf-filename.js'
import { getOrCreateCompanySettings } from '../settings/settings.service.js'
import { Quote } from './models/Quote.js'
import { uploadQuotePdf } from './drive.service.js'
import { deleteQuotePdf } from './drive.service.js'
import { logger } from '../../lib/logger.js'

export const quotesRouter = Router()
const objectId = z.string().regex(/^[a-f\d]{24}$/i)
const idParams = z.object({ id: objectId }).strict()
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00-05:00`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Fecha inválida.')
const itemSchema = z.object({
  cheeseId: objectId,
  quantity: z.string().regex(/^\d{1,7}$/),
  oneTime: z.boolean().optional().default(false),
  unitPrice: z.number().int().min(1).max(1_000_000_000).optional(),
}).strict()
const newStoreItemSchema = itemSchema
const sharedQuoteFields = {
  notes: z.string().trim().max(1000).optional().default(''),
  date: dateString.optional(),
}
const newStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nit: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().max(100).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().default(''),
  contactName: z.string().trim().max(120).optional().default(''),
}).strict()
const createQuoteSchema = z.discriminatedUnion('storeMode', [
  z.object({ storeMode: z.literal('registered'), storeId: objectId, items: z.array(itemSchema).min(1).max(50), ...sharedQuoteFields }).strict(),
  z.object({ storeMode: z.literal('new'), newStore: newStoreSchema, items: z.array(newStoreItemSchema).min(1).max(50), ...sharedQuoteFields }).strict(),
])
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  store: objectId.optional(),
  number: z.string().trim().max(30).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
}).strict().refine((query) => !query.from || !query.to || query.from <= query.to, {
  path: ['to'], message: 'La fecha final debe ser igual o posterior a la inicial.',
})

function sendError(res, status, code, message) {
  return res.status(status).json({ ok: false, data: null, error: { code, message } })
}

function parse(schema, part = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[part])
    if (!result.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.')
    req.quoteInput = result.data
    return next()
  }
}

quotesRouter.use(requireAuth)

quotesRouter.post('/', parse(createQuoteSchema), async (req, res, next) => {
  try {
    const { quote, evictedDriveFiles } = await createQuote({ input: req.quoteInput, userId: req.authUser._id })
    for (const fileId of evictedDriveFiles) {
      void deleteQuotePdf(fileId).catch((error) => logger.warn({ code: error.code ?? error.name }, 'No se pudo retirar de Drive el PDF de una factura reemplazada'))
    }
    return res.status(201).json({ ok: true, data: quote, error: null })
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.code || 'QUOTE_INVALID', error.message)
    return next(error)
  }
})

quotesRouter.get('/', parse(listQuery, 'query'), async (req, res, next) => {
  try {
    const data = await listQuotes({ user: req.authUser, query: req.quoteInput })
    return res.json({ ok: true, data, error: null })
  } catch (error) { return next(error) }
})

quotesRouter.get('/recent', async (req, res, next) => {
  try {
    const quotes = await listRecentSales()
    return res.json({ ok: true, data: { quotes }, error: null })
  } catch (error) { return next(error) }
})

quotesRouter.get('/recent/:id/pdf', parse(idParams, 'params'), async (req, res, next) => {
  try {
    const quote = await getRecentSale(req.quoteInput.id)
    if (!quote) return sendError(res, 404, 'QUOTE_NOT_FOUND', 'Factura no encontrada.')
    const settings = await getOrCreateCompanySettings()
    const pdf = await generateQuotePdf(quote, settings, settings.printProfile)
    const filename = quotePdfFilename(quote)
    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment'
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${filename}"`, 'Cache-Control': 'no-store', 'Content-Length': String(pdf.length) })
    return res.send(pdf)
  } catch (error) { return next(error) }
})

quotesRouter.delete('/recent/:id', parse(idParams, 'params'), async (req, res, next) => {
  try {
    const quote = await deleteRecentSale(req.quoteInput.id)
    if (!quote) return sendError(res, 404, 'QUOTE_NOT_FOUND', 'Factura no encontrada.')
    let driveDeleted = true
    if (quote.driveFile?.id) {
      try { await deleteQuotePdf(quote.driveFile.id) }
      catch (error) {
        driveDeleted = false
        logger.warn({ code: error.code ?? error.name }, 'La factura se eliminó de la aplicación, pero no de Google Drive')
      }
    }
    return res.json({ ok: true, data: { deleted: true, driveDeleted }, error: null })
  } catch (error) { return next(error) }
})

quotesRouter.get('/:id', parse(idParams, 'params'), async (req, res, next) => {
  try {
    const quote = await getQuote({ id: req.quoteInput.id, user: req.authUser })
    if (!quote) return sendError(res, 404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada.')
    return res.json({ ok: true, data: quote, error: null })
  } catch (error) { return next(error) }
})

quotesRouter.get('/:id/pdf', parse(idParams, 'params'), async (req, res, next) => {
  try {
    const quote = await getQuote({ id: req.quoteInput.id, user: req.authUser })
    if (!quote) return sendError(res, 404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada.')
    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment'
    const settings = await getOrCreateCompanySettings()
    const pdf = await generateQuotePdf(quote, settings, settings.printProfile)
    const filename = quotePdfFilename(quote)
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `${disposition}; filename="${filename}"`, 'Cache-Control': 'no-store', 'Content-Length': String(pdf.length) })
    return res.send(pdf)
  } catch (error) { return next(error) }
})

quotesRouter.post('/:id/drive', parse(idParams, 'params'), async (req, res, next) => {
  try {
    const quote = await getQuote({ id: req.quoteInput.id, user: req.authUser })
    if (!quote) return sendError(res, 404, 'QUOTE_NOT_FOUND', 'Cotización no encontrada.')
    if (quote.driveFile?.id) return res.json({ ok: true, data: { driveFile: quote.driveFile }, error: null })
    const settings = await getOrCreateCompanySettings()
    const pdf = await generateQuotePdf(quote, settings, settings.printProfile)
    const driveFile = await uploadQuotePdf({ quote, pdf })
    const uploadedAt = new Date()
    await Quote.updateOne({ _id: quote._id, 'driveFile.id': { $in: ['', null] } }, { $set: { driveFile: { ...driveFile, uploadedAt } } })
    const saved = await Quote.findById(quote._id).select('driveFile').lean()
    return res.status(201).json({ ok: true, data: { driveFile: saved.driveFile }, error: null })
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.code || 'DRIVE_ERROR', error.message)
    return next(error)
  }
})
