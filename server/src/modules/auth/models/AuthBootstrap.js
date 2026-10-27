import mongoose from 'mongoose'

const authBootstrapSchema = new mongoose.Schema({
  _id: { type: String, default: 'first-admin' },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
}, { timestamps: true, strict: 'throw' })

export const AuthBootstrap = mongoose.models.AuthBootstrap ?? mongoose.model('AuthBootstrap', authBootstrapSchema)
