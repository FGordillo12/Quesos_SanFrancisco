import jwt from 'jsonwebtoken'
import { randomUUID } from 'node:crypto'
import { env } from '../../config/env.js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'
let cachedToken = null

function driveError(code, message, status = 503) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

async function getAccessToken() {
  const config = env.googleDrive
  if (!config) throw driveError('DRIVE_NOT_CONFIGURED', 'Google Drive aún no está configurado en el servidor.')
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken

  const now = Math.floor(Date.now() / 1000)
  const assertion = jwt.sign({
    iss: config.clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.file',
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

export async function uploadQuotePdf({ quote, pdf }) {
  const config = env.googleDrive
  const accessToken = await getAccessToken()
  const boundary = `qsf_${randomUUID().replaceAll('-', '')}`
  const metadata = {
    name: `${quote.number}.pdf`,
    mimeType: 'application/pdf',
    parents: [config.folderId],
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
    throw driveError('DRIVE_UPLOAD_FAILED', 'Google Drive no pudo guardar el PDF. Revisa que la carpeta esté compartida con la cuenta de servicio.', 502)
  }
  return { id: data.id, webViewLink: data.webViewLink || '' }
}
