const https = require('https')

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'

function normalizeProductName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
}

function decodeHtml(buffer, contentType = '') {
  const charset = String(contentType).match(/charset\s*=\s*([^;\s]+)/i)?.[1]?.replace(/["']/g, '') || 'utf-8'
  try { return new TextDecoder(charset).decode(buffer) } catch { return buffer.toString('utf8') }
}

function fetchHtml(url, allowedHosts, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) { reject(new Error('Çok fazla yönlendirme')); return }
    let parsed
    try { parsed = new URL(url) } catch { reject(new Error('Geçersiz kaynak adresi')); return }
    if (parsed.protocol !== 'https:') { reject(new Error('Güvensiz kaynak adresi')); return }
    if (!allowedHosts.includes(parsed.hostname.toLowerCase())) { reject(new Error('İzin verilmeyen kaynak adresi')); return }

    const request = https.get(parsed, {
      timeout: 10000,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.7' }
    }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        resolve(fetchHtml(new URL(response.headers.location, parsed).toString(), allowedHosts, redirects + 1))
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`Kaynak HTTP ${response.statusCode}`))
        return
      }

      const chunks = []
      let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size <= 2_000_000) chunks.push(chunk)
        else request.destroy(new Error('Kaynak yanıtı çok büyük'))
      })
      response.on('end', () => resolve(decodeHtml(Buffer.concat(chunks), response.headers['content-type'])))
    })
    request.on('timeout', () => request.destroy(new Error('Kaynak zaman aşımına uğradı')))
    request.on('error', reject)
  })
}

function getAttribute(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
  return match?.[2]?.replace(/&amp;/gi, '&') || ''
}

function extractAnchors(html) {
  const anchors = []
  const pattern = /<a\b[^>]*>[\s\S]*?<\/a>/gi
  let match
  while ((match = pattern.exec(String(html || '')))) {
    const tag = match[0]
    anchors.push({
      href: getAttribute(tag, 'href'),
      title: getAttribute(tag, 'title'),
      className: getAttribute(tag, 'class'),
      text: tag.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
    })
  }
  return anchors
}

function safeSourceUrl(value, base, allowedHosts) {
  try {
    const url = new URL(String(value || '').startsWith('//') ? `https:${value}` : value, base)
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname.toLowerCase()) ? url.toString() : ''
  } catch {
    return ''
  }
}

function parseIlacabakProductUrl(html, fullName) {
  const target = normalizeProductName(fullName)
  if (!target) return ''
  for (const anchor of extractAnchors(html)) {
    const candidateName = normalizeProductName(anchor.title || anchor.text)
    if (candidateName !== target) continue
    const url = safeSourceUrl(anchor.href, 'https://www.ilacabak.com/', ['www.ilacabak.com', 'ilacabak.com'])
    if (url && !/\/canliArama\.php|\/pdf\//i.test(new URL(url).pathname)) return url.replace(/\/$/, '')
  }
  return ''
}

function parseIlacabakPdfUrl(html) {
  for (const anchor of extractAnchors(html)) {
    if (!/\.pdf(?:$|[?#])/i.test(anchor.href)) continue
    const url = safeSourceUrl(anchor.href, 'https://www.ilacabak.com/', ['www.ilacabak.com', 'ilacabak.com'])
    if (url && /^\/pdf\//i.test(new URL(url).pathname)) return url
  }
  return ''
}

function parseIlacProspektusuDocumentPageUrl(html, documentType) {
  const wantedClass = documentType === 'KÜB' ? 'kuburl' : 'kturl'
  const allowedHosts = documentType === 'KÜB' ? ['kub.ilacprospektusu.com'] : ['kt.ilacprospektusu.com']
  for (const anchor of extractAnchors(html)) {
    const classes = anchor.className.toLowerCase().split(/\s+/)
    if (!classes.includes(wantedClass)) continue
    const url = safeSourceUrl(anchor.href, 'https://www.ilacprospektusu.com/', allowedHosts)
    if (url) return url
  }
  return ''
}

function parseIlacProspektusuPdfUrl(html, documentType) {
  const wantedTitle = documentType === 'KÜB' ? 'KUB' : 'KT'
  for (const anchor of extractAnchors(html)) {
    const classes = anchor.className.toLowerCase().split(/\s+/)
    if (!classes.includes('pdf') || anchor.title.trim().toLocaleUpperCase('tr-TR') !== wantedTitle) continue
    const url = safeSourceUrl(anchor.href, 'https://www.ilacprospektusu.com/', ['pdf.ilacprospektusu.com'])
    if (url && /\.pdf(?:$|[?#])/i.test(url)) return url
  }
  return ''
}

async function findIlacabakPdf(fullName, documentType) {
  if (!String(fullName || '').trim()) return ''
  const searchUrl = `https://www.ilacabak.com/canliArama.php?sorgu=${encodeURIComponent(fullName)}`
  const allowedHosts = ['www.ilacabak.com', 'ilacabak.com']
  const productUrl = parseIlacabakProductUrl(await fetchHtml(searchUrl, allowedHosts), fullName)
  if (!productUrl) return ''
  const suffix = documentType === 'KÜB' ? 'kisa-urun-bilgisi' : 'kullanma-talimati'
  return parseIlacabakPdfUrl(await fetchHtml(`${productUrl}/${suffix}`, allowedHosts))
}

async function findIlacProspektusuPdf(barcode, documentType) {
  const normalizedBarcode = String(barcode || '').replace(/\D/g, '')
  if (!normalizedBarcode) return ''
  const searchUrl = `https://www.ilacprospektusu.com/ara/ilac/barkod/${normalizedBarcode}`
  const searchHosts = ['www.ilacprospektusu.com', 'ilacprospektusu.com']
  const documentPageUrl = parseIlacProspektusuDocumentPageUrl(await fetchHtml(searchUrl, searchHosts), documentType)
  if (!documentPageUrl) return ''
  const documentHosts = documentType === 'KÜB' ? ['kub.ilacprospektusu.com'] : ['kt.ilacprospektusu.com']
  return parseIlacProspektusuPdfUrl(await fetchHtml(documentPageUrl, documentHosts), documentType)
}

async function findDirectProspectusCandidates({ fullName, barcode, documentType }) {
  const [barcodeResult, nameResult] = await Promise.allSettled([
    findIlacProspektusuPdf(barcode, documentType),
    findIlacabakPdf(fullName, documentType)
  ])
  const candidates = []
  if (barcodeResult.status === 'fulfilled' && barcodeResult.value) {
    candidates.push({ source: 'ilacprospektusu.com', url: barcodeResult.value })
  }
  if (nameResult.status === 'fulfilled' && nameResult.value && !candidates.some(item => item.url === nameResult.value)) {
    candidates.push({ source: 'ilacabak.com', url: nameResult.value })
  }
  return candidates
}

module.exports = {
  normalizeProductName,
  extractAnchors,
  parseIlacabakProductUrl,
  parseIlacabakPdfUrl,
  parseIlacProspektusuDocumentPageUrl,
  parseIlacProspektusuPdfUrl,
  findIlacabakPdf,
  findIlacProspektusuPdf,
  findDirectProspectusCandidates
}
