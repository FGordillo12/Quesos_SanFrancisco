import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { OneTimeToken } from './models/OneTimeToken.js'
import { RefreshToken } from './models/RefreshToken.js'
import { User } from './models/User.js'
import { createOpaqueToken, hashToken, normalizeEmail, passwordPolicyError } from './auth.utils.js'
import { sendPasswordResetEmail } from './email.service.js'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60
export const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60
const PASSWORD_HASH_COST = 12
const LOCK_THRESHOLD = 5
const LOCK_DURATION_MS = 15 * 60 * 1000
const dummyHashPromise = bcrypt.hash('not-a-real-user-password', PASSWORD_HASH_COST)

export function createAccessToken(userId, sessionId) {
  return jwt.sign({ sub: String(userId), sid: String(sessionId), typ: 'access' }, env.accessTokenSecret, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: 'quesos-san-francisco',
    audience: 'web',
  })
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.accessTokenSecret, {
    algorithms: ['HS256'],
    issuer: 'quesos-san-francisco',
    audience: 'web',
  })
}

function createRefreshJwt(userId, ttlSeconds) {
  return jwt.sign({ sub: String(userId), typ: 'refresh' }, env.refreshTokenSecret, {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
    issuer: 'quesos-san-francisco',
    audience: 'web',
    jwtid: createOpaqueToken(),
  })
}

export async function registerUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email)
  const existing = await User.exists({ email: normalizedEmail })
  if (existing) {
    const error = new Error('No fue posible crear la cuenta con esos datos.')
    error.status = 409
    error.code = 'REGISTRATION_FAILED'
    throw error
  }
  const passwordError = passwordPolicyError(password)
  if (passwordError) {
    const error = new Error(passwordError)
    error.status = 400
    error.code = 'WEAK_PASSWORD'
    throw error
  }

  const user = new User({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, PASSWORD_HASH_COST),
    role: 'usuario',
    isActive: true,
    isEmailVerified: true,
  })
  try {
    await user.save()
  } catch (error) {
    if (error.code === 11000) {
      const conflict = new Error('No fue posible crear la cuenta con esos datos.')
      conflict.status = 409
      conflict.code = 'REGISTRATION_FAILED'
      throw conflict
    }
    throw error
  }

  return { ok: true, userId: user._id }
}

export async function verifyEmailToken(token) {
  const now = new Date()
  const tokenRecord = await OneTimeToken.findOneAndUpdate(
    { tokenHash: hashToken(token), kind: 'email_verification', usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  )
  if (!tokenRecord) return false
  const result = await User.updateOne({ _id: tokenRecord.user, isEmailVerified: false }, { $set: { isEmailVerified: true } })
  return result.modifiedCount === 1
}

export async function loginUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email)
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash')
  const hash = user?.passwordHash ?? await dummyHashPromise
  const passwordMatches = await bcrypt.compare(password, hash)
  const now = new Date()
  const locked = Boolean(user?.lockUntil && user.lockUntil > now)

  // A correct password must not be reported as invalid just because the
  // account reached the temporary lockout threshold after earlier attempts.
  if (user && locked && user.isActive && passwordMatches) {
    const error = new Error('La cuenta está bloqueada temporalmente por varios intentos. Inténtalo de nuevo más tarde.')
    error.status = 429
    error.code = 'ACCOUNT_TEMPORARILY_LOCKED'
    error.retryAfterSeconds = Math.ceil((user.lockUntil.getTime() - now.getTime()) / 1000)
    throw error
  }

  if (!user || locked || !user.isActive || !passwordMatches) {
    if (user && !locked && user.isActive && !passwordMatches) {
      if (user.lockUntil && user.lockUntil <= now) {
        await User.updateOne({ _id: user._id, lockUntil: user.lockUntil }, { $set: { failedLoginAttempts: 0, lockUntil: null } })
      }
      await User.updateOne({ _id: user._id }, { $inc: { failedLoginAttempts: 1 } })
      const current = await User.findById(user._id).select('failedLoginAttempts lockUntil')
      if (current?.failedLoginAttempts >= LOCK_THRESHOLD && !current.lockUntil) {
        await User.updateOne(
          { _id: user._id, failedLoginAttempts: { $gte: LOCK_THRESHOLD }, lockUntil: null },
          { $set: { lockUntil: new Date(Date.now() + LOCK_DURATION_MS) } },
        )
      }
    }
    return null
  }

  if (user.role === 'usuario') {
    const error = new Error('Tu cuenta está creada y pendiente de que un administrador te asigne el rol de Trabajador o Administrador.')
    error.status = 403
    error.code = 'ROLE_PENDING'
    throw error
  }

  // Migrate users created by previous versions without changing their access.
  if (user.role === 'vendedor') {
    user.role = 'trabajador'
    await user.save()
  }

  await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: now } })
  return user
}

export async function createRefreshSession(user, req, rememberMe) {
  const ttlSeconds = rememberMe ? REMEMBER_TTL_SECONDS : REFRESH_TTL_SECONDS
  const token = createOpaqueToken()
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
  const record = await RefreshToken.create({
    user: user._id,
    tokenHash: hashToken(token),
    userAgent: String(req.get('user-agent') ?? '').slice(0, 500),
    ip: String(req.ip ?? '').slice(0, 64),
    expiresAt,
  })
  return { token, expiresAt, ttlSeconds, sessionId: record._id }
}

export async function rotateRefreshSession(rawToken, req) {
  if (!rawToken) return null
  let payload
  try {
    payload = jwt.verify(rawToken, env.refreshTokenSecret, {
      algorithms: ['HS256'],
      issuer: 'quesos-san-francisco',
      audience: 'web',
    })
  } catch {
    return null
  }
  if (payload.typ !== 'refresh' || typeof payload.sub !== 'string') return null
  const now = new Date()
  const oldSession = await RefreshToken.findOneAndUpdate(
    { tokenHash: hashToken(rawToken), user: payload.sub, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { new: true },
  )
  if (!oldSession) return null
  const user = await User.findOne({ _id: oldSession.user, isActive: true })
  if (!user || user.role === 'usuario') return null
  if (user.role === 'vendedor') { user.role = 'trabajador'; await user.save() }
  const ttlSeconds = Math.ceil((oldSession.expiresAt.getTime() - now.getTime()) / 1000)
  const token = createRefreshJwt(user._id, ttlSeconds)
  const expiresAt = oldSession.expiresAt
  try {
    const newSession = await RefreshToken.create({
      user: user._id,
      tokenHash: hashToken(token),
      userAgent: String(req.get('user-agent') ?? '').slice(0, 500),
      ip: String(req.ip ?? '').slice(0, 64),
      expiresAt,
    })
    return { user, token, expiresAt, ttlSeconds, sessionId: newSession._id }
  } catch (error) {
    logger.error({ name: error.name, code: error.code }, 'No se pudo rotar una sesión')
    return null
  }
}

export async function revokeRefreshSession(rawToken) {
  if (!rawToken) return
  await RefreshToken.updateOne(
    { tokenHash: hashToken(rawToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  )
}

export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: normalizeEmail(email), isActive: true })
  if (!user) return
  await OneTimeToken.deleteMany({ user: user._id, kind: 'password_reset', usedAt: null })
  const token = createOpaqueToken()
  const record = await OneTimeToken.create({
    user: user._id,
    kind: 'password_reset',
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  })
  try {
    await sendPasswordResetEmail(user.email, token)
  } catch (error) {
    await OneTimeToken.deleteOne({ _id: record._id })
    throw error
  }
}

export async function resetPassword({ token, password }) {
  const passwordError = passwordPolicyError(password)
  if (passwordError) {
    const error = new Error(passwordError)
    error.status = 400
    error.code = 'WEAK_PASSWORD'
    throw error
  }
  const now = new Date()
  const record = await OneTimeToken.findOneAndUpdate(
    { tokenHash: hashToken(token), kind: 'password_reset', usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
    { new: true },
  )
  if (!record) return false
  const passwordHash = await bcrypt.hash(password, PASSWORD_HASH_COST)
  const result = await User.updateOne({ _id: record.user, isActive: true }, { $set: { passwordHash, failedLoginAttempts: 0, lockUntil: null } })
  if (result.modifiedCount !== 1) return false
  await RefreshToken.updateMany({ user: record.user, revokedAt: null }, { $set: { revokedAt: now } })
  return true
}

