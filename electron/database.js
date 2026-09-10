const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { app, safeStorage } = require('electron')
const { initMigrations } = require('./migrations')
const { normalizeMedicationDose } = require('../shared/doseUnits')
const { uniqueActiveIngredients } = require('../shared/activeIngredients')
const devLog = require('./devLogger')
const {
  DATABASE_FILENAME,
  BACKUP_FILENAME_PREFIX,
  BACKUP_FILENAME_PATTERN,
  ENCRYPTED_DATABASE_HEADER
} = require('./productIdentity')

let db = null
const BACKUP_LIMIT = 10

function encodeDatabase(data) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Hasta verisi icin isletim sistemi sifrelemesi kullanilamiyor')
  const encrypted = safeStorage.encryptString(Buffer.from(data).toString('base64'))
  return Buffer.concat([ENCRYPTED_DATABASE_HEADER, encrypted])
}

function decodeDatabase(data) {
  if (!data.subarray(0, ENCRYPTED_DATABASE_HEADER.length).equals(ENCRYPTED_DATABASE_HEADER)) return data
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Sifreli hasta verisi acilamiyor')
  const plain = safeStorage.decryptString(data.subarray(ENCRYPTED_DATABASE_HEADER.length))
  return Buffer.from(plain, 'base64')
}

function databasePaths() {
  const dir = app.getPath('userData')
  return { dir, dbPath: path.join(dir, DATABASE_FILENAME), backupDir: path.join(dir, 'backups') }
}

function rotateBackups(dbPath, backupDir) {
  if (!fs.existsSync(dbPath)) return
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  fs.copyFileSync(dbPath, path.join(backupDir, `${BACKUP_FILENAME_PREFIX}${stamp}.db`))
  const files = fs.readdirSync(backupDir).filter(f => BACKUP_FILENAME_PATTERN.test(f)).sort()
  while (files.length > BACKUP_LIMIT) fs.unlinkSync(path.join(backupDir, files.shift()))
}

async function initDatabase() {
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()

  const { dbPath } = databasePaths()

  if (fs.existsSync(dbPath)) {
    const buf = decodeDatabase(fs.readFileSync(dbPath))
    db = new SQL.Database(buf)
  } else {
    db = new SQL.Database()
  }

  initMigrations(db, saveDatabase)

  saveDatabase()
  return db
}

function saveDatabase() {
  if (!db) return
  try {
    const data = db.export()
    const { dir, dbPath, backupDir } = databasePaths()
    fs.mkdirSync(dir, { recursive: true })
    const tmpPath = `${dbPath}.tmp`
    fs.writeFileSync(tmpPath, encodeDatabase(data))
    const check = fs.readFileSync(tmpPath)
    if (!check.length) throw new Error('Veritabani disari aktarimi bos')
    rotateBackups(dbPath, backupDir)
    fs.renameSync(tmpPath, dbPath)
  } catch (e) {
    console.error('saveDatabase error:', e)
    throw e
  }
}

function getPatients() {
  const stmt = db.prepare('SELECT * FROM patients ORDER BY id')
  const rows = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    row.archived = !!row.archived
    rows.push(row)
  }
  stmt.free()
  return rows
}

function addPatient(name, height, weight, patient_no, gender, birthDate) {
  const existing = findPatientByName(name)
  if (existing) return -1
  db.run('INSERT INTO patients (name, height, weight, patient_no, gender, birthDate) VALUES (?, ?, ?, ?, ?, ?)', [name, height || '', weight || '', patient_no || '', gender || '', birthDate || ''])
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
  saveDatabase()
  return id
}

function findPatientByName(name) {
  const stmt = db.prepare('SELECT id FROM patients WHERE name = ?', [name])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return row
  }
  stmt.free()
  return null
}

function updatePatient(id, name, height, weight, patient_no, gender, birthDate) {
  const existing = findPatientByName(name)
  if (existing && existing.id !== id) return false
  db.run('UPDATE patients SET name = ?, height = ?, weight = ?, patient_no = ?, gender = ?, birthDate = ? WHERE id = ?', [name, height || '', weight || '', patient_no || '', gender || '', birthDate || '', id])
  saveDatabase()
  return true
}

function archivePatient(id) {
  db.run('UPDATE patients SET archived = 1 WHERE id = ?', [id])
  saveDatabase()
}

function restorePatient(id) {
  db.run('UPDATE patients SET archived = 0 WHERE id = ?', [id])
  saveDatabase()
}

function getMeds(patientId) {
  let stmt
  if (patientId) {
    stmt = db.prepare('SELECT * FROM meds WHERE patientId = ? ORDER BY id', [patientId])
  } else {
    stmt = db.prepare('SELECT * FROM meds ORDER BY id')
  }
  const rows = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    try { row.conditionData = JSON.parse(row.conditionData) } catch (e) { row.conditionData = {} }
    try { row.timeDoses = JSON.parse(row.timeDoses) } catch (e) { row.timeDoses = {} }
    const normalizedDose = normalizeMedicationDose(row)
    row.doseValue = normalizedDose.value
    row.doseUnit = normalizedDose.unit
    row.dose = normalizedDose.display
    rows.push(row)
  }
  stmt.free()
  return rows
}

function addMed(data) {
  db.run('INSERT INTO meds (patientId, name, route, dose, doseValue, doseUnit, times, condition, conditionData, note, startDate, timeDoses, activeIngredient, luezym, catalogBarcode, catalogLabelDetail, catalogLabelDetailCustomized, catalogLabelDetailEnabled, customLabel) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [data.patientId, data.name, data.route, data.dose, data.doseValue, data.doseUnit, data.times, data.condition || 'standard', JSON.stringify(data.conditionData || {}), data.note || '', data.startDate || '', JSON.stringify(data.timeDoses || {}), data.activeIngredient || '', data.luezym ? 1 : 0, data.catalogBarcode || '', data.catalogLabelDetail || '', data.catalogLabelDetailCustomized ? 1 : 0, data.catalogLabelDetailEnabled ? 1 : 0, data.customLabel || ''])
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
  saveDatabase()
  return id
}

function updateMed(id, data) {
  db.run('UPDATE meds SET name = ?, route = ?, dose = ?, doseValue = ?, doseUnit = ?, times = ?, condition = ?, conditionData = ?, note = ?, startDate = ?, timeDoses = ?, activeIngredient = ?, luezym = ?, catalogBarcode = ?, catalogLabelDetail = ?, catalogLabelDetailCustomized = ?, catalogLabelDetailEnabled = ?, customLabel = ? WHERE id = ?',
    [data.name, data.route, data.dose, data.doseValue, data.doseUnit, data.times, data.condition || 'standard', JSON.stringify(data.conditionData || {}), data.note || '', data.startDate || '', JSON.stringify(data.timeDoses || {}), data.activeIngredient || '', data.luezym ? 1 : 0, data.catalogBarcode || '', data.catalogLabelDetail || '', data.catalogLabelDetailCustomized ? 1 : 0, data.catalogLabelDetailEnabled ? 1 : 0, data.customLabel || '', id])
  saveDatabase()
}

function deleteMed(id) {
  db.run('DELETE FROM meds WHERE id = ?', [id])
  saveDatabase()
}

function deletePatientMeds(patientId) {
  db.run('DELETE FROM meds WHERE patientId = ?', [patientId])
  saveDatabase()
}

function deletePatient(id) {
  if (id == null) return false
  db.run('DELETE FROM meds WHERE patientId = ?', [id])
  db.run('DELETE FROM patients WHERE id = ?', [id])
  saveDatabase()
  return true
}

function getPatientMayi(id) {
  const stmt = db.prepare('SELECT mayiFluid, mayiContents, mayiRate FROM patients WHERE id = ?', [id])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    try { row.mayiContents = JSON.parse(row.mayiContents) } catch (e) { row.mayiContents = [] }
    return row
  }
  stmt.free()
  return null
}

function updatePatientMayi(id, fluid, contents, rate) {
  db.run('UPDATE patients SET mayiFluid = ?, mayiContents = ?, mayiRate = ? WHERE id = ?', [fluid, JSON.stringify(contents), rate || '', id])
  saveDatabase()
}

function getPatientInfList(id) {
  const stmt = db.prepare('SELECT infList FROM patients WHERE id = ?', [id])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    try { return JSON.parse(row.infList || '[]') } catch (e) { return [] }
  }
  stmt.free()
  return []
}

function updatePatientInfList(id, list) {
  db.run('UPDATE patients SET infList = ? WHERE id = ?', [JSON.stringify(list), id])
  saveDatabase()
}

const https = require('https')
const http = require('http')
const config = require('./config')
const { API_URL } = require('./constants')

const DRUG_SYNC_PAGE_SIZE = 5000

function requestJson(url, apiKey, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http
    const headers = apiKey ? { 'x-api-key': apiKey } : {}
    let finished = false

    const fail = (error) => {
      if (finished) return
      finished = true
      reject(error)
    }

    let req
    try {
      req = client.get(url, { headers, timeout: timeoutMs }, (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { data += chunk })
        res.on('error', fail)
        res.on('end', () => {
          if (finished) return
          let parsed
          try {
            parsed = data ? JSON.parse(data) : null
          } catch (cause) {
            const error = new Error('Sunucu geçersiz JSON döndürdü')
            error.cause = cause
            error.statusCode = res.statusCode
            fail(error)
            return
          }

          if (res.statusCode < 200 || res.statusCode >= 300) {
            const serverMessage = parsed && (parsed.error || parsed.message)
            const error = new Error(serverMessage || `HTTP ${res.statusCode}`)
            error.statusCode = res.statusCode
            error.response = parsed
            fail(error)
            return
          }

          finished = true
          resolve({ statusCode: res.statusCode, body: parsed })
        })
      })
    } catch (error) {
      fail(error)
      return
    }

    req.on('error', fail)
    req.setTimeout(timeoutMs, () => {
      const error = new Error(`İstek ${Math.round(timeoutMs / 1000)} saniyede yanıt vermedi`)
      error.code = 'ETIMEDOUT'
      req.destroy(error)
    })
  })
}

function logSyncRequestError(step, error) {
  if (error.statusCode === 401) {
    devLog.error(step, 'HTTP 401: API anahtarı eksik, hatalı veya REST API ile eşleşmiyor')
    return
  }
  if (error.statusCode === 400) {
    const details = error.response && Array.isArray(error.response.details)
      ? ` (${error.response.details.map(item => `${item.field}: ${item.message}`).join(', ')})`
      : ''
    devLog.error(step, `HTTP 400: REST API isteği geçersiz${details}`)
    return
  }
  if (error.statusCode) {
    devLog.error(step, `REST API HTTP ${error.statusCode} döndürdü: ${error.message}`)
    return
  }
  devLog.error('REST API', `REST API kapalı, yanıt vermiyor veya ulaşılamıyor: ${devLog.errorMessage(error)}`)
}

function buildCatalogEndpoint(apiUrl, suffix) {
  const target = new URL(apiUrl || `${config.get('apiUrl') || API_URL}/api/drugs`)
  target.search = ''
  target.pathname = `${target.pathname.replace(/\/$/, '')}/${suffix}`
  return target.toString()
}

async function checkDrugCatalog(apiUrl) {
  const apiKey = config.get('apiKey') || ''
  try {
    const response = await requestJson(buildCatalogEndpoint(apiUrl, 'check'), apiKey)
    const body = response.body || {}
    return {
      ok: true,
      updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : '',
      revision: typeof body.revision === 'string' ? body.revision : ''
    }
  } catch (error) {
    logSyncRequestError('KATALOG KONTROLÜ', error)
    return { ok: false, error: error.message }
  }
}

async function syncDrugCatalog(apiUrl) {
  const apiKey = config.get('apiKey') || ''
  const sourceUrl = apiUrl || `${config.get('apiUrl') || API_URL}/api/drugs`
  const startedAt = Date.now()
  const drugs = []
  let similarDrugNames = []
  let clinicalInfo = []

  try {
    const target = new URL(sourceUrl)
    const serverCheck = await checkDrugCatalog(sourceUrl)
    target.searchParams.delete('limit')
    target.searchParams.delete('page')
    devLog.info('REST API', `İlaç kataloğuna bağlanılıyor: ${target.origin}${target.pathname}`)
    devLog.info('REST API', `Kimlik doğrulama: API anahtarı ${apiKey ? 'yapılandırılmış' : 'yapılandırılmamış'}`)

    let page = 1
    let expectedTotal = null
    while (true) {
      target.searchParams.set('page', String(page))
      target.searchParams.set('limit', String(DRUG_SYNC_PAGE_SIZE))
      devLog.info('İLAÇLAR', `${page}. sayfa isteniyor (en fazla ${DRUG_SYNC_PAGE_SIZE} kayıt)...`)
      const response = await requestJson(target.toString(), apiKey)
      const parsed = response.body
      const pageRows = Array.isArray(parsed) ? parsed : (parsed && parsed.data)
      if (!Array.isArray(pageRows)) throw new Error('Sunucu ilaç listesi yerine beklenmeyen bir yanıt döndürdü')

      if (expectedTotal == null && parsed && !Array.isArray(parsed) && Number.isFinite(Number(parsed.total))) {
        expectedTotal = Number(parsed.total)
        devLog.success('REST API', `Bağlantı kuruldu (HTTP ${response.statusCode}); sunucuda ${expectedTotal} ilaç var`)
      } else if (page === 1) {
        devLog.success('REST API', `Bağlantı kuruldu (HTTP ${response.statusCode})`)
      }

      drugs.push(...pageRows)
      devLog.success('İLAÇLAR', `${page}. sayfa alındı: ${pageRows.length} kayıt (toplam alınan ${drugs.length}${expectedTotal == null ? '' : `/${expectedTotal}`})`)

      if (!pageRows.length || (expectedTotal != null && drugs.length >= expectedTotal) || pageRows.length < DRUG_SYNC_PAGE_SIZE) break
      page++
    }

    if (!drugs.length) {
      devLog.warn('İLAÇLAR', 'Sunucu boş ilaç listesi döndürdü; yerel katalog değiştirilmedi')
      return false
    }
    if (expectedTotal != null && drugs.length < expectedTotal) {
      throw new Error(`Eksik katalog alındı: ${drugs.length}/${expectedTotal} kayıt`)
    }

    devLog.info('İLAÇLAR', `${drugs.length} ilaç kaydı eksiksiz alındı, yerel katalog atomik olarak güncelleniyor...`)
    const similarTarget = new URL(target.toString())
    similarTarget.search = ''
    similarTarget.pathname = `${similarTarget.pathname.replace(/\/$/, '')}/similar-names`
    const similarResponse = await requestJson(similarTarget.toString(), apiKey)
    similarDrugNames = similarResponse.body
    if (!Array.isArray(similarDrugNames)) throw new Error('Sunucu benzer ilaç adı listesi yerine beklenmeyen bir yanıt döndürdü')

    const clinicalTarget = new URL(target.toString())
    clinicalTarget.search = ''
    clinicalTarget.pathname = `${clinicalTarget.pathname.replace(/\/$/, '')}/clinical-info`
    const clinicalResponse = await requestJson(clinicalTarget.toString(), apiKey)
    clinicalInfo = clinicalResponse.body
    if (!Array.isArray(clinicalInfo)) throw new Error('Sunucu klinik katalog bilgileri yerine beklenmeyen bir yanıt döndürdü')

    const revision = crypto.createHash('sha256').update(JSON.stringify({
      drugs: drugs.map(d => [d.label || '', d.label_detail || '', d.full_name || '', String(d.barcode || ''), d.atc_code || '', d.active_ingredient || '', d.etken_detay || '', Boolean(d.karisimMi), Boolean(d.sgk_odeme), d.form || '', d.drug_type || '', d.properties || null]),
      similarDrugNames,
      clinicalInfo
    })).digest('hex')
    db.run('CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT \'\')')
    const revisionRows = db.exec("SELECT value FROM catalog_meta WHERE key = 'revision' LIMIT 1")
    const previousRevision = revisionRows[0]?.values?.[0]?.[0] || ''
    const changed = previousRevision !== revision

    db.run('BEGIN TRANSACTION')
    db.run(`CREATE TABLE drug_catalog_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT DEFAULT '',
            label_detail TEXT DEFAULT '',
            full_name TEXT DEFAULT '',
            barcode TEXT DEFAULT '',
            atc_code TEXT DEFAULT '',
            active_ingredient TEXT DEFAULT '',
            etken_detay TEXT DEFAULT '',
            karisimMi INTEGER DEFAULT 0,
            sgk_odeme INTEGER NOT NULL DEFAULT 0,
            form TEXT DEFAULT '',
            drug_type TEXT DEFAULT '',
            properties TEXT DEFAULT NULL
          )`)
    const stmt = db.prepare('INSERT INTO drug_catalog_new (label, label_detail, full_name, barcode, atc_code, active_ingredient, etken_detay, karisimMi, sgk_odeme, form, drug_type, properties) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    let importedCount = 0
    for (const d of drugs) {
      if (!d.active_ingredient) continue
      stmt.run([d.label || '', d.label_detail || '', d.full_name || '', String(d.barcode || ''), d.atc_code || '', d.active_ingredient || '', d.etken_detay || '', d.karisimMi ? 1 : 0, d.sgk_odeme ? 1 : 0, d.form || '', d.drug_type || '', d.properties ? JSON.stringify(d.properties) : null])
      importedCount++
    }
    stmt.free()
    db.run('DROP TABLE IF EXISTS drug_catalog')
    db.run('ALTER TABLE drug_catalog_new RENAME TO drug_catalog')
    db.run('CREATE INDEX IF NOT EXISTS idx_dc_label ON drug_catalog(label)')
    db.run('CREATE INDEX IF NOT EXISTS idx_dc_ai ON drug_catalog(active_ingredient)')
    db.run('CREATE INDEX IF NOT EXISTS idx_dc_etken_detay ON drug_catalog(etken_detay)')
    db.run('CREATE INDEX IF NOT EXISTS idx_dc_barcode ON drug_catalog(barcode)')
    db.run(`UPDATE meds
      SET catalogLabelDetail = COALESCE((
        SELECT label_detail FROM drug_catalog
        WHERE drug_catalog.barcode = meds.catalogBarcode
        LIMIT 1
      ), ''),
      catalogLabelDetailEnabled = CASE WHEN EXISTS (
        SELECT 1 FROM drug_catalog
        WHERE drug_catalog.barcode = meds.catalogBarcode
          AND TRIM(COALESCE(drug_catalog.label_detail, '')) != ''
      ) THEN 1 ELSE 0 END
      WHERE catalogBarcode IS NOT NULL AND TRIM(catalogBarcode) != ''
        AND COALESCE(catalogLabelDetailCustomized, 0) = 0`)
    db.run(`CREATE TABLE similar_drug_names_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drug_label TEXT NOT NULL,
      similar_label TEXT NOT NULL,
      similarity_type TEXT DEFAULT 'name',
      source_code TEXT DEFAULT '',
      source_revision TEXT DEFAULT '',
      source_date TEXT DEFAULT '',
      UNIQUE(drug_label, similar_label)
    )`)
    const similarStmt = db.prepare(`INSERT OR IGNORE INTO similar_drug_names_new
      (drug_label, similar_label, similarity_type, source_code, source_revision, source_date)
      VALUES (?, ?, ?, ?, ?, ?)`)
    for (const relation of similarDrugNames) {
      const drugLabel = String(relation.drugLabel || '').trim()
      const similarLabel = String(relation.similarLabel || '').trim()
      if (drugLabel && similarLabel) similarStmt.run([drugLabel, similarLabel, relation.similarityType || 'name',
        relation.sourceCode || '', relation.sourceRevision || '', relation.sourceDate || ''])
    }
    similarStmt.free()
    db.run('DROP TABLE IF EXISTS similar_drug_names')
    db.run('ALTER TABLE similar_drug_names_new RENAME TO similar_drug_names')
    db.run('CREATE INDEX IF NOT EXISTS idx_similar_drug_label ON similar_drug_names(drug_label)')
    db.run(`CREATE TABLE drug_clinical_info_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lookup_name TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      details TEXT DEFAULT '{}',
      severity TEXT DEFAULT 'info',
      source_code TEXT DEFAULT '',
      source_revision TEXT DEFAULT '',
      source_date TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )`)
    const clinicalStmt = db.prepare(`INSERT INTO drug_clinical_info_new
      (lookup_name, category, title, summary, details, severity, source_code, source_revision, source_date, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const item of clinicalInfo) {
      const lookupName = String(item.lookupName || '').trim()
      if (!lookupName || !item.category) continue
      clinicalStmt.run([lookupName, item.category, item.title || '', item.summary || '', JSON.stringify(item.details || {}),
        item.severity || 'info', item.sourceCode || '', item.sourceRevision || '', item.sourceDate || '', item.sortOrder || 0])
    }
    clinicalStmt.free()
    db.run('DROP TABLE IF EXISTS drug_clinical_info')
    db.run('ALTER TABLE drug_clinical_info_new RENAME TO drug_clinical_info')
    db.run('CREATE INDEX IF NOT EXISTS idx_dci_lookup ON drug_clinical_info(lookup_name)')
    db.run('CREATE INDEX IF NOT EXISTS idx_dci_category ON drug_clinical_info(category)')
    db.run("INSERT OR REPLACE INTO catalog_meta (key, value) VALUES ('revision', ?)", [revision])
    db.run('COMMIT')
    saveDatabase()
    devLog.success('İLAÇLAR', `${importedCount} ilaç güncellendi (${Date.now() - startedAt} ms)`)
    return { ok: true, changed, updatedAt: serverCheck.updatedAt, revision }
  } catch (error) {
    try { db.run('ROLLBACK') } catch (_) {}
    console.error('syncDrugCatalog error:', error.message)
    logSyncRequestError('İLAÇLAR', error)
    devLog.warn('İLAÇLAR', 'Senkronizasyon başarısız olduğu için mevcut yerel katalog korundu')
    return false
  }
}

function getSimilarDrugNames(medication) {
  // Patient medications may contain the commercial full name while the
  // similarity table is keyed by the catalog/etiket label. Resolve that
  // label only through exact name or barcode matches; never use substring
  // matching here because it can associate unrelated products.
  const input = typeof medication === 'string' ? { name: medication } : (medication || {})
  const name = String(input.name || '').trim()
  const barcode = String(input.catalogBarcode || '').trim()
  const stmt = db.prepare(`SELECT DISTINCT s.similar_label
    FROM similar_drug_names s
    WHERE LOWER(TRIM(s.drug_label)) = LOWER(TRIM(?))
       OR EXISTS (
         SELECT 1 FROM drug_catalog d
         WHERE LOWER(TRIM(d.label)) = LOWER(TRIM(s.drug_label))
           AND (
             (? <> '' AND TRIM(d.barcode) = TRIM(?))
             OR LOWER(TRIM(d.full_name)) = LOWER(TRIM(?))
           )
       )
    ORDER BY s.similar_label`, [name, barcode, barcode, name])
  const names = []
  while (stmt.step()) names.push(stmt.getAsObject().similar_label)
  stmt.free()
  return names
}

function normalizeClinicalLookup(value) {
  return String(value || '')
    .toLocaleUpperCase('tr-TR')
    .replace(/[İI]/g, 'I')
    .replace(/Ç/g, 'C').replace(/Ğ/g, 'G').replace(/Ö/g, 'O').replace(/Ş/g, 'S').replace(/Ü/g, 'U')
    .replace(/\b(AMPUL|AMP|FLAKON|FLK|TABLET|TB|KAPSUL|KAPSÜL|SOLUSYON|SOLÜSYON)\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:MG|MCG|G|ML|IU|U)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function clinicalLookupMatches(lookupName, medication) {
  const needle = normalizeClinicalLookup(lookupName)
  if (!needle) return false
  const candidates = [medication?.name, medication?.activeIngredient, medication?.label, medication?.active_ingredient]
    .map(normalizeClinicalLookup).filter(Boolean)
  return candidates.some(candidate => candidate === needle ||
    (needle.length >= 5 && candidate.includes(needle)) || (candidate.length >= 5 && needle.includes(candidate)))
}

function getDrugClinicalInfo(medication) {
  const stmt = db.prepare(`SELECT lookup_name, category, title, summary, details, severity,
    source_code, source_revision, source_date, sort_order FROM drug_clinical_info ORDER BY sort_order, id`)
  const rows = []
  const seen = new Set()
  while (stmt.step()) {
    const row = stmt.getAsObject()
    if (!clinicalLookupMatches(row.lookup_name, medication)) continue
    try { row.details = JSON.parse(row.details || '{}') } catch (_) { row.details = {} }
    const key = `${row.category}|${row.title}|${row.summary}|${JSON.stringify(row.details)}|${row.source_code}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      lookupName: row.lookup_name, category: row.category, title: row.title, summary: row.summary,
      details: row.details, severity: row.severity, sourceCode: row.source_code,
      sourceRevision: row.source_revision, sourceDate: row.source_date
    })
  }
  stmt.free()
  return rows
}

function getDrugSimilarities(label) {
  const stmt = db.prepare(`SELECT drug_label, similar_label, similarity_type, source_code, source_revision, source_date
    FROM similar_drug_names ORDER BY similarity_type, similar_label`)
  const rows = []
  const seen = new Set()
  while (stmt.step()) {
    const row = stmt.getAsObject()
    if (!clinicalLookupMatches(row.drug_label, { name: label })) continue
    const key = `${row.similarity_type}|${row.similar_label}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      similarLabel: row.similar_label, similarityType: row.similarity_type || 'name',
      sourceCode: row.source_code || '', sourceRevision: row.source_revision || '', sourceDate: row.source_date || ''
    })
  }
  stmt.free()
  return rows
}

function searchDrugCatalog(query, formFilter) {
  const q = String(query || '').trim().toLowerCase()
  let sql = `
    SELECT DISTINCT full_name, barcode, label, label_detail, active_ingredient, etken_detay, karisimMi, sgk_odeme, form, drug_type
    FROM drug_catalog
    WHERE (LOWER(full_name) LIKE ? OR LOWER(label) LIKE ? OR LOWER(label_detail) LIKE ? OR LOWER(active_ingredient) LIKE ? OR LOWER(etken_detay) LIKE ?)
  `
  const params = [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]
  if (formFilter) {
    sql += ` AND LOWER(form) = LOWER(?)`
    params.push(formFilter)
  }
  sql += `
    ORDER BY
      CASE
        WHEN LOWER(full_name) = ? THEN 0
        WHEN LOWER(label) = ? THEN 1
        WHEN LOWER(active_ingredient) = ? THEN 2
        WHEN LOWER(etken_detay) = ? THEN 3
        WHEN LOWER(full_name) LIKE ? THEN 4
        WHEN LOWER(label) LIKE ? THEN 5
        ELSE 6
      END,
      full_name COLLATE NOCASE ASC
    LIMIT 15
  `
  params.push(q, q, q, q, `${q}%`, `${q}%`)
  const stmt = db.prepare(sql, params)
  const rows = []
  while (stmt.step()) { rows.push(stmt.getAsObject()) }
  stmt.free()
  return rows
}

function getDrugFullNameMap() {
  const stmt = db.prepare('SELECT active_ingredient, form, label FROM drug_catalog WHERE label IS NOT NULL AND label != \'\' ORDER BY label ASC')
  const map = {}
  while (stmt.step()) {
    const row = stmt.getAsObject()
    const key = (row.active_ingredient || '').toLowerCase() + '|' + (row.form || '').toLowerCase()
    if (!map[key]) map[key] = []
    if (!map[key].includes(row.label)) map[key].push(row.label)
  }
  stmt.free()
  return map
}

function getDrugFullName(name, activeIngredient, form) {
  const stmt = db.prepare(`
    SELECT full_name FROM drug_catalog
    WHERE LOWER(label) = LOWER(?) AND full_name IS NOT NULL AND full_name != ''
    ORDER BY
      CASE WHEN LOWER(active_ingredient) = LOWER(?) THEN 0 ELSE 1 END,
      CASE WHEN LOWER(form) = LOWER(?) THEN 0 ELSE 1 END
    LIMIT 1
  `, [String(name || '').trim(), String(activeIngredient || '').trim(), String(form || '').trim()])
  if (!stmt.step()) { stmt.free(); return null }
  const fullName = stmt.getAsObject().full_name
  stmt.free()
  return fullName
}

function getDrugProspectusOptions(name, form) {
  const stmt = db.prepare(`
    SELECT label, full_name FROM drug_catalog
    WHERE UPPER(TRIM(form)) = UPPER(TRIM(?))
      AND full_name IS NOT NULL AND TRIM(full_name) != ''
    ORDER BY full_name COLLATE NOCASE
  `, [String(form || '').trim()])
  const targetLabel = normTR(String(name || '')).toLowerCase().replace(/\s+/g, ' ').trim()
  const rows = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    const rowLabel = normTR(String(row.label || '')).toLowerCase().replace(/\s+/g, ' ').trim()
    if (rowLabel === targetLabel && !rows.includes(row.full_name)) rows.push(row.full_name)
  }
  stmt.free()
  return rows
}

function getDrugPriceOptions(name, form) {
  const stmt = db.prepare(`
    SELECT label, full_name, barcode FROM drug_catalog
    WHERE UPPER(TRIM(form)) = UPPER(TRIM(?))
      AND barcode IS NOT NULL AND TRIM(barcode) != ''
    ORDER BY full_name COLLATE NOCASE, barcode
  `, [String(form || '').trim()])
  const targetLabel = normTR(String(name || '')).toLowerCase().replace(/\s+/g, ' ').trim()
  const rows = []
  while (stmt.step()) {
    const row = stmt.getAsObject()
    const rowLabel = normTR(String(row.label || '')).toLowerCase().replace(/\s+/g, ' ').trim()
    const barcode = String(row.barcode || '').trim()
    if (rowLabel === targetLabel && barcode && !rows.some(item => item.barcode === barcode)) {
      rows.push({ fullName: String(row.full_name || row.label || '').trim(), barcode })
    }
  }
  stmt.free()
  return rows
}

function resolveDrugBarcode(name, activeIngredient, form) {
  const stmt = db.prepare(`
    SELECT DISTINCT barcode FROM drug_catalog
    WHERE LOWER(TRIM(label)) = LOWER(TRIM(?))
      AND LOWER(TRIM(active_ingredient)) = LOWER(TRIM(?))
      AND LOWER(TRIM(form)) = LOWER(TRIM(?))
      AND barcode IS NOT NULL AND TRIM(barcode) != ''
    ORDER BY barcode
    LIMIT 1
  `, [String(name || '').trim(), String(activeIngredient || '').trim(), String(form || '').trim()])
  let barcode = ''
  if (stmt.step()) barcode = String(stmt.getAsObject().barcode || '')
  stmt.free()
  return barcode
}

function getActiveIngredients() {
  const stmt = db.prepare('SELECT DISTINCT active_ingredient FROM drug_catalog ORDER BY active_ingredient ASC')
  const rows = []
  while (stmt.step()) { rows.push(stmt.getAsObject().active_ingredient) }
  stmt.free()
  return uniqueActiveIngredients(rows)
}

function getDrugCatalogCount() {
  const result = db.exec('SELECT COUNT(*) as c FROM drug_catalog')
  return result[0].values[0][0]
}

function resolveActiveIngredient(name) {
  const q = name.toLowerCase()
  const stmt = db.prepare(`
    SELECT active_ingredient FROM drug_catalog
    WHERE LOWER(label) = ? OR LOWER(active_ingredient) = ? OR LOWER(etken_detay) LIKE ?
    LIMIT 1
  `, [q, q, `%${q}%`])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return row.active_ingredient
  }
  stmt.free()
  return null
}

function normTR(s) {
  return s.replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
}

function extractBrand(name) {
  const clean = normTR(name)
    .toLowerCase().trim()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b\d+\s*(mg|ml|gr|g|mcg|iu|adet|flakon|ampul|tablet|kapsul|suspan\w*)\b/g, '')
    .replace(/\b(iv|im|po|sc|pr|sl|top)\b/g, '')
    .replace(/\b(enj|flk|tb|sase|pomad|krem|suru\w*|damla|gargara|solusyon|cozelti|liyofilize|toz|sprey|merhem|fl)\b/g, '')
    .replace(/\d+[\/\.]\d+/g, '')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ').trim()
  return clean.split(/\s+/).filter(w => w.length > 1)
}

function lookupDrugByName(name) {
  // "40MG" → "40 MG" gibi bitişik yazımları ayır
  const normalized = normTR(name).replace(/(\d)(mg|g|ml|mcg|iu|meq|mmol|tb|amp|flk|adet|damla|puf|%)/gi, '$1 $2')
  const q = normalized.toLowerCase().trim()

  // Ilk kelimeyle dene (tam eslesme veya benzer)
  const queryWords = q.split(/\s+/).filter(w => w.length > 1)
  const firstWord = queryWords[0]
  if (!firstWord || firstWord.length < 3) return null

  // Ilk kelimede nokta varsa (orn: M.RESOURCE), noktadan sonrasini da dene
  const altWords = [firstWord]
  if (firstWord.includes('.')) {
    const afterDot = firstWord.split('.').pop()
    if (afterDot && afterDot.length >= 3) altWords.push(afterDot)
  }

  // Geniş arama: etiket, etken madde, alias
  const stmt = db.prepare(`SELECT label, active_ingredient FROM drug_catalog WHERE LOWER(label) = ? OR LOWER(label) LIKE ? OR LOWER(active_ingredient) = ? OR LOWER(etken_detay) LIKE ? LIMIT 1`)
  stmt.bind([q, `%${q}%`, q, `%${q}%`])
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return { label: row.label, activeIngredient: row.active_ingredient }
  }
  stmt.free()

  // İlk kelimeyle ara, varyantlari dene (noktali/noktasiz)
  const candidates = []
  for (const w of altWords) {
    const cs = db.prepare(`SELECT label, active_ingredient FROM drug_catalog WHERE LOWER(label) LIKE ? LIMIT 30`)
    cs.bind([`%${w}%`])
    while (cs.step()) candidates.push(cs.getAsObject())
    cs.free()
    if (candidates.length) break
  }

  if (!candidates.length) return null

  let best = candidates[0], bestScore = 0
  for (const c of candidates) {
    const cw = c.label.toLowerCase().trim().split(/\s+/)
    const common = queryWords.filter(qw => cw.some(w => w.includes(qw) || qw.includes(w)))
    // Aynı form tercihi: ampul→ampul, flakon→flakon, tablet→tablet, krem→krem
    const qHas = (w) => q.includes(w)
    const cHas = (w) => c.label.toLowerCase().includes(w)
    const formBonus = (qHas('ampul') && cHas('ampul')) || (qHas('flakon') && cHas('flakon')) ||
                      (qHas('tablet') && cHas('tablet')) || (qHas('kapsul') && cHas('kapsul')) ? 2 : 0
    const score = common.length + formBonus
    if (score > bestScore) { bestScore = score; best = c }
  }

  return { label: best.label, activeIngredient: best.active_ingredient }
}

function syncDosages(apiUrl) {
  const apiKey = config.get('apiKey') || ''
  const url = apiUrl || `${config.get('apiUrl') || API_URL}/api/dosages?limit=10000`
  return new Promise((resolve) => {
    const startedAt = Date.now()
    devLog.info('DOZAJLAR', `Dozaj kuralları REST API'den isteniyor: ${url}`)
    const client = url.startsWith('https') ? https : http
    const headers = apiKey ? { 'x-api-key': apiKey } : {}
    const req = client.get(url, { headers, timeout: 10000 }, (res) => {
      devLog.success('REST API', `Dozaj servisine bağlandı (HTTP ${res.statusCode})`)
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            devLog.error('DOZAJLAR', `Dozaj kuralları alınamadı; sunucu HTTP ${res.statusCode} döndürdü`)
            resolve(false)
            return
          }
          const parsed = JSON.parse(data)
          const rows = Array.isArray(parsed) ? parsed : (parsed.data || [])
          if (!rows.length) {
            devLog.warn('DOZAJLAR', 'Sunucu boş dozaj listesi döndürdü; yerel kurallar değiştirilmedi')
            resolve(false)
            return
          }

          devLog.info('DOZAJLAR', `${rows.length} dozaj kuralı alındı, yerel veritabanı güncelleniyor...`)

          db.run('BEGIN TRANSACTION')
          db.run(`CREATE TABLE dosages_new (
            id INTEGER PRIMARY KEY,
            active_ingredient TEXT NOT NULL,
            form TEXT DEFAULT '',
            age_group TEXT NOT NULL,
            age_min INTEGER,
            age_max INTEGER,
            dose_min REAL NOT NULL,
            dose_max REAL NOT NULL,
            dose_unit TEXT NOT NULL,
            dose_period TEXT NOT NULL,
            dose_count INTEGER DEFAULT 1,
            tolerance_percent REAL DEFAULT 2.0,
            max_dose REAL
          )`)
          const stmt = db.prepare('INSERT INTO dosages_new (id, active_ingredient, form, age_group, age_min, age_max, dose_min, dose_max, dose_unit, dose_period, dose_count, tolerance_percent, max_dose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          let importedCount = 0
          for (const d of rows) {
            if (!d.active_ingredient) continue
            stmt.run([d.id, d.active_ingredient, d.form || '', d.age_group, d.age_min || null, d.age_max || null, d.dose_min, d.dose_max, d.dose_unit, d.dose_period, d.dose_count || 1, d.tolerance_percent ?? 2.0, d.max_dose || null])
            importedCount++
          }
          stmt.free()
          db.run('DROP TABLE IF EXISTS dosages')
          db.run('ALTER TABLE dosages_new RENAME TO dosages')
          db.run('CREATE INDEX IF NOT EXISTS idx_dos_ai ON dosages(active_ingredient)')
          db.run('CREATE INDEX IF NOT EXISTS idx_dos_form ON dosages(form)')
          db.run('COMMIT')
          saveDatabase()
          devLog.success('DOZAJLAR', `${importedCount} dozaj kuralı güncellendi (${Date.now() - startedAt} ms)`)
          resolve(true)
        } catch (e) {
          try { db.run('ROLLBACK') } catch (_) {}
          console.error('syncDosages error:', e.message)
          devLog.error('DOZAJLAR', `Dozaj kuralları güncellenemedi: ${devLog.errorMessage(e)}`)
          resolve(false)
        }
      })
      res.on('error', (err) => {
        devLog.error('DOZAJLAR', `Sunucu yanıtı okunamadı: ${devLog.errorMessage(err)}`)
        resolve(false)
      })
    })
    req.on('error', (err) => {
      devLog.error('REST API', `REST API kapalı veya ulaşılamıyor (dozajlar): ${devLog.errorMessage(err)}`)
      resolve(false)
    })
    req.setTimeout(10000, () => {
      devLog.error('DOZAJLAR', 'Dozaj servisi zaman aşımına uğradı (10 saniye)')
      req.destroy()
      resolve(false)
    })
  })
}

function getMatchingDosages(activeIngredient, form) {
  const ai = (activeIngredient || '').toLowerCase().trim()
  const f = (form || '').trim()
  let stmt
  if (!ai) {
    stmt = db.prepare('SELECT * FROM dosages ORDER BY active_ingredient, form, age_min, age_max')
  } else if (f) {
    stmt = db.prepare('SELECT * FROM dosages WHERE LOWER(active_ingredient) = ? AND LOWER(form) = LOWER(?)', [ai, f])
  } else {
    stmt = db.prepare('SELECT * FROM dosages WHERE LOWER(active_ingredient) = ?', [ai])
  }
  const rows = []
  while (stmt.step()) { rows.push(stmt.getAsObject()) }
  stmt.free()
  return rows
}

function validateDosage(data, excludeId = null) {
  const required = ['active_ingredient', 'dose_min', 'dose_max', 'dose_unit', 'dose_period']
  for (const field of required) {
    if (data[field] === undefined || data[field] === null || data[field] === '') throw new Error('Zorunlu dozaj alanları eksik')
  }
  const min = Number(data.dose_min)
  const max = Number(data.dose_max)
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) throw new Error('Doz aralığı geçersiz')
  for (const value of [data.age_min, data.age_max]) {
    if (value !== null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) throw new Error('Yaş aralığı geçersiz')
  }
  if (data.age_min !== null && data.age_min !== '' && data.age_max !== null && data.age_max !== '' && Number(data.age_max) < Number(data.age_min)) throw new Error('Yaş aralığı geçersiz')
  const requestedMin = data.age_min === null || data.age_min === '' ? -Infinity : Number(data.age_min)
  const requestedMax = data.age_max === null || data.age_max === '' ? Infinity : Number(data.age_max)
  const stmt = db.prepare(`SELECT id, age_min, age_max FROM dosages WHERE LOWER(active_ingredient) = LOWER(?) AND LOWER(form) = LOWER(?)`)
  stmt.bind([String(data.active_ingredient).trim(), String(data.form || '').trim()])
  let duplicate = false
  while (stmt.step()) {
    const row = stmt.getAsObject()
    if (Number(row.id) === Number(excludeId)) continue
    const rowMin = row.age_min == null ? -Infinity : Number(row.age_min)
    const rowMax = row.age_max == null ? Infinity : Number(row.age_max)
    if (requestedMin <= rowMax && requestedMax >= rowMin) { duplicate = true; break }
  }
  stmt.free()
  if (duplicate) throw new Error('Bu etken madde ve form için çakışan bir yaş aralığı var')
}

function saveDosage(data) {
  validateDosage(data, data.id || null)
  const values = [
    String(data.active_ingredient).trim().toLocaleLowerCase('tr'), String(data.form || '').trim().toUpperCase(), 'range',
    data.age_min === '' || data.age_min == null ? null : Number(data.age_min), data.age_max === '' || data.age_max == null ? null : Number(data.age_max),
    Number(data.dose_min), Number(data.dose_max), data.dose_unit, data.dose_period,
    Number(data.dose_count) || 1, data.tolerance_percent === '' || data.tolerance_percent == null ? 2 : Number(data.tolerance_percent),
    data.max_dose === '' || data.max_dose == null ? null : Number(data.max_dose)
  ]
  if (data.id) {
    db.run(`UPDATE dosages SET active_ingredient=?, form=?, age_group=?, age_min=?, age_max=?, dose_min=?, dose_max=?, dose_unit=?, dose_period=?, dose_count=?, tolerance_percent=?, max_dose=? WHERE id=?`, [...values, Number(data.id)])
  } else {
    db.run(`INSERT INTO dosages (active_ingredient, form, age_group, age_min, age_max, dose_min, dose_max, dose_unit, dose_period, dose_count, tolerance_percent, max_dose) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, values)
  }
  saveDatabase()
  return getMatchingDosages('', '')
}

function deleteDosage(id) {
  db.run('DELETE FROM dosages WHERE id = ?', [Number(id)])
  saveDatabase()
  return getMatchingDosages('', '')
}

function getCabinets() {
  const stmt = db.prepare('SELECT * FROM cabinet_history ORDER BY name')
  const rows = []
  while (stmt.step()) { rows.push(stmt.getAsObject()) }
  stmt.free()
  return rows
}

function addCabinet(name) {
  try {
    db.run('INSERT INTO cabinet_history (name) VALUES (?)', [name])
    const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
    saveDatabase()
    return id
  } catch (e) {
    return -1
  }
}

function renameCabinet(id, name) {
  db.run('UPDATE cabinet_history SET name = ? WHERE id = ?', [name, id])
  saveDatabase()
}

function deleteCabinet(id) {
  db.run('DELETE FROM cabinet_drugs WHERE cabinetId = ?', [id])
  db.run('DELETE FROM cabinet_history WHERE id = ?', [id])
  saveDatabase()
}

function getCabinetDrugs(cabinetId) {
  const stmt = db.prepare('SELECT * FROM cabinet_drugs WHERE cabinetId = ? ORDER BY name', [cabinetId])
  const rows = []
  while (stmt.step()) { rows.push(stmt.getAsObject()) }
  stmt.free()
  return rows
}

function addCabinetDrug(cabinetId, name, form, dose, quantity, unit, expiry) {
  db.run('INSERT INTO cabinet_drugs (cabinetId, name, form, dose, quantity, unit, expiry) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [cabinetId, name, form || '', dose || '', quantity || 0, unit || 'Adet', expiry || ''])
  const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
  saveDatabase()
  return id
}

function updateCabinetDrug(id, name, form, dose, quantity, unit, expiry) {
  db.run('UPDATE cabinet_drugs SET name = ?, form = ?, dose = ?, quantity = ?, unit = ?, expiry = ? WHERE id = ?',
    [name, form || '', dose || '', quantity || 0, unit || 'Adet', expiry || '', id])
  saveDatabase()
}

function deleteCabinetDrug(id) {
  db.run('DELETE FROM cabinet_drugs WHERE id = ?', [id])
  saveDatabase()
}

function getAllExpiredDrugs() {
  const stmt = db.prepare(`
    SELECT c.name AS cabinet, d.name, d.form, d.dose, d.expiry
    FROM cabinet_drugs d JOIN cabinet_history c ON d.cabinetId = c.id
    WHERE d.expiry != ''
    ORDER BY c.name, d.name
  `)
  const rows = []
  const now = new Date()
  while (stmt.step()) {
    const row = stmt.getAsObject()
    let m = row.expiry.match(/^(\d{2})[.-](\d{4})$/)
    if (!m) m = row.expiry.match(/^(\d{4})[.-](\d{2})$/)
    if (m) {
      const exp = new Date(parseInt(m[2] || m[1]), parseInt(m[1] || m[2]), 0)
      if (exp < now) rows.push(row)
    }
  }
  stmt.free()
  return rows
}

function getDrugProperties(activeIngredient) {
  const ai = (activeIngredient || '').toLowerCase().trim()
  if (!ai) return null
  const stmt = db.prepare('SELECT properties FROM drug_catalog WHERE LOWER(TRIM(active_ingredient)) = ? AND properties IS NOT NULL', [ai])
  const result = mergePropertyRows(stmt)
  stmt.free()
  return result
}

function mergePropertyRows(stmt) {
  const merged = {}
  while (stmt.step()) {
    const row = stmt.getAsObject()
    try {
      const properties = JSON.parse(row.properties || '{}')
      for (const [key, value] of Object.entries(properties)) {
        if (value?.flag === true && !merged[key]) merged[key] = value
      }
    } catch {}
  }
  return Object.keys(merged).length ? merged : null
}

function getDrugPropertiesForMedication(medication) {
  const barcode = String(medication?.catalogBarcode || '').trim()
  if (barcode) {
    const exactMatch = db.prepare('SELECT 1 FROM drug_catalog WHERE barcode = ? LIMIT 1', [barcode])
    const catalogDrugExists = exactMatch.step()
    exactMatch.free()

    const stmt = db.prepare('SELECT properties FROM drug_catalog WHERE barcode = ? AND properties IS NOT NULL', [barcode])
    const result = mergePropertyRows(stmt)
    stmt.free()
    if (catalogDrugExists) return result
  }

  const name = String(medication?.name || '').trim()
  const form = String(medication?.route || '').trim()
  if (name) {
    const matchParams = [name, form, form]
    const matchSql = `FROM drug_catalog
      WHERE LOWER(TRIM(label)) = LOWER(TRIM(?))
      AND (? = '' OR LOWER(TRIM(form)) = LOWER(TRIM(?)))`
    const exactMatch = db.prepare(`SELECT 1 ${matchSql} LIMIT 1`, matchParams)
    const catalogDrugExists = exactMatch.step()
    exactMatch.free()

    const stmt = db.prepare(`SELECT properties
      ${matchSql}
      AND properties IS NOT NULL`, matchParams)
    const result = mergePropertyRows(stmt)
    stmt.free()
    if (catalogDrugExists) return result
  }

  return getDrugProperties(medication?.activeIngredient || '')
}

function getPatientDrugBarcodes(patientId) {
  const medsStmt = db.prepare('SELECT name, route, activeIngredient, catalogBarcode FROM meds WHERE patientId = ?', [patientId])
  const barcodes = new Set()
  while (medsStmt.step()) {
    const med = medsStmt.getAsObject()
    if (/^\d{8,14}$/.test(String(med.catalogBarcode || ''))) {
      barcodes.add(String(med.catalogBarcode))
      continue
    }
    const stmt = db.prepare(`SELECT DISTINCT barcode FROM drug_catalog
      WHERE LOWER(TRIM(label)) = LOWER(TRIM(?))
      AND LOWER(TRIM(active_ingredient)) = LOWER(TRIM(?))
      AND LOWER(TRIM(form)) = LOWER(TRIM(?))
      AND barcode IS NOT NULL AND barcode != ''`,
      [med.name || '', med.activeIngredient || '', med.route || ''])
    const matches = []
    while (stmt.step()) matches.push(String(stmt.getAsObject().barcode || ''))
    stmt.free()
    if (matches.length === 1 && /^\d{8,14}$/.test(matches[0])) barcodes.add(matches[0])
  }
  medsStmt.free()
  return [...barcodes]
}

module.exports = {
  initDatabase,
  getPatients,
  addPatient,
  updatePatient,
  archivePatient,
  restorePatient,
  getMeds,
  addMed,
  updateMed,
  deleteMed,
  deletePatientMeds,
  deletePatient,
  getPatientMayi,
  updatePatientMayi,
  getPatientInfList,
  updatePatientInfList,
  syncDrugCatalog,
  checkDrugCatalog,
  searchDrugCatalog,
  getActiveIngredients,
  getDrugFullNameMap,
  getDrugFullName,
  getDrugProspectusOptions,
  getDrugPriceOptions,
  resolveDrugBarcode,
  getDrugCatalogCount,
  resolveActiveIngredient,
  lookupDrugByName,
  getMatchingDosages,
  saveDosage,
  deleteDosage,
  getCabinets,
  addCabinet,
  renameCabinet,
  deleteCabinet,
  getCabinetDrugs,
  addCabinetDrug,
  updateCabinetDrug,
  deleteCabinetDrug,
  getAllExpiredDrugs,
  getDrugProperties,
  getDrugPropertiesForMedication,
  getSimilarDrugNames,
  getDrugSimilarities,
  getDrugClinicalInfo,
  getPatientDrugBarcodes
}
