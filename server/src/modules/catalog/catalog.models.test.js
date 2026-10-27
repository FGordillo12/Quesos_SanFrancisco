import test from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { Price } from './models/Price.js'
import { PriceHistory } from './models/PriceHistory.js'

const ids = () => ({ cheese: new mongoose.Types.ObjectId(), store: new mongoose.Types.ObjectId(), actor: new mongoose.Types.ObjectId() })

test('acepta tarifa general sin almacén y tarifa particular con almacén', async () => {
  const generalIds = ids()
  const general = new Price({ cheese: generalIds.cheese, scope: 'general', store: null, price: 25000, updatedBy: generalIds.actor })
  await assert.doesNotReject(general.validate())

  const storeIds = ids()
  const particular = new Price({ cheese: storeIds.cheese, store: storeIds.store, scope: 'store', price: 27000, updatedBy: storeIds.actor })
  await assert.doesNotReject(particular.validate())
})

test('rechaza precios particulares sin almacén y valores no enteros', async () => {
  const missingStoreIds = ids()
  const missingStore = new Price({ cheese: missingStoreIds.cheese, scope: 'store', store: null, price: 25000, updatedBy: missingStoreIds.actor })
  await assert.rejects(missingStore.validate())

  const fractionalIds = ids()
  const fractional = new Price({ cheese: fractionalIds.cheese, scope: 'general', store: null, price: 1250.5, updatedBy: fractionalIds.actor })
  await assert.rejects(fractional.validate())
})

test('historial identifica cambios generales y particulares', async () => {
  const generalIds = ids()
  const general = new PriceHistory({ cheese: generalIds.cheese, scope: 'general', store: null, oldPrice: null, newPrice: 25000, changedBy: generalIds.actor })
  await assert.doesNotReject(general.validate())

  const particularIds = ids()
  const particular = new PriceHistory({ cheese: particularIds.cheese, store: particularIds.store, scope: 'store', oldPrice: 25000, newPrice: 26000, changedBy: particularIds.actor })
  await assert.doesNotReject(particular.validate())
})
