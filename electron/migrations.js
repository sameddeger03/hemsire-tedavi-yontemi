const path = require('path')
const fs = require('fs')
const { app } = require('electron')

let db = null
let saveFn = null

function initMigrations(_db, _saveFn) {
  db = _db
  saveFn = _saveFn

  db.run('PRAGMA foreign_keys = ON')

  const currentVersion = db.exec("PRAGMA user_version")[0].values[0][0]

  const migrations = [
    {
      version: 1,
      up: () => {
        db.run(`CREATE TABLE IF NOT EXISTS patients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          archived INTEGER DEFAULT 0
        )`)
        db.run(`CREATE TABLE IF NOT EXISTS meds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          patientId INTEGER NOT NULL,
          name TEXT NOT NULL,
          route TEXT NOT NULL,
          dose TEXT NOT NULL,
          times TEXT NOT NULL,
          condition TEXT DEFAULT 'standard',
          conditionData TEXT DEFAULT '{}',
          note TEXT DEFAULT '',
          startDate TEXT DEFAULT '',
          FOREIGN KEY (patientId) REFERENCES patients(id)
        )`)
        try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_name ON patients(name)") } catch (e) {}
      }
    },
    {
      version: 2,
      up: () => {
        try { db.run("ALTER TABLE meds ADD COLUMN note TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 3,
      up: () => {
        try { db.run("ALTER TABLE meds ADD COLUMN startDate TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 4,
      up: () => {
        try { db.run("ALTER TABLE meds ADD COLUMN timeDoses TEXT DEFAULT '{}'") } catch (e) {}
      }
    },
    {
      version: 5,
      up: () => {
        try { db.run("ALTER TABLE meds ADD COLUMN activeIngredient TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 6,
      up: () => {
        try { db.run("ALTER TABLE patients ADD COLUMN mayiFluid TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE patients ADD COLUMN mayiContents TEXT DEFAULT '[]'") } catch (e) {}
      }
    },
    {
      version: 7,
      up: () => {
        try { db.run("ALTER TABLE patients ADD COLUMN height TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE patients ADD COLUMN weight TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE patients ADD COLUMN patient_no TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 8,
      up: () => {
        db.run(`CREATE TABLE IF NOT EXISTS cabinet_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE
        )`)
        db.run(`CREATE TABLE IF NOT EXISTS cabinet_drugs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cabinetId INTEGER NOT NULL,
          name TEXT NOT NULL,
          form TEXT DEFAULT '',
          dose TEXT DEFAULT '',
          quantity INTEGER DEFAULT 0,
          expiry TEXT DEFAULT '',
          FOREIGN KEY (cabinetId) REFERENCES cabinet_history(id) ON DELETE CASCADE
        )`)
      }
    },
    {
      version: 9,
      up: () => {
        try { db.run("ALTER TABLE cabinet_drugs ADD COLUMN unit TEXT DEFAULT 'Adet'") } catch (e) {}
      }
    },
    {
      version: 10,
      up: () => {
        db.run(`CREATE TABLE IF NOT EXISTS drug_catalog (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT DEFAULT '',
          full_name TEXT DEFAULT '',
          barcode TEXT DEFAULT '',
          atc_code TEXT DEFAULT '',
          active_ingredient TEXT DEFAULT '',
          etken_detay TEXT DEFAULT '',
          karisimMi INTEGER DEFAULT 0,
          sgk_odeme INTEGER NOT NULL DEFAULT 0,
          form TEXT DEFAULT '',
          drug_type TEXT DEFAULT ''
        )`)
        try { db.run("ALTER TABLE drug_catalog ADD COLUMN form TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE drug_catalog ADD COLUMN drug_type TEXT DEFAULT ''") } catch (e) {}
        db.run(`CREATE INDEX IF NOT EXISTS idx_dc_label ON drug_catalog(label)`)
        db.run(`CREATE INDEX IF NOT EXISTS idx_dc_ai ON drug_catalog(active_ingredient)`)
        db.run(`CREATE INDEX IF NOT EXISTS idx_dc_barcode ON drug_catalog(barcode)`)
      }
    },
    {
      version: 11,
      up: () => {
        try { db.run("ALTER TABLE patients ADD COLUMN gender TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE patients ADD COLUMN birthDate TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 12,
      up: () => {
        db.run(`CREATE TABLE IF NOT EXISTS dosages (
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
          tolerance_percent REAL DEFAULT 2.0
        )`)
        db.run(`CREATE INDEX IF NOT EXISTS idx_dos_ai ON dosages(active_ingredient)`)
        db.run(`CREATE INDEX IF NOT EXISTS idx_dos_form ON dosages(form)`)
      }
    },
    {
      version: 13,
      up: () => {
        try { db.run('ALTER TABLE dosages ADD COLUMN max_dose REAL') } catch (e) { /* column may already exist */ }
      }
    },
    {
      version: 14,
      up: () => {
        try { db.run('ALTER TABLE drug_catalog ADD COLUMN properties TEXT DEFAULT NULL') } catch (e) { /* column may already exist */ }
      }
    },
    {
      version: 15,
      up: () => {
        try { db.run('ALTER TABLE meds ADD COLUMN luezym INTEGER DEFAULT 0') } catch (e) { /* column may already exist */ }
      }
    },
    {
      version: 16,
      up: () => {
        try { db.run("ALTER TABLE patients ADD COLUMN infDrug TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE patients ADD COLUMN infDose TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE patients ADD COLUMN infFluid TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE patients ADD COLUMN infTotalMl TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE patients ADD COLUMN infRate TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 17,
      up: () => {
        try { db.run("ALTER TABLE patients ADD COLUMN infActiveIngredient TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 18,
      up: () => {
        try { db.run("ALTER TABLE patients ADD COLUMN infList TEXT DEFAULT '[]'") } catch (e) {}
        try {
          const result = db.exec("SELECT id, infDrug, infDose, infFluid, infTotalMl, infRate, infActiveIngredient FROM patients WHERE infDrug IS NOT NULL AND infDrug != ''")
          if (result && result[0] && result[0].values) {
            const stmt = db.prepare('UPDATE patients SET infList = ? WHERE id = ?')
            for (const row of result[0].values) {
              const [id, drug, dose, fluid, totalMl, rate, activeIngredient] = row
              const list = JSON.stringify([{ drug: drug || '', dose: dose || '', fluid: fluid || 'SF', totalMl: totalMl || '', rate: rate || '', activeIngredient: activeIngredient || '' }])
              stmt.run([list, id])
            }
            stmt.free()
          }
        } catch (e) { console.error('v18 data migration error:', e) }
      }
    },
    {
      version: 19,
      up: () => {
        db.run("UPDATE dosages SET age_min = 18 WHERE age_group = 'adult' AND age_min IS NULL AND age_max IS NULL")
        db.run("UPDATE dosages SET age_min = 0, age_max = 17 WHERE age_group = 'pediatric' AND age_min IS NULL AND age_max IS NULL")
        db.run("UPDATE dosages SET age_min = 0, age_max = 0 WHERE age_group = 'neonatal' AND age_min IS NULL AND age_max IS NULL")
        db.run("UPDATE dosages SET age_group = 'range'")
      }
    },
    {
      version: 20,
      up: () => {
        try { db.run("ALTER TABLE patients ADD COLUMN mayiRate TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 21,
      up: () => {
        try { db.run("ALTER TABLE meds ADD COLUMN catalogBarcode TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 22,
      up: () => {
        try { db.run("ALTER TABLE drug_catalog ADD COLUMN etken_detay TEXT DEFAULT ''") } catch (e) {}
        try { db.run('ALTER TABLE drug_catalog ADD COLUMN karisimMi INTEGER DEFAULT 0') } catch (e) {}
        try { db.run('CREATE INDEX IF NOT EXISTS idx_dc_etken_detay ON drug_catalog(etken_detay)') } catch (e) {}
      }
    },
    {
      version: 23,
      up: () => {
        db.run(`CREATE TABLE IF NOT EXISTS similar_drug_names (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          drug_label TEXT NOT NULL,
          similar_label TEXT NOT NULL,
          UNIQUE(drug_label, similar_label)
        )`)
        db.run('CREATE INDEX IF NOT EXISTS idx_similar_drug_label ON similar_drug_names(drug_label)')
      }
    },
    {
      version: 24,
      up: () => {
        try { db.run("ALTER TABLE similar_drug_names ADD COLUMN similarity_type TEXT DEFAULT 'name'") } catch (e) {}
        try { db.run("ALTER TABLE similar_drug_names ADD COLUMN source_code TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE similar_drug_names ADD COLUMN source_revision TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE similar_drug_names ADD COLUMN source_date TEXT DEFAULT ''") } catch (e) {}
        db.run(`CREATE TABLE IF NOT EXISTS drug_clinical_info (
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
        db.run('CREATE INDEX IF NOT EXISTS idx_dci_lookup ON drug_clinical_info(lookup_name)')
        db.run('CREATE INDEX IF NOT EXISTS idx_dci_category ON drug_clinical_info(category)')
      }
    },
    {
      version: 25,
      up: () => {
        try { db.run('ALTER TABLE meds ADD COLUMN doseValue REAL') } catch (e) {}
        try { db.run("ALTER TABLE meds ADD COLUMN doseUnit TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 26,
      up: () => {
        try { db.run("ALTER TABLE meds ADD COLUMN customLabel TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 27,
      up: () => {
        try { db.run('ALTER TABLE drug_catalog ADD COLUMN sgk_odeme INTEGER NOT NULL DEFAULT 0') } catch (e) {}
      }
    },
    {
      version: 28,
      up: () => {
        try { db.run("ALTER TABLE drug_catalog ADD COLUMN label_detail TEXT DEFAULT ''") } catch (e) {}
        try { db.run("ALTER TABLE meds ADD COLUMN catalogLabelDetail TEXT DEFAULT ''") } catch (e) {}
      }
    },
    {
      version: 29,
      up: () => {
        try { db.run('ALTER TABLE meds ADD COLUMN catalogLabelDetailCustomized INTEGER DEFAULT 0') } catch (e) {}
      }
    },
    {
      version: 30,
      up: () => {
        try { db.run('ALTER TABLE meds ADD COLUMN catalogLabelDetailEnabled INTEGER DEFAULT 0') } catch (e) {}
        try { db.run("UPDATE meds SET catalogLabelDetailEnabled = 1 WHERE TRIM(COALESCE(catalogLabelDetail, '')) != ''") } catch (e) {}
      }
    },
    {
      version: 31,
      up: () => {
        try { db.run("ALTER TABLE drug_catalog ADD COLUMN mixture_content TEXT DEFAULT ''") } catch (e) {}
      }
    }
  ]

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      try {
        migration.up()
        db.run(`PRAGMA user_version = ${migration.version}`)
      } catch (e) {
        console.error(`Migration ${migration.version} failed:`, e.message)
        break
      }
    }
  }

  if (saveFn) saveFn()
}

module.exports = { initMigrations }
