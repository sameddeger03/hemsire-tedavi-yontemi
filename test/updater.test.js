const { EventEmitter } = require('events')

let mockAutoUpdater

jest.mock('electron-updater', () => ({
  get autoUpdater() { return mockAutoUpdater }
}))
jest.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '1.0.0' }
}))
jest.mock('electron-log', () => ({
  transports: { file: {} },
  info: jest.fn(),
  error: jest.fn()
}))
jest.mock('../electron/config', () => ({
  get: key => key === 'apiUrl' ? 'https://tedavi.dislek.com' : undefined
}))
jest.mock('../electron/devLogger', () => ({ warn: jest.fn() }))

function createUpdater() {
  mockAutoUpdater = Object.assign(new EventEmitter(), {
    setFeedURL: jest.fn(),
    checkForUpdates: jest.fn(async () => ({})),
    downloadUpdate: jest.fn(async () => []),
    quitAndInstall: jest.fn()
  })
  return mockAutoUpdater
}

function createTarget() {
  return { isDestroyed: () => false, webContents: { send: jest.fn() } }
}

describe('uygulama güncelleme politikası', () => {
  beforeEach(() => {
    jest.resetModules()
    delete process.windowsStore
    createUpdater()
  })

  afterEach(() => {
    delete process.windowsStore
  })

  test('Microsoft Store paketinde electron-updater başlatılmaz', () => {
    Object.defineProperty(process, 'windowsStore', { value: true, configurable: true })
    const updater = require('../electron/updater')

    expect(updater.initAutoUpdater(createTarget(), { startup: true })).toBe(false)
    expect(mockAutoUpdater.setFeedURL).not.toHaveBeenCalled()
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  test('açılışta bulunan güncellemeyi onay beklemeden indirir', async () => {
    const updater = require('../electron/updater')
    const runtimeHandler = jest.fn()
    updater.setUpdateAvailableHandler(runtimeHandler)
    updater.initAutoUpdater(createTarget(), { startup: true })

    mockAutoUpdater.emit('update-available', { version: '2.0.0' })
    await Promise.resolve()

    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(runtimeHandler).not.toHaveBeenCalled()
  })

  test('çalışma zamanında bulunan güncellemeyi karar işleyicisine iletir', () => {
    const updater = require('../electron/updater')
    const runtimeHandler = jest.fn()
    updater.setUpdateAvailableHandler(runtimeHandler)
    updater.initAutoUpdater(createTarget())

    const info = { version: '2.0.0' }
    mockAutoUpdater.emit('update-available', info)

    expect(runtimeHandler).toHaveBeenCalledWith(info)
    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })
})
