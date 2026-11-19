import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/auth.middleware.js'
import { deleteReportInvoice, getReportSummary, getSalesSeries, listReportInvoices, resolveReportRangeForData, updateInvoicePayment, updateManyInvoicePayments } from './reports.service.js'

export const reportsRouter = Router()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T12:00:00-05:00`)) && new Date(`${value}T12:00:00-05:00`).toISOString().startsWith(value), 'Fecha inválida.')
const common = {
  periodo: z.enum(['todo', 'hoy', 'semana', 'mes', 'anio', 'personalizado']).default('todo'),
  desde: date.optional(), hasta: date.optional(),
  estado_pago: z.enum(['todos', 'pagado', 'pendiente']).default('todos'),
  cliente: z.string().regex(/^[a-f\d]{24}$/i, 'Cliente inválido.').optional(),
}
function validateRange(value, ctx) {
  if (value.periodo === 'personalizado' && (!value.desde || !value.hasta || value.desde > value.hasta)) ctx.addIssue({ code: 'custom', message: 'Indica un rango de fechas válido.', path: ['desde'] })
  if (value.periodo !== 'personalizado' && (value.desde || value.hasta)) ctx.addIssue({ code: 'custom', message: 'Las fechas solo se usan con el período personalizado.', path: ['desde'] })
  if (value.periodo === 'personalizado' && value.desde && value.hasta) {
    const days = (new Date(`${value.hasta}T00:00:00-05:00`) - new Date(`${value.desde}T00:00:00-05:00`)) / 86_400_000
    if (days > 365) ctx.addIssue({ code: 'custom', message: 'El rango personalizado no puede superar 366 días.', path: ['hasta'] })
  }
}
const querySchema = z.object(common).strict().superRefine(validateRange)
const listSchema = z.object({ ...common,
  busqueda: z.string().trim().max(100).default(''), pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(5).default(5),
  ordenar: z.enum(['fecha', 'numero', 'cliente', 'total', 'estado']).default('fecha'),
  direccion: z.enum(['asc', 'desc']).default('desc'),
}).strict().superRefine(validateRange)
const statusSchema = z.object({ estado_pago: z.enum(['pagado', 'pendiente']) }).strict()
const massSchema = z.object({ ids: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(100), estado_pago: z.enum(['pagado', 'pendiente']) }).strict().refine(({ ids }) => new Set(ids).size === ids.length, 'No repitas facturas.')
const idSchema = z.string().regex(/^[a-f\d]{24}$/i)
const idParamsSchema = z.object({ id: idSchema }).strict()
const sendError = (res, status, code, message) => res.status(status).json({ ok: false, data: null, error: { code, message } })
function parse(schema, part) { return (req, res, next) => { const result = schema.safeParse(req[part]); if (!result.success) return sendError(res, 400, 'VALIDATION_ERROR', result.error.issues[0]?.message || 'Revisa los filtros ingresados.'); req.reportInput = result.data; next() } }
function rangeFrom(input) { return resolveReportRangeForData(input) }

reportsRouter.use(requireAuth, requireRole('admin'))

reportsRouter.get('/resumen', parse(querySchema, 'query'), async (req, res, next) => {
  try { const input = req.reportInput; const range = await rangeFrom(input); const data = await getReportSummary({ range, estadoPago: input.estado_pago, clienteId: input.cliente }); return res.json({ ok: true, data: { ...data, rango: range }, error: null }) }
  catch (error) { return next(error) }
})

reportsRouter.get('/ventas-por-periodo', parse(querySchema, 'query'), async (req, res, next) => {
  try { const input = req.reportInput; const range = await rangeFrom(input); const serie = await getSalesSeries({ range, estadoPago: input.estado_pago, clienteId: input.cliente }); return res.json({ ok: true, data: { serie, unidad: input.periodo === 'hoy' ? 'hora' : input.periodo === 'anio' ? 'mes' : input.periodo === 'todo' ? 'año' : 'día', rango: range }, error: null }) }
  catch (error) { return next(error) }
})

reportsRouter.get('/facturas', parse(listSchema, 'query'), async (req, res, next) => {
  try { const input = req.reportInput; const range = await rangeFrom(input); const data = await listReportInvoices({ range, estadoPago: input.estado_pago, clienteId: input.cliente, busqueda: input.busqueda, pagina: input.pagina, limite: input.limite, ordenar: input.ordenar, direccion: input.direccion }); return res.json({ ok: true, data, error: null }) }
  catch (error) { return next(error) }
})

reportsRouter.delete('/facturas/:id', parse(idParamsSchema, 'params'), async (req, res, next) => {
  try {
    const data = await deleteReportInvoice(req.reportInput.id)
    if (!data) return sendError(res, 404, 'INVOICE_NOT_FOUND', 'Factura no encontrada.')
    return res.json({ ok: true, data, error: null })
  } catch (error) { return next(error) }
})

reportsRouter.patch('/facturas/estado-pago', parse(massSchema, 'body'), async (req, res, next) => {
  try { const facturas = await updateManyInvoicePayments(req.reportInput); return res.json({ ok: true, data: { facturas }, error: null }) }
  catch (error) { if (error.status) return sendError(res, error.status, error.code || 'UPDATE_FAILED', error.message); return next(error) }
})

reportsRouter.patch('/facturas/:id/estado-pago', parse(idParamsSchema, 'params'), async (req, res, next) => {
  const body = statusSchema.safeParse(req.body)
  if (!body.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Estado de pago inválido.')
  try {
    const factura = await updateInvoicePayment({ id: req.reportInput.id, estadoPago: body.data.estado_pago })
    if (!factura) return sendError(res, 404, 'INVOICE_NOT_FOUND', 'Factura no encontrada.')
    const filters = querySchema.safeParse(req.query)
    const input = filters.success ? filters.data : { periodo: 'todo', estado_pago: 'todos' }
    const resumen = await getReportSummary({ range: await rangeFrom(input), estadoPago: input.estado_pago, clienteId: input.cliente })
    return res.json({ ok: true, data: { factura, resumen }, error: null })
  } catch (error) { return next(error) }
})
