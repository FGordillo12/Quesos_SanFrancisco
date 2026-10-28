import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/auth.middleware.js'
import { Cheese } from './models/Cheese.js'
import { Price } from './models/Price.js'
import { PriceHistory } from './models/PriceHistory.js'
import { Store } from './models/Store.js'

export const cheeseRouter = Router()
export const storeRouter = Router()
export const priceRouter = Router()

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identificador inválido.')
const idParams = z.object({ id: objectId }).strict()
const statusQuery = z.enum(['active', 'inactive', 'all']).default('active')
const searchQuery = z.string().trim().max(100).optional().default('')
const cheeseCreate = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().default(''),
  unit: z.enum(['kg', 'und']),
}).strict()
const cheeseUpdate = cheeseCreate.partial().extend({ isActive: z.boolean().optional() }).strict()
const emailOptional = z.union([z.string().trim().email().max(254), z.literal('')]).optional().default('')
const storeCreate = z.object({
  name: z.string().trim().min(2).max(120),
  nit: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().min(2).max(200),
  city: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(40).optional().default(''),
  email: emailOptional,
  contactName: z.string().trim().max(120).optional().default(''),
}).strict()
const storeUpdate = storeCreate.partial().extend({ isActive: z.boolean().optional() }).strict()
const priceUpdate = z.object({
  cheeseId: objectId,
  price: z.number().int().min(1).max(1_000_000_000),
}).strict()
const storePriceBatch = z.object({
  storeId: objectId,
  updates: z.array(priceUpdate).min(1).max(200),
}).strict()
const generalPriceBatch = z.object({ updates: z.array(priceUpdate).min(1).max(200) }).strict()

function sendError(res, status, code, message) {
  return res.status(status).json({ ok: false, data: null, error: { code, message } })
}

function parse(schema, part = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[part])
    if (!result.success) return sendError(res, 400, 'VALIDATION_ERROR', 'Revisa los datos ingresados.')
    const target = part === 'params' ? 'validatedParams' : part === 'query' ? 'validatedQuery' : 'validatedBody'
    req[target] = result.data
    return next()
  }
}

function isDuplicate(error) { return error?.code === 11000 }
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function statusFilter(status) {
  return status === 'all' ? {} : { isActive: status === 'active' }
}

cheeseRouter.use(requireAuth)
cheeseRouter.get('/', parse(z.object({ search: searchQuery, status: statusQuery }).strict(), 'query'), async (req, res, next) => {
  try {
    const { search, status } = req.validatedQuery
    const filter = { ...statusFilter(status) }
    if (search) filter.name = { $regex: escapeRegex(search), $options: 'i' }
    const data = await Cheese.find(filter).sort({ sortOrder: 1, name: 1 }).lean()
    return res.json({ ok: true, data, error: null })
  } catch (error) { return next(error) }
})

cheeseRouter.post('/', requireRole('admin'), parse(cheeseCreate), async (req, res, next) => {
  try {
    const cheese = await Cheese.create(req.validatedBody)
    return res.status(201).json({ ok: true, data: cheese, error: null })
  } catch (error) {
    if (isDuplicate(error)) return sendError(res, 409, 'CHEESE_EXISTS', 'Ya existe un queso con ese nombre.')
    return next(error)
  }
})

cheeseRouter.put('/:id', requireRole('admin'), parse(idParams, 'params'), parse(cheeseUpdate), async (req, res, next) => {
  try {
    const current = await Cheese.findById(req.validatedParams.id)
    if (!current) return sendError(res, 404, 'CHEESE_NOT_FOUND', 'Queso no encontrado.')
    if (req.validatedBody.unit && req.validatedBody.unit !== current.unit && await Price.exists({ cheese: current._id })) {
      return sendError(res, 409, 'UNIT_IN_USE', 'No se puede cambiar la unidad mientras existan precios para este queso.')
    }
    const cheese = await Cheese.findByIdAndUpdate(req.validatedParams.id, { $set: req.validatedBody }, { new: true, runValidators: true })
    return res.json({ ok: true, data: cheese, error: null })
  } catch (error) {
    if (isDuplicate(error)) return sendError(res, 409, 'CHEESE_EXISTS', 'Ya existe un queso con ese nombre.')
    return next(error)
  }
})

cheeseRouter.delete('/:id', requireRole('admin'), parse(idParams, 'params'), async (req, res, next) => {
  try {
    const cheese = await Cheese.findByIdAndUpdate(req.validatedParams.id, { $set: { isActive: false } }, { new: true })
    if (!cheese) return sendError(res, 404, 'CHEESE_NOT_FOUND', 'Queso no encontrado.')
    return res.json({ ok: true, data: cheese, error: null })
  } catch (error) { return next(error) }
})

storeRouter.use(requireAuth)
storeRouter.get('/', parse(z.object({ search: searchQuery, status: statusQuery }).strict(), 'query'), async (req, res, next) => {
  try {
    const { search, status } = req.validatedQuery
    const filter = { ...statusFilter(status) }
    if (search) {
      const pattern = { $regex: escapeRegex(search), $options: 'i' }
      filter.$or = [{ name: pattern }, { nit: pattern }, { city: pattern }, { contactName: pattern }]
    }
    const data = await Store.find(filter).sort({ name: 1, city: 1 }).lean()
    return res.json({ ok: true, data, error: null })
  } catch (error) { return next(error) }
})

storeRouter.post('/', requireRole('admin'), parse(storeCreate), async (req, res, next) => {
  try {
    const input = { ...req.validatedBody, nit: req.validatedBody.nit || undefined }
    const store = await Store.create(input)
    return res.status(201).json({ ok: true, data: store, error: null })
  } catch (error) {
    if (isDuplicate(error)) return sendError(res, 409, 'STORE_EXISTS', 'Ya existe un almacén con ese NIT.')
    return next(error)
  }
})

storeRouter.put('/:id', requireRole('admin'), parse(idParams, 'params'), parse(storeUpdate), async (req, res, next) => {
  try {
    const input = { ...req.validatedBody }
    const update = { $set: input }
    if (input.nit === '') { delete update.$set.nit; update.$unset = { nit: 1 } }
    const store = await Store.findByIdAndUpdate(req.validatedParams.id, update, { new: true, runValidators: true })
    if (!store) return sendError(res, 404, 'STORE_NOT_FOUND', 'Almacén no encontrado.')
    return res.json({ ok: true, data: store, error: null })
  } catch (error) {
    if (isDuplicate(error)) return sendError(res, 409, 'STORE_EXISTS', 'Ya existe un almacén con ese NIT.')
    return next(error)
  }
})

storeRouter.delete('/:id', requireRole('admin'), parse(idParams, 'params'), async (req, res, next) => {
  try {
    const store = await Store.findByIdAndUpdate(req.validatedParams.id, { $set: { isActive: false } }, { new: true })
    if (!store) return sendError(res, 404, 'STORE_NOT_FOUND', 'Almacén no encontrado.')
    return res.json({ ok: true, data: store, error: null })
  } catch (error) { return next(error) }
})

async function readPriceMatrix(scope, storeId) {
  if (scope === 'store') {
    const store = await Store.findOne({ _id: storeId, isActive: true }).lean()
    if (!store) {
      const error = new Error('Almacén no encontrado o inactivo.')
      error.status = 404
      error.code = 'STORE_NOT_FOUND'
      throw error
    }
  }
  const cheeses = await Cheese.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean()
  const filter = { scope, cheese: { $in: cheeses.map((cheese) => cheese._id) } }
  if (scope === 'store') filter.store = storeId
  const prices = await Price.find(filter).lean()
  const byCheese = new Map(prices.map((price) => [String(price.cheese), price]))
  return cheeses.map((cheese) => {
    const price = byCheese.get(String(cheese._id))
    return { cheeseId: cheese._id, name: cheese.name, unit: cheese.unit, price: price?.price ?? null, updatedAt: price?.updatedAt ?? null }
  })
}

async function savePriceBatch({ scope, storeId = null, updates, userId }) {
  const ids = updates.map((item) => item.cheeseId)
  if (new Set(ids).size !== ids.length) {
    const error = new Error('No repitas quesos en el mismo guardado.')
    error.status = 400
    error.code = 'DUPLICATE_CHEESE'
    throw error
  }
  const activeCheeseCount = await Cheese.countDocuments({ _id: { $in: ids }, isActive: true })
  if (activeCheeseCount !== ids.length) {
    const error = new Error('Uno o más quesos no existen o están inactivos.')
    error.status = 400
    error.code = 'INVALID_CHEESE'
    throw error
  }
  if (scope === 'store') {
    const store = await Store.findOne({ _id: storeId, isActive: true })
    if (!store) {
      const error = new Error('Almacén no encontrado o inactivo.')
      error.status = 404
      error.code = 'STORE_NOT_FOUND'
      throw error
    }
  }

  const session = await mongoose.startSession()
  const changed = new Set()
  try {
    await session.withTransaction(async () => {
      for (const item of updates) {
        const filter = { scope, cheese: item.cheeseId, store: scope === 'store' ? storeId : null }
        const previous = await Price.findOne(filter).session(session)
        if (previous?.price === item.price) continue
        await Price.findOneAndUpdate(filter, {
          $set: { scope, store: scope === 'store' ? storeId : null, price: item.price, updatedBy: userId },
        }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session })
        await PriceHistory.create([{
          cheese: item.cheeseId,
          scope,
          store: scope === 'store' ? storeId : null,
          oldPrice: previous?.price ?? null,
          newPrice: item.price,
          changedBy: userId,
          changedAt: new Date(),
        }], { session })
        changed.add(String(item.cheeseId))
      }
    })
    return { saved: updates.length, changed: changed.size }
  } finally {
    await session.endSession()
  }
}

priceRouter.use(requireAuth)
priceRouter.get('/general', async (req, res, next) => {
  try {
    const data = await readPriceMatrix('general')
    return res.json({ ok: true, data, error: null })
  } catch (error) { return next(error) }
})

priceRouter.put('/general', requireRole('admin'), parse(generalPriceBatch), async (req, res, next) => {
  try {
    const result = await savePriceBatch({ scope: 'general', updates: req.validatedBody.updates, userId: req.authUser._id })
    return res.json({ ok: true, data: result, error: null })
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.code, error.message)
    return next(error)
  }
})

priceRouter.get('/history', parse(z.object({
  scope: z.enum(['general', 'store']).optional(),
  store: objectId.optional(),
  cheese: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict(), 'query'), async (req, res, next) => {
  try {
    const filter = {}
    if (req.validatedQuery.scope) filter.scope = req.validatedQuery.scope
    if (req.validatedQuery.store) filter.store = req.validatedQuery.store
    if (req.validatedQuery.cheese) filter.cheese = req.validatedQuery.cheese
    const data = await PriceHistory.find(filter)
      .sort({ changedAt: -1 })
      .limit(req.validatedQuery.limit)
      .populate('cheese', 'name unit')
      .populate('store', 'name city')
      .populate('changedBy', 'name')
      .lean()
    return res.json({ ok: true, data, error: null })
  } catch (error) { return next(error) }
})

priceRouter.get('/', parse(z.object({ store: objectId }).strict(), 'query'), async (req, res, next) => {
  try {
    const data = await readPriceMatrix('store', req.validatedQuery.store)
    return res.json({ ok: true, data, error: null })
  } catch (error) { return next(error) }
})

priceRouter.put('/', requireRole('admin'), parse(storePriceBatch), async (req, res, next) => {
  try {
    const result = await savePriceBatch({
      scope: 'store', storeId: req.validatedBody.storeId, updates: req.validatedBody.updates, userId: req.authUser._id,
    })
    return res.json({ ok: true, data: result, error: null })
  } catch (error) {
    if (error.status) return sendError(res, error.status, error.code, error.message)
    return next(error)
  }
})
