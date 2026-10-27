import { User } from './models/User.js'
import { RefreshToken } from './models/RefreshToken.js'
import { verifyAccessToken } from './auth.service.js'

function unauthorized(res) {
  return res.status(401).json({ ok: false, data: null, error: { code: 'UNAUTHORIZED', message: 'La sesión no es válida o expiró.' } })
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.access_token
  if (!token) return unauthorized(res)
  try {
    const payload = verifyAccessToken(token)
    if (payload.typ !== 'access' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return unauthorized(res)
    const session = await RefreshToken.exists({ _id: payload.sid, user: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } })
    if (!session) return unauthorized(res)
    const user = await User.findOne({ _id: payload.sub, isActive: true })
    if (!user) return unauthorized(res)
    req.authUser = user
    return next()
  } catch {
    return unauthorized(res)
  }
}

export function requireRole(...roles) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.authUser || !roles.includes(req.authUser.role)) {
      return res.status(403).json({ ok: false, data: null, error: { code: 'FORBIDDEN', message: 'No tienes permiso para esta acción.' } })
    }
    return next()
  }
}
