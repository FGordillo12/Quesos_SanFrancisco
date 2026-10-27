import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createOpaqueToken,
  hashToken,
  normalizeEmail,
  passwordPolicyError,
  safeEqual,
} from './auth.utils.js'

test('normaliza el correo para búsquedas consistentes', () => {
  assert.equal(normalizeEmail('  VENTAS@EJEMPLO.COM '), 'ventas@ejemplo.com')
})

test('exige longitud y clases de caracteres para contraseña', () => {
  assert.match(passwordPolicyError('Corta1!'), /10 caracteres/)
  assert.match(passwordPolicyError('segurapero1!'), /mayúscula/)
  assert.match(passwordPolicyError('SeguraPero!'), /número/)
  assert.match(passwordPolicyError('SeguraPero1'), /símbolo/)
  assert.equal(passwordPolicyError('LacteoSeguro2026!'), null)
})

test('rechaza contraseñas frecuentes', () => {
  assert.match(passwordPolicyError('Password123!'), /menos común/)
})

test('genera tokens opacos aleatorios y solo almacena un hash verificable', () => {
  const first = createOpaqueToken()
  const second = createOpaqueToken()
  assert.notEqual(first, second)
  assert.match(first, /^[A-Za-z0-9_-]{40,}$/)
  assert.match(hashToken(first), /^[a-f0-9]{64}$/)
  assert.notEqual(hashToken(first), first)
  assert.equal(hashToken(first), hashToken(first))
})

test('compara tokens CSRF sin aceptar valores ausentes o diferentes', () => {
  assert.equal(safeEqual('same-token', 'same-token'), true)
  assert.equal(safeEqual('token-a', 'token-b'), false)
  assert.equal(safeEqual(undefined, undefined), false)
})
