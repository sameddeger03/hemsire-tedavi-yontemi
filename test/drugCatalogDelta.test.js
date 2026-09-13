const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')

jest.mock('electron', () => ({
  app: { getPath: () => process.env.APPDATA },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`),
    decryptString: value => value.toString().replace(/^encrypted:/, '')
  }
}))
jest.mock('../electron/devLogger', () => ({ info: jest.fn(), success: jest.fn(), warn: jest.fn(), error: jest.fn(), errorMessage: e => e.message }))

test('catalog sync downloads only changed drugs after the initial full sync', async () => {
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'client-catalog-delta-'))
  process.env.APPDATA = appData
  let revision = 0
  let drug = {
    id: 42, label: 'TEST', label_detail: '', full_name: 'TEST 1 MG', barcode: '8690000000001',
    atc_code: 'A00', active_ingredient: 'TEST', etken_detay: '', karisimMi: false,
    mixture_content: '', sgk_odeme: false, form: 'IV', drug_type: 'TEST', properties: null
  }
  const mixtureDrug = {
    id: 43, label: 'KARISIM', label_detail: '', full_name: 'KARISIM', barcode: '',
    atc_code: '', active_ingredient: 'GLISERIN + NOVOCAIN', etken_detay: '', karisimMi: true,
    mixture_content: '30 ml Gliserin', sgk_odeme: false, form: 'PO', drug_type: 'MAGISTRAL', properties: null
  }
  let fullRequests = 0
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/drugs/check') return res.end(JSON.stringify({ updatedAt: `2026-09-13T00:00:0${revision}Z`, revision: String(revision) }))
    if (req.url.startsWith('/api/drugs/changes')) {
      return res.end(JSON.stringify({
        revision: String(revision), latestRevision: String(revision), hasMore: false,
        drugs: drug ? [drug] : [], deletedIds: drug ? [] : [42]
      }))
    }
    if (req.url === '/api/drugs/similar-names' || req.url === '/api/drugs/clinical-info') return res.end('[]')
    if (req.url.startsWith('/api/drugs?')) {
      fullRequests++
      const data = [...(drug ? [drug] : []), mixtureDrug]
      return res.end(JSON.stringify({ data, total: data.length }))
    }
    res.statusCode = 404
    res.end('{}')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))

  try {
    jest.resetModules()
    const config = require('../electron/config')
    const database = require('../electron/database')
    const apiUrl = `http://127.0.0.1:${server.address().port}/api/drugs`
    config.setMany({ apiUrl, apiKey: 'test-key' })
    await database.initDatabase()

    expect((await database.syncDrugCatalog(apiUrl)).ok).toBe(true)
    expect(fullRequests).toBe(1)
    expect(database.searchDrugCatalog('TEST')[0].barcode).toBe('8690000000001')
    expect(database.getDrugPropertiesForMedication({
      name: 'Karisim', route: 'PO', activeIngredient: 'gliserin + novocain', catalogBarcode: drug.barcode
    })).toMatchObject({ _karisimMi: true, _mixtureContent: '30 ml Gliserin' })

    revision = 1
    drug = { ...drug, label_detail: 'YENI', mixture_content: 'A + B' }
    const updateResult = await database.syncDrugCatalog(apiUrl)
    expect(updateResult.changed).toBe(true)
    expect(updateResult.cacheInvalidation).toMatchObject({
      names: expect.arrayContaining(['TEST', 'TEST 1 MG']),
      barcodes: ['8690000000001'],
      activeIngredients: ['TEST']
    })
    expect(fullRequests).toBe(1)
    expect(database.searchDrugCatalog('TEST')[0]).toMatchObject({ label_detail: 'YENI', mixture_content: 'A + B' })

    revision = 2
    drug = null
    expect((await database.syncDrugCatalog(apiUrl)).changed).toBe(true)
    expect(fullRequests).toBe(1)
    expect(database.getDrugCatalogCount()).toBe(1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    fs.rmSync(appData, { recursive: true, force: true })
  }
})
