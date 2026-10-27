import mongoose from 'mongoose'

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  value: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
}, { timestamps: true, strict: 'throw' })

export const Counter = mongoose.models.Counter ?? mongoose.model('Counter', counterSchema)
