const UPTODATE_ORIGIN = 'https://www.uptodate.com'
const SEARCH_URL = `${UPTODATE_ORIGIN}/contents/search`
const DRUG_INDEX_URL = `${UPTODATE_ORIGIN}/contents/table-of-contents/drug-information/general-drug-information`
const AVAILABILITY_TTL_MS = 15 * 60 * 1000

let availabilityCache = null
let availabilityPromise = null

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function drugAliases(medication) {
  const values = [medication?.etken_detay, medication?.active_ingredient]
    .flatMap(value => String(value || '').split(/[;,|/]+/))
    .map(normalizeText)
    .filter(value => value.length >= 3)
  return [...new Set(values)].sort((a, b) => b.length - a.length)
}

function matchDrugOptions(options, medication) {
  const aliases = drugAliases(medication)
  if (!aliases.length) return []
  const seen = new Set()
  return (options || []).filter(option => {
    const title = normalizeText(option?.title)
    const matches = aliases.some(alias => title === alias || title.startsWith(`${alias} `))
    if (!matches || seen.has(option.url)) return false
    seen.add(option.url)
    return true
  })
}

function safeUptodateUrl(value) {
  try {
    const url = new URL(value)
    return url.origin === UPTODATE_ORIGIN && url.pathname.startsWith('/contents/') ? url.toString() : ''
  } catch {
    return ''
  }
}

function createWindow(BrowserWindow, options = {}) {
  const win = new BrowserWindow({
    show: false,
    width: options.width || 1100,
    height: options.height || 820,
    minWidth: 720,
    minHeight: 540,
    autoHideMenuBar: true,
    title: options.title || 'UpToDate',
    icon: options.icon,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = safeUptodateUrl(url)
    if (safeUrl) win.loadURL(safeUrl)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!safeUptodateUrl(url)) event.preventDefault()
  })
  return win
}

async function waitForWelcomeLabel(win) {
  return win.webContents.executeJavaScript(`new Promise(resolve => {
    const finish = () => {
      const label = document.querySelector('span.welcomeLabel');
      const text = label && String(label.textContent || '').trim();
      if (text) { resolve(text); return true; }
      return false;
    };
    if (finish()) return;
    const observer = new MutationObserver(() => { if (finish()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setTimeout(() => { observer.disconnect(); resolve(''); }, 20000);
  })`, true)
}

async function checkAvailability(BrowserWindow, icon, force = false) {
  const now = Date.now()
  const cacheTtl = availabilityCache?.available ? AVAILABILITY_TTL_MS : 60 * 1000
  if (!force && availabilityCache && now - availabilityCache.checkedAt < cacheTtl) return availabilityCache
  if (availabilityPromise) return availabilityPromise
  availabilityPromise = (async () => {
    const win = createWindow(BrowserWindow, { icon })
    try {
      await win.loadURL(SEARCH_URL)
      const institution = await waitForWelcomeLabel(win)
      availabilityCache = { available: Boolean(institution), institution, checkedAt: Date.now() }
      return availabilityCache
    } catch {
      availabilityCache = { available: false, institution: '', checkedAt: Date.now() }
      return availabilityCache
    } finally {
      if (!win.isDestroyed()) win.destroy()
      availabilityPromise = null
    }
  })()
  return availabilityPromise
}

async function findDrugOptions(BrowserWindow, icon, medication) {
  const access = await checkAvailability(BrowserWindow, icon)
  if (!access.available) return { success: false, error: 'UpToDate kurumsal erişimi bulunamadı.' }
  const win = createWindow(BrowserWindow, { icon })
  try {
    await win.loadURL(DRUG_INDEX_URL)
    const options = await win.webContents.executeJavaScript(`new Promise(resolve => {
      const collect = () => [...document.querySelectorAll('a[href]')]
        .map(link => ({
          title: String(link.textContent || '').replace(/\\s*:\\s*Drug information\\s*$/i, '').trim(),
          rawTitle: String(link.textContent || '').trim(),
          url: link.href
        }))
        .filter(item => /:\\s*Drug information\\s*$/i.test(item.rawTitle) && item.url.includes('/contents/'))
        .map(({ title, url }) => ({ title, url }));
      const ready = () => {
        const rows = collect();
        if (rows.length) { resolve(rows); return true; }
        return false;
      };
      if (ready()) return;
      const observer = new MutationObserver(() => { if (ready()) observer.disconnect(); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve([]); }, 20000);
    })`, true)
    const matches = matchDrugOptions(options, medication)
      .map(option => ({ title: option.title, url: safeUptodateUrl(option.url) }))
      .filter(option => option.url)
    return matches.length
      ? { success: true, options: matches }
      : { success: false, error: 'Bu etken madde için UpToDate ilaç bilgisi bulunamadı.' }
  } catch {
    return { success: false, error: 'UpToDate ilaç listesine ulaşılamadı.' }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

async function openDrugInformation(option, openExternal) {
  const url = safeUptodateUrl(option?.url)
  if (!url) return { success: false, error: 'UpToDate bağlantısı geçersiz.' }
  if (typeof openExternal !== 'function') return { success: false, error: 'Varsayılan tarayıcı açılamadı.' }
  try {
    await openExternal(url)
    return { success: true }
  } catch {
    return { success: false, error: 'UpToDate ilaç bilgisi varsayılan tarayıcıda açılamadı.' }
  }
}

module.exports = {
  normalizeText,
  drugAliases,
  matchDrugOptions,
  safeUptodateUrl,
  checkAvailability,
  findDrugOptions,
  openDrugInformation
}
