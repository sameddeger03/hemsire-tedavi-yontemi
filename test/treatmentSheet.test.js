const fs = require('fs')
const path = require('path')
const Module = require('module')
const { transformSync } = require('esbuild')

function loadViteModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath)
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(transformSync(fs.readFileSync(filename, 'utf8'), { format: 'cjs' }).code, filename)
  return loaded.exports
}

const { buildTreatmentSheet } = loadViteModule('../src/domain/treatmentSheet.js')
const { shiftHourColumns, filterTimesByShift, DEFAULT_SHIFTS } = loadViteModule('../src/domain/shiftSelection.js')
const app = fs.readFileSync(path.join(__dirname, '../src/App.vue'), 'utf8')
const source = app.slice(app.indexOf('    generateSema('), app.indexOf('    printSema()'))
const generateSema = new Function('shiftHourColumns', 'buildTreatmentSheet', `return ({${source}}).generateSema`)(shiftHourColumns, buildTreatmentSheet)

function context() {
  return {
    patients: [{ id: 1, name: 'Deneme Hasta' }], referenceDate: '2026-09-06', shift: 'gunduz', shifts: DEFAULT_SHIFTS,
    routes: [{ val: 'IV', label: 'İntravenöz (IV)' }, { val: 'PO', label: 'Per Oral (PO)' }],
    meds: [
      { patientId: 1, name: 'Tedavi A', activeIngredient: 'ETKEN_GIZLI', dose: '10 mg', route: 'IV', times: '08:45,20:15,00:30' },
      { patientId: 1, name: 'Tedavi B', dose: '1 tb', route: 'PO', times: '12:00,16:30' },
      { patientId: 1, name: 'Gece uygulaması', dose: '5 mg', route: 'IV', times: '23:00' },
      { patientId: 1, name: 'Koşullu uygulama', dose: '2 mg', route: 'PO', times: '10:00', skipToday: true },
      { patientId: 1, name: 'Gerektiğinde', dose: '3 mg', route: 'PO', times: '', luezym: true, note: 'Gerektiğinde notu' },
      { patientId: 2, name: 'Diğer hasta', route: 'IV', times: '09:00' }
    ],
    matchesCondition: med => !med.skipToday,
    filterByShift(times, shift) { return filterTimesByShift(times, shift, this.shifts) },
    medDisplayName: med => med.name,
    medDay: () => 3
  }
}

test('schema keeps only scheduled applications in the selected shift, without losing minutes', () => {
  const html = generateSema.call(context(), 1)
  expect(html).toContain('08:45')
  expect(html).toContain('12:00')
  for (const absent of ['20:15', '00:30', '16:30', 'Gece uygulaması', 'Koşullu uygulama', 'Gerektiğinde', 'Diğer hasta']) expect(html).not.toContain(absent)
  const night = context()
  night.shift = 'gece'
  const nightHtml = generateSema.call(night, 1)
  for (const time of ['20:15', '00:30', '16:30']) expect(nightHtml).toContain(time)
  expect(nightHtml).not.toContain('08:45')
})

test('karteks uses the same layout but includes all applications, doses and PRN', () => {
  const html = generateSema.call(context(), 1, true)
  for (const value of ['KARTEKS', '08:45', '20:15', '00:30', '16:30', '23:00', 'Koşullu uygulama', 'Lüzum halinde', '10 mg', 'Gerektiğinde notu']) expect(html).toContain(value)
  for (const absent of ['ETKEN_GIZLI', '<th>Yol</th>', '>IV</td>', '>PO</td>', 'Diğer hasta']) expect(html).not.toContain(absent)
  expect(html).toContain('<col span="24">')
})

test('each route has its own table, title and column headings in landscape', () => {
  for (const all of [false, true]) {
    const html = generateSema.call(context(), 1, all)
    expect(html.match(/<table /g)).toHaveLength(2)
    expect(html.match(/<thead>/g)).toHaveLength(2)
    expect(html.match(/>Tedavi<\/th>/g)).toHaveLength(2)
    expect(html.match(/>Dozu<\/th>/g)).toHaveLength(2)
    expect(html.match(/>Uygulama Saatleri<\/th>/g)).toHaveLength(2)
    expect(html).toContain('İNTRAVENÖZ TEDAVİLER')
    expect(html).toContain('PER ORAL TEDAVİLER')
    expect(html).toContain('@page { size: A4 landscape;')
  }
})

test('empty sheets, missing patients and HTML escaping are safe', () => {
  const ctx = context()
  expect(generateSema.call(ctx, 999)).toBe('')
  ctx.meds = []
  expect(generateSema.call(ctx, 1)).toContain('Gösterilecek uygulama bulunmuyor.')
  ctx.patients[0].name = '<img src=x onerror=alert(1)>'
  ctx.meds = [{ patientId: 1, name: '<script>alert(1)</script>', dose: '5 < 10', route: '__proto__', times: '' }]
  const html = generateSema.call(ctx, 1, true)
  expect(html).not.toContain('<img')
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('Saat belirtilmemiş')
})
