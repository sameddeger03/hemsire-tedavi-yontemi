const { normalizeBarcode, formatTryPrice } = require('./selcukEcza')

const ILAC_REHBERI_ORIGIN = 'https://www.ilacrehberi.com'
const PRICE_PATH = '/ilac-fiyatlari/'

function createLookupWindow(BrowserWindow) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== ILAC_REHBERI_ORIGIN) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })
  return win
}

async function findPrice(BrowserWindow, rawBarcode) {
  const barcode = normalizeBarcode(rawBarcode)
  if (!barcode) return { success: false, source: 'İlaç Rehberi', error: 'Geçerli barkod bulunamadı.' }
  const win = createLookupWindow(BrowserWindow)
  try {
    await win.loadURL(`${ILAC_REHBERI_ORIGIN}${PRICE_PATH}`, {
      method: 'POST',
      postData: [{ type: 'rawData', bytes: Buffer.from(`ilac=${encodeURIComponent(barcode)}`) }],
      extraHeaders: 'Content-Type: application/x-www-form-urlencoded\nReferer: https://www.ilacrehberi.com/ilac-fiyatlari/'
    })
    const result = await win.webContents.executeJavaScript(`(() => {
      const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
      const cells = Array.from(document.querySelectorAll('td'));
      const labelCell = cells.find(cell => {
        const label = normalize(cell.textContent);
        return label.includes('eczane perakende satış fiyatı') && label.includes('kdv dahil');
      });
      const price = String(labelCell?.nextElementSibling?.textContent || '').replace(/\\s+/g, ' ').trim();
      const heading = String(document.querySelector('h1')?.textContent || '').replace(/\\s+/g, ' ').trim();
      const description = String(document.querySelector('meta[name="description"]')?.content || '');
      const date = description.match(/(\\d{1,2}\\s+[^ ]+\\s+\\d{4})\\s+tarihinde/i)?.[1] || '';
      return price ? { price, name: heading.replace(/\\s+\\d{4}\\s+YILI\\s+FİYATLARI.*$/i, '').trim(), date } : null;
    })()`, true)
    if (!result?.price) return { success: false, source: 'İlaç Rehberi', error: 'Bu barkod için fiyat bilgisi bulunamadı.' }
    const numericPrice = String(result.price).match(/\d+(?:[.,]\d+)?/)?.[0] || ''
    const displayPrice = formatTryPrice(numericPrice)
    if (!displayPrice) return { success: false, source: 'İlaç Rehberi', error: 'Bulunan fiyat değeri okunamadı.' }
    return {
      success: true,
      source: 'İlaç Rehberi',
      barcode,
      name: String(result.name || '').trim(),
      price: numericPrice,
      displayPrice,
      date: String(result.date || '').trim()
    }
  } catch {
    return { success: false, source: 'İlaç Rehberi', error: 'İlaç Rehberi fiyat sorgusuna ulaşılamadı.' }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

module.exports = { findPrice }
