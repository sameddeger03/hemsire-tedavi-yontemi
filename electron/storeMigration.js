const STORE_MIGRATION_VERSION = '9.9.9'
const STORE_URL = 'ms-windows-store://pdp/?productid=9NVH397592FX'

function isStoreMigrationRelease({ version, isPackaged, windowsStore }) {
  return version === STORE_MIGRATION_VERSION && isPackaged && !windowsStore
}

async function showStoreMigration({ app, dialog, shell, windowsStore = process.windowsStore }) {
  if (!isStoreMigrationRelease({ version: app.getVersion(), isPackaged: app.isPackaged, windowsStore })) return false

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Artık bu sürüm kullanılamaz',
    message: 'Lütfen bu uygulamayı Microsoft Store üzerinden kurun.',
    buttons: ['Microsoft Store’u Aç', 'Kapat'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  })
  if (result.response === 0) await shell.openExternal(STORE_URL)
  app.quit()
  return true
}

module.exports = { STORE_MIGRATION_VERSION, STORE_URL, isStoreMigrationRelease, showStoreMigration }
