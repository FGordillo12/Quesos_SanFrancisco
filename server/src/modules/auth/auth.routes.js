import { Router } from 'express'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { logger } from '../../lib/logger.js'
import { sensitiveRateLimit } from '../../middleware/security.js'
import { createOpaqueToken, hashToken, publicUser } from './auth.utils.js'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  createAccessToken,
  createRefreshSession,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  revokeRefreshSession,
  rotateRefreshSession,
  verifyEmailToken,
} from './auth.service.js'
import { requireAuth, requireRole } from './auth.middleware.js'
import { User } from './models/User.js'
import { RefreshToken } from './models/RefreshToken.js'

export const authRouter = Router()

const emailSchema = z.string().trim().email().max(254)
const registrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: z.string().min(10).max(72),
}).strict()
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
  rememberMe: z.boolean().optional().default(false),
}).strict()
const emailOnlySchema = z.object({ email: emailSchema }).strict()
const verifySchema = z.object({ token: z.string().min(20).max(200) }).strict()
const resetSchema = z.object({ token: z.string().min(20).max(200), password: z.string().min(10).max(72) }).strict()
const roleSchema = z.object({ role: z.enum(['admin', 'trabajador', 'usuario']) }).strict()
const userIdSchema = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }).strict()

function parseBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        ok: false, data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Revisa los datos ingresados.' },
      })
    }
    req.validatedBody = parsed.data
    return next()
  }
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'strict',
    path: '/api',
    maxAge,
  }
}

function setSessionCookies(res, accessToken, refreshToken, refreshTtlSeconds = REFRESH_TTL_SECONDS) {
  res.cookie('access_token', accessToken, cookieOptions(ACCESS_TOKEN_TTL_SECONDS * 1000))
  res.cookie('refresh_token', refreshToken, cookieOptions(refreshTtlSeconds * 1000))
}

function clearSessionCookies(res) {
  const options = { httpOnly: true, secure: env.isProduction, sameSite: 'strict', path: '/api' }
  res.clearCookie('access_token', options)
  res.clearCookie('refresh_token', options)
}

function sendError(res, status, code, message) {
  return res.status(status).json({ ok: false, data: null, error: { code, message } })
}

authRouter.get('/csrf', (req, res) => {
  const token = createOpaqueToken()
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: env.isProduction,
    sameSite: 'strict',
    path: '/api',
    maxAge: 2 * 60 * 60 * 1000,
  })
  res.set('Cache-Control', 'no-store')
  return res.json({ ok: true, data: { csrfToken: token }, error: null })
})

authRouter.post('/register', sensitiveRateLimit, parseBody(registrationSchema), async (req, res, next) => {
  try {
    await registerUser(req.validatedBody)
    return res.status(201).json({
      ok: true, data: { message: 'Cuenta creada. Quedó pendiente de que un administrador asigne un rol con acceso.' }, error: null,
    })
  } catch (error) {
    if (error.code === 'WEAK_PASSWORD') return sendError(res, 400, error.code, error.message)
    if (error.code === 'REGISTRATION_FAILED') return sendError(res, 409, error.code, error.message)
    return next(error)
  }
})

authRouter.post('/verify-email', parseBody(verifySchema), async (req, res, next) => {
  try {
    const verified = await verifyEmailToken(req.validatedBody.token)
    if (!verified) return sendError(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'El enlace no es válido o ya venció.')
    return res.json({ ok: true, data: { message: 'Correo verificado. Ya puedes iniciar sesión.' }, error: null })
  } catch (error) { return next(error) }
})

authRouter.post('/login', sensitiveRateLimit, parseBody(loginSchema), async (req, res, next) => {
  try {
    const user = await loginUser(req.validatedBody)
    if (!user) return sendError(res, 401, 'INVALID_CREDENTIALS', 'Credenciales inválidas.')
    const session = await createRefreshSession(user, req, req.validatedBody.rememberMe)
    const accessToken = createAccessToken(user._id, session.sessionId)
    setSessionCookies(res, accessToken, session.token, session.ttlSeconds)
    return res.json({ ok: true, data: { user: publicUser(user) }, error: null })
  } catch (error) {
    if (error.code === 'ROLE_PENDING') return sendError(res, 403, error.code, error.message)
    if (error.code === 'ACCOUNT_TEMPORARILY_LOCKED') {
      res.set('Retry-After', String(error.retryAfterSeconds))
      return sendError(res, 429, error.code, error.message)
    }
    return next(error)
  }
})

authRouter.post('/refresh', async (req, res) => {
  const session = await rotateRefreshSession(req.cookies?.refresh_token, req)
  if (!session) {
    clearSessionCookies(res)
    return sendError(res, 401, 'SESSION_EXPIRED', 'La sesión no es válida o expiró.')
  }
  const accessToken = createAccessToken(session.user._id, session.sessionId)
  setSessionCookies(res, accessToken, session.token, session.ttlSeconds)
  return res.json({ ok: true, data: { user: publicUser(session.user) }, error: null })
})

authRouter.post('/logout', async (req, res, next) => {
  try {
    await revokeRefreshSession(req.cookies?.refresh_token)
    clearSessionCookies(res)
    return res.json({ ok: true, data: { message: 'Sesión cerrada.' }, error: null })
  } catch (error) { return next(error) }
})

authRouter.post('/forgot-password', sensitiveRateLimit, parseBody(emailOnlySchema), async (req, res) => {
  try {
    await requestPasswordReset(req.validatedBody.email)
  } catch (error) {
    logger.warn({ code: error.code ?? error.name }, 'No fue posible entregar un correo de recuperación')
  }
  return res.json({
    ok: true, data: { message: 'Si el correo existe, enviaremos instrucciones para recuperar la contraseña.' }, error: null,
  })
})

authRouter.post('/reset-password', sensitiveRateLimit, parseBody(resetSchema), async (req, res, next) => {
  try {
    const reset = await resetPassword(req.validatedBody)
    if (!reset) return sendError(res, 400, 'INVALID_OR_EXPIRED_TOKEN', 'El enlace no es válido o ya venció.')
    return res.json({ ok: true, data: { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' }, error: null })
  } catch (error) {
    if (error.code === 'WEAK_PASSWORD') return sendError(res, 400, error.code, error.message)
    return next(error)
  }
})

authRouter.get('/me', requireAuth, (req, res) => {
  return res.json({ ok: true, data: { user: publicUser(req.authUser) }, error: null })
})

authRouter.get('/users', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const users = await User.find({ isActive: true }).select('name email role createdAt').sort({ createdAt: -1, name: 1 }).lean()
    return res.json({ ok: true, data: users.map((user) => ({ id: String(user._id), name: user.name, email: user.email, role: user.role === 'vendedor' ? 'trabajador' : user.role, createdAt: user.createdAt })), error: null })
  } catch (error) { return next(error) }
})

authRouter.patch('/users/:id/role', requireAuth, requireRole('admin'), (req, res, next) => {
  const parsedParams = userIdSchema.safeParse(req.params)
  const parsedBody = roleSchema.safeParse(req.body)
  if (!parsedParams.success || !parsedBody.success) {
    return res.status(400).json({ ok: false, data: null, error: { code: 'VALIDATION_ERROR', message: 'Revisa el usuario y el rol seleccionados.' } })
  }
  req.validatedParams = parsedParams.data
  req.validatedBody = parsedBody.data
  return next()
}, async (req, res, next) => {
  try {
    const target = await User.findById(req.validatedParams.id)
    if (!target) return sendError(res, 404, 'USER_NOT_FOUND', 'La cuenta no existe.')
    const nextRole = req.validatedBody.role
    if (String(target._id) === String(req.authUser._id) && nextRole !== 'admin') {
      return sendError(res, 409, 'SELF_DEMOTION_NOT_ALLOWED', 'No puedes quitarte tu propio rol de Administrador.')
    }
    if (target.role === 'admin' && target.isActive && nextRole !== 'admin') {
      const admins = await User.countDocuments({ role: 'admin', isActive: true })
      if (admins <= 1) return sendError(res, 409, 'LAST_ADMIN', 'No se puede quitar el rol al único administrador activo.')
    }
    target.role = nextRole
    await target.save()
    return res.json({ ok: true, data: { id: String(target._id), name: target.name, email: target.email, role: target.role }, error: null })
  } catch (error) { return next(error) }
})

authRouter.delete('/users/:id', requireAuth, requireRole('admin'), (req, res, next) => {
  const parsedParams = userIdSchema.safeParse(req.params)
  if (!parsedParams.success) return sendError(res, 400, 'VALIDATION_ERROR', 'La cuenta seleccionada no es válida.')
  req.validatedParams = parsedParams.data
  return next()
}, async (req, res, next) => {
  try {
    const target = await User.findById(req.validatedParams.id).select('name email role isActive')
    if (!target || !target.isActive) return sendError(res, 404, 'USER_NOT_FOUND', 'La cuenta no existe o ya fue eliminada.')
    if (target.role === 'admin') return sendError(res, 409, 'ADMIN_ACCOUNT_PROTECTED', 'Las cuentas con rol Administrador no se pueden eliminar.')
    if (String(target._id) === String(req.authUser._id)) return sendError(res, 409, 'SELF_DELETE_NOT_ALLOWED', 'No puedes eliminar tu propia cuenta.')

    // Soft-delete to preserve quote ownership and audit history, while revoking access immediately.
    const removed = await User.findOneAndUpdate(
      { _id: target._id, isActive: true, role: { $ne: 'admin' } },
      { $set: { isActive: false } },
      { new: true },
    ).select('_id')
    if (!removed) return sendError(res, 409, 'ACCOUNT_NOT_DELETABLE', 'La cuenta cambió o ya no se puede eliminar.')
    await RefreshToken.updateMany({ user: target._id, revokedAt: null }, { $set: { revokedAt: new Date() } })
    return res.json({ ok: true, data: { id: String(target._id), message: 'Cuenta eliminada y acceso revocado.' }, error: null })
  } catch (error) { return next(error) }
})

