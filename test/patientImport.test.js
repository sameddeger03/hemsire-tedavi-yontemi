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

const { applyImportedPatient, importedPatientLabel } = loadViteModule('../src/domain/patientImport.js')

test('yalnızca panodan okunabilen alanları forma uygular', () => {
  const form = { name: 'ELLE GİRİLEN', patientNo: '', gender: 'Erkek', birthDate: '', height: '170', weight: '60' }

  applyImportedPatient(form, { patientNo: '638879', gender: 'Kadın' })

  expect(form).toEqual({
    name: 'ELLE GİRİLEN',
    patientNo: '638879',
    gender: 'Kadın',
    birthDate: '',
    height: '170',
    weight: '60'
  })
})

test('seçim satırı için mevcut hasta bilgileriyle anlaşılır etiket üretir', () => {
  expect(importedPatientLabel({ name: 'FADİME ÖZİŞ', gender: 'Kadın', birthDate: '2006-02-04' }, 0))
    .toBe('FADİME ÖZİŞ · Kadın · 2006-02-04')
  expect(importedPatientLabel({ patientNo: '638879' }, 1)).toBe('Hasta No: 638879')
})
