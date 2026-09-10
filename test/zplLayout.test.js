const fs = require('fs')
const path = require('path')
const vm = require('vm')

function loadModule() {
  const file = path.join(__dirname, '../src/domain/zplLayout.js')
  const source = fs.readFileSync(file, 'utf8')
    .replace('export function normalizeLabelOffset', 'function normalizeLabelOffset')
    .replace('export function buildLabelHome', 'function buildLabelHome')
    .replace('export function buildMultilineZplFields', 'function buildMultilineZplFields')
    .concat('\nmodule.exports = { buildLabelHome, buildMultilineZplFields, normalizeLabelOffset }')
  const context = { module: { exports: {} }, exports: {} }
  vm.runInNewContext(source, context)
  return context.module.exports
}

describe('buildMultilineZplFields', () => {
  const { buildLabelHome, buildMultilineZplFields, normalizeLabelOffset } = loadModule()

  test('küçük etiket başlangıcını ayarlanabilir, büyük etiketi sabit tutar', () => {
    expect(buildLabelHome(false)).toBe('^LH45,15')
    expect(buildLabelHome(false, 52, 18)).toBe('^LH52,18')
    expect(buildLabelHome(false, 52, 18, 0, 0, 5)).toBe('^LH57,18')
    expect(buildLabelHome(false, 52, 18, 0, 0, 0, -10)).toBe('^LH52,8')
    expect(buildLabelHome(true)).toBe('^LH0,0')
    expect(buildLabelHome(true, 45, 15, 7, 9)).toBe('^LH7,9')
  })

  test('geçersiz etiket başlangıçlarını güvenli aralığa çeker', () => {
    expect(normalizeLabelOffset('bozuk', 45)).toBe(45)
    expect(buildLabelHome(false, 999, -999)).toBe('^LH100,-100')
  })

  test('her satırı ayrı bir ZPL alanına yerleştirir', () => {
    expect(buildMultilineZplFields('Birinci\nİkinci', { x: 20, y: 5, lineHeight: 30, font: '^CFS,26' }))
      .toBe('^CFS,26^FO20,5^FDBirinci^FS\n^CFS,26^FO20,35^FDİkinci^FS')
  })

  test('boş satırın dikey yerini korur ve satır sınırını uygular', () => {
    expect(buildMultilineZplFields('A\n\nC\nD\nE', { maxLines: 4 }))
      .toBe('^CF0,48^FO10,10^FDA^FS\n^CF0,48^FO10,106^FDC^FS\n^CF0,48^FO10,154^FDD^FS')
  })
})
