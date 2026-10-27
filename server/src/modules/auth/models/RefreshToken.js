import mongoose from 'mongoose'

const refreshTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  userAgent: { type: String, maxlength: 500, default: '' },
  ip: { type: String, maxlength: 64, default: '' },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' })

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const RefreshToken = mongoose.models.RefreshToken ?? mongoose.model('RefreshToken', refreshTokenSchema)
