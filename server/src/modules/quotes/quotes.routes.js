import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth/auth.middleware.js'
import { createQuote, getQuote, listQuotes } from './quotes.service.js'
import { generateQuotePdf } from './pdf.service.js'
import { getOrCreateCompanySettings } from '../settings/settings.service.js'
import { Quote } from './models/Quote.js'
import { uploadQuotePdf } from './drive.service.js'

export const quotesRouter = Router()
const objectId = z.string().regex(/^[a-f\d]{24}$/i)
const idParams = z.object({ id: objectId }).strict()
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00-05:00`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}, 'Fecha inválida.')
const itemSchema = z.object({
  cheeseId: objectId,
  quantity: z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/),
}).strict()
const sharedQuoteFields = {
  items: z.array(itemSchema).min(1).max(50),
  notes: z.string().trim().max(1000).optional().default(''),
  date: dateString.optional(),
}
const newStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nit: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional().default(''),
  contactName: z.string().trim().max(120).optional().default(''),
}).strict()
const createQuoteSchema = z.discriminatedUnion('storeMode', [
  z.object({ storeMode: z.literal('registered'), storeId: objectId, ...sharedQuoteFields }).strict(),
  z.object({ storeMode: z.literal('new'), newStore: newStoreSchema, ...sharedQuoteFields }).strict(),
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
    const quote = await createQuote({ input: req.quoteInput, userId: req.authUser._id })
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
    const pdf = await generateQuotePdf(quote, settings, quote.printProfile || settings.printProfile)
    const filename = `${quote.number}.pdf`
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
    const pdf = await generateQuotePdf(quote, settings, quote.printProfile || settings.printProfile)
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
