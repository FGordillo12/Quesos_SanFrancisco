import mongoose from 'mongoose'
import { logger } from '../lib/logger.js'

mongoose.set('strictQuery', true)

export async function connectDatabase(uri) {
  mongoose.connection.on('connected', () => logger.info('MongoDB conectado'))
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB desconectado'))
  mongoose.connection.on('error', (error) => logger.error({ name: error?.name, code: error?.code }, 'Error de conexión MongoDB'))
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
  return mongoose.connection
}

export function databaseIsReady() {
  return mongoose.connection.readyState === 1
}
