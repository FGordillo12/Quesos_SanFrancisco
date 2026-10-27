import mongoose from 'mongoose'

const cheeseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  unit: { type: String, enum: ['kg', 'und'], required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true, strict: 'throw' })

cheeseSchema.index({ name: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } })
cheeseSchema.index({ isActive: 1, name: 1 })

export const Cheese = mongoose.models.Cheese ?? mongoose.model('Cheese', cheeseSchema)
