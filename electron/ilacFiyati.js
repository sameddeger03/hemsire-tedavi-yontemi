// ilacfiyati.com bilgi karti verileri + 1 gunluk dosya bazli cache.
// Python'daki fetch_ilacfiyati.py mantiginin Node.js karsiligi.

const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const SEARCH_URL = 'https://ilacfiyati.com/ajax/header-search?q='
const PAGE_URL = 'https://ilacfiyati.com/ilaclar/'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const CARD_RE = /<p class="info-card__label">(.*?)<\/p>\s*<p class="info-card__value[^>]*?(?:title="([^"]*)")?[^>]*>\s*(.*?)\s*<\/p>/gs
const TAG_RE = /<[^>]+>/g

let cache = null

function fold(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripTags(value) {
  return String(value || '').replace(TAG_RE, ' ').replace(/\s+/g, ' ').trim()
}

function extractContentHtml(html, contentId) {
  const source = String(html || '')
  const escapedId = String(contentId || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const openingTag = new RegExp(`<div\\b[^>]*\\bid=(["'])${escapedId}\\1[^>]*>`, 'i').exec(source)
  if (!openingTag) return ''

  const divTag = /<\/?div\b[^>]*>/gi
  divTag.lastIndex = openingTag.index
  let depth = 0
  let match
  while ((match = divTag.exec(source))) {
    if (/^<\s*\/div/i.test(match[0])) depth--
    else depth++
    if (depth === 0) return source.slice(openingTag.index, divTag.lastIndex)
  }

  return source.slice(openingTag.index)
}

function extractFoodInteractionHtml(html) {
  return extractContentHtml(html, 'content-besin-etkilesimi')
}

function cachePath() {
  return path.join(app.getPath('userData'), 'ilacfiyati-cache.json')
}

function loadCache() {
  if (cache) return cache
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(), 'utf-8'))
    cache = parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    cache = {}
  }
  const now = Date.now()
  for (const key of Object.keys(cache)) {
    if (now - (cache[key]?.fetchedAt || 0) > CACHE_TTL_MS) delete cache[key]
  }
  return cache
}

function saveCache() {
  try {
    const file = cachePath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(cache), 'utf-8')
    fs.renameSync(tmp, file)
  } catch {
    // cache yazilamazsa sessizce devam et (onbellek kalici olmaz)
  }
}

function parseCards(html) {
  const cards = {}
  for (const match of String(html || '').matchAll(CARD_RE)) {
    const rawLabel = match[1] || ''
    const tooltip = match[2] || ''
    const rawValue = match[3] || ''
    const label = stripTags(rawLabel)
    const value = stripTags(rawValue) || stripTags(tooltip)
    if (!label || !value) continue
    const foldedLabel = fold(label)
    if (foldedLabel === 'barkod' || foldedLabel === 'firmaya ait diger ilaclar') continue
    if (foldedLabel.endsWith('markali ilaclar')) continue
    cards[label] = value
  }
  return cards
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ouml;/gi, 'ö').replace(/&uuml;/gi, 'ü').replace(/&ccedil;/gi, 'ç')
    .replace(/&Ouml;/gi, 'Ö').replace(/&Uuml;/gi, 'Ü').replace(/&Ccedil;/gi, 'Ç')
    .replace(/&reg;/gi, '®').replace(/&deg;/gi, '°').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&rsquo;/gi, "'").replace(/&lsquo;/gi, "'").replace(/&hellip;/gi, '…')
    .replace(/&mdash;/gi, '—').replace(/&ndash;/gi, '–')
}

function safeDocumentUrl(value) {
  try {
    const raw = decodeEntities(value).trim()
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw, 'https://ilacfiyati.com/')
    const allowedHosts = ['ilacfiyati.com', 'www.ilacfiyati.com']
    if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname.toLowerCase())) return ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function extractDocumentUrl(html, contentId) {
  const block = extractContentHtml(html, contentId)
  if (!block) return ''
  const anchorPattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
  let match
  while ((match = anchorPattern.exec(block))) {
    const url = safeDocumentUrl(match[1] || match[2] || match[3] || '')
    if (url) return url
  }
  return ''
}

function extractDocumentLinks(html) {
  return {
    kub: extractDocumentUrl(html, 'content-kisa-urun-bilgisi'),
    kt: extractDocumentUrl(html, 'content-kullanma-talimati')
  }
}

function extractBesinEtkilesimi(html) {
  const block = extractFoodInteractionHtml(html)
  if (!block) return ''
  let text = block
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<ins\b[\s\S]*?<\/ins>/gi, ' ')
    .replace(/<div class="alert alert-danger[\s\S]*?<\/div>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
  text = decodeEntities(text).replace(/\s+/g, ' ').replace(/\s+®\s+/g, '®').trim()
  return text
}

async function fetchInfoCards(barcode) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const searchResponse = await fetch(`${SEARCH_URL}${encodeURIComponent(barcode)}`, {
      headers,
      signal: controller.signal
    })
    if (!searchResponse.ok) throw new Error(`search HTTP ${searchResponse.status}`)
    const data = await searchResponse.json()
    if (data?.status !== 'success') throw new Error(`search status=${data?.status || 'unknown'}`)
    const items = data?.items || []
    if (!items.length || !items[0]?.slug) throw new Error('search: barkod icin sonuc yok')

    const pageResponse = await fetch(`${PAGE_URL}${encodeURIComponent(items[0].slug)}`, {
      headers,
      signal: controller.signal
    })
    if (!pageResponse.ok) throw new Error(`page HTTP ${pageResponse.status}`)
    const html = await pageResponse.text()
    return {
      cards: parseCards(html),
      besinEtkilesimi: extractBesinEtkilesimi(html),
      documents: extractDocumentLinks(html)
    }
  } finally {
    clearTimeout(timer)
  }
}

async function getDrugInfo(rawBarcode) {
  const barcode = String(rawBarcode || '').trim()
  if (!/^\d{8,14}$/.test(barcode)) {
    return { success: false, error: 'Geçerli bir barkod bulunamadı.' }
  }

  const store = loadCache()
  const hit = store[barcode]
  const cachedFoodInteraction = Object.prototype.hasOwnProperty.call(hit || {}, 'besinEtkilesimi')
  const cachedDocuments = hit?.documents && typeof hit.documents === 'object' &&
    Object.prototype.hasOwnProperty.call(hit.documents, 'kub') &&
    Object.prototype.hasOwnProperty.call(hit.documents, 'kt')
  if (hit && cachedFoodInteraction && cachedDocuments && Date.now() - (hit.fetchedAt || 0) <= CACHE_TTL_MS) {
    return {
      success: true,
      cached: true,
      cards: hit.cards || {},
      besinEtkilesimi: hit.besinEtkilesimi || '',
      documents: hit.documents || { kub: '', kt: '' }
    }
  }

  try {
    const { cards, besinEtkilesimi, documents } = await fetchInfoCards(barcode)
    if (!cards || !Object.keys(cards).length) {
      return { success: false, error: 'Bu barkod için ilacfiyati bilgisi bulunamadı.' }
    }
    store[barcode] = { fetchedAt: Date.now(), cards, besinEtkilesimi, documents }
    saveCache()
    return { success: true, cached: false, cards, besinEtkilesimi, documents }
  } catch (error) {
    return { success: false, error: String(error?.message || error) }
  }
}

module.exports = { getDrugInfo, fetchInfoCards, parseCards, extractBesinEtkilesimi, extractDocumentLinks }
