export const DEFAULT_SHIFTS = Object.freeze([
  Object.freeze({ id: 'gunduz', name: "Gündüz Shift'i", start: '08:30', end: '16:30' }),
  Object.freeze({ id: 'gece', name: "Gece Shift'i", start: '16:30', end: '08:30' })
])

export function cloneDefaultShifts() {
  return DEFAULT_SHIFTS.map(shift => ({ ...shift }))
}

export function timeToMinutes(value) {
  const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

export function isMinuteInShift(minute, shift) {
  const start = timeToMinutes(shift?.start)
  const end = timeToMinutes(shift?.end)
  if (start === null || end === null) return false
  if (start === end) return true
  if (start < end) return minute >= start && minute < end
  return minute >= start || minute < end
}

export function validateShifts(shifts) {
  if (!Array.isArray(shifts) || shifts.length < 1) {
    return { valid: false, error: 'En az 1 vardiya tanımlayın.' }
  }

  const ids = new Set()
  const names = new Set()
  for (const shift of shifts) {
    const id = String(shift?.id || '').trim()
    const name = String(shift?.name || '').trim()
    if (!id || ids.has(id)) return { valid: false, error: 'Vardiya kimlikleri benzersiz olmalıdır.' }
    if (!name) return { valid: false, error: 'Her vardiyaya bir ad verin.' }
    const nameKey = name.toLocaleLowerCase('tr-TR')
    if (names.has(nameKey)) return { valid: false, error: 'Vardiya adları birbirinden farklı olmalıdır.' }
    if (timeToMinutes(shift.start) === null || timeToMinutes(shift.end) === null) {
      return { valid: false, error: 'Başlangıç ve bitiş saatlerini eksiksiz girin.' }
    }
    ids.add(id)
    names.add(nameKey)
  }

  for (let minute = 0; minute < 24 * 60; minute++) {
    const coverage = shifts.reduce((count, shift) => count + (isMinuteInShift(minute, shift) ? 1 : 0), 0)
    if (coverage === 0) return { valid: false, error: 'Vardiyalar 24 saati boşluk bırakmadan kapsamalıdır.' }
  }

  return { valid: true, error: '' }
}

export function normalizeShifts(shifts) {
  if (!validateShifts(shifts).valid) return cloneDefaultShifts()
  return shifts.map(shift => ({
    id: String(shift.id).trim(),
    name: String(shift.name).trim(),
    start: shift.start,
    end: shift.end
  }))
}

export function shiftForTime(date = new Date(), shifts = DEFAULT_SHIFTS) {
  const normalized = normalizeShifts(shifts)
  const minutes = date.getHours() * 60 + date.getMinutes()
  return normalized.find(shift => isMinuteInShift(minutes, shift))?.id || normalized[0].id
}

export function filterTimesByShift(times, shiftId, shifts = DEFAULT_SHIFTS) {
  const selected = normalizeShifts(shifts).find(shift => shift.id === shiftId)
  if (!selected) return []
  return (Array.isArray(times) ? times : []).filter(time => {
    const minutes = timeToMinutes(time)
    return minutes !== null && isMinuteInShift(minutes, selected)
  })
}

export function shiftHourColumns(shiftId, shifts = DEFAULT_SHIFTS) {
  const selected = normalizeShifts(shifts).find(shift => shift.id === shiftId)
  if (!selected) return []
  const start = timeToMinutes(selected.start)
  const end = timeToMinutes(selected.end)
  const duration = start === end ? 24 * 60 : (end - start + 24 * 60) % (24 * 60)
  const columns = []
  const seen = new Set()
  for (let offset = 0; offset < duration; offset++) {
    const hour = Math.floor(((start + offset) % (24 * 60)) / 60)
    if (!seen.has(hour)) {
      seen.add(hour)
      columns.push(hour === 0 ? 24 : hour)
    }
  }
  return columns
}
