import mongoose from 'mongoose'
import { Cheese } from '../catalog/models/Cheese.js'
import { Price } from '../catalog/models/Price.js'
import { Store } from '../catalog/models/Store.js'
import { Counter } from './models/Counter.js'
import { Quote } from './models/Quote.js'
import { getOrCreateCompanySettings } from '../settings/settings.service.js'
import { quotePdfFilename } from './pdf-filename.js'

const MAX_QUANTITY_MILLI = 1_000_000_000

export function parseQuantity(quantity) {
  if (typeof quantity !== 'string' || !/^\d{1,7}$/.test(quantity)) {
    const error = new Error('La cantidad debe ser un número entero positivo de unidades.')
    error.status = 400
    error.code = 'INVALID_QUANTITY'
    throw error
  }
  const milliBig = BigInt(quantity) * 1000n
  if (milliBig < 1000n || milliBig > BigInt(MAX_QUANTITY_MILLI)) {
    const error = new Error('La cantidad de unidades debe ser un entero positivo.')
    error.status = 400
    error.code = 'INVALID_QUANTITY'
    throw error
  }
  const milli = Number(milliBig)
  const normalized = quantity
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
    if (!store) fail(404, 'STORE_NOT_FOUND', 'El cliente seleccionado no existe o está inactivo.')
    return {
      scope: 'store',
      storeId: store._id,
      excludedCheeses: store.excludedCheeses || [],
      allowedProducts: store.allowedProducts || [],
      productsConfigured: Boolean(store.productsConfigured),
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
  if (new Set(ids).size !== ids.length) fail(400, 'DUPLICATE_CHEESE', 'Agrega cada producto una sola vez.')

  const destination = await resolveStore(input)
  const cheeses = await Cheese.find({ _id: { $in: ids }, isActive: true }).lean()
  if (cheeses.length !== ids.length) fail(400, 'INVALID_CHEESE', 'Uno o más productos no existen o están inactivos.')
  if (destination.scope === 'store') {
    const excludedCheeses = new Set(destination.excludedCheeses.map(String))
    if (ids.some((id) => excludedCheeses.has(String(id)))) {
      fail(400, 'CHEESE_NOT_AVAILABLE_AT_STORE', 'Este producto no se maneja para el cliente seleccionado.')
    }
    if (destination.productsConfigured) {
      const allowedProducts = new Set(destination.allowedProducts.map(String))
      if (ids.some((id) => !allowedProducts.has(String(id)))) {
        fail(400, 'PRODUCT_NOT_ASSIGNED', 'Uno o más productos no están asignados a este cliente.')
      }
    }
  }
  const cheeseById = new Map(cheeses.map((cheese) => [String(cheese._id), cheese]))
  const prices = await Price.find({
    scope: destination.scope,
    store: destination.scope === 'store' ? destination.storeId : null,
    cheese: { $in: ids },
  }).lean()
  const priceByCheese = new Map(prices.map((price) => [String(price.cheese), price.price]))

  const items = input.items.map(({ cheeseId, quantity, unitPrice: requestedUnitPrice }) => {
    const cheese = cheeseById.get(String(cheeseId))
    const basePrice = priceByCheese.get(String(cheeseId))
    const unitPrice = destination.scope === 'general' && requestedUnitPrice != null ? requestedUnitPrice : basePrice
    if (unitPrice == null) fail(400, 'PRICE_NOT_DEFINED', `No hay precio configurado para ${cheese.name} en el destino seleccionado.`)
    const parsedQuantity = parseQuantity(quantity)
    const lineTotal = calculateLineTotal(unitPrice, parsedQuantity.milli)
    if (lineTotal < 1) fail(400, 'SUBTOTAL_TOO_SMALL', `La cantidad de ${cheese.name} produce un subtotal menor a $1 COP.`)
    return {
      cheese: cheese._id,
      cheeseName: cheese.name,
      sortOrder: cheese.sortOrder ?? 10_000,
      quantity: parsedQuantity.normalized,
      quantityMilli: parsedQuantity.milli,
      unit: 'und',
      unitPrice,
      lineTotal,
    }
  })
  items.sort((left, right) => left.sortOrder - right.sortOrder || left.cheeseName.localeCompare(right.cheeseName, 'es', { sensitivity: 'base', numeric: true }))
  const totalBig = items.reduce((total, item) => total + BigInt(item.lineTotal), 0n)
  if (totalBig > BigInt(Number.MAX_SAFE_INTEGER)) fail(400, 'TOTAL_TOO_LARGE', 'El total supera el rango permitido.')
  const total = Number(totalBig)
  const settings = await getOrCreateCompanySettings()
  const printProfile = settings.printProfile.toObject ? settings.printProfile.toObject() : settings.printProfile

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
        printProfile,
        pdfFileName: quotePdfFilename({ store: destination.snapshot, number }),
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
