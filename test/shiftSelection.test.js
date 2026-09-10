const fs = require('fs')
const path = require('path')
const Module = require('module')
const { transformSync } = require('esbuild')

function loadViteModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const compiled = transformSync(source, { format: 'cjs', loader: 'js' }).code
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(compiled, filename)
  return loaded.exports
}

const {
  cloneDefaultShifts,
  filterTimesByShift,
  normalizeShifts,
  shiftForTime,
  shiftHourColumns,
  validateShifts
} = loadViteModule('../src/domain/shiftSelection.js')

describe('başlangıç vardiyası', () => {
  test.each([
    [8, 29, 'gece'],
    [8, 30, 'gunduz'],
    [12, 0, 'gunduz'],
    [16, 29, 'gunduz'],
    [16, 30, 'gece'],
    [23, 0, 'gece'],
    [0, 0, 'gece']
  ])('%s:%s için %s seçer', (hour, minute, expected) => {
    expect(shiftForTime(new Date(2026, 7, 3, hour, minute))).toBe(expected)
  })
})

describe('çoklu vardiya düzeni', () => {
  const threeShifts = [
    { id: 'sabah', name: 'Sabah', start: '08:00', end: '16:00' },
    { id: 'aksam', name: 'Akşam', start: '16:00', end: '00:00' },
    { id: 'gece', name: 'Gece', start: '00:00', end: '08:00' }
  ]

  test('üç vardiyanın 24 saati kapsamasını kabul eder', () => {
    expect(validateShifts(threeShifts)).toEqual({ valid: true, error: '' })
    expect(shiftForTime(new Date(2026, 7, 3, 16, 0), threeShifts)).toBe('aksam')
    expect(shiftForTime(new Date(2026, 7, 3, 0, 0), threeShifts)).toBe('gece')
  })

  test('boşluğu reddeder', () => {
    const gap = threeShifts.map(shift => ({ ...shift }))
    gap[1].start = '16:30'
    expect(validateShifts(gap).valid).toBe(false)
    expect(validateShifts(gap).error).toContain('boşluk')
  })

  test('farklı personel gruplarının çakışan vardiyalarını kabul eder', () => {
    const overlappingShifts = [
      { id: 'gunduz', name: "Gündüz Shift'i", start: '08:30', end: '16:30' },
      { id: 'gece', name: "Gece Shift'i", start: '16:30', end: '08:30' },
      { id: 'isci', name: 'İşçi Mesaisi', start: '08:00', end: '20:00' }
    ]
    expect(validateShifts(overlappingShifts)).toEqual({ valid: true, error: '' })
    expect(shiftForTime(new Date(2026, 7, 3, 9, 0), overlappingShifts)).toBe('gunduz')
    expect(filterTimesByShift(['08:00', '12:00', '19:59', '20:00'], 'isci', overlappingShifts)).toEqual(['08:00', '12:00', '19:59'])
  })

  test('sınır saatini yalnız başlayan vardiyaya dahil eder', () => {
    const times = ['07:59', '08:00', '15:59', '16:00', '23:59', '00:00']
    expect(filterTimesByShift(times, 'sabah', threeShifts)).toEqual(['08:00', '15:59'])
    expect(filterTimesByShift(times, 'aksam', threeShifts)).toEqual(['16:00', '23:59'])
    expect(filterTimesByShift(times, 'gece', threeShifts)).toEqual(['07:59', '00:00'])
  })

  test('tedavi şeması saat sütunlarını vardiyadan üretir', () => {
    expect(shiftHourColumns('sabah', threeShifts)).toEqual([8, 9, 10, 11, 12, 13, 14, 15])
    expect(shiftHourColumns('aksam', threeShifts)).toEqual([16, 17, 18, 19, 20, 21, 22, 23])
    expect(shiftHourColumns('gece', threeShifts)).toEqual([24, 1, 2, 3, 4, 5, 6, 7])
  })

  test('tek bir 24 saatlik vardiyayı destekler', () => {
    const fullDay = [{ id: 'nobet24', name: '24 Saat Nöbeti', start: '08:00', end: '08:00' }]
    expect(validateShifts(fullDay)).toEqual({ valid: true, error: '' })
    expect(shiftForTime(new Date(2026, 7, 3, 2, 0), fullDay)).toBe('nobet24')
    expect(filterTimesByShift(['00:00', '08:00', '23:59'], 'nobet24', fullDay)).toEqual(['00:00', '08:00', '23:59'])
    expect(shiftHourColumns('nobet24', fullDay)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 1, 2, 3, 4, 5, 6, 7])
  })

  test('dörtten fazla vardiyaya üst sınır koymaz', () => {
    const manyShifts = Array.from({ length: 7 }, (_, index) => ({
      id: `vardiya-${index}`,
      name: `Vardiya ${index + 1}`,
      start: '00:00',
      end: '00:00'
    }))
    expect(validateShifts(manyShifts)).toEqual({ valid: true, error: '' })
  })

  test('bozuk kayıtları güvenli varsayılanlara döndürür', () => {
    expect(normalizeShifts([])).toEqual(cloneDefaultShifts())
  })
})
