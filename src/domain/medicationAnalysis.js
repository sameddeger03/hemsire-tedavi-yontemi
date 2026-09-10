export function findConflictingIvMedTimes(meds, ignoredActiveIngredients = []) {
  const ignored = new Set(ignoredActiveIngredients.map(value => value.toLowerCase().trim()))
  const ivMeds = meds.filter(med =>
    med.route === 'IV' &&
    !med.luezym &&
    !ignored.has(normalizeIngredient(med.activeIngredient))
  )
  const conflicts = new Map()
  for (let i = 0; i < ivMeds.length; i++) {
    const timesA = splitTimes(ivMeds[i].times)
    for (let j = i + 1; j < ivMeds.length; j++) {
      const timesB = splitTimes(ivMeds[j].times)
      for (const time of timesA.filter(value => timesB.includes(value))) {
        if (!conflicts.has(ivMeds[i].id)) conflicts.set(ivMeds[i].id, new Set())
        if (!conflicts.has(ivMeds[j].id)) conflicts.set(ivMeds[j].id, new Set())
        conflicts.get(ivMeds[i].id).add(time)
        conflicts.get(ivMeds[j].id).add(time)
      }
    }
  }
  return conflicts
}

export function findConflictingIvMedIds(meds, ignoredActiveIngredients = []) {
  return new Set(findConflictingIvMedTimes(meds, ignoredActiveIngredients).keys())
}

export function findExpiredMedIds(meds, now = new Date()) {
  const expired = new Set()
  for (const med of meds) {
    if ((med.condition || 'standard') !== 'dateRange') continue
    const condition = med.conditionData || {}
    if (!condition.start || !condition.end) continue
    const times = splitTimes(med.times)
    if (!times.length) continue
    const latestTime = times.reduce((a, b) => a > b ? a : b)
    if (new Date(`${condition.end}T${latestTime}`) < now) expired.add(med.id)
  }
  return expired
}

export function findNonMatchingMedIds(meds, matchesCondition, date = new Date()) {
  const nonMatching = new Set()
  for (const med of meds) {
    const condition = med.condition || 'standard'
    if (condition === 'standard' || condition === 'dateRange') continue
    if (!matchesCondition(med, date)) nonMatching.add(med.id)
  }
  return nonMatching
}

export function findDuplicateActiveIngredientMedIds(meds) {
  const counts = new Map()
  for (const med of meds) {
    const ingredient = normalizeIngredient(med.activeIngredient)
    if (ingredient) counts.set(ingredient, (counts.get(ingredient) || 0) + 1)
  }
  return new Set(meds
    .filter(med => counts.get(normalizeIngredient(med.activeIngredient)) > 1)
    .map(med => med.id))
}

function splitTimes(times = '') {
  return times.split(',').map(time => time.trim()).filter(Boolean)
}

function normalizeIngredient(value = '') {
  return value.toLowerCase().trim()
}
