import mongoose from 'mongoose'
import { Cheese } from '../catalog/models/Cheese.js'
import { Price } from '../catalog/models/Price.js'
import { Store } from '../catalog/models/Store.js'
import { Counter } from './models/Counter.js'
import { Quote } from './models/Quote.js'

const MAX_QUANTITY_MILLI = 1_000_000_000

export function parseQuantity(quantity, unit) {
  if (typeof quantity !== 'string' || !/^\d{1,7}(?:\.\d{1,3})?$/.test(quantity)) {
    const error = new Error('La cantidad debe ser un número positivo con máximo 3 decimales.')
    error.status = 400
    error.code = 'INVALID_QUANTITY'
    throw error
  }
  const [whole, fraction = ''] = quantity.split('.')
  const milliBig = BigInt(whole) * 1000n + BigInt((fraction + '000').slice(0, 3))
  if (milliBig < 1n || milliBig > BigInt(MAX_QUANTITY_MILLI) || (unit === 'und' && milliBig % 1000n !== 0n)) {
    const error = new Error(unit === 'und' ? 'La cantidad de unidades debe ser un entero positivo.' : 'La cantidad está fuera del rango permitido.')
    error.status = 400
    error.code = 'INVALID_QUANTITY'
    throw error
  }
  const milli = Number(milliBig)
  const normalized = `${BigInt(whole)}${milli % 1000 === 0 ? '' : `.${String(milli % 1000).padStart(3, '0').replace(/0+$/, '')}`}`
  return { milli, normalized }
}

export function calculateLineTotal(unitPrice, quantityMilli) {
  const amount = BigInt(unitPrice) * BigInt(quantityMilli)
  return Number((amount + 500n) / 1000n)
}

function fail(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  throw error
}

async function resolveStore(input) {
  if (input.storeMode === 'registered') {
    const store = await Store.findOne({ _id: input.storeId, isActive: true }).lean()
    if (!store) fail(404, 'STORE_NOT_FOUND', 'El almacén seleccionado no existe o está inactivo.')
    return {
      scope: 'store',
      storeId: store._id,
      snapshot: {
        mode: 'registered', storeId: store._id, name: store.name, nit: store.nit || '',
        address: store.address, city: store.city, phone: store.phone || '', email: store.email || '',
        contactName: store.contactName || '',
      },
    }
  }
  return {
    scope: 'general',
    storeId: null,
    snapshot: { mode: 'new', storeId: null, ...input.newStore },
  }
}

function quoteDate(value) {
  if (!value) return new Date()
  const date = new Date(`${value}T12:00:00-05:00`)
  if (Number.isNaN(date.getTime())) fail(400, 'INVALID_DATE', 'La fecha indicada no es válida.')
  return date
}

export async function createQuote({ input, userId }) {
  const ids = input.items.map((item) => item.cheeseId)
  if (new Set(ids).size !== ids.length) fail(400, 'DUPLICATE_CHEESE', 'Agrega cada tipo de queso una sola vez.')

  const destination = await resolveStore(input)
  const cheeses = await Cheese.find({ _id: { $in: ids }, isActive: true }).lean()
  if (cheeses.length !== ids.length) fail(400, 'INVALID_CHEESE', 'Uno o más quesos no existen o están inactivos.')
  const cheeseById = new Map(cheeses.map((cheese) => [String(cheese._id), cheese]))
  const prices = await Price.find({
    scope: destination.scope,
    store: destination.scope === 'store' ? destination.storeId : null,
    cheese: { $in: ids },
  }).lean()
  const priceByCheese = new Map(prices.map((price) => [String(price.cheese), price.price]))

  const items = input.items.map(({ cheeseId, quantity }) => {
    const cheese = cheeseById.get(String(cheeseId))
    const unitPrice = priceByCheese.get(String(cheeseId))
    if (unitPrice == null) fail(400, 'PRICE_NOT_DEFINED', `No hay precio configurado para ${cheese.name} en el destino seleccionado.`)
    const parsedQuantity = parseQuantity(quantity, cheese.unit)
    const lineTotal = calculateLineTotal(unitPrice, parsedQuantity.milli)
    if (lineTotal < 1) fail(400, 'SUBTOTAL_TOO_SMALL', `La cantidad de ${cheese.name} produce un subtotal menor a $1 COP.`)
    return {
      cheese: cheese._id,
      cheeseName: cheese.name,
      quantity: parsedQuantity.normalized,
      quantityMilli: parsedQuantity.milli,
      unit: cheese.unit,
      unitPrice,
      lineTotal,
    }
  })
  const totalBig = items.reduce((total, item) => total + BigInt(item.lineTotal), 0n)
  if (totalBig > BigInt(Number.MAX_SAFE_INTEGER)) fail(400, 'TOTAL_TOO_LARGE', 'El total supera el rango permitido.')
  const total = Number(totalBig)

  const session = await mongoose.startSession()
  let quote
  try {
    await session.withTransaction(async () => {
      const counter = await Counter.findOneAndUpdate(
        { _id: 'quotes' },
        { $inc: { value: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true, session },
      )
      const number = `QSF-${String(counter.value).padStart(6, '0')}`
      const documents = await Quote.create([{
        number,
        date: quoteDate(input.date),
        store: destination.snapshot,
        items,
        total,
        notes: input.notes || '',
        createdBy: userId,
      }], { session })
      quote = documents[0]
    })
  } finally {
    await session.endSession()
  }
  return quote.toObject()
}

export async function listQuotes({ user, query }) {
  const filter = user.role === 'admin' ? {} : { createdBy: user._id }
  if (query.store) filter['store.storeId'] = query.store
  if (query.number) filter.number = { $regex: `^${query.number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' }
  if (query.from || query.to) {
    filter.date = {}
    if (query.from) filter.date.$gte = new Date(`${query.from}T00:00:00-05:00`)
    if (query.to) filter.date.$lt = new Date(new Date(`${query.to}T00:00:00-05:00`).getTime() + 86_400_000)
  }
  const skip = (query.page - 1) * query.limit
  const [quotes, total] = await Promise.all([
    Quote.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(query.limit).select('-items').populate('createdBy', 'name').lean(),
    Quote.countDocuments(filter),
  ])
  return { quotes, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } }
}

export async function getQuote({ id, user }) {
  const filter = { _id: id }
  if (user.role !== 'admin') filter.createdBy = user._id
  return Quote.findOne(filter).populate('createdBy', 'name').lean()
}
