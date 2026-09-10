const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const config = require('../electron/config')

const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

function getPrinterName() {
  return config.get('printerName') || 'USBBARKOD'
}

function setPrinterName(name) {
  const normalized = validatePrinterName(name)
  config.set('printerName', normalized)
}

function validatePrinterName(name) {
  const normalized = String(name || '').trim()
  if (!normalized || normalized.length > 220 || /[\x00-\x1F<>"/\\|]/.test(normalized)) {
    throw new Error('Geçersiz yazıcı adı.')
  }
  return normalized
}

let printQueue = Promise.resolve()

function printZPL(zpl, printerName) {
  const name = validatePrinterName(printerName || getPrinterName())
  if (typeof zpl !== 'string' || !zpl.trim() || Buffer.byteLength(zpl) > 1024 * 1024) {
    throw new Error('Geçersiz veya çok büyük etiket verisi.')
  }
  const printJob = () => new Promise((resolve) => {
    // Read through Node so this also works inside the packaged app.asar.
    const script = fs.readFileSync(path.join(__dirname, 'raw-print.ps1'), 'utf8')
    const child = execFile(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      timeout: 15000, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024
    }, (err, stdout, stderr) => {
      if (err) {
        const error = err.killed ? 'Yazıcı yanıt vermedi; gönderim zaman aşımına uğradı.' : (stderr?.trim() || 'Windows yazdırma servisine erişilemedi.')
        resolve({ success: false, error: error.slice(0, 2000) })
        return
      }
      try {
        const { jobId } = JSON.parse(stdout)
        if (!Number.isInteger(jobId) || jobId <= 0) throw new Error('Invalid job ID')
        resolve({ success: true, jobId })
      } catch {
        resolve({ success: false, error: 'Windows yazdırma kuyruğundan geçerli yanıt alınamadı.' })
      }
    })
    // Printer names and label data are input, never executable PowerShell text.
    child.stdin.on('error', () => {}) // A failed/terminated helper can close stdin early.
    child.stdin.end(JSON.stringify({ printerName: name, data: Buffer.from(zpl, 'ascii').toString('base64') }))
  })

  printQueue = printQueue.then(printJob, printJob)
  return printQueue
}

module.exports = { printZPL, getPrinterName, setPrinterName, validatePrinterName }
