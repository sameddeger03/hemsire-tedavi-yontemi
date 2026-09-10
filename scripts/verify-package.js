const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const asar = require('@electron/asar')

module.exports = async function ({ appOutDir }) {
  const archive = path.join(appOutDir, 'resources', 'app.asar')
  const files = asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, ''))
  const allowed = new Set(['dist', 'electron', 'printer', 'shared', 'build', 'node_modules', 'package.json'])
  for (const file of files) {
    assert.ok(allowed.has(file.split('/')[0]), `Unexpected packaged path: ${file}`)
    assert.ok(!/(^|\/)\.env($|\.)|\.(db|tar\.gz)(-|$)/i.test(file), `Private data in package: ${file}`)
  }
  for (const file of ['electron/main.js', 'electron/preload.js', 'electron/constants.js', 'dist/index.html', 'printer/index.js', 'shared/doseUnits.js', 'shared/activeIngredients.js', 'build/icon.ico', 'node_modules/sql.js/dist/sql-wasm.wasm']) {
    assert.ok(files.includes(file), `Missing runtime file: ${file}`)
  }
  const expected = require('../package.json').version
  assert.equal(JSON.parse(asar.extractFile(archive, 'package.json')).version, expected)
  assert.ok(asar.extractFile(archive, 'electron/constants.js').toString().includes('https://tedavi.dislek.com'))
  fs.writeFileSync(path.join(path.dirname(appOutDir), 'package-check.json'), JSON.stringify({ version: expected, entries: files.length, runtimeFiles: 'ok', privateData: 'absent' }, null, 2))
  console.log(`Package ${expected} verified: ${files.length} entries, runtime files present, private data absent`)
}
