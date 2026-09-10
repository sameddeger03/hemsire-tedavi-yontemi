const { normalizeActiveIngredientKey, uniqueActiveIngredients } = require('../shared/activeIngredients')

describe('active ingredient normalization', () => {
  test('groups names case-insensitively while preserving one display value', () => {
    expect(uniqueActiveIngredients(['amphotericin b', 'amphotericin B'])).toEqual(['amphotericin b'])
  })

  test('handles Turkish casing and repeated whitespace consistently', () => {
    expect(normalizeActiveIngredientKey('  İLAÇ   ADI ')).toBe('ilaç adı')
    expect(uniqueActiveIngredients(['İLAÇ ADI', 'ilaç   adı'])).toEqual(['İLAÇ ADI'])
  })

  test('drops empty values and sorts the remaining names', () => {
    expect(uniqueActiveIngredients(['zidovudin', '', null, 'asiklovir'])).toEqual(['asiklovir', 'zidovudin'])
  })
})
