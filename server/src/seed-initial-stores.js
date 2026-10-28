import mongoose from 'mongoose'
import { env } from './config/env.js'
import { connectDatabase } from './config/database.js'
import { Cheese } from './modules/catalog/models/Cheese.js'
import { Price } from './modules/catalog/models/Price.js'
import { PriceHistory } from './modules/catalog/models/PriceHistory.js'
import { Store } from './modules/catalog/models/Store.js'
import { User } from './modules/auth/models/User.js'

const jrInvoicePrices = [
  ['QUESO DOBLE CREMA x 550 gr.', 13500],
  ['QUESO DOBLE CREMA x 350 gr.', 9300],
  ['QUESO DOBLE CREMA x 250 gr.', 6700],
  ['QUESO DOBLE CREMA x 800 gr.', 19000],
  ['QUESO CAMPESINO x 500 gr.', 10300],
  ['QUESO CAMPESINO x 1000 gr.', 19000],
  ['QUESO TAJADO x 500 gr.', 13500],
  ['QUESO TAJADO x 250 gr.', 7200],
  ['QUESO TAJADO x 125 gr.', 4000],
  ['MALLAS', 6200],
  ['QUESO CAMPESINO x 250 gr.', 5800],
]

const priceLists = {
  Idemass: [
    ['QUESO DOBLE CREMA x 350 gr.', 8600],
    ['QUESO DOBLE CREMA x 250 gr.', 6200],
    ['QUESO DOBLE CREMA x 800 gr.', 18000],
    ['QUESO CAMPESINO x 500 gr.', 9800],
    ['QUESO CAMPESINO x 1000 gr.', 18000],
    ['QUESO TAJADO x 500 gr.', 12500],
    ['COMBINADO', 2000],
  ],
  'JR Supermercado Centro': jrInvoicePrices,
}

const storeDetails = [
  { name: 'Idemass', address: 'Calle 15', city: 'Ubaté', excludedProduct: 'QUESO DOBLE CREMA x 550 gr.' },
  { name: 'JR Supermercado Centro', legacyNames: ['JR Supermercado'], address: 'Calle 9 # 7A-14', city: 'Ubaté' },
  { name: 'JR Supermercado Norte', address: 'Carrera 7 # 14-65', city: 'Ubaté' },
]

async function findOrCreateCheese(name) {
  const existing = await Cheese.findOne({ name }).collation({ locale: 'es', strength: 2 })
  if (existing) return existing
  const isCampesino250 = name === 'QUESO CAMPESINO x 250 gr.'
  return Cheese.create({
    name,
    description: isCampesino250 ? 'Queso campesino, presentación de 250 g.' : '',
    unit: 'und',
    sortOrder: isCampesino250 ? 50 : 10_000,
  })
}

async function findOrCreateStore(details, excludedCheeseId = null) {
  const names = [details.name, ...(details.legacyNames || [])]
  const existing = await Store.findOne({ name: { $in: names } }).collation({ locale: 'es', strength: 2 })
  const update = {
    name: details.name,
    address: details.address,
    city: details.city,
    isActive: true,
    ...(excludedCheeseId ? { excludedCheeses: [excludedCheeseId] } : {}),
  }
  if (existing) {
    await Store.updateOne({ _id: existing._id }, { $set: update })
    return Store.findById(existing._id)
  }
  return Store.create({ name: details.name, address: details.address, city: details.city, ...update })
}

try {
  await connectDatabase(env.mongoUri)
  const admin = await User.findOne({ role: 'admin', isActive: true }).select('_id').lean()
  if (!admin) throw new Error('No se encontró un administrador activo para registrar las tarifas iniciales.')

  const products = new Map()
  for (const name of new Set(Object.values(priceLists).flatMap((list) => list.map(([product]) => product)).concat(storeDetails.map((store) => store.excludedProduct).filter(Boolean)))) {
    products.set(name, await findOrCreateCheese(name))
  }

  const stores = new Map()
  for (const details of storeDetails) {
    const excludedId = details.excludedProduct ? products.get(details.excludedProduct)._id : null
    stores.set(details.name, await findOrCreateStore(details, excludedId))
  }

  const idemass = stores.get('Idemass')
  const removed = await Price.deleteOne({ scope: 'store', store: idemass._id, cheese: products.get('QUESO DOBLE CREMA x 550 gr.')._id })
  let inserted = 0
  let alreadyConfigured = 0
  for (const [storeName, items] of Object.entries(priceLists)) {
    const store = stores.get(storeName)
    for (const [productName, amountCop] of items) {
      const cheese = products.get(productName)
      const exists = await Price.exists({ scope: 'store', store: store._id, cheese: cheese._id })
      if (exists) { alreadyConfigured += 1; continue }
      await Price.create({ scope: 'store', store: store._id, cheese: cheese._id, price: amountCop, updatedBy: admin._id })
      await PriceHistory.create({ cheese: cheese._id, scope: 'store', store: store._id, oldPrice: null, newPrice: amountCop, changedBy: admin._id })
      inserted += 1
    }
  }

  const jrCentro = stores.get('JR Supermercado Centro')
  const jrNorte = stores.get('JR Supermercado Norte')
  const centroPrices = await Price.find({ scope: 'store', store: jrCentro._id }).lean()
  const centroCheeseIds = centroPrices.map((price) => price.cheese)
  let copiedToNorth = 0
  for (const source of centroPrices) {
    const current = await Price.findOne({ scope: 'store', store: jrNorte._id, cheese: source.cheese })
    if (current?.price === source.price) continue
    if (current) {
      await Price.updateOne({ _id: current._id }, { $set: { price: source.price, updatedBy: admin._id } })
    } else {
      await Price.create({ scope: 'store', store: jrNorte._id, cheese: source.cheese, price: source.price, updatedBy: admin._id })
    }
    await PriceHistory.create({ cheese: source.cheese, scope: 'store', store: jrNorte._id, oldPrice: current?.price ?? null, newPrice: source.price, changedBy: admin._id })
    copiedToNorth += 1
  }
  await Price.deleteMany({ scope: 'store', store: jrNorte._id, cheese: { $nin: centroCheeseIds } })

  console.log(`Almacenes listos: ${stores.size}. Tarifas iniciales agregadas: ${inserted}; ya existentes y respetadas: ${alreadyConfigured}. Tarifas sincronizadas en JR Norte: ${copiedToNorth}.`)
  console.log(`Producto sin precio eliminado de Idemass: ${removed.deletedCount ? 'sí' : 'no había precio previo'}. Los demás precios no indicados permanecen sin definir.`)
} catch (error) {
  console.error(`No se pudo cargar la información de los almacenes: ${error.message}`)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
