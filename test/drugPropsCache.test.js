const { drugPropsCacheKey, filterDrugPropsCache } = require('../shared/drugPropsCache')

test('only cache entries related to the changed drug are removed', () => {
  const changed = drugPropsCacheKey({ name: 'AAJ', catalogBarcode: '111', route: 'IV', activeIngredient: 'A' })
  const untouched = drugPropsCacheKey({ name: 'Bactrim', catalogBarcode: '222', route: 'PO', activeIngredient: 'B' })
  const cache = { [changed]: { props: { hazardous: true } }, [untouched]: { props: { coldChain: true } } }

  expect(filterDrugPropsCache(cache, { names: ['AAJ'], barcodes: ['111'], activeIngredients: ['A'] }))
    .toEqual({ [untouched]: cache[untouched] })
  expect(filterDrugPropsCache(cache)).toEqual({})
})
