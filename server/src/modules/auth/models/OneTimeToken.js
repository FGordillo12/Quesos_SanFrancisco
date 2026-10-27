import mongoose from 'mongoose'

const oneTimeTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  kind: { type: String, enum: ['email_verification', 'password_reset'], required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' })

oneTimeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
oneTimeTokenSchema.index({ user: 1, kind: 1 })
export const OneTimeToken = mongoose.models.OneTimeToken ?? mongoose.model('OneTimeToken', oneTimeTokenSchema)
