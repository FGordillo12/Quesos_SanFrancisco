import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const commonPasswords = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'password123!',
  'p@ssw0rd!', 'qwerty123', 'qwerty12345', 'qwerty123!', 'admin123', 'admin12345',
  'letmein123', 'letmein1234', 'welcome123', 'welcome1234', 'iloveyou123',
  'abc1234567', '1234567890', '123456789a', '1q2w3e4r5t', 'q1w2e3r4t5',
  'changeme123', 'secret12345', 'trustno1234', 'monkey12345', 'dragon12345',
  'football1234', 'sunshine1234', 'princess1234', 'superman1234', 'whatever1234',
  'colombia123', 'colombia2024!', 'sanfrancisco1', 'quesos12345', 'ubate2024!',
])

export function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

export function passwordPolicyError(password) {
  if (Buffer.byteLength(password, 'utf8') > 72) return 'La contraseña supera el máximo permitido.'
  if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.'
  if (!/[A-Z]/.test(password)) return 'Agrega al menos una mayúscula.'
  if (!/[a-z]/.test(password)) return 'Agrega al menos una minúscula.'
  if (!/[0-9]/.test(password)) return 'Agrega al menos un número.'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Agrega al menos un símbolo.'
  if (commonPasswords.has(password.toLowerCase())) return 'Elige una contraseña menos común.'
  return null
}

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  }
}
