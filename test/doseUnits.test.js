const {
  convertDoseValue,
  doseToMilligrams,
  formatDose,
  normalizeDoseUnit,
  normalizeMedicationDose,
  parseDose
} = require('../shared/doseUnits')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

describe('structured medication dose units', () => {
  test('tarayıcı ortamında CommonJS globali olmadan yüklenir', () => {
    const context = {}
    vm.createContext(context)
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/doseUnits.js'), 'utf8'), context)
    expect(context.__TEDAVI_DOSE_UNITS__.formatDose(500, 'mg')).toBe('500 mg')
  })

  test.each([
    ['1gr', 1, 'g', 1000],
    ['1 g', 1, 'g', 1000],
    ['500mg', 500, 'mg', 500],
    ['500 mcg', 500, 'mcg', 0.5],
    ['1/2 tb', 0.5, 'tb', null]
  ])('parses %s safely', (input, value, unit, mg) => {
    const parsed = parseDose(input)
    expect(parsed).toEqual({ value, unit })
    expect(doseToMilligrams(parsed.value, parsed.unit)).toBe(mg)
  })

  test('normalizes supported Turkish aliases', () => {
    expect(normalizeDoseUnit('Flakon')).toBe('flk')
    expect(normalizeDoseUnit('DML')).toBe('damla')
    expect(normalizeDoseUnit('Ünite')).toBe('iu')
  })

  test('preserves structured values and migrates legacy display values', () => {
    expect(normalizeMedicationDose({ doseValue: 2, doseUnit: 'flk', dose: 'eski' })).toEqual({ value: 2, unit: 'flk', display: '2 flk' })
    expect(normalizeMedicationDose({ dose: '1gr' })).toEqual({ value: 1, unit: 'g', display: '1 g' })
    expect(normalizeMedicationDose({ dose: '1' })).toEqual({ value: 1, unit: 'adet', display: '1 adet' })
  })

  test('formats canonical display labels', () => {
    expect(formatDose('1,5', 'g')).toBe('1,5 g')
    expect(formatDose(2, 'ml')).toBe('2 mL')
  })

  test('converts only compatible mass units', () => {
    expect(convertDoseValue(500, 'mg', 'g')).toBe(0.5)
    expect(convertDoseValue(1, 'g', 'mg')).toBe(1000)
    expect(convertDoseValue(1, 'flk', 'mg')).toBeNull()
  })
})
