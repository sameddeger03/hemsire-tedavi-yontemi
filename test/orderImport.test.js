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

const { importSelectedOrders } = loadViteModule('../src/domain/orderImport.js')

function createMedicationApi(catalog) {
  const saved = []
  let nextId = 40

  return {
    saved,
    async dbLookupDrugByName(name) {
      return catalog[name] || null
    },
    async dbAddMed(payload) {
      saved.push({ ...payload })
      nextId += 1
      return nextId
    }
  }
}

describe('Panodan seçilen ilaçların aktarılması', () => {
  test('yalnız katalog eşleşmelerini katalog etken maddesi ve boş başlangıç tarihiyle ekler', async () => {
    const api = createMedicationApi({
      'MEROSİD IV 1 GR': { label: 'Merosid IV 1 Gr', activeIngredient: 'Meropenem' }
    })
    const orders = [
      {
        name: 'MEROSİD IV 1 GR',
        dose: '1',
        doseValue: 1,
        doseUnit: 'adet',
        route: 'IV',
        times: '10:00',
        note: 'Test notu',
        startDate: '2026-08-02',
        panoActiveIng: 'Yanlış etken madde'
      },
      { name: 'KATALOĞA UYMAYAN', dose: '2', route: 'PO', times: '10:00', note: '' },
      { name: 'SEÇİLMEYEN', dose: '3', route: 'IM', times: '10:00', note: '' }
    ]

    const result = await importSelectedOrders({
      orders,
      selectedIndexes: [0, 1],
      patientId: 7,
      api,
      normalizeDrugName: value => value.toLocaleUpperCase('tr-TR'),
      normalizeRoute: value => value.toLowerCase()
    })

    expect(api.saved).toEqual([{
      patientId: 7,
      name: 'MEROSİD IV 1 GR',
      activeIngredient: 'MEROPENEM',
      route: 'iv',
      dose: '1',
      doseValue: 1,
      doseUnit: 'adet',
      times: '10:00',
      condition: 'standard',
      conditionData: {},
      note: 'Test notu',
      startDate: ''
    }])
    expect(result).toEqual({
      imported: [{ id: 41, ...api.saved[0] }],
      skipped: ['KATALOĞA UYMAYAN']
    })
  })

  test('hiçbir eşleşme yoksa kayıt oluşturmadan tüm seçili isimleri döndürür', async () => {
    const api = createMedicationApi({})
    const orders = [
      { name: 'BİRİNCİ', dose: '1', route: 'DGR', times: '10:00', note: '' },
      { name: 'İKİNCİ', dose: '1', route: 'DGR', times: '10:00', note: '' }
    ]

    const result = await importSelectedOrders({
      orders,
      selectedIndexes: [0, 1],
      patientId: 9,
      api,
      normalizeDrugName: value => value,
      normalizeRoute: value => value
    })

    expect(api.saved).toEqual([])
    expect(result).toEqual({ imported: [], skipped: ['BİRİNCİ', 'İKİNCİ'] })
  })
})
