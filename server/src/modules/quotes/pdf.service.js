import PDFDocument from 'pdfkit'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Cheese } from '../catalog/models/Cheese.js'

const NAVY = '#000000'
const BRAND = '#000000'
const PALE = '#FFFFFF'
const MUTED = '#333333'
const PAYMENT_DISCLAIMER = 'Esta factura no constituye comprobante de pago ni paz y salvo.'
const LOGO_PATH = fileURLToPath(new URL('../../../assets/logo-invoice.png', import.meta.url))
const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const dateFormatter = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeZone: 'America/Bogota' })
const mmToPt = (mm) => mm * 72 / 25.4

function normalizedProfile(profile = {}) {
  return {
    format: ['letter', 'thermal80', 'thermal58'].includes(profile.format) ? profile.format : 'letter',
    marginMm: Number.isFinite(profile.marginMm) ? Math.min(25, Math.max(0, profile.marginMm)) : 10,
    fontSize: Number.isFinite(profile.fontSize) ? Math.min(14, Math.max(8, profile.fontSize)) : 9,
    showLogo: profile.showLogo !== false,
  }
}

function thermalBaseSize(profile) {
  const narrow = profile.format === 'thermal58'
  return Math.min(Math.max(profile.fontSize - 1.5, 6.5), narrow ? 8.5 : 10.5)
}

function nonEmpty(parts) { return parts.filter((value) => typeof value === 'string' && value.trim()) }

function thermalHeight(quote, company, profile) {
  const narrow = profile.format === 'thermal58'
  const baseSize = thermalBaseSize(profile)
  const lineHeight = (size) => size * 1.15
  const margin = mmToPt(profile.marginMm)
  const contentWidth = narrow ? mmToPt(48) : mmToPt(80) - margin * 2
  const maxChars = (size) => Math.max(18, Math.floor(contentWidth / (size * 0.48)))
  const lines = (value, size) => Math.max(1, Math.ceil(String(value || '').length / maxChars(size)))
  const logoSize = narrow ? mmToPt(20) : 38
  let height = margin * 2 + lineHeight(baseSize + 2) + 1

  if (profile.showLogo && existsSync(LOGO_PATH)) height += logoSize + 3
  const companyLines = nonEmpty([
    company.representative && `Representante: ${company.representative}`,
    company.location,
    company.nit && `NIT: ${company.nit}`,
    company.phone && `Tel. ${company.phone}`,
    company.email,
  ])
  height += companyLines.reduce((sum, value) => sum + lines(value, baseSize - 1) * lineHeight(baseSize - 1) + 1, 0)
  height += 1 + 4 + 4 + 4 + lineHeight(baseSize) + 3 + lineHeight(baseSize) + 2 + lineHeight(baseSize - 1) + 4 + 4

  const storeLines = quote.store.mode === 'new'
    ? [`Almacén: ${quote.store.name}`, `NIT/CC: ${quote.store.nit || ''}`, `Dirección: ${quote.store.address || ''}`, `Ciudad: ${quote.store.city || ''}`, `Teléfono: ${quote.store.phone || ''}`, `Contacto: ${quote.store.contactName || ''}`]
    : nonEmpty([`Almacén: ${quote.store.name}`, quote.store.nit && `NIT/CC: ${quote.store.nit}`, quote.store.address, quote.store.city, quote.store.phone && `Tel. ${quote.store.phone}`, quote.store.contactName && `Contacto: ${quote.store.contactName}`])
  height += storeLines.reduce((sum, value) => sum + lines(value, baseSize - 1) * lineHeight(baseSize - 1) + 1, 0) + 3 + 4 + 4

  for (const item of quote.items) {
    height += lines(item.cheeseName, baseSize) * lineHeight(baseSize) + 0.5
    height += lineHeight(baseSize + 0.5) + 0.5
    height += lineHeight(baseSize) + 1.5
  }

  height += lineHeight(baseSize + 2) + 10
  if (quote.notes) height += lineHeight(baseSize - 1) * (1 + lines(quote.notes, baseSize - 1)) + 10
  const disclaimerLines = Math.max(1, Math.ceil(PAYMENT_DISCLAIMER.length / Math.floor(contentWidth / (6 * 0.52))))
  height += 4 + lineHeight(baseSize) + 2 + disclaimerLines * lineHeight(6) + 6
  return Math.min(20_000, Math.ceil(height))
}

async function orderItemsByCatalog(items) {
  const itemsNeedingLookup = items.filter((item) => !Number.isFinite(item.sortOrder))
  const cheeseIds = itemsNeedingLookup.map((item) => item.cheese).filter(Boolean)
  const catalog = cheeseIds.length
    ? await Cheese.find({ _id: { $in: cheeseIds } }).select('_id sortOrder').lean()
    : []
  const sortOrderById = new Map(catalog.map((cheese) => [String(cheese._id), cheese.sortOrder ?? 10_000]))
  return [...items].sort((left, right) => {
    const leftOrder = Number.isFinite(left.sortOrder) ? left.sortOrder : sortOrderById.get(String(left.cheese)) ?? 10_000
    const rightOrder = Number.isFinite(right.sortOrder) ? right.sortOrder : sortOrderById.get(String(right.cheese)) ?? 10_000
    const orderDifference = leftOrder - rightOrder
    return orderDifference || left.cheeseName.localeCompare(right.cheeseName, 'es', { sensitivity: 'base', numeric: true })
  })
}

function renderThermal(doc, quote, company, profile) {
  const widthMm = profile.format === 'thermal58' ? 57 : 80
  const pageWidth = mmToPt(widthMm)
  const margin = mmToPt(profile.marginMm)
  // PT-210/PT200: 57 mm paper, 48 mm printable width (384 dots at 203 DPI).
  // Center that area on the paper and keep artwork within its 48 mm width.
  const contentWidth = profile.format === 'thermal58' ? mmToPt(48) : pageWidth - margin * 2
  const contentX = profile.format === 'thermal58' ? mmToPt((57 - 48) / 2) : margin
  const baseSize = thermalBaseSize(profile)
  let y = margin

  if (profile.showLogo && existsSync(LOGO_PATH)) {
    const logoSize = widthMm === 57 ? mmToPt(20) : 38
    doc.image(LOGO_PATH, contentX + (contentWidth - logoSize) / 2, y, { fit: [logoSize, logoSize] })
    y += logoSize + 3
  }
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(baseSize + 2).text(company.name, contentX, y, { width: contentWidth, align: 'center' })
  y = doc.y + 1
  for (const line of nonEmpty([company.representative && `Representante: ${company.representative}`, company.location, company.nit && `NIT: ${company.nit}`, company.phone && `Tel. ${company.phone}`, company.email])) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(baseSize - 1).text(line, contentX, y, { width: contentWidth, align: 'center' })
    y = doc.y + 1
  }
  y += 4
  doc.moveTo(contentX, y).lineTo(contentX + contentWidth, y).lineWidth(0.8).strokeColor(BRAND).stroke()
  y += 4
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(baseSize).text('FACTURA DE VENTA', contentX, y, { width: contentWidth, align: 'center' })
  y = doc.y + 3
  doc.font('Helvetica-Bold').fontSize(baseSize).text(quote.number, contentX, y, { width: contentWidth, align: 'center' })
  y = doc.y + 2
  doc.font('Helvetica').fontSize(baseSize - 1).fillColor(MUTED).text(dateFormatter.format(new Date(quote.date)), contentX, y, { width: contentWidth, align: 'center' })
  y = doc.y + 4
  doc.moveTo(contentX, y).lineTo(contentX + contentWidth, y).lineWidth(0.5).strokeColor('#000000').stroke()
  y += 4

  const storeDetails = quote.store.mode === 'new'
    ? [
        `Almacén: ${quote.store.name}`,
        `NIT/CC: ${quote.store.nit || ''}`,
        `Dirección: ${quote.store.address || ''}`,
        `Ciudad: ${quote.store.city || ''}`,
        `Teléfono: ${quote.store.phone || ''}`,
        `Contacto: ${quote.store.contactName || ''}`,
      ]
    : nonEmpty([
        `Almacén: ${quote.store.name}`,
        quote.store.nit && `NIT/CC: ${quote.store.nit}`,
        quote.store.address,
        quote.store.city,
        quote.store.phone && `Tel. ${quote.store.phone}`,
        quote.store.contactName && `Contacto: ${quote.store.contactName}`,
      ])
  for (const line of storeDetails) {
    doc.fillColor(NAVY).font('Helvetica').fontSize(baseSize - 1).text(line, contentX, y, { width: contentWidth })
    y = doc.y + 1
  }
  y += 3
  doc.moveTo(contentX, y).lineTo(contentX + contentWidth, y).lineWidth(0.5).strokeColor('#000000').stroke()
  y += 4

  for (const item of quote.items) {
    doc.fillColor(NAVY).font('Helvetica').fontSize(baseSize).text(item.cheeseName, contentX, y, { width: contentWidth })
    y = doc.y + 0.5
    const quantityWidth = contentWidth * 0.53
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(baseSize + 0.5)
      .text(`Cant: ${item.quantity} ${item.unit}`, contentX, y, { width: quantityWidth, lineBreak: false })
    doc.fillColor(MUTED).font('Helvetica').fontSize(baseSize - 0.5)
      .text(`Unit.: ${cop.format(item.unitPrice)}`, contentX + quantityWidth, y + 0.5, { width: contentWidth - quantityWidth, align: 'right', lineBreak: false })
    y = doc.y + 0.5
    doc.fillColor(NAVY).font('Helvetica').fontSize(baseSize)
      .text(`Subtotal: ${cop.format(item.lineTotal)}`, contentX, y, { width: contentWidth, align: 'right' })
    y = doc.y + 1.5
  }

  doc.moveTo(contentX, y).lineTo(contentX + contentWidth, y).lineWidth(0.8).strokeColor(BRAND).stroke()
  y += 5
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(baseSize + 2).text('TOTAL', contentX, y, { width: contentWidth * 0.4 })
  doc.text(cop.format(quote.total), contentX, y, { width: contentWidth, align: 'right' })
  y = doc.y + 5

  if (quote.notes) {
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(baseSize - 1).text('Observaciones', contentX, y, { width: contentWidth })
    y = doc.y + 2
    doc.fillColor(NAVY).font('Helvetica').fontSize(baseSize - 1).text(quote.notes, contentX, y, { width: contentWidth })
    y = doc.y + 8
  }
  doc.moveTo(contentX, y).lineTo(contentX + contentWidth, y).lineWidth(0.5).strokeColor('#000000').stroke()
  y += 4
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(baseSize).text('Gracias por preferirnos', contentX, y, { width: contentWidth, align: 'center' })
  doc.fillColor(MUTED).font('Helvetica').fontSize(6).text(PAYMENT_DISCLAIMER, contentX, doc.y + 2, { width: contentWidth, align: 'center' })
}

function drawLetterHeader(doc, quote, company, profile, margin, pageWidth, continuation = false) {
  const contentWidth = pageWidth - margin * 2
  let y = margin
  let detailsX = margin
  if (profile.showLogo && existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, margin, y, { fit: [64, 64] })
    detailsX += 76
  }
  const detailsWidth = pageWidth * 0.52 - (detailsX - margin)
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(company.name, detailsX, y + 1, { width: detailsWidth })
  let companyY = doc.y + 3
  for (const line of nonEmpty([company.representative && `Representante: ${company.representative}`, company.location, company.nit && `NIT: ${company.nit}`, company.phone && `Tel. ${company.phone}`, company.email])) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(line, detailsX, companyY, { width: detailsWidth })
    companyY = doc.y + 1
  }
  const infoX = margin + contentWidth * 0.63
  const infoWidth = contentWidth * 0.37
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(19).text('FACTURA DE VENTA', infoX, y + 2, { width: infoWidth, align: 'right' })
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(quote.number, infoX, doc.y + 4, { width: infoWidth, align: 'right' })
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(dateFormatter.format(new Date(quote.date)), infoX, doc.y + 3, { width: infoWidth, align: 'right' })
  y = Math.max(y + 74, companyY + 8, doc.y + 16)

  const isNewStore = quote.store.mode === 'new'
  const customerBoxHeight = isNewStore ? 104 : 66
  doc.roundedRect(margin, y, contentWidth, customerBoxHeight, 7).lineWidth(0.6).fillAndStroke(PALE, NAVY)
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(8).text('CLIENTE', margin + 12, y + 9)
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(quote.store.name, margin + 12, y + 23, { width: contentWidth - 24 })
  if (isNewStore) {
    const storeFields = [
      ['NIT/CC', quote.store.nit],
      ['Dirección', quote.store.address],
      ['Ciudad', quote.store.city],
      ['Teléfono', quote.store.phone],
      ['Contacto', quote.store.contactName],
    ]
    storeFields.forEach(([label, value], index) => {
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`${label}: ${value || ''}`, margin + 12, y + 41 + index * 11, { width: contentWidth - 24, lineBreak: false })
    })
  } else {
    const storeLines = nonEmpty([
      quote.store.nit && `NIT/CC: ${quote.store.nit}`,
      quote.store.address,
      quote.store.city,
      quote.store.phone && `Tel. ${quote.store.phone}`,
      quote.store.contactName && `Contacto: ${quote.store.contactName}`,
    ])
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(storeLines.join('  ·  '), margin + 12, y + 42, { width: contentWidth - 24, height: 18, ellipsis: true })
  }
  return y + customerBoxHeight + 16
}

function drawTableHeader(doc, margin, y, widths) {
  const height = 24
  doc.roundedRect(margin, y, widths.total, height, 4).fill(NAVY)
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8)
  doc.text('PRODUCTO', margin + 8, y + 8, { width: widths.name - 12 })
  doc.text('CANT.', margin + widths.name, y + 8, { width: widths.quantity - 6, align: 'right' })
  doc.text('VALOR UNIT.', margin + widths.name + widths.quantity, y + 8, { width: widths.unitPrice - 8, align: 'right' })
  doc.text('SUBTOTAL', margin + widths.name + widths.quantity + widths.unitPrice, y + 8, { width: widths.subtotal - 8, align: 'right' })
  return y + height
}

function renderLetter(doc, quote, company, profile) {
  const pageWidth = 612
  const pageHeight = 792
  const margin = mmToPt(profile.marginMm)
  const contentWidth = pageWidth - margin * 2
  const widths = {
    total: contentWidth,
    name: contentWidth * 0.40,
    quantity: contentWidth * 0.15,
    unitPrice: contentWidth * 0.22,
    subtotal: contentWidth * 0.23,
  }
  let pageNumber = 1
  let y = drawLetterHeader(doc, quote, company, profile, margin, pageWidth)
  y = drawTableHeader(doc, margin, y, widths) + 4

  for (const item of quote.items) {
    doc.font('Helvetica').fontSize(9)
    const rowHeight = Math.max(26, doc.heightOfString(item.cheeseName, { width: widths.name - 14 }) + 12)
    if (y + rowHeight > pageHeight - margin - 34) {
      doc.addPage({ size: 'LETTER', margin: 0 })
      pageNumber += 1
      y = drawLetterHeader(doc, quote, company, profile, margin, pageWidth, true)
      y = drawTableHeader(doc, margin, y, widths) + 4
    }
    if (pageNumber % 2 === 0) doc.rect(margin, y, contentWidth, rowHeight).fill('#FFFFFF')
    const textY = y + 7
    doc.fillColor(NAVY).font('Helvetica').fontSize(9).text(item.cheeseName, margin + 7, textY, { width: widths.name - 14, height: rowHeight - 8 })
    const quantityX = margin + widths.name
    doc.fillColor(MUTED).fontSize(8.5).text(`${item.quantity} ${item.unit}`, quantityX, textY, { width: widths.quantity - 7, align: 'right' })
    const unitX = quantityX + widths.quantity
    doc.text(cop.format(item.unitPrice), unitX, textY, { width: widths.unitPrice - 7, align: 'right' })
    const subtotalX = unitX + widths.unitPrice
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5).text(cop.format(item.lineTotal), subtotalX, textY, { width: widths.subtotal - 8, align: 'right' })
    y += rowHeight
    doc.moveTo(margin, y).lineTo(margin + contentWidth, y).lineWidth(0.4).strokeColor('#000000').stroke()
  }

  const noteHeight = quote.notes ? Math.max(38, doc.heightOfString(quote.notes, { width: contentWidth - 20, fontSize: 9 }) + 25) : 0
  if (y + 74 + noteHeight > pageHeight - margin - 30) {
    doc.addPage({ size: 'LETTER', margin: 0 })
    pageNumber += 1
    y = drawLetterHeader(doc, quote, company, profile, margin, pageWidth, true)
  }
  y += 16
  doc.roundedRect(margin + contentWidth * 0.53, y, contentWidth * 0.47, 39, 6).lineWidth(0.6).fillAndStroke(PALE, NAVY)
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text('TOTAL', margin + contentWidth * 0.55, y + 13)
  doc.fillColor(BRAND).fontSize(15).text(cop.format(quote.total), margin + contentWidth * 0.55, y + 10, { width: contentWidth * 0.41, align: 'right' })
  y += 54

  if (quote.notes) {
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text('Observaciones', margin, y)
    y = doc.y + 4
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(quote.notes, margin, y, { width: contentWidth })
    y = doc.y + 12
  }
  const thanksY = Math.min(y + 6, pageHeight - margin - 38)
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(9).text('Gracias por preferirnos', margin, thanksY, { width: contentWidth, align: 'center' })
  doc.fillColor(MUTED).font('Helvetica').fontSize(6).text(PAYMENT_DISCLAIMER, margin, thanksY + 13, { width: contentWidth, align: 'center' })

  if (doc.bufferedPageRange) {
    const range = doc.bufferedPageRange()
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index)
      doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`${quote.number} · Página ${index + 1}`, margin, pageHeight - margin - 14, { width: contentWidth, align: 'right' })
    }
  }
}

export function generateQuotePdf(quote, companySettings, printProfile = quote.printProfile) {
  const profile = normalizedProfile(printProfile)
  const company = companySettings.toObject ? companySettings.toObject() : companySettings
  const orderedQuotePromise = orderItemsByCatalog(quote.items).then((items) => ({ ...quote, items }))
  const thermal = profile.format !== 'letter'
  const widthMm = profile.format === 'thermal58' ? 57 : 80
  const size = thermal ? [mmToPt(widthMm), thermalHeight(quote, company, profile)] : 'LETTER'
  const doc = new PDFDocument({ size, margin: 0, compress: true, bufferPages: !thermal, info: { Title: `Factura ${quote.number}`, Author: company.name } })

  return new Promise((resolve, reject) => {
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      orderedQuotePromise.then((orderedQuote) => {
        if (thermal) renderThermal(doc, orderedQuote, company, profile)
        else renderLetter(doc, orderedQuote, company, profile)
        doc.end()
      }).catch(reject)
    } catch (error) { reject(error) }
  })
}
