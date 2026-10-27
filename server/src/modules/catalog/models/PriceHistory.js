import mongoose from 'mongoose'

const priceHistorySchema = new mongoose.Schema({
  cheese: { type: mongoose.Schema.Types.ObjectId, ref: 'Cheese', required: true },
  scope: { type: String, enum: ['general', 'store'], required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
  oldPrice: { type: Number, min: 1, max: 1_000_000_000, default: null },
  newPrice: { type: Number, required: true, min: 1, max: 1_000_000_000, validate: Number.isSafeInteger },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: false, strict: 'throw' })

priceHistorySchema.index({ store: 1, cheese: 1, changedAt: -1 })
priceHistorySchema.pre('validate', function validatePriceHistoryScope() {
  if (this.scope === 'store' && !this.store) this.invalidate('store', 'El historial particular requiere un almacén.')
  if (this.scope === 'general' && this.store) this.invalidate('store', 'El historial general no puede asociarse a un almacén.')
})

export const PriceHistory = mongoose.models.PriceHistory ?? mongoose.model('PriceHistory', priceHistorySchema)
