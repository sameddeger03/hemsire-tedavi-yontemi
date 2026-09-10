const GLOBAL_RPH_ORIGIN = 'https://globalrph.com'

function normalizeSearchTerm(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeForMatch(value) {
  return normalizeSearchTerm(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function getSearchTerms(medication) {
  const detailedNames = String(medication?.etken_detay || '').split(/[;,|]+/)
  const candidates = [...detailedNames, medication?.active_ingredient, medication?.label]
    .map(normalizeSearchTerm)
    .filter(Boolean)
  return [...new Set(candidates.map(value => value.toLocaleLowerCase('en-US')))]
}

function safeGlobalRphUrl(value) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (hostname === 'globalrph.com' || hostname.endsWith('.globalrph.com'))
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

function resultMatchesTerm(result, term) {
  const needle = normalizeForMatch(term)
  if (!needle) return false
  let path = ''
  try { path = decodeURIComponent(new URL(result?.url).pathname) } catch {}
  const haystack = normalizeForMatch(`${result?.title || ''} ${path}`)
  return haystack.includes(needle)
}

function prepareOptions(results, term) {
  return (Array.isArray(results) ? results : [])
    .map(result => ({
      title: normalizeSearchTerm(result?.title),
      url: safeGlobalRphUrl(result?.url),
      postType: normalizeSearchTerm(result?.postType)
    }))
    .filter(result => result.postType.toLocaleLowerCase('en-US') === 'dilution')
    .filter(result => result.title && result.url && resultMatchesTerm(result, term))
    .filter((result, index, items) => items.findIndex(item => item.url === result.url) === index)
    .map(({ title, url }) => ({ title, url }))
}

function createSearchWindow(BrowserWindow) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: `globalrph-search-${Date.now()}-${Math.random().toString(16).slice(2)}`
    }
  })
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    callback({ cancel: !safeGlobalRphUrl(details.url) })
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (!safeGlobalRphUrl(url)) event.preventDefault()
  })
  return win
}

async function findResults(BrowserWindow, medication) {
  const terms = getSearchTerms(medication)
  if (!terms.length) return { success: false, error: 'Aranacak etken madde bulunamadı.' }
  const win = createSearchWindow(BrowserWindow)
  try {
    for (const term of terms) {
      const searchParams = new URLSearchParams({ s: `${term} dilution`, sources: '' })
      const searchUrl = `${GLOBAL_RPH_ORIGIN}/?${searchParams.toString()}`
      await win.loadURL(searchUrl)
      const results = await win.webContents.executeJavaScript(`(() => {
        return Array.from(document.querySelectorAll('article')).map(article => {
          const link = article.querySelector('h1 a[href], h2 a[href], h3 a[href], .entry-title a[href], a[href]');
          const heading = article.querySelector('h1, h2, h3, .entry-title');
          const postType = String(article.querySelector('span.postttype')?.textContent || '').replace(/\\s+/g, ' ').trim();
          const title = String(link?.textContent || heading?.textContent || '').replace(/\\s+/g, ' ').trim();
          return link && title ? { url: link.href, title, postType } : null;
        }).filter(Boolean);
      })()`, true)
      const options = prepareOptions(results, term)
      if (options.length) return { success: true, options, searchTerm: term }
    }
    return { success: false, error: 'GlobalRPH’de bu etken madde için sonuç bulunamadı.' }
  } catch {
    return { success: false, error: 'GlobalRPH aramasına ulaşılamadı.' }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

async function openResult(option, openExternal) {
  if (typeof openExternal !== 'function') return { success: false, error: 'Varsayılan tarayıcı açılamadı.' }
  const url = safeGlobalRphUrl(option?.url)
  if (!url) return { success: false, error: 'GlobalRPH bağlantısı geçersiz.' }
  try {
    await openExternal(url)
    return { success: true, url }
  } catch {
    return { success: false, error: 'GlobalRPH sonucu varsayılan tarayıcıda açılamadı.' }
  }
}

module.exports = { normalizeSearchTerm, normalizeForMatch, getSearchTerms, safeGlobalRphUrl, resultMatchesTerm, prepareOptions, createSearchWindow, findResults, openResult }
