import mongoose from 'mongoose'
import { env } from './config/env.js'
import { connectDatabase } from './config/database.js'
import { Cheese } from './modules/catalog/models/Cheese.js'

// Todos se cotizan por unidad (paquete/pieza); el gramaje forma parte del nombre.
// Los precios quedan sin definir para que administración los registre en Precios.
const products = [
  { name: 'QUESO DOBLE CREMA x 550 gr.', description: 'Queso doble crema, presentación de 550 g.', unit: 'und' },
  { name: 'QUESO DOBLE CREMA x 350 gr.', description: 'Queso doble crema, presentación de 350 g.', unit: 'und' },
  { name: 'QUESO DOBLE CREMA x 250 gr.', description: 'Queso doble crema, presentación de 250 g.', unit: 'und' },
  { name: 'QUESO DOBLE CREMA x 800 gr.', description: 'Queso doble crema, presentación de 800 g.', unit: 'und' },
  { name: 'QUESO CAMPESINO x 250 gr.', description: 'Queso campesino, presentación de 250 g.', unit: 'und' },
  { name: 'QUESO CAMPESINO x 350 gr.', description: 'Queso campesino, presentación de 350 g.', unit: 'und' },
  { name: 'QUESO CAMPESINO x 500 gr.', description: 'Queso campesino, presentación de 500 g.', unit: 'und' },
  { name: 'QUESO CAMPESINO x 1000 gr.', description: 'Queso campesino, presentación de 1000 g.', unit: 'und' },
  { name: 'QUESO TAJADO x 125 gr.', description: 'Queso tajado, presentación de 125 g.', unit: 'und' },
  { name: 'QUESO TAJADO x 250 gr.', description: 'Queso tajado, presentación de 250 g.', unit: 'und' },
  { name: 'QUESO TAJADO x 500 gr.', description: 'Queso tajado, presentación de 500 g.', unit: 'und' },
  { name: 'MALLAS', description: 'Mallas.', unit: 'und' },
  { name: 'COMBINADO', description: 'Producto combinado.', unit: 'und' },
  { name: 'CUARTOS', description: 'Queso en cuartos.', unit: 'und' },
]

try {
  await connectDatabase(env.mongoUri)
  let created = 0
  for (const [index, product] of products.entries()) {
    const existing = await Cheese.findOne({ name: product.name }).collation({ locale: 'es', strength: 2 })
    const sortOrder = (index + 1) * 10
    if (existing) {
      if (existing.sortOrder !== sortOrder) await Cheese.updateOne({ _id: existing._id }, { $set: { sortOrder } })
      continue
    }
    await Cheese.create({ ...product, sortOrder })
    created += 1
  }
  console.log(`Catálogo listo: ${products.length} productos revisados, ${created} agregados. Los precios se configuran desde el módulo Precios.`)
} catch (error) {
  console.error(`No se pudo cargar el catálogo inicial: ${error.message}`)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
