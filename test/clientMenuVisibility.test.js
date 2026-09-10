const { normalizeClientMenuVisibility, normalizeStringList } = require('../electron/clientMenuVisibility')

describe('client menu visibility cache', () => {
  test('normalizes, trims and deduplicates menu keys', () => {
    expect(normalizeClientMenuVisibility({
      visiblePrintMenus: [' enjektor ', 'enjektor', '', 42],
      restrictedPrintMenus: ['yatis', ' agizBakim '],
      clinicalName: ' Pediatri Kemik İliği Nakil Kliniği ',
      usageTerms: ' Kullanım koşulları '
    })).toEqual({
      visiblePrintMenus: ['enjektor'],
      restrictedPrintMenus: ['yatis', 'agizBakim'],
      clinicalName: 'Pediatri Kemik İliği Nakil Kliniği',
      usageTerms: 'Kullanım koşulları'
    })
  })

  test('accepts empty menu lists', () => {
    expect(normalizeClientMenuVisibility({
      visiblePrintMenus: [],
      restrictedPrintMenus: [],
      clinicalName: ''
    })).toEqual({ visiblePrintMenus: [], restrictedPrintMenus: [], clinicalName: '', usageTerms: '' })
  })

  test('rejects incomplete server responses so the existing cache can be kept', () => {
    expect(normalizeClientMenuVisibility(null)).toBeNull()
    expect(normalizeClientMenuVisibility({ visiblePrintMenus: [] })).toBeNull()
    expect(normalizeClientMenuVisibility({ restrictedPrintMenus: [] })).toBeNull()
  })

  test('rejects non-array string lists', () => {
    expect(normalizeStringList('enjektor')).toBeNull()
  })
})
