import mongoose from 'mongoose'

const storeSnapshotSchema = new mongoose.Schema({
  mode: { type: String, enum: ['registered', 'new'], required: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  nit: { type: String, trim: true, maxlength: 30, default: '' },
  address: { type: String, trim: true, maxlength: 200, default: '' },
  city: { type: String, trim: true, maxlength: 100, default: '' },
  phone: { type: String, trim: true, maxlength: 40, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
  contactName: { type: String, trim: true, maxlength: 120, default: '' },
}, { _id: false, strict: 'throw' })

const quoteItemSchema = new mongoose.Schema({
  cheese: { type: mongoose.Schema.Types.ObjectId, ref: 'Cheese', required: true },
  cheeseName: { type: String, required: true, trim: true, maxlength: 100 },
  sortOrder: { type: Number, min: 0, max: 100_000, default: 10_000 },
  quantity: { type: String, required: true, maxlength: 20 },
  quantityMilli: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  unit: { type: String, enum: ['kg', 'und'], required: true },
  unitPrice: { type: Number, required: true, min: 1, max: 1_000_000_000, validate: Number.isSafeInteger },
  lineTotal: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
}, { _id: false, strict: 'throw' })

const printProfileSnapshotSchema = new mongoose.Schema({
  format: { type: String, enum: ['letter', 'thermal80', 'thermal58'], required: true },
  marginMm: { type: Number, min: 0, max: 25, required: true },
  fontSize: { type: Number, min: 8, max: 14, required: true },
  showLogo: { type: Boolean, required: true },
}, { _id: false, strict: 'throw' })

const quoteSchema = new mongoose.Schema({
  number: { type: String, required: true, immutable: true },
  date: { type: Date, required: true, default: Date.now },
  store: { type: storeSnapshotSchema, required: true },
  items: { type: [quoteItemSchema], required: true, validate: [(items) => items.length > 0 && items.length <= 50, 'La cotización debe tener entre 1 y 50 productos.'] },
  total: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  notes: { type: String, trim: true, maxlength: 1000, default: '' },
  printProfile: { type: printProfileSnapshotSchema, default: null },
  pdfFileName: { type: String, maxlength: 100, default: '' },
  driveFile: {
    id: { type: String, maxlength: 200, default: '' },
    webViewLink: { type: String, maxlength: 1000, default: '' },
    uploadedAt: { type: Date, default: null },
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true, strict: 'throw' })

quoteSchema.index({ number: 1 }, { unique: true })
quoteSchema.index({ date: -1, createdBy: 1 })
quoteSchema.index({ 'store.storeId': 1, date: -1 })
quoteSchema.pre('validate', function validateStoreSnapshot() {
  if (this.store?.mode === 'registered' && !this.store.storeId) this.invalidate('store.storeId', 'El almacén registrado requiere una referencia.')
  if (this.store?.mode === 'registered' && !this.store.address?.trim()) this.invalidate('store.address', 'El almacén registrado requiere una dirección.')
  if (this.store?.mode === 'registered' && !this.store.city?.trim()) this.invalidate('store.city', 'El almacén registrado requiere una ciudad.')
  if (this.store?.mode === 'new' && this.store.storeId) this.invalidate('store.storeId', 'Un almacén nuevo no debe guardar una referencia del catálogo.')
})

export const Quote = mongoose.models.Quote ?? mongoose.model('Quote', quoteSchema)
