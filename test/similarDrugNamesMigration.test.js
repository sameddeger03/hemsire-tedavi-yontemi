jest.mock('electron', () => ({ app: {} }))

const initSqlJs = require('sql.js')
const { initMigrations } = require('../electron/migrations')

describe('similar drug names migration', () => {
  it('creates the relation table when upgrading from schema version 22', async () => {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    db.run('CREATE TABLE meds (id INTEGER PRIMARY KEY, dose TEXT)')
    db.run('PRAGMA user_version = 22')

    initMigrations(db)

    const table = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'similar_drug_names'")
    expect(table[0].values[0][0]).toBe('similar_drug_names')
    const clinicalTable = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drug_clinical_info'")
    expect(clinicalTable[0].values[0][0]).toBe('drug_clinical_info')
    const medColumns = db.exec('PRAGMA table_info(meds)')[0].values.map(row => row[1])
    expect(medColumns).toEqual(expect.arrayContaining(['doseValue', 'doseUnit']))
    expect(db.exec('PRAGMA user_version')[0].values[0][0]).toBe(30)
  })
})
