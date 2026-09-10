const { LOG_PREFIX } = require('./productIdentity')

const isEnabled = () => Boolean(process.env.VITE_DEV_SERVER_URL)

function timestamp() {
  return new Date().toLocaleTimeString('tr-TR', { hour12: false })
}

function write(level, step, message) {
  if (!isEnabled()) return
  const line = `[${LOG_PREFIX} ${timestamp()}] [${step}] ${message}`
  const output = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  output(line)
}

function info(step, message) {
  write('info', step, message)
}

function success(step, message) {
  write('info', step, `TAMAM - ${message}`)
}

function warn(step, message) {
  write('warn', step, `UYARI - ${message}`)
}

function error(step, message) {
  write('error', step, `HATA - ${message}`)
}

function errorMessage(err) {
  if (!err) return 'Bilinmeyen hata'
  const code = err.code ? `${err.code}: ` : ''
  return `${code}${err.message || String(err)}`
}

module.exports = { info, success, warn, error, errorMessage }
