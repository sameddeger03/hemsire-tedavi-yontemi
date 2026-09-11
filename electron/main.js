const { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell, Tray } = require('electron')
const path = require('path')
const { USER_DATA_DIRECTORY, REPORT_TEMP_DIRECTORY } = require('./productIdentity')

app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIRECTORY))

const { pathToFileURL } = require('url')
const fs = require('fs')
const os = require('os')
const { exec } = require('child_process')
const http = require('http')
const https = require('https')
const { printZPL, getPrinterName, setPrinterName } = require('../printer/index')
const db = require('./database')
const config = require('./config')
const { parseOrders } = require('./orderParser')
const { parsePatients } = require('./patientParser')
const { initAutoUpdater, runStartupUpdate, checkForUpdates, downloadUpdate, quitAndInstall, setUpdateAvailableHandler, setUpdateErrorHandler } = require('./updater')
const devLog = require('./devLogger')
const { API_URL } = require('./constants')
const { isCompatibleServer } = require('./clientProtocol')
const { normalizeApiUrl, normalizeApiAddressInput, activateApiAccess } = require('./apiAccess')
const { startServerEvents } = require('./serverEvents')
const uptoDate = require('./uptodate')
const globalRph = require('./globalrph')
const { searchDuckDuckGoCandidates } = require('./duckduckgoSearch')
const { findDirectProspectusCandidates } = require('./prospectusSources')
const selcukEcza = require('./selcukEcza')
const ilacRehberi = require('./ilacRehberi')
const ilacFiyati = require('./ilacFiyati')
const { formatDose, normalizeMedicationDose, parseDose } = require('../shared/doseUnits')
const { createWindowsTaskScheduler, findOldestDueReminder, markReminderDelivered, normalizeReminders } = require('./reminderRuntime')
const { normalizeClientMenuVisibility } = require('./clientMenuVisibility')
const { classifySecondInstanceCommand, createRelaunchCoordinator } = require('./relaunchFlow')
const { showStoreMigration } = require('./storeMigration')

let mainWindow
let authWindow
let authResolve
let updateWindow
let splashWindow
let startupInProgress = true
let periodicUpdateCheckRunning = false
let updateTransitionStarted = false
let updatePromptOpen = false
let pendingRuntimeUpdateInfo = null
let dataUpdateWindow
let dataUpdatePromise = null
let periodicUpdateTimer
let serverEventConnection
let serverConnectionOnline = false
const serverMessages = new Map()
let tray
let reminderTimer
let activeReminderId = null
let isQuitting = false
let foregroundRelaunchRequested = false
const backgroundLaunch = process.argv.includes('--background') || process.argv.includes('--background-reminder')
const backgroundRuntimeEnabled = app.isPackaged || process.env.REMINDER_BACKGROUND_TEST === '1'
const reminderTaskScheduler = createWindowsTaskScheduler({
  enabled: process.platform === 'win32' && app.isPackaged,
  executablePath: process.execPath,
  logger: devLog
})

function showAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  mainWindow.moveTop()
}

function focusActiveGateWindow() {
  const activeWindow = dataUpdateWindow || updateWindow || authWindow || splashWindow
  if (!activeWindow || activeWindow.isDestroyed()) {
    showAndFocusMainWindow()
    return
  }
  if (activeWindow.isMinimized()) activeWindow.restore()
  activeWindow.show()
  activeWindow.focus()
}

function hideMainWindowForRelaunch() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
}

function reloadMainWindowForRelaunch() {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve(false)
      return
    }

    let settled = false
    const finish = (loaded) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      mainWindow?.webContents.removeListener('did-finish-load', handleLoaded)
      mainWindow?.webContents.removeListener('did-fail-load', handleFailed)
      resolve(loaded)
    }
    const handleLoaded = () => finish(true)
    const handleFailed = () => finish(false)
    const timeout = setTimeout(() => finish(false), 15000)

    mainWindow.webContents.once('did-finish-load', handleLoaded)
    mainWindow.webContents.once('did-fail-load', handleFailed)
    mainWindow.webContents.reload()
  })
}

function restoreRuntimeUpdaterAfterRelaunch() {
  updatePromptOpen = false
  pendingRuntimeUpdateInfo = null
  initAutoUpdater(mainWindow)
}

const relaunchCoordinator = createRelaunchCoordinator({
  hideMainWindow: hideMainWindowForRelaunch,
  focusActiveGate: focusActiveGateWindow,
  runSplashGate,
  ensureApiAccess,
  runUpdateGate,
  runDataUpdateGate,
  restoreRuntimeUpdater: restoreRuntimeUpdaterAfterRelaunch,
  reloadMainWindow: reloadMainWindowForRelaunch,
  showMainWindow: showAndFocusMainWindow,
  onError: error => devLog.error('BAŞLANGIÇ', `Uygulama yeniden açılış akışı başarısız: ${error.stack || error.message}`)
})

function getStoredReminders() {
  return normalizeReminders(config.get('reminders'))
}

function persistReminders(reminders, notifyRenderer = true) {
  const normalized = normalizeReminders(reminders)
  config.set('reminders', normalized)
  if (notifyRenderer && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('reminders-changed', normalized)
  }
  void reminderTaskScheduler.sync(normalized)
  return normalized
}

function deliverActiveReminder(reminder) {
  if (!reminder || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isLoading()) return
  mainWindow.webContents.send('reminder-due', reminder)
}

function processDueReminders() {
  const reminders = getStoredReminders()
  if (!activeReminderId) {
    const due = findOldestDueReminder(reminders)
    if (due) {
      activeReminderId = due.id
      const notification = new Notification({
        title: 'Hemşire Tedavi Yönetimi Hatırlatması',
        body: due.text,
        urgency: 'critical',
        timeoutType: 'never'
      })
      notification.on('click', showAndFocusMainWindow)
      notification.show()
      showAndFocusMainWindow()
      deliverActiveReminder(due)
    }
  }
  void reminderTaskScheduler.sync(reminders)
}

function initializeReminderRuntime() {
  const reminders = persistReminders(config.get('reminders'), false)
  if (app.isPackaged && process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: ['--background'] })
  }
  void reminderTaskScheduler.sync(reminders)
  clearInterval(reminderTimer)
  reminderTimer = setInterval(processDueReminders, 15000)
}

function createTray() {
  if (!backgroundRuntimeEnabled || tray) return
  tray = new Tray(path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'))
  tray.setToolTip('Hemşire Tedavi Yönetimi arka planda çalışıyor')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Hemşire Tedavi Yönetimi’ni Aç', click: showAndFocusMainWindow },
    { type: 'separator' },
    {
      label: 'Tamamen Çık',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ]))
  tray.on('double-click', showAndFocusMainWindow)
}

function shutdownDevelopmentRuntime() {
  if (app.isPackaged || isQuitting) return
  isQuitting = true
  clearInterval(periodicUpdateTimer)
  clearInterval(reminderTimer)
  serverEventConnection?.stop()
  tray?.destroy()
  tray = null
  app.quit()
}

function disableGateWindowShortcuts(window) {
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return

    const key = String(input.key || '').toLowerCase()
    const commandKey = input.control || input.meta
    const blocked =
      key === 'f11' ||
      key === 'f12' ||
      (commandKey && ['r', 'w', 'q', 'u', 'p', '+', '-', '0'].includes(key)) ||
      (commandKey && input.shift && ['i', 'j', 'c', 'r'].includes(key)) ||
      (input.alt && ['arrowleft', 'arrowright'].includes(key))

    if (blocked) event.preventDefault()
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine) => {
    const commandType = classifySecondInstanceCommand(commandLine)
    if (commandType === 'reminder') {
      processDueReminders()
      return
    }
    if (commandType === 'background') return

    if (startupInProgress) {
      focusActiveGateWindow()
      foregroundRelaunchRequested = true
      return
    }
    void relaunchCoordinator.run()
  })
}

function verifyApiKey(apiUrl, apiKey) {
  return new Promise((resolve) => {
    let client
    try { client = apiClient(apiUrl) } catch (error) { resolve({ success: false, error: error.message }); return }
    const req = client.request(`${apiUrl.replace(/\/$/, '')}/api/drugs/stats`, {
      method: 'GET', timeout: 7000, headers: { 'x-api-key': apiKey }
    }, (res) => {
      res.resume()
      if (res.statusCode === 200) resolve({ success: true })
      else if (res.statusCode === 401 || res.statusCode === 403) resolve({ success: false, invalidKey: true, error: 'API anahtarı geçersiz veya iptal edilmiş.' })
      else resolve({ success: false, error: `Sunucu doğrulama hatası (${res.statusCode}).` })
    })
    req.on('timeout', () => req.destroy(new Error('Sunucu yanıt vermedi.')))
    req.on('error', (error) => resolve({ success: false, offline: true, error: `API sunucusuna bağlanılamadı: ${error.message}` }))
    req.end()
  })
}

function getClientMenuVisibility() {
  return new Promise((resolve) => {
    const apiUrl = String(config.get('apiUrl') || API_URL).replace(/\/$/, '')
    const apiKey = String(config.get('apiKey') || '')
    if (!apiKey) {
      devLog.warn('MENÜ', 'Özel menü kontrolü: API anahtarı yapılandırılmamış')
      return resolve(null)
    }
    const maskedApiKey = apiKey.length > 8
      ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
      : `${apiKey.slice(0, 2)}…${apiKey.slice(-2)}`
    devLog.info('MENÜ', `Özel menü kontrolü API anahtarı: ${maskedApiKey} (${apiKey.length} karakter)`)
    let client
    try { client = apiClient(apiUrl) } catch { return resolve(null) }
    const req = client.request(`${apiUrl}/api/client/menu-visibility`, {
      method: 'GET', timeout: 7000, headers: { 'x-api-key': apiKey }
    }, (res) => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { if (raw.length <= 16384) raw += chunk })
      res.on('end', () => {
        if (res.statusCode !== 200 || raw.length > 16384) return resolve(null)
        try {
          resolve(normalizeClientMenuVisibility(JSON.parse(raw)))
        } catch { resolve(null) }
      })
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(null))
    req.end()
  })
}

function checkServerOnce() {
  return new Promise((resolve) => {
    const apiUrl = config.get('apiUrl') || API_URL
    let client
    try { client = apiClient(apiUrl) } catch { resolve(false); return }
    const req = client.get(`${apiUrl.replace(/\/$/, '')}/api/drugs/health`, { timeout: 7000 }, (res) => {
      res.resume()
      resolve(res.statusCode >= 200 && res.statusCode < 500)
    })
    req.on('timeout', () => req.destroy(new Error('Sunucu yanıt vermedi.')))
    req.on('error', () => resolve(false))
  })
}

async function checkServerReachable(attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await checkServerOnce()) return true
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 600))
  }
  return false
}

function sendSplashStatus(message, error = false) {
  if (!splashWindow?.isDestroyed()) splashWindow.webContents.send('splash-status', { message, error })
}

function runSplashGate() {
  return new Promise((resolve) => {
    splashWindow = new BrowserWindow({
      width: 480, height: 360, resizable: false, maximizable: false, minimizable: false,
      closable: false, autoHideMenuBar: true, frame: false, title: 'Hemşire Tedavi Yönetimi',
      icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'splashPreload.js'), contextIsolation: true, nodeIntegration: false
      }
    })
    disableGateWindowShortcuts(splashWindow)
    splashWindow.loadFile(path.join(__dirname, 'splash.html'))
    const retryHandler = (event) => {
      if (event.sender === splashWindow?.webContents) evaluateStartupState()
    }
    const closeHandler = (event) => {
      if (event.sender === splashWindow?.webContents) finish({ action: 'quit' })
    }
    ipcMain.on('splash-retry', retryHandler)
    ipcMain.on('splash-close', closeHandler)

    splashWindow.webContents.once('did-finish-load', evaluateStartupState)

    async function evaluateStartupState() {
      sendSplashStatus('Sunucu bağlantısı kontrol ediliyor...')
      const hasApiKey = Boolean(config.get('apiKey'))
      const keyStatus = hasApiKey
        ? await verifyApiKey(config.get('apiUrl') || API_URL, config.get('apiKey'))
        : { success: false, offline: !(await checkServerReachable()) }
      const testMode = !app.isPackaged ? String(process.env.STARTUP_TEST_MODE || '').toLowerCase() : ''

      if (testMode === 'auth') {
        sendSplashStatus('Test modu: API anahtarı ekranı açılıyor...')
        setTimeout(() => finish({ action: 'auth' }), 500)
        return
      }
      if (testMode === 'update') {
        sendSplashStatus('Test modu: güncelleme ekranı açılıyor...')
        setTimeout(() => finish({ action: 'update' }), 500)
        return
      }
      if (testMode === 'offline') {
        sendSplashStatus('Test modu: Çevrimdışı mod simüle ediliyor. Güncelleme kontrolü atlanacak...')
        setTimeout(() => finish({ action: 'offline' }), 1600)
        return
      }
      if (testMode === 'quit') {
        sendSplashStatus('Sunucuya ulaşılamadığı için uygulama açılamıyor.', true)
        return
      }

      if (!hasApiKey) {
        sendSplashStatus(!keyStatus.offline
          ? 'API anahtarı gerekli. Bağlantı ekranı açılıyor...'
          : 'API bağlantısı yapılandırılmalı. Bağlantı ekranı açılıyor...')
        setTimeout(() => finish({ action: 'auth' }), 500)
      } else if (keyStatus.invalidKey) {
        sendSplashStatus('API anahtarı geçersiz veya iptal edilmiş. Bağlantı ekranı açılıyor...')
        setTimeout(() => finish({ action: 'auth', error: keyStatus.error }), 500)
      } else if (keyStatus.success) {
        sendSplashStatus('Sunucu hazır. Güncellemeler kontrol edilecek...')
        setTimeout(() => finish({ action: 'update' }), 500)
      } else {
        sendSplashStatus('Sunucuya ulaşılamadı. Çevrimdışı modda açılıyor...')
        setTimeout(() => finish({ action: 'offline' }), 900)
      }
    }

    function finish(result) {
      ipcMain.removeListener('splash-retry', retryHandler)
      ipcMain.removeListener('splash-close', closeHandler)
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy()
      splashWindow = null
      resolve(result)
    }
  })
}

function showApiKeyWindow(initialError = '') {
  return new Promise((resolve) => {
    authResolve = resolve
    authWindow = new BrowserWindow({
      width: 460, height: 480, resizable: false, maximizable: false, minimizable: false,
      autoHideMenuBar: true, title: 'API Bağlantısı',
      icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'setupPreload.js'), contextIsolation: true, nodeIntegration: false
      }
    })
    disableGateWindowShortcuts(authWindow)
    authWindow.loadFile(path.join(__dirname, 'setup.html'), {
      query: {
        error: initialError,
        apiUrl: config.get('apiUrl') || API_URL
      }
    })
    authWindow.on('closed', () => {
      authWindow = null
      if (authResolve) { const done = authResolve; authResolve = null; done(false) }
    })
  })
}

async function ensureApiAccess(initialError = '') {
  return showApiKeyWindow(initialError)
}

function runUpdateGate() {
  if (process.windowsStore) return Promise.resolve(null)
  return new Promise((resolve) => {
    updateWindow = new BrowserWindow({
      width: 520, height: 390, resizable: false, maximizable: false, minimizable: false,
      closable: false, autoHideMenuBar: true, title: 'Güncelleme Kontrolü',
      icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      webPreferences: {
        preload: path.join(__dirname, 'updatePreload.js'), contextIsolation: true, nodeIntegration: false
      }
    })
    disableGateWindowShortcuts(updateWindow)
    updateWindow.loadFile(path.join(__dirname, 'updateGate.html'))
    updateWindow.webContents.once('did-finish-load', async () => {
      if (!app.isPackaged && String(process.env.STARTUP_TEST_MODE || '').toLowerCase() === 'update') {
        await runFakeUpdatePreview(updateWindow)
        if (updateWindow && !updateWindow.isDestroyed()) updateWindow.destroy()
        updateWindow = null
        resolve(null)
        return
      }
      const updateInfo = await runStartupUpdate(updateWindow)
      if (updateWindow && !updateWindow.isDestroyed()) updateWindow.destroy()
      updateWindow = null
      resolve(updateInfo)
    })
  })
}

function runFakeUpdatePreview(targetWindow) {
  return new Promise((resolve) => {
    const send = (channel, payload) => {
      if (targetWindow && !targetWindow.isDestroyed()) targetWindow.webContents.send(channel, payload)
    }
    send('update-checking')
    setTimeout(() => {
      send('update-available', { version: '99.0.0-test' })
      let percent = 0
      const timer = setInterval(() => {
        percent = Math.min(100, percent + 4)
        send('update-download-progress', { percent, bytesPerSecond: 2.4 * 1024 * 1024 })
        if (percent === 100) {
          clearInterval(timer)
          send('update-downloaded', { version: '99.0.0-test' })
          setTimeout(resolve, 4000)
        }
      }, 280)
    }, 1200)
  })
}

function runDataUpdateGate() {
  if (dataUpdatePromise) return dataUpdatePromise
  dataUpdatePromise = new Promise((resolve) => {
    dataUpdateWindow = new BrowserWindow({
      width: 520, height: 360, resizable: false, maximizable: false, minimizable: false,
      closable: false, autoHideMenuBar: true, title: 'Veri Güncellemesi',
      icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'dataUpdatePreload.js'), contextIsolation: true, nodeIntegration: false }
    })
    disableGateWindowShortcuts(dataUpdateWindow)
    dataUpdateWindow.loadFile(path.join(__dirname, 'dataUpdateGate.html'))
    dataUpdateWindow.webContents.once('did-finish-load', async () => {
      const base = String(config.get('apiUrl') || API_URL).replace(/\/$/, '')
      const [result, menuVisibility] = await Promise.all([
        db.syncDrugCatalog(`${base}/api/drugs`),
        getClientMenuVisibility()
      ])
      const configUpdates = {}
      if (result?.ok) {
        const now = new Date().toISOString()
        configUpdates.drugCatalogServerUpdatedAt = result.updatedAt || now
        configUpdates.drugCatalogLastSyncedAt = now
      }
      if (menuVisibility) {
        configUpdates.clientMenuVisibilityCache = menuVisibility
        devLog.success('MENÜ', `Klinik ve özel menü bilgileri yerel olarak güncellendi: ${menuVisibility.clinicalName || 'Klinik adı yok'}`)
      } else {
        devLog.warn('MENÜ', 'Klinik ve özel menü bilgileri alınamadı; mevcut yerel kayıt korundu')
      }
      if (Object.keys(configUpdates).length) config.setMany(configUpdates)
      if (dataUpdateWindow && !dataUpdateWindow.isDestroyed()) {
        dataUpdateWindow.webContents.send('data-update-result', { ok: Boolean(result?.ok), changed: Boolean(result?.changed), error: result?.error || '' })
      }
      setTimeout(() => {
        if (dataUpdateWindow && !dataUpdateWindow.isDestroyed()) dataUpdateWindow.destroy()
        dataUpdateWindow = null
        dataUpdatePromise = null
        resolve({ ...result, menuVisibilityUpdated: Boolean(menuVisibility) })
      }, result?.ok ? 450 : 1800)
    })
  })
  return dataUpdatePromise
}

function showRuntimeUpdatePrompt(info) {
  if (updateTransitionStarted || updatePromptOpen || !mainWindow || mainWindow.isDestroyed()) return
  updatePromptOpen = true
  pendingRuntimeUpdateInfo = info || {}
  mainWindow.webContents.send('runtime-update-decision-required', pendingRuntimeUpdateInfo)
}

function showRuntimeUpdateGate(info) {
  if (updateTransitionStarted) return
  updateTransitionStarted = true
  updateWindow = new BrowserWindow({
    width: 520, height: 390, resizable: false, maximizable: false, minimizable: false,
    closable: false, autoHideMenuBar: true, title: 'Güncelleme İndiriliyor',
    icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'updatePreload.js'), contextIsolation: true, nodeIntegration: false
    }
  })
  disableGateWindowShortcuts(updateWindow)
  updateWindow.loadFile(path.join(__dirname, 'updateGate.html'), { query: { version: info?.version || '' } })
  updateWindow.webContents.once('did-finish-load', () => {
    initAutoUpdater(updateWindow)
    updateWindow.webContents.send('update-available', info || {})
    downloadUpdate().catch(() => {})
  })
}

function startPeriodicUpdateChecks() {
  if (process.windowsStore) return
  setUpdateAvailableHandler(showRuntimeUpdatePrompt)
  setUpdateErrorHandler(() => {
    if (!updateTransitionStarted) return
    setTimeout(() => {
      if (updateWindow && !updateWindow.isDestroyed()) updateWindow.destroy()
      updateWindow = null
      initAutoUpdater(mainWindow)
      updateTransitionStarted = false
    }, 2000)
  })
  periodicUpdateTimer = setInterval(async () => {
    if (periodicUpdateCheckRunning || updateTransitionStarted) return
    periodicUpdateCheckRunning = true
    try { await checkForUpdates() }
    finally { periodicUpdateCheckRunning = false }
  }, 30 * 60 * 1000)
}

function handleServerEvent(event, data) {
  if (event === 'client-settings-updated') {
    getClientMenuVisibility().then(menuVisibility => {
      if (!menuVisibility) return
      config.set('clientMenuVisibilityCache', menuVisibility)
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('client-menu-visibility-updated', menuVisibility)
    }).catch(() => {})
    return
  }
  if (event === 'client-message') {
    if (data?.deleted) { serverMessages.delete(String(data.id)); return }
    if (data?.id) serverMessages.set(String(data.id), data)
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('client-message', data || {})
    return
  }
  if (event === 'catalog-updated' || event === 'catalog-refresh-requested') {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('server-catalog-updated', data || {})
    return
  }
  if (event === 'app-update-check-requested') {
    if (periodicUpdateCheckRunning || updateTransitionStarted) return
    periodicUpdateCheckRunning = true
    checkForUpdates().catch(() => {}).finally(() => { periodicUpdateCheckRunning = false })
    return
  }
}

function deliverActiveServerMessages() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const now = Date.now()
  for (const [id, message] of serverMessages) {
    if (!message.expiresAt || new Date(message.expiresAt).getTime() <= now) { serverMessages.delete(id); continue }
    mainWindow.webContents.send('client-message', message)
  }
}

function setServerConnectionOnline(online) {
  serverConnectionOnline = Boolean(online)
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('server-connection-changed', serverConnectionOnline)
}

ipcMain.handle('check-internet-connection', async () => {
  const online = await checkServerReachable(1)
  setServerConnectionOnline(online)
  return online
})

function createWindow() {
  devLog.info('ELEKTRON', 'Uygulama penceresi oluşturuluyor...')
  Menu.setApplicationMenu(null)
  const preloadTest = !app.isPackaged && String(process.env.STARTUP_TEST_MODE || '').toLowerCase() === 'preload'

  mainWindow = new BrowserWindow({
    show: !backgroundLaunch,
    width: 1024,
    height: 700,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    backgroundColor: '#6A4DA8',
    icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  mainWindow.on('focus', deliverActiveServerMessages)

  if (process.env.VITE_DEV_SERVER_URL) {
    const devServerUrl = new URL(process.env.VITE_DEV_SERVER_URL.trim())
    if (preloadTest) devServerUrl.searchParams.set('preload', '1')
    devLog.info('ARAYÜZ', `Vite geliştirme sunucusu yükleniyor: ${devServerUrl}`)
    mainWindow.loadURL(devServerUrl.toString())
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'), preloadTest ? { query: { preload: '1' } } : undefined)
  }

  mainWindow.webContents.on('did-finish-load', () => {
    devLog.success('ARAYÜZ', 'Uygulama arayüzü yüklendi')
    mainWindow.webContents.send('window-maximized-changed', mainWindow.isMaximized())
    mainWindow.webContents.send('server-connection-changed', serverConnectionOnline)
    mainWindow.webContents.send('reminders-changed', getStoredReminders())
    if (activeReminderId) {
      deliverActiveReminder(getStoredReminders().find(reminder => reminder.id === activeReminderId))
    } else {
      processDueReminders()
    }
  })
  mainWindow.webContents.on('did-fail-load', (event, code, description) => {
    devLog.error('ARAYÜZ', `Arayüz yüklenemedi (${code}): ${description}`)
  })
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (app.isPackaged || input.type !== 'keyDown' || String(input.key || '').toUpperCase() !== 'F10') return
    event.preventDefault()
    shutdownDevelopmentRuntime()
  })
  let unresponsivePromptOpen = false
  mainWindow.on('responsive', () => { unresponsivePromptOpen = false })
  mainWindow.on('unresponsive', async () => {
    if (unresponsivePromptOpen || !mainWindow || mainWindow.isDestroyed()) return
    unresponsivePromptOpen = true
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Uygulama yanıt vermiyor',
      message: 'Hemşire Tedavi Yönetimi başlatılırken yanıt vermeyi durdurdu.',
      detail: 'Bir süre daha bekleyebilir veya uygulamayı güvenli şekilde kapatabilirsiniz.',
      buttons: ['Uygulamayı Kapat', 'Bekle'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    if (result.response === 0 && mainWindow && !mainWindow.isDestroyed()) {
      isQuitting = true
      app.quit()
    }
    else unresponsivePromptOpen = false
  })
  mainWindow.on('close', (event) => {
    if (isQuitting || !backgroundRuntimeEnabled) return
    event.preventDefault()
    mainWindow.hide()
  })
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized-changed', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized-changed', false))

  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
  })
}

app.whenReady().then(async () => {
  if (await showStoreMigration({ app, dialog, shell })) return
  const splashResult = backgroundLaunch ? { action: 'offline' } : await runSplashGate()
  if (splashResult.action === 'quit') { app.quit(); return }
  if (splashResult.action === 'auth') {
    const authorized = await ensureApiAccess(splashResult.error || '')
    if (!authorized) { app.quit(); return }
  }
  if (splashResult.action !== 'offline') await runUpdateGate()
  devLog.info('BAŞLANGIÇ', `Electron hazır (sürüm ${app.getVersion()})`)
  devLog.info('VERİTABANI', 'Yerel veritabanı açılıyor ve migration işlemleri kontrol ediliyor...')
  await db.initDatabase()
  if (splashResult.action !== 'offline') await runDataUpdateGate()
  initializeReminderRuntime()
  devLog.success('VERİTABANI', 'Yerel veritabanı hazır')
  createWindow()
  // Ana pencere hazır olduğunda ikinci bir kullanıcı çağrısı artık başlangıç
  // kapısına takılı kalmamalı. Ağır olmayan arka plan servisleri aşağıda
  // başlatılsa bile yeniden-açılma koordinatörü güvenle çalışabilir.
  startupInProgress = false
  createTray()
  void uptoDate.checkAvailability(
    BrowserWindow,
    path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  )
  devLog.info('RAPORLAR', 'Bekleyen raporlar kontrol ediliyor...')
  flushPendingReports()
  initAutoUpdater(mainWindow)
  startPeriodicUpdateChecks()
  serverEventConnection = startServerEvents({
    getApiUrl: () => config.get('apiUrl') || API_URL,
    getApiKey: () => config.get('apiKey') || '',
    onConnectionChange: setServerConnectionOnline,
    onEvent: handleServerEvent,
    logger: devLog
  })
  if (foregroundRelaunchRequested) {
    foregroundRelaunchRequested = false
    void relaunchCoordinator.run()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  clearInterval(periodicUpdateTimer)
  clearInterval(reminderTimer)
  serverEventConnection?.stop()
})

app.on('window-all-closed', () => {
  if (!backgroundRuntimeEnabled && !startupInProgress && process.platform !== 'darwin') app.quit()
})

let printErrorDialogOpen = false
ipcMain.handle('print-label', async (event, zpl) => {
  let result
  try {
    result = await printZPL(zpl)
  } catch (err) {
    result = { success: false, error: err.message }
  }
  if (!result.success && !printErrorDialogOpen) {
    printErrorDialogOpen = true
    try {
      await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender) || mainWindow, {
        type: 'error', title: 'Yazdırma hatası', message: 'Etiket yazıcıya gönderilemedi.',
        detail: result.error, buttons: ['Tamam']
      })
    } finally { printErrorDialogOpen = false }
  }
  return result
})

async function getAvailablePrinterNames() {
  try {
    const printers = await mainWindow.webContents.getPrintersAsync()
    return printers.map(p => p.name).filter(Boolean)
  } catch { return [] }
}

ipcMain.handle('get-printers', async () => getAvailablePrinterNames())
ipcMain.handle('get-printer-name', async () => getPrinterName())
ipcMain.handle('get-app-version', () => ({ isDev: !app.isPackaged }))
ipcMain.handle('set-printer-name', async (event, name) => {
  const requested = String(name || '').trim()
  const available = await getAvailablePrinterNames()
  if (!available.includes(requested)) throw new Error('Seçilen yazıcı sistem yazıcıları arasında bulunamadı.')
  setPrinterName(requested)
  return true
})
ipcMain.handle('config-get', async (event, key) => key === 'apiKey' ? undefined : config.get(key))
ipcMain.handle('config-set', async (event, key, value) => {
  if (key === 'apiUrl') return false
  if (key === 'reminders') {
    persistReminders(value)
    processDueReminders()
    return true
  }
  if (key === 'apiKey' && !String(value || '').trim()) return true
  if (key === 'apiKey') {
    const result = await verifyApiKey(config.get('apiUrl') || API_URL, String(value).trim())
    if (!result.success) throw new Error(result.error)
  }
  config.set(key, value)
  if (key === 'apiKey') serverEventConnection?.reconnect()
  return true
})
ipcMain.handle('config-get-all', async () => config.getAll())
ipcMain.handle('client-menu-visibility', async () => getClientMenuVisibility())
ipcMain.handle('change-api-url', async (event, value) => {
  const oldApiUrl = String(config.get('apiUrl') || API_URL).replace(/\/$/, '')
  let newApiUrl
  try {
    newApiUrl = normalizeApiAddressInput(value)
  } catch (error) { return { success: false, error: error.message } }
  if (newApiUrl === oldApiUrl) return { success: true }

  const valid = await validateApiAddress(newApiUrl)
  if (!valid) return { success: false, error: 'API adresine güvenli bağlantı kurulamadı.' }
  config.set('apiUrl', newApiUrl)
  serverEventConnection?.reconnect()
  return { success: true }
})
ipcMain.handle('api-key-activate', async (event, values) => {
  if (!authWindow || event.sender !== authWindow.webContents) return { success: false, error: 'Geçersiz pencere.' }
  const result = await activateApiAccess(values, {
    validateAddress: validateApiAddress,
    verifyKey: verifyApiKey,
    saveCredentials: credentials => config.setMany(credentials)
  })
  if (!result.success) return result
  const done = authResolve
  authResolve = null
  authWindow.destroy()
  if (done) done(true)
  return { success: true }
})
ipcMain.handle('get-system-info', async () => {
  const interfaces = os.networkInterfaces()
  let ip = ''
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) { ip = iface.address; break }
    }
    if (ip) break
  }
  return { hostname: os.hostname(), ip, platform: os.platform(), release: os.release() }
})

ipcMain.handle('db-get-patients', async () => db.getPatients())
ipcMain.handle('db-add-patient', async (event, name, height, weight, patient_no, gender, birthDate) => db.addPatient(name, height, weight, patient_no, gender, birthDate))
ipcMain.handle('db-update-patient', async (event, id, name, height, weight, patient_no, gender, birthDate) => db.updatePatient(id, name, height, weight, patient_no, gender, birthDate))
ipcMain.handle('db-archive-patient', async (event, id) => db.archivePatient(id))
ipcMain.handle('db-restore-patient', async (event, id) => db.restorePatient(id))
ipcMain.handle('db-get-meds', async (event, patientId) => db.getMeds(patientId))
ipcMain.handle('db-add-med', async (event, data) => db.addMed(validateMedData(data)))
ipcMain.handle('db-update-med', async (event, id, data) => db.updateMed(id, validateMedData(data)))
ipcMain.handle('db-delete-med', async (event, id) => db.deleteMed(id))
ipcMain.handle('db-delete-patient-meds', async (event, patientId) => db.deletePatientMeds(patientId))
ipcMain.handle('db-delete-patient', async (event, id) => db.deletePatient(id))
ipcMain.handle('db-get-patient-mayi', async (event, id) => db.getPatientMayi(id))
ipcMain.handle('db-update-patient-mayi', async (event, id, fluid, contents, rate) => db.updatePatientMayi(id, fluid, contents, rate))
ipcMain.handle('db-get-patient-inf-list', async (event, id) => db.getPatientInfList(id))
ipcMain.handle('db-update-patient-inf-list', async (event, id, list) => db.updatePatientInfList(id, list))
ipcMain.handle('db-sync-drug-catalog', async (event, apiUrl) => {
  const base = String(config.get('apiUrl') || API_URL).replace(/\/$/, '')
  const url = apiUrl || `${base}/api/drugs`
  if (apiUrl && typeof apiUrl === 'string') {
    if (!apiUrl.startsWith(base)) {
      devLog.warn('REST API', 'Yapılandırılmış REST API adresiyle eşleşmeyen katalog isteği engellendi')
      return false
    }
  }
  return db.syncDrugCatalog(url)
})
ipcMain.handle('db-check-drug-catalog', async (event, apiUrl) => {
  const base = String(config.get('apiUrl') || API_URL).replace(/\/$/, '')
  const url = apiUrl || `${base}/api/drugs`
  if (apiUrl && typeof apiUrl === 'string' && !apiUrl.startsWith(base)) return { ok: false, error: 'API adresi eşleşmiyor' }
  return db.checkDrugCatalog(url)
})
ipcMain.handle('run-data-update-gate', async () => runDataUpdateGate())
ipcMain.handle('db-search-drug-catalog', async (event, query, formFilter) => db.searchDrugCatalog(query, formFilter))
ipcMain.handle('db-get-similar-drug-names', async (event, label) => db.getSimilarDrugNames(label))
ipcMain.handle('db-get-active-ingredients', async () => db.getActiveIngredients())
ipcMain.handle('db-get-drug-full-name-map', async () => db.getDrugFullNameMap())
ipcMain.handle('db-get-drug-prospectus-options', async (event, name, form) => {
  const options = db.getDrugProspectusOptions(name, form)
  devLog.info('PROSPEKTÜS', `Varyant kontrolü: label="${name}", form="${form}", bulunan=${options.length}`)
  return options
})
ipcMain.handle('db-resolve-drug-barcode', async (event, name, activeIngredient, form) => db.resolveDrugBarcode(name, activeIngredient, form))

function fetchSearchPage(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) { reject(new Error('Çok fazla yönlendirme')); return }
    const client = url.startsWith('https:') ? https : http
    const req = client.get(url, {
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.7'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        resolve(fetchSearchPage(new URL(res.headers.location, url).toString(), redirects + 1))
        return
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`Arama servisi HTTP ${res.statusCode}`)); return }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { if (body.length < 2_000_000) body += chunk })
      res.on('end', () => resolve(body))
    })
    req.on('timeout', () => req.destroy(new Error('Arama zaman aşımına uğradı')))
    req.on('error', reject)
  })
}

function decodeSearchUrl(value) {
  try {
    const decoded = value.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    const absolute = decoded.startsWith('//') ? `https:${decoded}` : (decoded.startsWith('/') ? `https://duckduckgo.com${decoded}` : decoded)
    const url = new URL(absolute)
    const redirected = url.searchParams.get('uddg') || url.searchParams.get('url') || (url.hostname.includes('google.') ? url.searchParams.get('q') : null)
    if (redirected) return decodeURIComponent(redirected)
    const bingTarget = url.hostname.endsWith('bing.com') ? url.searchParams.get('u') : null
    if (bingTarget && bingTarget.startsWith('a1')) {
      try { return Buffer.from(bingTarget.slice(2), 'base64url').toString('utf8') } catch (_) {}
    }
    return url.toString()
  } catch (_) { return null }
}

function extractSearchCandidates(html) {
  const results = []
  const hrefPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = hrefPattern.exec(html))) {
    const value = decodeSearchUrl(match[1])
    if (!value || !/^https?:\/\//i.test(value)) continue
    if (/duckduckgo\.com|bing\.com|google\.com|microsoft\.com/i.test(new URL(value).hostname)) continue
    if (!results.some(item => item.url === value)) {
      const context = html.slice(Math.max(0, match.index - 250), Math.min(html.length, match.index + 500)).replace(/<[^>]+>/g, ' ')
      results.push({ url: value, text: context })
    }
  }
  return results.slice(0, 20)
}

function searchGoogleCandidates(query) {
  return new Promise((resolve) => {
    const searchWindow = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    })
    let settled = false
    const finish = (results = []) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!searchWindow.isDestroyed()) searchWindow.destroy()
      resolve(results)
    }
    const timer = setTimeout(() => finish(), 15000)
    searchWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    searchWindow.webContents.once('did-fail-load', () => finish())
    searchWindow.webContents.once('did-finish-load', async () => {
      try {
        const links = await searchWindow.webContents.executeJavaScript(`Array.from(document.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: (a.closest('div')?.innerText || a.innerText || '') }))`)
        const results = []
        for (const link of links) {
          const value = decodeSearchUrl(link.href)
          if (!value || !/^https?:\/\//i.test(value)) continue
          const host = new URL(value).hostname
          if (/google\.com|googleusercontent\.com|gstatic\.com/i.test(host)) continue
          if (!results.some(item => item.url === value)) results.push({ url: value, text: link.text || '' })
        }
        finish(results.slice(0, 20))
      } catch (_) { finish() }
    })
    searchWindow.loadURL(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=tr&num=10`)
  })
}

function candidateMatchesDocumentType(candidate, documentType) {
  let urlText = candidate.url
  try { urlText = decodeURIComponent(urlText) } catch (_) {}
  const text = `${urlText} ${candidate.text || ''}`.toLocaleLowerCase('tr')
  const normalizedUrl = urlText.toLocaleLowerCase('tr')
  const isKub = /(^|[^a-zçğıöşü])k[üu]b([^a-zçğıöşü]|$)|kısa\s+ürün\s+bilgisi/i.test(text)
  const isKt = /(^|[^a-zçğıöşü])kt([^a-zçğıöşü]|$)|kullanma\s+talimatı/i.test(text)
  const urlIsKub = /(^|[^a-zçğıöşü])k[üu]b([^a-zçğıöşü]|$)/i.test(normalizedUrl)
  const urlIsKt = /(^|[^a-zçğıöşü])kt([^a-zçğıöşü]|$)/i.test(normalizedUrl)
  return documentType === 'KÜB' ? isKub && (!isKt || urlIsKub) : isKt && (!isKub || urlIsKt)
}

function hasPdfSignature(buffer) {
  return Buffer.isBuffer(buffer) &&
    buffer.subarray(0, 1024).indexOf(Buffer.from('%PDF-')) !== -1
}

function extractViewerPdfLinks(html, pageUrl) {
  const links = []
  const addLink = (raw) => {
    if (!raw) return
    let value = String(raw).replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"')
    try { value = decodeURIComponent(value) } catch (_) {}
    try {
      const target = new URL(value.startsWith('//') ? `https:${value}` : value, pageUrl).toString()
      if (target !== pageUrl && !links.includes(target)) links.push(target)
    } catch (_) {}
  }

  try {
    const viewerUrl = new URL(pageUrl)
    for (const key of ['file', 'url', 'src']) addLink(viewerUrl.searchParams.get(key))
  } catch (_) {}

  const attributePattern = /(?:href|src|data)=["']([^"']+)["']/gi
  let match
  while ((match = attributePattern.exec(html))) {
    if (/pdf|k[üu]b|kullanma.?talimat|\/kt(?:\/|$)/i.test(match[1])) addLink(match[1])
  }

  return links.sort((a, b) => (/\.pdf(?:$|[?#])/i.test(b) ? 1 : 0) - (/\.pdf(?:$|[?#])/i.test(a) ? 1 : 0))
}

function verifyPdf(url, redirects = 0, htmlDepth = 0) {
  return new Promise((resolve) => {
    if (redirects > 4) { resolve(null); return }
    let parsed
    try { parsed = new URL(url) } catch (_) { resolve(null); return }
    if (!['http:', 'https:'].includes(parsed.protocol)) { resolve(null); return }
    const client = parsed.protocol === 'https:' ? https : http
    const req = client.get(parsed, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'application/pdf,text/html;q=0.8,*/*;q=0.5',
        Range: 'bytes=0-1048575'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        resolve(verifyPdf(new URL(res.headers.location, parsed).toString(), redirects + 1, htmlDepth))
        return
      }
      if (res.statusCode < 200 || res.statusCode >= 400) {
        res.resume()
        resolve(null)
        return
      }

      const contentType = String(res.headers['content-type'] || '').toLowerCase()
      const chunks = []
      let size = 0
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      res.on('data', chunk => {
        if (settled) return
        size += chunk.length
        if (size <= 1_050_000) chunks.push(chunk)
        const probe = Buffer.concat(chunks)
        if (hasPdfSignature(probe)) {
          finish(parsed.toString())
          res.destroy()
        } else if (size > 1_048_576) {
          finish(null)
          res.destroy()
        }
      })
      res.on('end', async () => {
        if (settled) return
        const buffer = Buffer.concat(chunks)
        if (hasPdfSignature(buffer)) { finish(parsed.toString()); return }
        if (!contentType.includes('text/html') || htmlDepth >= 2) { finish(null); return }
        const links = extractViewerPdfLinks(buffer.toString('utf8'), parsed.toString())
        const verified = await Promise.all(links.slice(0, 8).map(link => verifyPdf(link, 0, htmlDepth + 1)))
        finish(verified.find(Boolean) || null)
      })
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}

async function findProspectusPdf(searchNames, documentType, barcode = '') {
  const typeQuery = documentType === 'KÜB' ? '(KÜB OR KUB)' : '(KT OR "Kullanma Talimatı")'
  for (const searchName of [...new Set(searchNames.filter(Boolean))]) {
    const directCandidates = await findDirectProspectusCandidates({ fullName: searchName, barcode, documentType })
    for (const candidate of directCandidates) {
      const verifiedUrl = await verifyPdf(candidate.url)
      devLog.info('PROSPEKTÜS', `${candidate.source} ${documentType} kontrolü: ${verifiedUrl ? 'bulundu' : 'geçersiz'}`)
      if (verifiedUrl) return verifiedUrl
    }
    const query = `${searchName} ${typeQuery} pdf`
    try {
      const googleCandidates = (await searchGoogleCandidates(query)).filter(candidate => candidateMatchesDocumentType(candidate, documentType))
      devLog.info('PROSPEKTÜS', `Google ${documentType} aramasında "${searchName}" için ${googleCandidates.length} uygun aday bulundu`)
      const verified = await Promise.all(googleCandidates.slice(0, 10).map(candidate => verifyPdf(candidate.url)))
      const pdfUrl = verified.find(Boolean)
      if (pdfUrl) return pdfUrl
    } catch (error) {
      devLog.warn('PROSPEKTÜS', `Google ${documentType} araması başarısız: ${devLog.errorMessage(error)}`)
    }
    const searchUrls = [`https://www.bing.com/search?q=${encodeURIComponent(query)}`]
    for (const searchUrl of searchUrls) {
      try {
        const candidates = extractSearchCandidates(await fetchSearchPage(searchUrl)).filter(candidate => candidateMatchesDocumentType(candidate, documentType))
        devLog.info('PROSPEKTÜS', `${new URL(searchUrl).hostname} ${documentType} aramasında "${searchName}" için ${candidates.length} uygun aday bulundu`)
        const verified = await Promise.all(candidates.slice(0, 8).map(candidate => verifyPdf(candidate.url)))
        const pdfUrl = verified.find(Boolean)
        if (pdfUrl) return pdfUrl
      } catch (error) {
        devLog.warn('PROSPEKTÜS', `${documentType} araması başarısız: ${devLog.errorMessage(error)}`)
      }
    }
    try {
      const duckDuckGoCandidates = (await searchDuckDuckGoCandidates(BrowserWindow, query))
        .filter(candidate => candidateMatchesDocumentType(candidate, documentType))
      devLog.info('PROSPEKTÃœS', `DuckDuckGo ${documentType} aramasÄ±nda "${searchName}" iÃ§in ${duckDuckGoCandidates.length} uygun aday bulundu`)
      const verified = await Promise.all(duckDuckGoCandidates.slice(0, 10).map(candidate => verifyPdf(candidate.url)))
      const pdfUrl = verified.find(Boolean)
      if (pdfUrl) return pdfUrl
    } catch (error) {
      devLog.warn('PROSPEKTÃœS', `DuckDuckGo ${documentType} aramasÄ± baÅŸarÄ±sÄ±z: ${devLog.errorMessage(error)}`)
    }
  }
  return null
}

function downloadPdf(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('PDF indirilirken çok fazla yönlendirme oluştu.')); return }
    let parsed
    try { parsed = new URL(url) } catch (_) { reject(new Error('Geçersiz PDF adresi.')); return }
    if (!['http:', 'https:'].includes(parsed.protocol)) { reject(new Error('Geçersiz PDF adresi.')); return }
    const client = parsed.protocol === 'https:' ? https : http
    const req = client.get(parsed, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Accept: 'application/pdf,*/*;q=0.5'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        resolve(downloadPdf(new URL(res.headers.location, parsed).toString(), redirects + 1))
        return
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        reject(new Error(`PDF indirilemedi (HTTP ${res.statusCode}).`))
        return
      }

      const maxSize = 50 * 1024 * 1024
      const declaredSize = Number(res.headers['content-length'] || 0)
      if (declaredSize > maxSize) {
        res.destroy()
        reject(new Error('PDF dosyası 50 MB sınırını aşıyor.'))
        return
      }

      const chunks = []
      let size = 0
      let failed = false
      res.on('data', chunk => {
        if (failed) return
        size += chunk.length
        if (size > maxSize) {
          failed = true
          res.destroy()
          reject(new Error('PDF dosyası 50 MB sınırını aşıyor.'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => {
        if (failed) return
        const buffer = Buffer.concat(chunks)
        if (!hasPdfSignature(buffer)) {
          reject(new Error('İndirilen içerik geçerli bir PDF değil.'))
          return
        }
        resolve(buffer)
      })
    })
    req.on('timeout', () => req.destroy(new Error('PDF indirme zaman aşımına uğradı.')))
    req.on('error', reject)
  })
}

async function openPdfWindow(url, title) {
  const buffer = await downloadPdf(url)
  const tempDir = path.join(app.getPath('temp'), 'client-prospektus')
  await fs.promises.mkdir(tempDir, { recursive: true })
  const safeName = String(title || 'prospektus').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').slice(0, 80) || 'prospektus'
  const filePath = path.join(tempDir, `${safeName}-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`)
  await fs.promises.writeFile(filePath, buffer)

  const win = new BrowserWindow({
    width: 1100, height: 820, minWidth: 720, minHeight: 540,
    autoHideMenuBar: true, title,
    icon: path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, plugins: true }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.on('closed', () => {
    fs.promises.unlink(filePath).catch(() => {})
  })
  try {
    await win.loadURL(pathToFileURL(filePath).toString())
  } catch (error) {
    if (!win.isDestroyed()) win.destroy()
    await fs.promises.unlink(filePath).catch(() => {})
    throw error
  }
}

async function findIlacFiyatiProspectus(barcode, requestedDocumentType = '') {
  const normalizedBarcode = String(barcode || '').replace(/\D/g, '')
  if (!normalizedBarcode) return null

  const info = await ilacFiyati.getDrugInfo(normalizedBarcode)
  if (!info?.success) {
    devLog.info('PROSPEKTÜS', `ilacfiyati.com bilgisi alınamadı: ${info?.error || 'bilinmeyen hata'}`)
    return null
  }

  const candidates = requestedDocumentType === 'KÜB'
    ? [{ documentType: 'KÜB', url: info.documents?.kub }]
    : requestedDocumentType === 'KT'
      ? [{ documentType: 'KT', url: info.documents?.kt }]
      : [
          { documentType: 'KÜB', url: info.documents?.kub },
          { documentType: 'KT', url: info.documents?.kt }
        ]

  for (const candidate of candidates) {
    if (!candidate.url) continue
    const verifiedUrl = await verifyPdf(candidate.url)
    devLog.info('PROSPEKTÜS', `ilacfiyati.com ${candidate.documentType} kontrolü: ${verifiedUrl ? 'bulundu' : 'geçersiz'}`)
    if (verifiedUrl) return { documentType: candidate.documentType, url: verifiedUrl }
  }
  return null
}

ipcMain.handle('open-drug-prospectus', async (event, name, activeIngredient, form, selectedFullName, requestedDocumentType) => {
  const fullName = selectedFullName || db.getDrugFullName(name, activeIngredient, form)
  if (!fullName) return { success: false, error: 'İlacın tam adı yerel katalogda bulunamadı.' }
  const priceOption = db.getDrugPriceOptions(name, form).find(option =>
    String(option.fullName || '').localeCompare(String(fullName), 'tr-TR', { sensitivity: 'base' }) === 0
  )
  const barcode = String(priceOption?.barcode || '')
  const searchNames = [fullName]
  const requestedType = requestedDocumentType === 'KÜB' || requestedDocumentType === 'KT' ? requestedDocumentType : ''
  let url
  let documentType
  const ilacFiyatiDocument = await findIlacFiyatiProspectus(barcode, requestedType)
  if (ilacFiyatiDocument) {
    url = ilacFiyatiDocument.url
    documentType = ilacFiyatiDocument.documentType
  } else if (requestedType) {
    documentType = requestedType
    const searchType = requestedType === 'KÜB' ? 'KÜB' : 'Kullanma Talimatı'
    url = await findProspectusPdf(searchNames, searchType, barcode)
  } else {
    url = await findProspectusPdf(searchNames, 'KÜB', barcode)
    documentType = 'KÜB'
    if (!url) {
      url = await findProspectusPdf(searchNames, 'Kullanma Talimatı', barcode)
      documentType = 'KT'
    }
  }
  if (!url) {
    const documentLabel = requestedType === 'KÜB'
      ? 'Kısa Ürün Bilgisi'
      : requestedType === 'KT' ? 'Kullanım Talimatları' : 'KÜB veya KT'
    return { success: false, error: `Bu ilaç için ${documentLabel} PDF belgesi bulunamadı.` }
  }
  try {
    await openPdfWindow(url, `${fullName} - ${documentType}`)
    return { success: true, documentType }
  } catch (error) {
    devLog.warn('PROSPEKTÜS', `PDF açılamadı: ${devLog.errorMessage(error)}`)
    return { success: false, error: 'Prospektüs PDF dosyası indirilemedi veya geçerli değil.' }
  }
})
ipcMain.handle('db-get-drug-catalog-count', async () => db.getDrugCatalogCount())
ipcMain.handle('db-resolve-active-ingredient', async (event, name) => db.resolveActiveIngredient(name))
ipcMain.handle('db-lookup-drug-by-name', async (event, name) => db.lookupDrugByName(name))
ipcMain.handle('db-get-matching-dosages', async (event, activeIngredient, form) => db.getMatchingDosages(activeIngredient, form))
ipcMain.handle('db-save-dosage', async (event, data) => db.saveDosage(data))
ipcMain.handle('db-delete-dosage', async (event, id) => db.deleteDosage(id))
ipcMain.handle('db-get-drug-properties', async (event, activeIngredient) => db.getDrugProperties(activeIngredient))
ipcMain.handle('db-get-drug-properties-for-medication', async (event, medication) => db.getDrugPropertiesForMedication(medication))
ipcMain.handle('db-get-drug-similarities', async (event, label) => db.getDrugSimilarities(label))
ipcMain.handle('db-get-drug-clinical-info', async (event, medication) => db.getDrugClinicalInfo(medication))
ipcMain.handle('uptodate-availability', async () => uptoDate.checkAvailability(
  BrowserWindow,
  path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
))
ipcMain.handle('uptodate-find-drug-options', async (event, medication) => uptoDate.findDrugOptions(
  BrowserWindow,
  path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
  medication
))
ipcMain.handle('uptodate-open-drug-information', async (event, option) => uptoDate.openDrugInformation(
  option,
  (url) => shell.openExternal(url)
))
ipcMain.handle('globalrph-find-drug-options', async (event, medication) => globalRph.findResults(
  BrowserWindow,
  medication
))
ipcMain.handle('globalrph-open-drug-information', async (event, option) => globalRph.openResult(
  option,
  (url) => shell.openExternal(url)
))
ipcMain.handle('selcuk-ecza-find-price', async (event, barcode) => selcukEcza.findPrice(BrowserWindow, barcode))
ipcMain.handle('ilacfiyati-fetch-info', async (event, barcode) => ilacFiyati.getDrugInfo(barcode))
ipcMain.handle('drug-find-prices', async (event, barcode) => {
  const sources = await Promise.all([
    selcukEcza.findPrice(BrowserWindow, barcode),
    ilacRehberi.findPrice(BrowserWindow, barcode)
  ])
  return {
    success: sources.some(source => source.success),
    sources,
    error: sources.every(source => !source.success) ? 'Bu barkod için fiyat bilgisi bulunamadı.' : ''
  }
})
ipcMain.handle('report-patient-drug-barcodes', async (event, patientId) => {
  const barcodes = db.getPatientDrugBarcodes(patientId)
  if (!barcodes.length) return false
  return reportDrugBarcodes(barcodes)
})

ipcMain.handle('send-report', async (event, body) => {
  const result = await sendReportHttp(body)
  if (result.success) flushPendingReports()
  return result
})

ipcMain.handle('flush-pending-reports', async () => flushPendingReports())

function getApiHeaders(dataLength) {
  const headers = { 'Content-Type': 'application/json' }
  if (dataLength != null) headers['Content-Length'] = dataLength
  const apiKey = config.get('apiKey')
  if (apiKey) headers['x-api-key'] = apiKey
  return headers
}

function assertSecureApiUrl(value) {
  return new URL(normalizeApiUrl(value))
}

function apiClient(apiUrl) {
  return assertSecureApiUrl(apiUrl).protocol === 'https:' ? https : http
}

function validateApiAddress(apiUrl) {
  return new Promise(resolve => {
    let client
    try { client = apiClient(apiUrl) } catch { resolve(false); return }
    const req = client.request(`${apiUrl}/api/client/validate`, {
      method: 'GET',
      timeout: 7000,
    }, res => {
      let raw = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        if (raw.length <= 4096) raw += chunk
      })
      res.on('end', () => {
        if (res.statusCode !== 200 || raw.length > 4096) return resolve(false)
        try {
          const body = JSON.parse(raw)
          resolve(isCompatibleServer(body))
        } catch {
          resolve(false)
        }
      })
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(false))
    req.end()
  })
}

function reportDrugBarcodes(barcodes) {
  return new Promise(resolve => {
    const apiUrl = String(config.get('apiUrl') || API_URL).replace(/\/$/, '')
    const data = JSON.stringify({ barcodes })
    let client
    try { client = apiClient(apiUrl) } catch { resolve(false); return }
    const req = client.request(`${apiUrl}/api/drug-warning-lookups`, {
      method: 'POST',
      timeout: 5000,
      headers: getApiHeaders(Buffer.byteLength(data))
    }, res => {
      res.resume()
      res.on('end', () => resolve(res.statusCode === 202))
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(false))
    req.write(data)
    req.end()
  })
}

function sendReportHttp(body) {
  return new Promise((resolve) => {
    const apiUrl = String(config.get('apiUrl') || API_URL).replace(/\/$/, '')
    const data = JSON.stringify(body)
    let client
    try { client = apiClient(apiUrl) } catch (error) { resolve({ success: false, error: error.message }); return }
    const req = client.request(`${apiUrl}/api/reports`, {
      method: 'POST',
      timeout: 5000,
      headers: getApiHeaders(Buffer.byteLength(data))
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        if (res.statusCode === 201) resolve({ success: true })
        else resolve({ success: false, error: 'Sunucu hatası: ' + res.statusCode })
      })
    })
    req.on('error', (err) => {
      saveReportLocally(body)
      resolve({ success: false, error: 'Sunucu kapalı, yerel dosyaya kaydedildi.', savedLocally: true })
    })
    req.write(data)
    req.end()
  })
}

function saveReportLocally(body) {
  const reportsDir = path.join(os.tmpdir(), REPORT_TEMP_DIRECTORY)
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  const file = path.join(reportsDir, `rapor_${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(body, null, 2), 'utf-8')
}

function flushPendingReports() {
  const apiUrl = String(config.get('apiUrl') || API_URL).replace(/\/$/, '')
  const reportsDir = path.join(os.tmpdir(), REPORT_TEMP_DIRECTORY)
  if (!fs.existsSync(reportsDir)) return
  const files = fs.readdirSync(reportsDir).filter(f => f.startsWith('rapor_') && f.endsWith('.json'))
  let delay = 0
  const INTERVAL = 300
  for (const file of files) {
    setTimeout(() => {
      try {
        const body = JSON.parse(fs.readFileSync(path.join(reportsDir, file), 'utf-8'))
        const client = apiClient(apiUrl)
        const req = client.request(`${apiUrl}/api/reports`, {
          method: 'POST',
          timeout: 3000,
          headers: getApiHeaders()
        }, (res) => {
          if (res.statusCode === 201) {
            try { fs.unlinkSync(path.join(reportsDir, file)) } catch (_) {}
          }
        })
        req.on('error', () => {})
        req.write(JSON.stringify(body))
        req.end()
      } catch (_) {}
    }, delay)
    delay += INTERVAL
  }
}

ipcMain.handle('print-text-file', async (event, text) => {
  const safe = String(text).substring(0, 100000)
  const tmp = path.join(os.tmpdir(), `sema_${Date.now()}.txt`)
  fs.writeFileSync(tmp, safe, 'utf-8')
  exec(`START /MIN NOTEPAD /P "${tmp}"`, (err) => {
    if (err) console.error('Notepad print error:', err.message)
  })
  return { success: true }
})

ipcMain.handle('print-html', async (event, html, options) => {
  const sanitized = String(html)
    .replace(/<script[\s>]/gi, '<script-blocked ')
    .replace(/on\w+\s*=/gi, 'data-blocked-')
    .replace(/javascript:/gi, 'blocked:')
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  const encoded = Buffer.from(sanitized, 'utf-8').toString('base64')
  await win.loadURL(`data:text/html;base64,${encoded}`)
  win.webContents.print({ landscape: options?.landscape === true }, (success) => {
    win.destroy()
  })
})

function validateMedData(data) {
  const result = {}
  if (typeof data !== 'object' || !data) data = {}
  const MAX_LEN = 500
  result.patientId = parseInt(data.patientId) || 0
  result.name = String(data.name || '').substring(0, MAX_LEN)
  result.route = String(data.route || '').substring(0, 10)
  const dose = normalizeMedicationDose(data)
  result.doseValue = dose.value
  result.doseUnit = dose.unit
  result.dose = dose.display.substring(0, MAX_LEN)
  result.times = String(data.times || '').substring(0, 300)
  result.condition = String(data.condition || 'standard').substring(0, 20)
  result.conditionData = typeof data.conditionData === 'object' ? JSON.parse(JSON.stringify(data.conditionData)) : {}
  result.note = String(data.note || '').substring(0, 2000)
  result.startDate = String(data.startDate || '').substring(0, 10)
  result.timeDoses = {}
  if (typeof data.timeDoses === 'object' && data.timeDoses) {
    Object.entries(data.timeDoses).slice(0, 48).forEach(([time, value]) => {
      const parsed = parseDose(value, result.doseUnit, result.doseUnit)
      if (parsed.value != null && parsed.value > 0) result.timeDoses[String(time).substring(0, 5)] = formatDose(parsed.value, parsed.unit)
    })
  }
  result.activeIngredient = String(data.activeIngredient || '').substring(0, 300)
  result.catalogBarcode = String(data.catalogBarcode || '').replace(/\D/g, '').substring(0, 14)
  result.catalogLabelDetail = String(data.catalogLabelDetail || '').trim().substring(0, 20)
  result.catalogLabelDetailCustomized = data.catalogLabelDetailCustomized ? 1 : 0
  result.catalogLabelDetailEnabled = data.catalogLabelDetailEnabled ? 1 : 0
  result.customLabel = String(data.customLabel || '').substring(0, MAX_LEN)
  result.luezym = data.luezym ? 1 : 0
  return result
}

ipcMain.handle('show-notification', async (event, title, body) => {
  const notif = new Notification({ title, body })
  notif.show()
  return { success: true }
})

ipcMain.handle('reminders-save', async (event, reminders) => {
  const saved = persistReminders(reminders)
  processDueReminders()
  return saved
})

ipcMain.handle('reminder-runtime-state', async () => {
  const reminders = getStoredReminders()
  return {
    reminders,
    activeReminder: reminders.find(reminder => reminder.id === activeReminderId) || null
  }
})

ipcMain.handle('reminder-acknowledge', async (event, reminderId) => {
  const id = String(reminderId || '')
  const reminders = markReminderDelivered(getStoredReminders(), id)
  if (activeReminderId === id) activeReminderId = null
  const saved = persistReminders(reminders)
  setTimeout(processDueReminders, 100)
  return saved
})

ipcMain.handle('focus-window', () => {
  if (!mainWindow) return
  showAndFocusMainWindow()
  mainWindow.setAlwaysOnTop(true, 'normal')
  setTimeout(() => mainWindow?.setAlwaysOnTop(false), 500)
})

const { clipboard } = require('electron')
ipcMain.handle('clipboard-parse-orders', async () => {
  const text = clipboard.readText()
  if (!text) return { error: 'Pano boş', orders: [] }
  return parseOrders(text)
})

ipcMain.handle('clipboard-parse-patients', async () => {
  const text = clipboard.readText()
  if (!text) return { error: 'Geçersiz pano: Hasta bilgisi bulunamadı.', patients: [] }
  return parsePatients(text)
})

ipcMain.handle('db-get-cabinets', async () => db.getCabinets())
ipcMain.handle('db-add-cabinet', async (event, name) => db.addCabinet(name))
ipcMain.handle('db-rename-cabinet', async (event, id, name) => db.renameCabinet(id, name))
ipcMain.handle('db-delete-cabinet', async (event, id) => db.deleteCabinet(id))
ipcMain.handle('db-get-cabinet-drugs', async (event, cabinetId) => db.getCabinetDrugs(cabinetId))
ipcMain.handle('db-add-cabinet-drug', async (event, cabinetId, name, form, dose, quantity, unit, expiry) => db.addCabinetDrug(cabinetId, name, form, dose, quantity, unit, expiry))
ipcMain.handle('db-update-cabinet-drug', async (event, id, name, form, dose, quantity, unit, expiry) => db.updateCabinetDrug(id, name, form, dose, quantity, unit, expiry))
ipcMain.handle('db-delete-cabinet-drug', async (event, id) => db.deleteCabinetDrug(id))
ipcMain.handle('db-get-all-expired-drugs', async () => db.getAllExpiredDrugs())

ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => mainWindow?.close())
ipcMain.handle('window-reload', () => mainWindow?.webContents.reload())
ipcMain.on('toggle-devtools', () => {
  if (app.isPackaged) return
  if (mainWindow?.webContents.isDevToolsOpened()) mainWindow.webContents.closeDevTools()
  else mainWindow?.webContents.openDevTools({ mode: 'detach' })
})

ipcMain.handle('check-for-updates', async () => checkForUpdates())
ipcMain.handle('download-update', async () => downloadUpdate())
ipcMain.handle('quit-and-install-update', async () => quitAndInstall())
ipcMain.handle('runtime-update-response', async (event, installNow) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !updatePromptOpen) return false
  const info = pendingRuntimeUpdateInfo
  pendingRuntimeUpdateInfo = null
  updatePromptOpen = false
  if (installNow) showRuntimeUpdateGate(info)
  return true
})
