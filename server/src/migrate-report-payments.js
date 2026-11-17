import mongoose from 'mongoose'
import { env } from './config/env.js'

async function migrate() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 10_000 })
  const quotes = mongoose.connection.collection('quotes')
  const result = await quotes.updateMany(
    { paymentStatus: { $exists: false } },
    { $set: { paymentStatus: 'pendiente', paidAt: null } },
  )
  await quotes.updateMany({ paidAt: { $exists: false } }, { $set: { paidAt: null } })
  await quotes.createIndex({ date: -1, paymentStatus: 1 }, { name: 'date_paymentStatus' })
  console.info(`Migración de reportes completada: ${result.modifiedCount} facturas marcadas como pendientes.`)
}

try { await migrate() }
catch (error) { console.error('No se pudo completar la migración de pagos.', error.message); process.exitCode = 1 }
finally { await mongoose.disconnect() }
