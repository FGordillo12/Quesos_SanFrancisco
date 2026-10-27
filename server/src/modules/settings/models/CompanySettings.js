import mongoose from 'mongoose'

const printProfileSchema = new mongoose.Schema({
  format: { type: String, enum: ['letter', 'thermal80', 'thermal58'], default: 'letter', required: true },
  marginMm: { type: Number, min: 0, max: 25, default: 10, required: true },
  fontSize: { type: Number, min: 8, max: 14, default: 9, required: true },
  showLogo: { type: Boolean, default: true, required: true },
}, { _id: false, strict: 'throw' })

const companySettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'company' },
  name: { type: String, required: true, trim: true, maxlength: 120, default: 'Quesos San Francisco' },
  location: { type: String, required: true, trim: true, maxlength: 240, default: 'Ubaté, Vereda Soaga, Cundinamarca, Colombia' },
  nit: { type: String, trim: true, maxlength: 30, default: '' },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  representative: { type: String, trim: true, maxlength: 120, default: '' },
  printProfile: { type: printProfileSchema, required: true, default: () => ({}) },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, strict: 'throw' })

export const CompanySettings = mongoose.models.CompanySettings ?? mongoose.model('CompanySettings', companySettingsSchema)
