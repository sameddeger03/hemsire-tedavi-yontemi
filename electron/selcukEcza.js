const SELCUK_ECZA_ORIGIN = 'https://selcukecza.com.tr'
const SEARCH_PATH = '/sayfa/ilac-fiyat-ve-barkod-arama/ilac-ve-barkod-arama'

function normalizeBarcode(value) {
  const barcode = String(value || '').trim()
  return /^\d{8,14}$/.test(barcode) ? barcode : ''
}

function formatTryPrice(value) {
  const amount = Number(String(value || '').trim().replace(',', '.'))
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount)
    : ''
}

function createLookupWindow(BrowserWindow) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== SELCUK_ECZA_ORIGIN) event.preventDefault()
    } catch {
      event.preventDefault()
    }
  })
  return win
}

async function findPrice(BrowserWindow, rawBarcode) {
  const barcode = normalizeBarcode(rawBarcode)
  if (!barcode) return { success: false, source: 'Selçuk Ecza Deposu', error: 'Fiyat sorgusu için geçerli bir barkod bulunamadı.' }
  const win = createLookupWindow(BrowserWindow)
  try {
    await win.loadURL(`${SELCUK_ECZA_ORIGIN}${SEARCH_PATH}?barcode=${encodeURIComponent(barcode)}`)
    const result = await win.webContents.executeJavaScript(`(() => {
      const table = document.querySelector('#tablesayfa table');
      if (!table) return null;
      const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
      const headers = Array.from(table.querySelectorAll('thead th')).map(cell => normalize(cell.textContent));
      const indexes = {
        barcode: headers.findIndex(value => value === 'barkodu'),
        name: headers.findIndex(value => value === 'adı'),
        price: headers.findIndex(value => value === 'fiyat'),
        date: headers.findIndex(value => value === 'tarih')
      };
      if (indexes.price < 0) return { schemaError: true };
      const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => Array.from(row.querySelectorAll('td')).map(cell => String(cell.textContent || '').replace(/\\s+/g, ' ').trim()));
      const cells = rows.find(row => indexes.barcode < 0 || row[indexes.barcode] === ${JSON.stringify(barcode)});
      if (!cells) return null;
      return {
        barcode: indexes.barcode >= 0 ? cells[indexes.barcode] : ${JSON.stringify(barcode)},
        name: indexes.name >= 0 ? cells[indexes.name] : '',
        price: cells[indexes.price] || '',
        date: indexes.date >= 0 ? cells[indexes.date] : ''
      };
    })()`, true)
    if (result?.schemaError) return { success: false, source: 'Selçuk Ecza Deposu', error: 'Fiyat tablosundaki Fiyat sütunu okunamadı.' }
    if (!result?.price) return { success: false, source: 'Selçuk Ecza Deposu', error: 'Bu barkod için fiyat bilgisi bulunamadı.' }
    const displayPrice = formatTryPrice(result.price)
    if (!displayPrice) return { success: false, source: 'Selçuk Ecza Deposu', error: 'Bulunan fiyat değeri okunamadı.' }
    return {
      success: true,
      barcode,
      name: String(result.name || '').trim(),
      price: String(result.price).trim(),
      displayPrice,
      date: String(result.date || '').trim(),
      source: 'Selçuk Ecza Deposu'
    }
  } catch {
    return { success: false, source: 'Selçuk Ecza Deposu', error: 'Selçuk Ecza fiyat sorgusuna ulaşılamadı.' }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

module.exports = { normalizeBarcode, formatTryPrice, findPrice }
