const { formatTryPrice, normalizeBarcode } = require('../electron/selcukEcza')

describe('Selçuk Ecza price lookup', () => {
  test('accepts numeric medicine barcodes only', () => {
    expect(normalizeBarcode('8699546010028')).toBe('8699546010028')
    expect(normalizeBarcode('8699-5460-10028')).toBe('')
    expect(normalizeBarcode('https://example.com')).toBe('')
  })

  test('formats the source price as Turkish lira', () => {
    expect(formatTryPrice('83.49')).toMatch(/₺\s*83,49/)
    expect(formatTryPrice('not-a-price')).toBe('')
  })
})
