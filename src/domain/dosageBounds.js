export function calculateAcceptedDoseRange(perDoseMin, perDoseMax, tolerancePercent = 2, maxDose = null) {
  const tolerance = Math.max(0, Number(tolerancePercent) || 0) / 100
  const absoluteMax = Number(maxDose) > 0 ? Number(maxDose) : null

  return {
    min: Number(perDoseMin) * (1 - tolerance),
    max: absoluteMax === null
      ? Number(perDoseMax) * (1 + tolerance)
      : Math.min(Number(perDoseMax) * (1 + tolerance), absoluteMax)
  }
}

export function doseAmountsForPeriod(dosesMg, period) {
  const validDoses = (Array.isArray(dosesMg) ? dosesMg : [])
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0)
  return period === 'day'
    ? (validDoses.length ? [validDoses.reduce((total, value) => total + value, 0)] : [])
    : validDoses
}
