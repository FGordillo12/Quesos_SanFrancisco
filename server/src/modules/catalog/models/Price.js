import mongoose from 'mongoose'

const priceSchema = new mongoose.Schema({
  cheese: { type: mongoose.Schema.Types.ObjectId, ref: 'Cheese', required: true },
  scope: { type: String, enum: ['general', 'store'], required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
  price: { type: Number, required: true, min: 1, max: 1_000_000_000, validate: Number.isSafeInteger },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, strict: 'throw' })

priceSchema.index({ cheese: 1, store: 1 }, { unique: true, partialFilterExpression: { scope: 'store' } })
priceSchema.index({ cheese: 1 }, { unique: true, partialFilterExpression: { scope: 'general' } })
priceSchema.pre('validate', function validatePriceScope() {
  if (this.scope === 'store' && !this.store) this.invalidate('store', 'El precio particular requiere un almacén.')
  if (this.scope === 'general' && this.store) this.invalidate('store', 'La tarifa general no puede asociarse a un almacén.')
})

export const Price = mongoose.models.Price ?? mongoose.model('Price', priceSchema)
