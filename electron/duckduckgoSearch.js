const DUCKDUCKGO_ORIGIN = 'https://duckduckgo.com'

function buildDuckDuckGoSearchUrl(query) {
  const params = new URLSearchParams({ q: String(query || '').trim(), ia: 'web' })
  return `${DUCKDUCKGO_ORIGIN}/?${params.toString()}`
}

function isAllowedDuckDuckGoRequest(value) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const isDuckDuckGo = hostname === 'duckduckgo.com' || hostname.endsWith('.duckduckgo.com')
    const isDuck = hostname === 'duck.com' || hostname.endsWith('.duck.com')
    return url.protocol === 'https:' && (isDuckDuckGo || isDuck)
  } catch {
    return false
  }
}

function decodeDuckDuckGoResultUrl(value) {
  try {
    const url = new URL(value)
    const redirected = url.searchParams.get('uddg') || url.searchParams.get('url')
    const target = new URL(redirected ? decodeURIComponent(redirected) : url.toString())
    if (!['http:', 'https:'].includes(target.protocol)) return ''
    if (isAllowedDuckDuckGoRequest(target.toString())) return ''
    return target.toString()
  } catch {
    return ''
  }
}

function prepareDuckDuckGoCandidates(links) {
  const results = []
  for (const link of Array.isArray(links) ? links : []) {
    const url = decodeDuckDuckGoResultUrl(link?.href)
    const text = String(link?.text || '').replace(/\s+/g, ' ').trim()
    if (url && !results.some(item => item.url === url)) results.push({ url, text })
  }
  return results.slice(0, 20)
}

function searchDuckDuckGoCandidates(BrowserWindow, query) {
  return new Promise((resolve) => {
    const searchWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: `prospectus-ddg-${Date.now()}-${Math.random().toString(16).slice(2)}`
      }
    })
    searchWindow.webContents.session.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      callback({ cancel: !isAllowedDuckDuckGoRequest(details.url) })
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
    searchWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (isMainFrame !== false) finish()
    })
    searchWindow.webContents.once('did-finish-load', async () => {
      try {
        const links = await searchWindow.webContents.executeJavaScript(`(async () => {
          const selector = '[data-testid="result-title-a"], article h2 a[href], .result__a';
          for (let attempt = 0; attempt < 30; attempt += 1) {
            const anchors = Array.from(document.querySelectorAll(selector));
            if (anchors.length) {
              return anchors.map(anchor => ({
                href: anchor.href,
                text: String(anchor.closest('article')?.innerText || anchor.innerText || '').replace(/\\s+/g, ' ').trim()
              }));
            }
            await new Promise(resolveWait => setTimeout(resolveWait, 250));
          }
          return [];
        })()`)
        finish(prepareDuckDuckGoCandidates(links))
      } catch {
        finish()
      }
    })
    searchWindow.loadURL(buildDuckDuckGoSearchUrl(query)).catch(() => finish())
  })
}

module.exports = {
  buildDuckDuckGoSearchUrl,
  isAllowedDuckDuckGoRequest,
  decodeDuckDuckGoResultUrl,
  prepareDuckDuckGoCandidates,
  searchDuckDuckGoCandidates
}
