import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateLineTotal, parseQuantity } from './quotes.service.js'

test('solo acepta cantidades enteras de unidades', () => {
  assert.deepEqual(parseQuantity('3'), { milli: 3000, normalized: '3' })
  assert.throws(() => parseQuantity('1.5'), { code: 'INVALID_QUANTITY' })
  assert.throws(() => parseQuantity('0'), { code: 'INVALID_QUANTITY' })
})

test('calcula el subtotal en COP con redondeo entero en el servidor', () => {
  assert.equal(calculateLineTotal(15000, 1250), 18750)
  assert.equal(calculateLineTotal(15001, 1250), 18751)
  assert.equal(calculateLineTotal(1000, 500), 500)
})
