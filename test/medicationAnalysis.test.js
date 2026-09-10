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

const { findConflictingIvMedTimes } = loadViteModule('../src/domain/medicationAnalysis.js')

describe('IV ilaç saat çakışmaları', () => {
  test('yalnız uygun IV ilaçların ortak saatlerini ilaç kimliğine göre döndürür', () => {
    const meds = [
      { id: 1, route: 'IV', times: '08:00, 10:00', activeIngredient: 'ilaç a' },
      { id: 2, route: 'IV', times: '10:00, 12:00', activeIngredient: 'ilaç b' },
      { id: 3, route: 'IV', times: '10:00', activeIngredient: 'ilaç c', luezym: true },
      { id: 4, route: 'PO', times: '10:00', activeIngredient: 'ilaç d' },
      { id: 5, route: 'IV', times: '10:00', activeIngredient: 'yoksayılan' }
    ]

    const result = findConflictingIvMedTimes(meds, ['yoksayılan'])

    expect([...result.get(1)]).toEqual(['10:00'])
    expect([...result.get(2)]).toEqual(['10:00'])
    expect(result.has(3)).toBe(false)
    expect(result.has(4)).toBe(false)
    expect(result.has(5)).toBe(false)
  })
})
