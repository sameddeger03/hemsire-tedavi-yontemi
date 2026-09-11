const { STORE_URL, isStoreMigrationRelease, showStoreMigration } = require('../electron/storeMigration')

test('yalnız paketli NSIS 9.9.9 sürümünü Store geçiş ekranına yönlendirir', async () => {
  expect(isStoreMigrationRelease({ version: '9.9.9', isPackaged: true, windowsStore: false })).toBe(true)
  expect(isStoreMigrationRelease({ version: '9.9.9', isPackaged: true, windowsStore: true })).toBe(false)
  expect(isStoreMigrationRelease({ version: '9.9.9', isPackaged: false, windowsStore: false })).toBe(false)

  const app = { getVersion: () => '9.9.9', isPackaged: true, quit: jest.fn() }
  const dialog = { showMessageBox: jest.fn(async () => ({ response: 0 })) }
  const shell = { openExternal: jest.fn(async () => {}) }

  await expect(showStoreMigration({ app, dialog, shell, windowsStore: false })).resolves.toBe(true)
  expect(dialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Artık bu sürüm kullanılamaz',
    message: 'Lütfen bu uygulamayı Microsoft Store üzerinden kurun.'
  }))
  expect(shell.openExternal).toHaveBeenCalledWith(STORE_URL)
  expect(app.quit).toHaveBeenCalledTimes(1)
})
