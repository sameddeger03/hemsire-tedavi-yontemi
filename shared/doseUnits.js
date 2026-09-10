const DOSE_UNITS = Object.freeze([
  { value: 'mcg', label: 'mcg', massFactorMg: 0.001, aliases: ['mcg', 'μg', 'µg', 'mikrogram'] },
  { value: 'mg', label: 'mg', massFactorMg: 1, aliases: ['mg', 'miligram'] },
  { value: 'g', label: 'g (gr)', display: 'g', massFactorMg: 1000, aliases: ['g', 'gr', 'gram'] },
  { value: 'ml', label: 'mL', display: 'mL', aliases: ['ml', 'mililitre'] },
  { value: 'flk', label: 'flk', aliases: ['flk', 'flakon'] },
  { value: 'amp', label: 'amp', aliases: ['amp', 'ampul'] },
  { value: 'tb', label: 'tb', aliases: ['tb', 'tablet', 'tbl'] },
  { value: 'adet', label: 'adet', aliases: ['adet', 'ad'] },
  { value: 'damla', label: 'damla', aliases: ['damla', 'dml'] },
  { value: 'puf', label: 'puf', aliases: ['puf', 'puff'] },
  { value: 'iu', label: 'IU', display: 'IU', aliases: ['iu', 'ü', 'u', 'unit', 'ünite', 'unite'] },
  { value: 'meq', label: 'mEq', display: 'mEq', aliases: ['meq'] },
  { value: 'mmol', label: 'mmol', aliases: ['mmol'] }
])

const unitByValue = new Map(DOSE_UNITS.map(unit => [unit.value, unit]))

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '')
}

function normalizeDoseUnit(value, fallback = '') {
  const normalized = normalizeText(value)
  if (!normalized) return unitByValue.has(fallback) ? fallback : ''
  const match = DOSE_UNITS.find(unit => unit.aliases.some(alias => normalizeText(alias) === normalized))
  return match?.value || (unitByValue.has(fallback) ? fallback : '')
}

function parseDoseAmount(value) {
  const normalized = String(value ?? '').trim().replace(',', '.')
  const fraction = normalized.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/)
  if (fraction) {
    const denominator = Number(fraction[2])
    return denominator > 0 ? Number(fraction[1]) / denominator : null
  }
  const match = normalized.match(/^\d+(?:\.\d+)?/)
  if (!match) return null
  const amount = Number(match[0])
  return Number.isFinite(amount) ? amount : null
}

function inferEmbeddedUnit(value) {
  const raw = String(value || '').trim()
  const amountPrefix = raw.match(/^(?:\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)/)?.[0] || ''
  const suffix = raw.slice(amountPrefix.length).trim().split(/[\s/]/)[0]
  return normalizeDoseUnit(suffix)
}

function parseDose(value, explicitUnit = '', fallbackUnit = 'adet') {
  const amount = parseDoseAmount(value)
  const unit = inferEmbeddedUnit(value) || normalizeDoseUnit(explicitUnit) || normalizeDoseUnit(fallbackUnit, 'adet')
  return { value: amount, unit }
}

function displayUnit(unit) {
  const definition = unitByValue.get(normalizeDoseUnit(unit))
  return definition?.display || definition?.value || ''
}

function formatDose(value, unit) {
  const amount = parseDoseAmount(value)
  if (amount == null) return ''
  const formatted = Number(amount.toFixed(4)).toString().replace('.', ',')
  const suffix = displayUnit(unit)
  return suffix ? `${formatted} ${suffix}` : formatted
}

function doseToMilligrams(value, unit) {
  const amount = parseDoseAmount(value)
  const definition = unitByValue.get(normalizeDoseUnit(unit))
  if (amount == null || !definition?.massFactorMg) return null
  return amount * definition.massFactorMg
}

function convertDoseValue(value, fromUnit, toUnit) {
  const amount = parseDoseAmount(value)
  const from = unitByValue.get(normalizeDoseUnit(fromUnit))
  const to = unitByValue.get(normalizeDoseUnit(toUnit))
  if (amount == null || !from || !to) return null
  if (from.value === to.value) return amount
  if (!from.massFactorMg || !to.massFactorMg) return null
  return amount * from.massFactorMg / to.massFactorMg
}

function normalizeMedicationDose(medication, fallbackUnit = 'adet') {
  const structuredValue = parseDoseAmount(medication?.doseValue)
  const structuredUnit = normalizeDoseUnit(medication?.doseUnit)
  const parsed = structuredValue != null && structuredUnit
    ? { value: structuredValue, unit: structuredUnit }
    : parseDose(medication?.dose, medication?.doseUnit, fallbackUnit)
  const value = parsed.value == null ? 1 : parsed.value
  return {
    value,
    unit: parsed.unit || fallbackUnit,
    display: formatDose(value, parsed.unit || fallbackUnit)
  }
}

const doseUnitDomain = {
  DOSE_UNITS,
  convertDoseValue,
  doseToMilligrams,
  formatDose,
  normalizeDoseUnit,
  normalizeMedicationDose,
  parseDose,
  parseDoseAmount
}

if (typeof globalThis !== 'undefined') globalThis.__TEDAVI_DOSE_UNITS__ = doseUnitDomain
if (typeof module !== 'undefined' && module.exports) module.exports = doseUnitDomain
