import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPaymentUpdate, buildReportMatch, getSeriesUnit, resolveReportRange, summarizeAggregateRows } from './reports.service.js'

test('resume totales y ticket promedio sin resultados', () => {
  assert.deepEqual(summarizeAggregateRows([]), {
    totalVendido: 0, totalPagado: 0, totalPendiente: 0, numeroFacturas: 0,
    facturasPagadas: 0, facturasPendientes: 0, ticketPromedio: 0,
  })
})

test('calcula totales y ticket promedio de la agregación', () => {
  assert.deepEqual(summarizeAggregateRows([{ totalVendido: 300, totalPagado: 100, totalPendiente: 200, numeroFacturas: 2, facturasPagadas: 1, facturasPendientes: 1 }]), {
    totalVendido: 300, totalPagado: 100, totalPendiente: 200, numeroFacturas: 2,
    facturasPagadas: 1, facturasPendientes: 1, ticketPromedio: 150,
  })
})

test('marca la fecha de pago al pagar y la limpia al volver a pendiente', () => {
  const paidAt = new Date('2026-11-17T10:00:00Z')
  assert.deepEqual(buildPaymentUpdate('pagado', paidAt), { paymentStatus: 'pagado', paidAt })
  assert.deepEqual(buildPaymentUpdate('pendiente', paidAt), { paymentStatus: 'pendiente', paidAt: null })
})

test('limita todos los reportes al cliente registrado cuando se selecciona', () => {
  const range = { start: new Date('2026-11-01T05:00:00Z'), end: new Date('2026-12-01T05:00:00Z') }
  const match = buildReportMatch(range, 'pagado', '64b000000000000000000123')
  assert.equal(match['store.storeId'].toString(), '64b000000000000000000123')
  assert.equal(match.paymentStatus, 'pagado')
  assert.equal(match.date.$gte, range.start)
})

test('crea rangos según calendario de Bogotá y unidad para la gráfica', () => {
  const today = resolveReportRange({ periodo: 'hoy', now: new Date('2026-11-17T14:00:00Z') })
  assert.equal(today.start.toISOString(), '2026-11-17T05:00:00.000Z')
  assert.equal(today.end.toISOString(), '2026-11-18T05:00:00.000Z')
  const month = resolveReportRange({ periodo: 'mes', now: new Date('2026-11-17T14:00:00Z') })
  assert.equal(month.end.toISOString(), '2026-11-18T05:00:00.000Z')
  assert.equal(month.previousStart.toISOString(), '2026-10-01T05:00:00.000Z')
  assert.equal(month.previousEnd.toISOString(), '2026-10-18T05:00:00.000Z')
  assert.equal(getSeriesUnit('hoy'), 'hour')
  assert.equal(getSeriesUnit('anio'), 'month')
  assert.equal(getSeriesUnit('todo'), 'year')
  const history = resolveReportRange({ periodo: 'todo', desde: '2025-01-01', now: new Date('2026-11-17T14:00:00Z') })
  assert.equal(history.start.toISOString(), '2025-01-01T05:00:00.000Z')
  assert.equal(history.end.toISOString(), '2026-11-18T05:00:00.000Z')
})
