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

const { buildDosageRuleIndex, findDosageRuleCandidates } = loadViteModule('../src/domain/dosageRuleIndex.js')

describe('doz kuralı indeksi', () => {
  const rules = [
    { id: 1, active_ingredient: ' Amikasin ', form: 'IV' },
    { id: 2, active_ingredient: 'amikasin', form: '' },
    { id: 3, active_ingredient: 'Asiklovir', form: 'PO' },
    { id: 4, active_ingredient: '', form: 'IV' }
  ]

  test('etken maddeyi normalize ederek yalnız ilgili kuralları döndürür', () => {
    const index = buildDosageRuleIndex(rules)
    expect(findDosageRuleCandidates(index, ' AMIKASIN ', 'IV').map(rule => rule.id)).toEqual([1, 2])
    expect(index.has('')).toBe(false)
  })

  test('uygulama formuna özel kuralı filtreler, formsuz genel kuralı korur', () => {
    const index = buildDosageRuleIndex(rules)
    expect(findDosageRuleCandidates(index, 'amikasin', 'PO').map(rule => rule.id)).toEqual([2])
  })
})
