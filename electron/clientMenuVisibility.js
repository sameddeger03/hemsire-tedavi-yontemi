function normalizeStringList(value) {
  if (!Array.isArray(value)) return null
  return [...new Set(value
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean))]
}

function normalizeClientMenuVisibility(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const visiblePrintMenus = normalizeStringList(value.visiblePrintMenus)
  const restrictedPrintMenus = normalizeStringList(value.restrictedPrintMenus)
  if (!visiblePrintMenus || !restrictedPrintMenus) return null

  return {
    visiblePrintMenus,
    restrictedPrintMenus,
    clinicalName: typeof value.clinicalName === 'string' ? value.clinicalName.trim() : '',
    usageTerms: typeof value.usageTerms === 'string' ? value.usageTerms.trim() : ''
  }
}

module.exports = { normalizeClientMenuVisibility, normalizeStringList }
