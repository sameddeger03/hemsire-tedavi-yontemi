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

const { sortTreatmentLabelJobs } = loadViteModule('../src/domain/treatmentLabelOrder.js')

function job(patientOrder, patientName, displayName, route, time) {
  return { patientOrder, patientName, displayName, route, time }
}

describe('tedavi etiketi çıktı sırası', () => {
  test('ilaç adına göre aynı ilaçları art arda dizer', () => {
    const jobs = [
      job(0, 'Hasta', 'Meropenem', 'IV', '10:00'),
      job(0, 'Hasta', 'Aspirin', 'PO', '12:00'),
      job(0, 'Hasta', 'Aspirin', 'PO', '08:00')
    ]

    expect(sortTreatmentLabelJobs(jobs, { sortBy: 'name', shiftStart: '08:00' }).map(item => `${item.displayName}-${item.time}`))
      .toEqual(['Aspirin-08:00', 'Aspirin-12:00', 'Meropenem-10:00'])
  })

  test('ilaç saatine göre gece vardiyasının gerçek akışını izler', () => {
    const jobs = [
      job(0, 'Hasta', 'Gece İlacı', 'IV', '00:00'),
      job(0, 'Hasta', 'Akşam İlacı', 'IV', '20:00'),
      job(0, 'Hasta', 'Sabah İlacı', 'IV', '06:00')
    ]

    expect(sortTreatmentLabelJobs(jobs, { sortBy: 'time', shiftStart: '16:30' }).map(item => item.time))
      .toEqual(['20:00', '00:00', '06:00'])
  })

  test('karıştırma kapalıyken her hastanın etiketlerini birlikte tutar', () => {
    const jobs = [
      job(0, 'Ayşe', 'Geç', 'IV', '20:00'),
      job(1, 'Banu', 'Erken', 'IV', '17:00'),
      job(0, 'Ayşe', 'Erken', 'IV', '17:00')
    ]

    expect(sortTreatmentLabelJobs(jobs, { sortBy: 'time', mixPatients: false, shiftStart: '16:30' }).map(item => item.patientName))
      .toEqual(['Ayşe', 'Ayşe', 'Banu'])
  })

  test('karıştırmaya izin verilince bütün hastaları seçilen sıraya göre birlikte dizer', () => {
    const jobs = [
      job(0, 'Ayşe', 'Meropenem', 'IV', '20:00'),
      job(1, 'Banu', 'Aspirin', 'PO', '17:00'),
      job(0, 'Ayşe', 'Aspirin', 'PO', '18:00')
    ]

    expect(sortTreatmentLabelJobs(jobs, { sortBy: 'name', mixPatients: true, shiftStart: '16:30' }).map(item => `${item.displayName}-${item.patientName}`))
      .toEqual(['Aspirin-Banu', 'Aspirin-Ayşe', 'Meropenem-Ayşe'])
  })

  test('uygulama yolu gruplamasını hasta sınırının içinde uygular', () => {
    const jobs = [
      job(0, 'Ayşe', 'Aspirin', 'PO', '17:00'),
      job(0, 'Ayşe', 'Meropenem', 'IV', '20:00'),
      job(1, 'Banu', 'Aspirin', 'PO', '17:00'),
      job(1, 'Banu', 'Meropenem', 'IV', '20:00')
    ]

    expect(sortTreatmentLabelJobs(jobs, {
      sortBy: 'name',
      mixPatients: false,
      groupByRoute: true,
      routeOrder: ['IV', 'PO'],
      shiftStart: '16:30'
    }).map(item => `${item.patientName}-${item.route}`))
      .toEqual(['Ayşe-IV', 'Ayşe-PO', 'Banu-IV', 'Banu-PO'])
  })
})
