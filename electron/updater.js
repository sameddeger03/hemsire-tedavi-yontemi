const { autoUpdater } = require('electron-updater')
const { app } = require('electron')
const log = require('electron-log')
const config = require('./config')
const devLog = require('./devLogger')
const { API_URL } = require('./constants')

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.logger = log
log.transports.file.level = 'info'

let initialized = false
let updaterEnabled = false
let updateTarget = null
let startupMode = false
let startupResolve = null
let lastProgressBucket = -1
let updateAvailableHandler = null
let updateErrorHandler = null
let startupDownloadStarted = false

function send(channel, payload) {
  if (updateTarget && !updateTarget.isDestroyed()) updateTarget.webContents.send(channel, payload)
}

function resolveFeedUrl() {
  return `${config.get('apiUrl') || API_URL}/api/versions`
}

function finishStartupGate(result = null) {
  if (!startupResolve) return
  const done = startupResolve
  startupResolve = null
  done(result)
}

function initAutoUpdater(targetWindow, options = {}) {
  if (process.windowsStore) {
    log.info('Microsoft Store paketi: electron-updater devre dışı')
    return false
  }
  updateTarget = targetWindow
  startupMode = Boolean(options.startup)
  if (initialized) return updaterEnabled
  initialized = true

  if (!app.isPackaged) {
    devLog.warn('GÜNCELLEME', 'Paketli olmayan geliştirme sürümünde otomatik güncelleme atlandı')
    return false
  }

  let feedUrl
  try { feedUrl = resolveFeedUrl() }
  catch (error) {
    log.error(`Güncelleme servisi devre dışı: ${error.message}`)
    return false
  }

  autoUpdater.setFeedURL({ url: feedUrl, provider: 'generic' })
  updaterEnabled = true
  log.info(`Güncelleme servisi hazır. Mevcut sürüm: ${app.getVersion()}, kaynak: ${feedUrl}`)

  autoUpdater.on('checking-for-update', () => send('update-checking'))
  autoUpdater.on('update-available', (info) => {
    log.info(`Yeni sürüm bulundu: ${info.version}`)
    send('update-available', info)
    if (startupMode) {
      if (startupDownloadStarted) return
      startupDownloadStarted = true
      log.info('Açılış güncellemesi zorunlu olarak indiriliyor')
      downloadUpdate().catch((error) => {
        log.error(`Açılış güncellemesi indirilemedi: ${error.stack || error.message}`)
        send('update-error', { message: error.message })
        finishStartupGate()
      })
      return
    }
    if (updateAvailableHandler) updateAvailableHandler(info)
  })
  autoUpdater.on('update-not-available', (info) => {
    log.info(`Uygulama güncel: ${info?.version || app.getVersion()}`)
    send('update-not-available')
    finishStartupGate()
  })
  autoUpdater.on('download-progress', (progress) => {
    const bucket = Math.floor(progress.percent / 10) * 10
    if (bucket !== lastProgressBucket) {
      lastProgressBucket = bucket
      log.info(`Güncelleme indiriliyor: %${progress.percent.toFixed(1)}`)
    }
    send('update-download-progress', progress)
  })
  autoUpdater.on('update-downloaded', (info) => {
    log.info(`Güncelleme indirildi: ${info.version}; kurulum otomatik başlatılıyor`)
    send('update-downloaded', info)
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 700)
  })
  autoUpdater.on('error', (error) => {
    log.error(`Otomatik güncelleme hatası: ${error.stack || error.message}`)
    send('update-error', { message: error.message })
    if (updateErrorHandler) updateErrorHandler(error)
    finishStartupGate()
  })
  return true
}

function runStartupUpdate(targetWindow) {
  return new Promise(async (resolve) => {
    startupResolve = resolve
    const enabled = initAutoUpdater(targetWindow, { startup: true })
    if (!enabled) { finishStartupGate(null); return }
    const result = await checkForUpdates()
    if (!result) finishStartupGate(null)
  })
}

async function checkForUpdates() {
  if (!updaterEnabled) return null
  try { return await autoUpdater.checkForUpdates() }
  catch (error) {
    log.error(`Güncelleme kontrolü başarısız: ${error.stack || error.message}`)
    send('update-error', { message: error.message })
    finishStartupGate()
    return null
  }
}

async function downloadUpdate() {
  return autoUpdater.downloadUpdate()
}

function quitAndInstall() {
  autoUpdater.quitAndInstall(false, true)
}

function setUpdateAvailableHandler(handler) {
  updateAvailableHandler = handler
}

function setUpdateErrorHandler(handler) {
  updateErrorHandler = handler
}

module.exports = { initAutoUpdater, runStartupUpdate, checkForUpdates, downloadUpdate, quitAndInstall, setUpdateAvailableHandler, setUpdateErrorHandler }
