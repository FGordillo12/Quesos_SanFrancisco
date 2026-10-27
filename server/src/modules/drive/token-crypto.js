import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { env } from '../../config/env.js'

function encryptionKey() {
  return Buffer.from(hkdfSync('sha256', env.refreshTokenSecret, 'qsf-google-drive-oauth-v1', 'refresh-token', 32))
}

export function encryptDriveRefreshToken(token) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return { refreshTokenCiphertext: ciphertext.toString('base64url'), iv: iv.toString('base64url'), authTag: cipher.getAuthTag().toString('base64url') }
}

export function decryptDriveRefreshToken({ refreshTokenCiphertext, iv, authTag }) {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(authTag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(refreshTokenCiphertext, 'base64url')), decipher.final()]).toString('utf8')
}
