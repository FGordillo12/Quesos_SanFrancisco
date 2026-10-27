import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'vendedor'], default: 'vendedor', required: true },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: true },
  failedLoginAttempts: { type: Number, default: 0, min: 0 },
  lockUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' })

userSchema.index({ email: 1 }, { unique: true })

export const User = mongoose.models.User ?? mongoose.model('User', userSchema)
