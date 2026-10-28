import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env.js'
import { requireAuth, requireRole } from '../auth/auth.middleware.js'
import { User } from '../auth/models/User.js'
import { CompanySettings } from '../settings/models/CompanySettings.js'
import { getOrCreateCompanySettings } from '../settings/settings.service.js'
import { clearDriveTokenCache, getOAuthAccessToken } from '../quotes/drive.service.js'
import { decryptDriveRefreshToken, encryptDriveRefreshToken } from './token-crypto.js'

export const driveRouter = Router()
const STATE_COOKIE = 'qsf_drive_oauth_state'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
function cookieOptions() {
  return { httpOnly: true, secure: env.isProduction, sameSite: 'lax', path: '/api/drive/oauth', maxAge: 10 * 60 * 1000 }
}

function clearStateCookie(res) {
  return res.clearCookie(STATE_COOKIE, { httpOnly: true, secure: env.isProduction, sameSite: 'lax', path: '/api/drive/oauth' })
}

function finishOAuth(res, result) {
  clearStateCookie(res)
  return res.redirect(303, `${env.clientUrl}/settings/company?drive=${encodeURIComponent(result)}`)
}

driveRouter.get('/oauth/status', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const settings = await getOrCreateCompanySettings()
    const oauthSettings = settings.driveOAuth
    return res.json({
      ok: true,
      data: {
        configured: Boolean(env.googleOAuth),
        connected: Boolean(oauthSettings?.refreshTokenCiphertext),
        accountEmail: oauthSettings?.accountEmail || '',
        connectedAt: oauthSettings?.linkedAt || null,
        folderId: oauthSettings?.folderId || '',
        folderName: oauthSettings?.folderName || '',
        redirectUri: env.googleOAuth?.redirectUri || null,
      },
      error: null,
    })
  } catch (error) { return next(error) }
})

driveRouter.get('/oauth/start', requireAuth, requireRole('admin'), (req, res) => {
  if (!env.googleOAuth) return finishOAuth(res, 'not_configured')
  const nonce = randomBytes(32).toString('base64url')
  const state = jwt.sign({ typ: 'google-drive-oauth', sub: String(req.authUser._id), nonce }, env.accessTokenSecret, { expiresIn: '10m' })
  res.cookie(STATE_COOKIE, nonce, cookieOptions())
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.googleOAuth.clientId)
  url.searchParams.set('redirect_uri', env.googleOAuth.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', state)
  return res.redirect(302, url.toString())
})

driveRouter.get('/oauth/callback', async (req, res) => {
  const token = String(req.query.state || '')
  const cookieNonce = req.cookies?.[STATE_COOKIE]
  if (req.query.error) return finishOAuth(res, 'cancelled')
  if (!token || !cookieNonce) return finishOAuth(res, 'invalid_state')

  let state
  try { state = jwt.verify(token, env.accessTokenSecret) }
  catch { return finishOAuth(res, 'invalid_state') }
  if (state.typ !== 'google-drive-oauth' || typeof state.sub !== 'string' || state.nonce !== cookieNonce) return finishOAuth(res, 'invalid_state')

  try {
    const admin = await User.findOne({ _id: state.sub, role: 'admin', isActive: true }).select('_id').lean()
    if (!admin) return finishOAuth(res, 'admin_required')
    if (!env.googleOAuth || typeof req.query.code !== 'string') return finishOAuth(res, 'not_configured')

    const tokenResponse = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: env.googleOAuth.clientId,
        client_secret: env.googleOAuth.clientSecret,
        redirect_uri: env.googleOAuth.redirectUri,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const tokens = await tokenResponse.json().catch(() => ({}))
    if (!tokenResponse.ok || typeof tokens.access_token !== 'string') return finishOAuth(res, 'token_exchange_failed')

    const existing = await CompanySettings.findById('company').select('driveOAuth').lean()
    let refreshToken = tokens.refresh_token
    if (!refreshToken && existing?.driveOAuth) {
      try { refreshToken = decryptDriveRefreshToken(existing.driveOAuth) } catch { /* require new consent token below */ }
    }
    if (!refreshToken) return finishOAuth(res, 'refresh_token_missing')

    const identityResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10_000) })
    const identity = identityResponse.ok ? await identityResponse.json().catch(() => ({})) : {}
    const encrypted = encryptDriveRefreshToken(refreshToken)
    await CompanySettings.findOneAndUpdate(
      { _id: 'company' },
      { $set: { driveOAuth: { ...encrypted, accountEmail: identity.email || '', linkedAt: new Date() }, updatedBy: admin._id } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )
    clearDriveTokenCache()
    return finishOAuth(res, 'connected')
  } catch {
    return finishOAuth(res, 'connection_failed')
  }
})

driveRouter.get('/oauth/picker-token', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    if (!env.googleOAuth?.pickerApiKey || !env.googleOAuth?.pickerAppId) return res.status(503).json({ ok: false, data: null, error: { code: 'DRIVE_PICKER_NOT_CONFIGURED', message: 'Configura la API key y el ID del proyecto para Google Picker.' } })
    const accessToken = await getOAuthAccessToken()
    return res.json({ ok: true, data: { accessToken, apiKey: env.googleOAuth.pickerApiKey, appId: env.googleOAuth.pickerAppId }, error: null })
  } catch (error) { return next(error) }
})

driveRouter.post('/oauth/folder', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const folderId = typeof req.body?.folderId === 'string' ? req.body.folderId.trim() : ''
    if (!/^[\w-]{10,200}$/.test(folderId)) return res.status(400).json({ ok: false, data: null, error: { code: 'INVALID_FOLDER', message: 'Selecciona una carpeta válida de Google Drive.' } })
    const accessToken = await getOAuthAccessToken()
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}`)
    url.searchParams.set('fields', 'id,name,mimeType,capabilities(canAddChildren)')
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) })
    const folder = await response.json().catch(() => ({}))
    if (!response.ok || folder.mimeType !== 'application/vnd.google-apps.folder' || folder.capabilities?.canAddChildren === false) {
      return res.status(400).json({ ok: false, data: null, error: { code: 'FOLDER_NOT_WRITABLE', message: 'Google no permitió seleccionar esa carpeta. Elige una carpeta propia donde puedas crear archivos.' } })
    }
    await CompanySettings.updateOne({ _id: 'company', 'driveOAuth.refreshTokenCiphertext': { $exists: true } }, { $set: { 'driveOAuth.folderId': folder.id, 'driveOAuth.folderName': folder.name || 'Carpeta de cotizaciones' } })
    return res.json({ ok: true, data: { folderId: folder.id, folderName: folder.name || '' }, error: null })
  } catch (error) { return next(error) }
})

driveRouter.post('/oauth/disconnect', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    await CompanySettings.updateOne({ _id: 'company' }, { $unset: { driveOAuth: 1 } })
    clearDriveTokenCache()
    return res.json({ ok: true, data: { connected: false }, error: null })
  } catch (error) { return next(error) }
})
