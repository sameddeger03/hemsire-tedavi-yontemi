function normalize(value) {
  return String(value || '').toLowerCase().trim()
}

export function buildDosageRuleIndex(rules = []) {
  const index = new Map()
  for (const rule of rules) {
    const key = normalize(rule.active_ingredient)
    if (!key) continue
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(rule)
  }
  return index
}

export function findDosageRuleCandidates(index, activeIngredient, route) {
  const normalizedRoute = String(route || '').toUpperCase()
  return (index.get(normalize(activeIngredient)) || []).filter(rule =>
    !rule.form || String(rule.form).toUpperCase() === normalizedRoute
  )
}
