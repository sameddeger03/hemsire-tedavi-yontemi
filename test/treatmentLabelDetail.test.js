const fs = require('fs')
const path = require('path')
const vm = require('vm')

function loadModule() {
  const file = path.join(__dirname, '../src/domain/treatmentLabelDetail.js')
  const source = fs.readFileSync(file, 'utf8')
    .replace('export function buildSmallTreatmentLabelName', 'function buildSmallTreatmentLabelName')
    .replace('export function buildTreatmentLabelDetailField', 'function buildTreatmentLabelDetailField')
    .concat('\nmodule.exports = { buildSmallTreatmentLabelName, buildTreatmentLabelDetailField }')
  const context = { module: { exports: {} }, exports: {} }
  vm.runInNewContext(source, context)
  return context.module.exports
}

describe('buildTreatmentLabelDetailField', () => {
  const { buildSmallTreatmentLabelName, buildTreatmentLabelDetailField } = loadModule()

  test('limits the small-label medicine name to 10 characters', () => {
    expect(buildSmallTreatmentLabelName('Mikostatin')).toBe('Mikostatin')
    expect(buildSmallTreatmentLabelName('Metotreksat')).toBe('Metotreksa')
  })

  test('places catalog detail at the lower-left of a large treatment label', () => {
    expect(buildTreatmentLabelDetailField('2.0 FİBRE ÇİLEK', true))
      .toBe('^ADN,18,10^FO0,215^FB450,1,0,L,0^FD2.0 FİBRE ÇİLEK^FS')
  })

  test('places catalog detail at the lower-left of a small treatment label', () => {
    expect(buildTreatmentLabelDetailField('2.0 ÇİLEK', false))
      .toBe('^ADN,18,9^FO0,121^FB190,1,0,L,0^FD2.0 ÇİLEK^FS')
  })

  test('does not print stored text when its checkbox is not selected', () => {
    expect(buildTreatmentLabelDetailField('2.0 ÇİLEK', true, false)).toBe('')
  })

  test('limits text to 20 characters and strips ZPL control characters', () => {
    const field = buildTreatmentLabelDetailField('12345678901234567890ABC', true)
    expect(field).toContain('^FD12345678901234567890^FS')
    expect(buildTreatmentLabelDetailField('2.0^XA~JA', true)).toContain('^FD2.0 XA JA^FS')
  })
})
