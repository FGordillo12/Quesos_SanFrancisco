import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'
import { CompanySettings } from '../settings/models/CompanySettings.js'
import { decryptDriveRefreshToken } from '../drive/token-crypto.js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
let cachedToken = null

function driveError(code, message, status = 503) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

async function getServiceAccountAccessToken() {
  const config = env.googleDriveServiceAccount
  if (!config) throw driveError('DRIVE_NOT_CONFIGURED', 'Conecta una cuenta de Google Drive desde Empresa e impresión.')
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken

  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign({
    iss: config.clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }, config.privateKey, { algorithm: 'RS256' })
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.access_token !== 'string') {
    throw driveError('DRIVE_AUTH_FAILED', 'Google Drive rechazó la autenticación. Revisa las credenciales y permisos configurados.', 502)
  }
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 }
  return cachedToken.accessToken
}

export async function getOAuthAccessToken() {
  const config = env.googleOAuth
  const settings = await CompanySettings.findById('company').select('driveOAuth').lean()
  if (!config || !settings?.driveOAuth) throw driveError('DRIVE_OAUTH_NOT_CONNECTED', 'Conecta tu cuenta personal de Google Drive desde Empresa e impresión.')
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken
  let refreshToken
  try { refreshToken = decryptDriveRefreshToken(settings.driveOAuth) }
  catch { throw driveError('DRIVE_TOKEN_INVALID', 'La conexión con Google Drive venció. Desconéctala y vuelve a conectarla.') }
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.access_token !== 'string') {
    throw driveError('DRIVE_REFRESH_FAILED', 'Google Drive necesita reconectarse. Ve a Empresa e impresión y conecta de nuevo tu cuenta.', 502)
  }
  cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 }
  return cachedToken.accessToken
}

export function clearDriveTokenCache() { cachedToken = null }

async function getAccessToken() {
  return env.googleOAuth ? getOAuthAccessToken() : getServiceAccountAccessToken()
}

export async function uploadQuotePdf({ quote, pdf }) {
  const oauthSettings = env.googleOAuth ? await CompanySettings.findById('company').select('driveOAuth.folderId').lean() : null
  const folderId = env.googleOAuth ? oauthSettings?.driveOAuth?.folderId : env.googleDriveFolderId
  if (!folderId) throw driveError('DRIVE_FOLDER_NOT_CONFIGURED', 'Conecta Google Drive y selecciona la carpeta de destino desde Empresa e impresión.')
  const accessToken = await getAccessToken()
  const boundary = `qsf_${randomUUID().replaceAll('-', '')}`
  const metadata = {
    name: `${quote.number}.pdf`,
    mimeType: 'application/pdf',
    parents: [folderId],
    description: `Cotización ${quote.number} · Quesos San Francisco`,
  }
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/pdf\r\nContent-Transfer-Encoding: binary\r\n\r\n`),
    pdf,
    Buffer.from(`\r\n--${boundary}--`),
  ])
  const url = new URL(DRIVE_UPLOAD_URL)
  url.searchParams.set('uploadType', 'multipart')
  url.searchParams.set('supportsAllDrives', 'true')
  url.searchParams.set('fields', 'id,name,webViewLink')
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw driveError('DRIVE_UPLOAD_FAILED', 'No se pudo conectar con Google Drive. Inténtalo de nuevo.', 502)
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.id !== 'string') {
    const reason = data.error?.errors?.[0]?.reason
    if (reason === 'storageQuotaExceeded' && !env.googleOAuth) {
      throw driveError('DRIVE_SERVICE_ACCOUNT_NO_QUOTA', 'Google no permite a las cuentas de servicio guardar archivos en Mi unidad porque no tienen cuota propia. Para ese destino se requiere OAuth con una cuenta de usuario; la alternativa es una unidad compartida.', 502)
    }
    throw driveError('DRIVE_UPLOAD_FAILED', 'Google Drive no pudo guardar el PDF. Verifica que la cuenta de servicio tenga permiso de editor y que el destino admita archivos nuevos.', 502)
  }
  return { id: data.id, webViewLink: data.webViewLink || '' }
}

export async function deleteQuotePdf(fileId) {
  if (typeof fileId !== 'string' || !fileId) return
  const accessToken = await getAccessToken()
  const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?supportsAllDrives=true`
  let response
  try {
    response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw driveError('DRIVE_DELETE_FAILED', 'No se pudo conectar con Google Drive para eliminar una factura vencida.', 502)
  }
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw driveError('DRIVE_DELETE_FAILED', 'Google Drive no permitió eliminar una factura vencida.', 502)
  }
}
