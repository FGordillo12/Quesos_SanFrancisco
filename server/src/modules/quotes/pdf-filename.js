function safeFilenamePart(value, maxLength) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, maxLength)
}

export function quotePdfFilename(quote) {
  const storeName = safeFilenamePart(quote?.store?.name, 60) || 'Almacen'
  const number = safeFilenamePart(quote?.number, 30) || 'Factura'
  return `${storeName}_${number}.pdf`
}
