function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('tr-TR')
}

function drugPropsCacheKey(med) {
  return [med?.name, med?.catalogBarcode, med?.route, med?.activeIngredient]
    .map(normalize)
    .join('|')
}

function filterDrugPropsCache(cache, invalidation) {
  const entries = cache && typeof cache === 'object' ? Object.entries(cache) : []
  if (!invalidation) return {}
  const names = new Set((invalidation.names || []).map(normalize))
  const barcodes = new Set((invalidation.barcodes || []).map(normalize))
  const activeIngredients = new Set((invalidation.activeIngredients || []).map(normalize))
  return Object.fromEntries(entries.filter(([key]) => {
    const [name, barcode, , activeIngredient] = key.split('|')
    return !names.has(name) && !barcodes.has(barcode) && !activeIngredients.has(activeIngredient)
  }))
}

const drugPropsCacheDomain = { drugPropsCacheKey, filterDrugPropsCache }
if (typeof globalThis !== 'undefined') globalThis.__TEDAVI_DRUG_PROPS_CACHE__ = drugPropsCacheDomain
if (typeof module !== 'undefined' && module.exports) module.exports = drugPropsCacheDomain
