import mongoose from 'mongoose'
import { logger } from '../lib/logger.js'

mongoose.set('strictQuery', true)

let connectionPromise

export async function connectDatabase(uri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection
  if (connectionPromise) return connectionPromise

  mongoose.connection.on('connected', () => logger.info('MongoDB conectado'))
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB desconectado'))
  mongoose.connection.on('error', (error) => logger.error({ name: error?.name, code: error?.code }, 'Error de conexión MongoDB'))
  connectionPromise = mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 })
    .then(() => mongoose.connection)
    .catch((error) => {
      connectionPromise = undefined
      throw error
    })
  return connectionPromise
}

export function databaseIsReady() {
  return mongoose.connection.readyState === 1
}
