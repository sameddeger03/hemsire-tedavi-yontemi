const initSqlJs = require('sql.js')
const { initMigrations } = require('../electron/migrations')

let SQL

beforeAll(async () => {
  SQL = await initSqlJs()
})

test('fresh catalog has sgk_odeme and label detail defaults', () => {
  const db = new SQL.Database()
  initMigrations(db)

  const columns = db.exec('PRAGMA table_info(drug_catalog)')[0].values
  const sgkColumn = columns.find(column => column[1] === 'sgk_odeme')
  const labelDetailColumn = columns.find(column => column[1] === 'label_detail')
  expect(sgkColumn).toBeDefined()
  expect(sgkColumn[2]).toBe('INTEGER')
  expect(sgkColumn[3]).toBe(1)
  expect(String(sgkColumn[4])).toBe('0')
  expect(labelDetailColumn).toBeDefined()

  const medColumns = db.exec('PRAGMA table_info(meds)')[0].values
  expect(medColumns.find(column => column[1] === 'catalogLabelDetail')).toBeDefined()
  const customizedColumn = medColumns.find(column => column[1] === 'catalogLabelDetailCustomized')
  const enabledColumn = medColumns.find(column => column[1] === 'catalogLabelDetailEnabled')
  expect(customizedColumn).toBeDefined()
  expect(String(customizedColumn[4])).toBe('0')
  expect(enabledColumn).toBeDefined()
  expect(String(enabledColumn[4])).toBe('0')

  db.run("INSERT INTO drug_catalog (label, active_ingredient) VALUES ('TEST', 'TEST')")
  expect(db.exec("SELECT sgk_odeme FROM drug_catalog WHERE label = 'TEST'")[0].values[0][0]).toBe(0)
  expect(db.exec('PRAGMA user_version')[0].values[0][0]).toBe(30)
  db.close()
})

test('version 26 catalog migrates existing rows through label detail migration', () => {
  const db = new SQL.Database()
  db.run(`CREATE TABLE drug_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT DEFAULT '',
    active_ingredient TEXT DEFAULT ''
  )`)
  db.run('CREATE TABLE meds (id INTEGER PRIMARY KEY)')
  db.run("INSERT INTO drug_catalog (label, active_ingredient) VALUES ('MEVCUT', 'ETKEN')")
  db.run('PRAGMA user_version = 26')

  initMigrations(db)

  expect(db.exec("SELECT sgk_odeme FROM drug_catalog WHERE label = 'MEVCUT'")[0].values[0][0]).toBe(0)
  expect(db.exec("SELECT label_detail FROM drug_catalog WHERE label = 'MEVCUT'")[0].values[0][0]).toBe('')
  expect(db.exec('PRAGMA user_version')[0].values[0][0]).toBe(30)
  db.close()
})
