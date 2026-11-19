import mongoose from 'mongoose'
import { logger } from '../../lib/logger.js'
import { Quote } from '../quotes/models/Quote.js'
import { deleteQuotePdf } from '../quotes/drive.service.js'

const REPORT_TIME_ZONE = 'America/Bogota'
const DAY_MS = 86_400_000
const BOGOTA_OFFSET = '-05:00'

function dateInBogota(value) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
}

function addDays(value, count) {
  const result = new Date(`${value}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + count)
  return result.toISOString().slice(0, 10)
}

function addMonths(value, count) {
  const result = new Date(`${value}T12:00:00Z`)
  result.setUTCMonth(result.getUTCMonth() + count)
  return result.toISOString().slice(0, 10)
}

function startOfMonth(value) { return `${value.slice(0, 7)}-01` }
function startOfYear(value) { return `${value.slice(0, 4)}-01-01` }
function atBogotaMidnight(value) { return new Date(`${value}T00:00:00${BOGOTA_OFFSET}`) }

export function resolveReportRange({ periodo = 'mes', desde, hasta, now = new Date() }) {
  const today = dateInBogota(now)
  let start
  let end
  let previousStart
  let previousEnd

  if (periodo === 'todo') {
    start = desde || '2000-01-01'
    end = addDays(today, 1)
    previousStart = start
    previousEnd = start
  } else if (periodo === 'hoy') {
    start = today
    end = addDays(start, 1)
    previousStart = addDays(start, -1)
    previousEnd = start
  } else if (periodo === 'semana') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7
    start = addDays(today, 1 - weekday)
    end = [addDays(start, 7), addDays(today, 1)].sort()[0]
    previousStart = addDays(start, -7)
    previousEnd = addDays(previousStart, (atBogotaMidnight(end) - atBogotaMidnight(start)) / DAY_MS)
  } else if (periodo === 'anio') {
    start = startOfYear(today)
    end = [
      `${Number(start.slice(0, 4)) + 1}-01-01`,
      addDays(today, 1),
    ].sort()[0]
    previousStart = `${Number(start.slice(0, 4)) - 1}-01-01`
    previousEnd = addDays(previousStart, (atBogotaMidnight(end) - atBogotaMidnight(start)) / DAY_MS)
  } else if (periodo === 'personalizado') {
    start = desde
    end = addDays(hasta, 1)
    const duration = (atBogotaMidnight(end) - atBogotaMidnight(start)) / DAY_MS
    previousEnd = start
    previousStart = addDays(start, -duration)
  } else {
    start = startOfMonth(today)
    end = [addMonths(start, 1), addDays(today, 1)].sort()[0]
    previousStart = addMonths(start, -1)
    previousEnd = addDays(previousStart, (atBogotaMidnight(end) - atBogotaMidnight(start)) / DAY_MS)
  }

  return {
    start: atBogotaMidnight(start),
    end: atBogotaMidnight(end),
    previousStart: atBogotaMidnight(previousStart),
    previousEnd: atBogotaMidnight(previousEnd),
    startDate: start,
    endDate: addDays(end, -1),
    periodo,
  }
}

export async function resolveReportRangeForData(input) {
  if (input.periodo !== 'todo') return resolveReportRange(input)
  const firstInvoice = await Quote.findOne({}).sort({ date: 1 }).select('date').lean()
  const start = startOfYear(firstInvoice ? dateInBogota(firstInvoice.date) : dateInBogota(new Date()))
  return resolveReportRange({ ...input, desde: start })
}

export function getSeriesUnit(periodo) {
  return periodo === 'hoy' ? 'hour' : periodo === 'anio' ? 'month' : periodo === 'todo' ? 'year' : 'day'
}

export function buildPaymentUpdate(estadoPago, paidAt = new Date()) {
  return { paymentStatus: estadoPago, paidAt: estadoPago === 'pagado' ? paidAt : null }
}

function paymentMatch(estadoPago) {
  if (estadoPago === 'todos') return {}
  if (estadoPago === 'pendiente') return { $or: [{ paymentStatus: 'pendiente' }, { paymentStatus: { $exists: false } }] }
  return { paymentStatus: estadoPago }
}

export function buildReportMatch(range, estadoPago = 'todos', clienteId) {
  const match = { date: { $gte: range.start, $lt: range.end }, ...paymentMatch(estadoPago) }
  if (clienteId) match['store.storeId'] = new mongoose.Types.ObjectId(clienteId)
  return match
}

function summaryPipeline(match) {
  const status = { $ifNull: ['$paymentStatus', 'pendiente'] }
  return [
    { $match: match },
    { $group: {
      _id: null,
      totalVendido: { $sum: '$total' },
      totalPagado: { $sum: { $cond: [{ $eq: [status, 'pagado'] }, '$total', 0] } },
      totalPendiente: { $sum: { $cond: [{ $eq: [status, 'pendiente'] }, '$total', 0] } },
      numeroFacturas: { $sum: 1 },
      facturasPagadas: { $sum: { $cond: [{ $eq: [status, 'pagado'] }, 1, 0] } },
      facturasPendientes: { $sum: { $cond: [{ $eq: [status, 'pendiente'] }, 1, 0] } },
    } },
    { $project: { _id: 0, totalVendido: 1, totalPagado: 1, totalPendiente: 1, numeroFacturas: 1, facturasPagadas: 1, facturasPendientes: 1 } },
  ]
}

export function summarizeAggregateRows(rows = []) {
  const row = rows[0] || {}
  const totalVendido = row.totalVendido || 0
  const numeroFacturas = row.numeroFacturas || 0
  return {
    totalVendido,
    totalPagado: row.totalPagado || 0,
    totalPendiente: row.totalPendiente || 0,
    numeroFacturas,
    facturasPagadas: row.facturasPagadas || 0,
    facturasPendientes: row.facturasPendientes || 0,
    ticketPromedio: numeroFacturas ? Math.round(totalVendido / numeroFacturas) : 0,
  }
}

export async function getReportSummary({ range, estadoPago = 'todos', clienteId }) {
  const currentMatch = buildReportMatch(range, estadoPago, clienteId)
  const previousMatch = { date: { $gte: range.previousStart, $lt: range.previousEnd }, ...paymentMatch(estadoPago) }
  if (clienteId) previousMatch['store.storeId'] = new mongoose.Types.ObjectId(clienteId)
  const [currentRows, previousRows] = await Promise.all([
    Quote.aggregate(summaryPipeline(currentMatch)),
    Quote.aggregate(summaryPipeline(previousMatch)),
  ])
  const current = summarizeAggregateRows(currentRows)
  const previous = summarizeAggregateRows(previousRows)
  const variacionPorcentual = range.periodo === 'todo' ? null : previous.totalVendido === 0
    ? current.totalVendido === 0 ? 0 : 100
    : Number(((current.totalVendido - previous.totalVendido) / previous.totalVendido * 100).toFixed(1))
  return { ...current, variacionPorcentual, periodoAnterior: previous.totalVendido }
}

function buildBucketDates(range, unit) {
  const dates = []
  let cursor = range.start
  while (cursor < range.end) {
    dates.push(cursor)
    if (unit === 'hour') cursor = new Date(cursor.getTime() + 3_600_000)
    else if (unit === 'day') cursor = new Date(cursor.getTime() + DAY_MS)
    else if (unit === 'year') {
      const localDate = dateInBogota(cursor)
      const nextYear = `${Number(localDate.slice(0, 4)) + 1}-01-01`
      cursor = atBogotaMidnight(nextYear)
    } else {
      const localDate = dateInBogota(cursor)
      cursor = atBogotaMidnight(addMonths(startOfMonth(localDate), 1))
    }
  }
  return dates
}

export async function getSalesSeries({ range, estadoPago = 'todos', clienteId }) {
  const unit = getSeriesUnit(range.periodo)
  const status = { $ifNull: ['$paymentStatus', 'pendiente'] }
  const rows = await Quote.aggregate([
    { $match: buildReportMatch(range, estadoPago, clienteId) },
    { $group: {
      _id: { $dateTrunc: { date: '$date', unit, timezone: REPORT_TIME_ZONE } },
      pagado: { $sum: { $cond: [{ $eq: [status, 'pagado'] }, '$total', 0] } },
      pendiente: { $sum: { $cond: [{ $eq: [status, 'pendiente'] }, '$total', 0] } },
      facturas: { $sum: 1 },
    } },
    { $sort: { _id: 1 } },
  ])
  const byDate = new Map(rows.map((row) => [new Date(row._id).toISOString(), row]))
  return buildBucketDates(range, unit).map((date) => {
    const bucket = byDate.get(date.toISOString())
    return { fecha: date.toISOString(), pagado: bucket?.pagado || 0, pendiente: bucket?.pendiente || 0, facturas: bucket?.facturas || 0 }
  })
}

const sortFields = { fecha: 'date', numero: 'number', cliente: 'store.name', total: 'total', estado: 'paymentStatus' }

export async function listReportInvoices({ range, estadoPago = 'todos', clienteId, busqueda = '', pagina = 1, limite = 5, ordenar = 'fecha', direccion = 'desc' }) {
  const match = buildReportMatch(range, estadoPago, clienteId)
  if (busqueda) {
    const escaped = busqueda.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    match.$and = [{ $or: [{ number: { $regex: escaped, $options: 'i' } }, { 'store.name': { $regex: escaped, $options: 'i' } }] }]
  }
  const sort = { [sortFields[ordenar] || 'date']: direccion === 'asc' ? 1 : -1, _id: -1 }
  const offset = (pagina - 1) * limite
  const [result] = await Quote.aggregate([
    { $match: match },
    { $addFields: { paymentStatus: { $ifNull: ['$paymentStatus', 'pendiente'] } } },
    { $facet: {
      facturas: [
        { $sort: sort }, { $skip: offset }, { $limit: limite },
        { $lookup: { from: 'users', localField: 'createdBy', foreignField: '_id', as: 'creador' } },
        { $project: { number: 1, date: 1, 'store.name': 1, total: 1, paymentStatus: 1, paidAt: 1, createdByName: { $ifNull: [{ $arrayElemAt: ['$creador.name', 0] }, 'Usuario'] } } },
      ],
      total: [{ $count: 'cantidad' }],
    } },
  ])
  const total = result?.total?.[0]?.cantidad || 0
  return {
    facturas: (result?.facturas || []).map((quote) => ({
      id: String(quote._id), numero: quote.number, fecha: quote.date, cliente: quote.store?.name || 'Cliente', total: quote.total,
      estado_pago: quote.paymentStatus, fecha_pago: quote.paidAt || null, creado_por: quote.createdByName,
    })),
    paginacion: { pagina, limite, total, paginas: Math.ceil(total / limite) },
  }
}

export async function updateInvoicePayment({ id, estadoPago }) {
  const current = await Quote.findById(id).select('paymentStatus paidAt').lean()
  if (!current) return null
  const currentStatus = current.paymentStatus || 'pendiente'
  const paidAt = estadoPago === 'pagado' ? (currentStatus === 'pagado' ? current.paidAt || new Date() : new Date()) : null
  return Quote.findByIdAndUpdate(id, { $set: { paymentStatus: estadoPago, paidAt } }, { new: true, runValidators: true })
    .select('number date store total paymentStatus paidAt')
    .lean()
}

export async function updateManyInvoicePayments({ ids, estadoPago }) {
  const session = await mongoose.startSession()
  let updated
  try {
    await session.withTransaction(async () => {
      const invoices = await Quote.find({ _id: { $in: ids } }).select('paymentStatus paidAt').session(session).lean()
      if (invoices.length !== ids.length) {
        const error = new Error('Una o más facturas no existen. No se aplicó ningún cambio.')
        error.status = 404
        error.code = 'INVOICES_NOT_FOUND'
        throw error
      }
      const now = new Date()
      const operations = invoices.filter((invoice) => (invoice.paymentStatus || 'pendiente') !== estadoPago).map((invoice) => ({
        updateOne: {
          filter: { _id: invoice._id },
          update: { $set: buildPaymentUpdate(estadoPago, now) },
        },
      }))
      if (operations.length) await Quote.bulkWrite(operations, { session, ordered: true })
      updated = await Quote.find({ _id: { $in: ids } }).select('number date store total paymentStatus paidAt').session(session).lean()
    })
  } finally { await session.endSession() }
  return updated
}

export async function deleteReportInvoice(id) {
  const invoice = await Quote.findByIdAndDelete(id).lean()
  if (!invoice) return null
  let driveDeleted = true
  if (invoice.driveFile?.id) {
    try { await deleteQuotePdf(invoice.driveFile.id) }
    catch (error) {
      driveDeleted = false
      logger.warn({ code: error.code ?? error.name }, 'La factura se eliminó de Reportes, pero no de Google Drive')
    }
  }
  return { deleted: true, driveDeleted }
}

export function toReportRangeDates(range) {
  return { desde: range.startDate, hasta: range.endDate }
}
