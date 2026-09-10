function normalizeActiveIngredientKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR')
}

function uniqueActiveIngredients(values = []) {
  const unique = new Map()

  for (const value of values) {
    const displayValue = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim()
    const key = normalizeActiveIngredientKey(displayValue)
    if (key && !unique.has(key)) unique.set(key, displayValue)
  }

  return [...unique.values()].sort((a, b) => a.localeCompare(b, 'tr-TR', { sensitivity: 'base' }))
}

module.exports = { normalizeActiveIngredientKey, uniqueActiveIngredients }
