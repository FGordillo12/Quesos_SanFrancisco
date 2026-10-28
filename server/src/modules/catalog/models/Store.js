import mongoose from 'mongoose'

const storeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  nit: { type: String, trim: true, maxlength: 30, unique: true, sparse: true },
  address: { type: String, required: true, trim: true, maxlength: 200 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  contactName: { type: String, trim: true, maxlength: 120, default: '' },
  excludedCheeses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cheese' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true, strict: 'throw' })

storeSchema.index({ isActive: 1, name: 1 })

export const Store = mongoose.models.Store ?? mongoose.model('Store', storeSchema)
