import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateLineTotal, parseQuantity } from './quotes.service.js'

test('interpreta kilogramos con precisión de hasta tres decimales', () => {
  assert.deepEqual(parseQuantity('1.250', 'kg'), { milli: 1250, normalized: '1.25' })
  assert.deepEqual(parseQuantity('0.125', 'kg'), { milli: 125, normalized: '0.125' })
})

test('solo acepta cantidades enteras para unidades', () => {
  assert.deepEqual(parseQuantity('3', 'und'), { milli: 3000, normalized: '3' })
  assert.throws(() => parseQuantity('1.5', 'und'), { code: 'INVALID_QUANTITY' })
  assert.throws(() => parseQuantity('0', 'kg'), { code: 'INVALID_QUANTITY' })
})

test('calcula el subtotal en COP con redondeo entero en el servidor', () => {
  assert.equal(calculateLineTotal(15000, 1250), 18750)
  assert.equal(calculateLineTotal(15001, 1250), 18751)
  assert.equal(calculateLineTotal(1000, 500), 500)
})
