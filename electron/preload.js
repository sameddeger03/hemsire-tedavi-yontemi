const { contextBridge, ipcRenderer } = require('electron')

let pendingPrints = 0
let printProgressListener = null

contextBridge.exposeInMainWorld('electronAPI', {
  printLabel: async (zpl) => {
    pendingPrints++
    try {
      printProgressListener?.(pendingPrints)
      return await ipcRenderer.invoke('print-label', zpl)
    } finally {
      pendingPrints--
      printProgressListener?.(pendingPrints)
    }
  },
  onPrintProgress: (callback) => {
    printProgressListener = callback
    callback(pendingPrints)
    return () => { if (printProgressListener === callback) printProgressListener = null }
  },
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  toggleDevTools: () => ipcRenderer.send('toggle-devtools'),
  reloadApp: () => ipcRenderer.invoke('window-reload'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  dbGetPatients: () => ipcRenderer.invoke('db-get-patients'),
  dbAddPatient: (name, height, weight, patient_no, gender, birthDate) => ipcRenderer.invoke('db-add-patient', name, height, weight, patient_no, gender, birthDate),
  dbUpdatePatient: (id, name, height, weight, patient_no, gender, birthDate) => ipcRenderer.invoke('db-update-patient', id, name, height, weight, patient_no, gender, birthDate),
  dbArchivePatient: (id) => ipcRenderer.invoke('db-archive-patient', id),
  dbRestorePatient: (id) => ipcRenderer.invoke('db-restore-patient', id),
  dbGetMeds: (patientId) => ipcRenderer.invoke('db-get-meds', patientId),
  dbAddMed: (data) => ipcRenderer.invoke('db-add-med', data),
  dbUpdateMed: (id, data) => ipcRenderer.invoke('db-update-med', id, data),
  dbDeleteMed: (id) => ipcRenderer.invoke('db-delete-med', id),
  dbDeletePatientMeds: (patientId) => ipcRenderer.invoke('db-delete-patient-meds', patientId),
  dbDeletePatient: (id) => ipcRenderer.invoke('db-delete-patient', id),
  dbGetPatientMayi: (id) => ipcRenderer.invoke('db-get-patient-mayi', id),
  dbUpdatePatientMayi: (id, fluid, contents, rate) => ipcRenderer.invoke('db-update-patient-mayi', id, fluid, contents, rate),
  dbGetPatientInfList: (id) => ipcRenderer.invoke('db-get-patient-inf-list', id),
  dbUpdatePatientInfList: (id, list) => ipcRenderer.invoke('db-update-patient-inf-list', id, list),
  dbSyncDrugCatalog: (apiUrl) => ipcRenderer.invoke('db-sync-drug-catalog', apiUrl),
  dbCheckDrugCatalog: (apiUrl) => ipcRenderer.invoke('db-check-drug-catalog', apiUrl),
  checkInternetConnection: () => ipcRenderer.invoke('check-internet-connection'),
  runDataUpdateGate: () => ipcRenderer.invoke('run-data-update-gate'),
  dbSearchDrugCatalog: (query, formFilter) => ipcRenderer.invoke('db-search-drug-catalog', query, formFilter),
  dbGetSimilarDrugNames: (label) => ipcRenderer.invoke('db-get-similar-drug-names', label),
  dbGetDrugSimilarities: (label) => ipcRenderer.invoke('db-get-drug-similarities', label),
  dbGetDrugClinicalInfo: (medication) => ipcRenderer.invoke('db-get-drug-clinical-info', medication),
  dbGetActiveIngredients: () => ipcRenderer.invoke('db-get-active-ingredients'),
  dbGetDrugFullNameMap: () => ipcRenderer.invoke('db-get-drug-full-name-map'),
  dbGetDrugProspectusOptions: (name, form) => ipcRenderer.invoke('db-get-drug-prospectus-options', name, form),
  dbResolveDrugBarcode: (name, activeIngredient, form) => ipcRenderer.invoke('db-resolve-drug-barcode', String(name || ''), String(activeIngredient || ''), String(form || '')),
  openDrugProspectus: (name, activeIngredient, form, fullName, documentType) => ipcRenderer.invoke('open-drug-prospectus', name, activeIngredient, form, fullName, documentType),
  getUptodateAvailability: () => ipcRenderer.invoke('uptodate-availability'),
  findUptodateDrugOptions: (medication) => ipcRenderer.invoke('uptodate-find-drug-options', medication),
  openUptodateDrugInformation: (option) => ipcRenderer.invoke('uptodate-open-drug-information', {
    title: String(option?.title || ''),
    url: String(option?.url || '')
  }),
  findGlobalRphDrugOptions: (medication) => ipcRenderer.invoke('globalrph-find-drug-options', {
    label: String(medication?.label || ''),
    active_ingredient: String(medication?.active_ingredient || ''),
    etken_detay: String(medication?.etken_detay || '')
  }),
  openGlobalRphDrugInformation: (option) => ipcRenderer.invoke('globalrph-open-drug-information', {
    title: String(option?.title || ''),
    url: String(option?.url || '')
  }),
  getDrugPrices: (barcode) => ipcRenderer.invoke('drug-find-prices', String(barcode || '')),
  fetchIlacfiyatiInfo: (barcode) => ipcRenderer.invoke('ilacfiyati-fetch-info', String(barcode || '')),
  getPrinterName: () => ipcRenderer.invoke('get-printer-name'),
  setPrinterName: (name) => ipcRenderer.invoke('set-printer-name', name),
  configGet: (key) => ipcRenderer.invoke('config-get', key),
  configSet: (key, value) => ipcRenderer.invoke('config-set', key, value),
  configGetAll: () => ipcRenderer.invoke('config-get-all'),
  getClientMenuVisibility: () => ipcRenderer.invoke('client-menu-visibility'),
  changeApiUrl: (newApiUrl) => ipcRenderer.invoke('change-api-url', newApiUrl),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  dbGetDrugCatalogCount: () => ipcRenderer.invoke('db-get-drug-catalog-count'),
  dbResolveActiveIngredient: (name) => ipcRenderer.invoke('db-resolve-active-ingredient', name),
  dbLookupDrugByName: (name) => ipcRenderer.invoke('db-lookup-drug-by-name', name),
  dbGetMatchingDosages: (activeIngredient, form) => ipcRenderer.invoke('db-get-matching-dosages', activeIngredient, form),
  dbSaveDosage: (data) => ipcRenderer.invoke('db-save-dosage', data),
  dbDeleteDosage: (id) => ipcRenderer.invoke('db-delete-dosage', id),
  dbGetDrugProperties: (activeIngredient) => ipcRenderer.invoke('db-get-drug-properties', activeIngredient),
  dbGetDrugPropertiesForMedication: (medication) => ipcRenderer.invoke('db-get-drug-properties-for-medication', medication),
  reportPatientDrugBarcodes: (patientId) => ipcRenderer.invoke('report-patient-drug-barcodes', patientId),
  printTextFile: (text) => ipcRenderer.invoke('print-text-file', text),
  printHtml: (html, options) => ipcRenderer.invoke('print-html', html, { landscape: options?.landscape === true }),
  focusWindow: () => ipcRenderer.invoke('focus-window'),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),
  saveReminders: (reminders) => ipcRenderer.invoke('reminders-save', JSON.parse(JSON.stringify(reminders || []))),
  getReminderState: () => ipcRenderer.invoke('reminder-runtime-state'),
  acknowledgeReminder: (id) => ipcRenderer.invoke('reminder-acknowledge', String(id || '')),
  clipboardParseOrders: () => ipcRenderer.invoke('clipboard-parse-orders'),
  clipboardParsePatients: () => ipcRenderer.invoke('clipboard-parse-patients'),
  dbGetCabinets: () => ipcRenderer.invoke('db-get-cabinets'),
  dbAddCabinet: (name) => ipcRenderer.invoke('db-add-cabinet', name),
  dbRenameCabinet: (id, name) => ipcRenderer.invoke('db-rename-cabinet', id, name),
  dbDeleteCabinet: (id) => ipcRenderer.invoke('db-delete-cabinet', id),
  dbGetCabinetDrugs: (cabinetId) => ipcRenderer.invoke('db-get-cabinet-drugs', cabinetId),
  dbAddCabinetDrug: (cabinetId, name, form, dose, quantity, unit, expiry) => ipcRenderer.invoke('db-add-cabinet-drug', cabinetId, name, form, dose, quantity, unit, expiry),
  dbUpdateCabinetDrug: (id, name, form, dose, quantity, unit, expiry) => ipcRenderer.invoke('db-update-cabinet-drug', id, name, form, dose, quantity, unit, expiry),
  dbDeleteCabinetDrug: (id) => ipcRenderer.invoke('db-delete-cabinet-drug', id),
  dbGetAllExpiredDrugs: () => ipcRenderer.invoke('db-get-all-expired-drugs'),
  sendReport: (body) => ipcRenderer.invoke('send-report', body),
  flushPendingReports: () => ipcRenderer.invoke('flush-pending-reports'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('quit-and-install-update'),
  respondRuntimeUpdate: (installNow) => ipcRenderer.invoke('runtime-update-response', Boolean(installNow)),
  onRuntimeUpdateDecisionRequired: (cb) => { const fn = (e, info) => cb(info); ipcRenderer.on('runtime-update-decision-required', fn); return () => ipcRenderer.removeListener('runtime-update-decision-required', fn) },
  onServerConnectionChanged: (cb) => { const fn = (e, online) => cb(Boolean(online)); ipcRenderer.on('server-connection-changed', fn); return () => ipcRenderer.removeListener('server-connection-changed', fn) },
  onServerCatalogUpdated: (cb) => { const fn = (e, info) => cb(info || {}); ipcRenderer.on('server-catalog-updated', fn); return () => ipcRenderer.removeListener('server-catalog-updated', fn) },
  onClientMessage: (cb) => { const fn = (e, info) => cb(info || {}); ipcRenderer.on('client-message', fn); return () => ipcRenderer.removeListener('client-message', fn) },
  onClientMenuVisibilityUpdated: (cb) => { const fn = (e, info) => cb(info || {}); ipcRenderer.on('client-menu-visibility-updated', fn); return () => ipcRenderer.removeListener('client-menu-visibility-updated', fn) },
  onReminderDue: (cb) => { const fn = (e, reminder) => cb(reminder || null); ipcRenderer.on('reminder-due', fn); return () => ipcRenderer.removeListener('reminder-due', fn) },
  onRemindersChanged: (cb) => { const fn = (e, reminders) => cb(Array.isArray(reminders) ? reminders : []); ipcRenderer.on('reminders-changed', fn); return () => ipcRenderer.removeListener('reminders-changed', fn) },
  onUpdateAvailable: (cb) => { const fn = (e, info) => cb(info); ipcRenderer.on('update-available', fn); return () => ipcRenderer.removeListener('update-available', fn) },
  onUpdateNotAvailable: (cb) => { const fn = () => cb(); ipcRenderer.on('update-not-available', fn); return () => ipcRenderer.removeListener('update-not-available', fn) },
  onUpdateDownloadProgress: (cb) => { const fn = (e, p) => cb(p); ipcRenderer.on('update-download-progress', fn); return () => ipcRenderer.removeListener('update-download-progress', fn) },
  onUpdateDownloaded: (cb) => { const fn = () => cb(); ipcRenderer.on('update-downloaded', fn); return () => ipcRenderer.removeListener('update-downloaded', fn) },
  onMaximizedChange: (callback) => { ipcRenderer.on('window-maximized-changed', (event, val) => callback(val)); return () => ipcRenderer.removeAllListeners('window-maximized-changed') }
})
