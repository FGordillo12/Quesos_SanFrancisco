import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { Quote } from './models/Quote.js'

function validQuote(store) {
  return new Quote({
    number: 'QSF-000001',
    date: new Date(),
    store,
    items: [{
      cheese: new mongoose.Types.ObjectId(), cheeseName: 'Queso Campesino', quantity: '1.25',
      quantityMilli: 1250, unit: 'kg', unitPrice: 18000, lineTotal: 22500,
    }],
    total: 22500,
    createdBy: new mongoose.Types.ObjectId(),
  })
}

test('cotización nueva conserva datos snapshot sin crear una referencia de almacén', async () => {
  const quote = validQuote({ mode: 'new', storeId: null, name: 'Tienda Nueva', address: 'Calle 1', city: 'Ubaté' })
  await assert.doesNotReject(quote.validate())
})

test('cotización registrada requiere referencia al almacén', async () => {
  const quote = validQuote({ mode: 'registered', storeId: null, name: 'Tienda', address: 'Calle 1', city: 'Ubaté' })
  await assert.rejects(quote.validate())
})
