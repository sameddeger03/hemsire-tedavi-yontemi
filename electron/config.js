const fs = require('fs')
const path = require('path')
const { app, safeStorage } = require('electron')
const { API_URL } = require('./constants')

const SECRET_PREFIX = 'safe:'

function protect(value) {
  if (!value) return ''
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Isletim sistemi gizli anahtar korumasi kullanilamiyor')
  return SECRET_PREFIX + safeStorage.encryptString(String(value)).toString('base64')
}

function unprotect(value) {
  if (!value) return ''
  if (!String(value).startsWith(SECRET_PREFIX)) return String(value)
  if (!safeStorage.isEncryptionAvailable()) return ''
  return safeStorage.decryptString(Buffer.from(String(value).slice(SECRET_PREFIX.length), 'base64'))
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeConfig(config) {
  const p = configPath()
  const tempPath = `${p}.tmp`
  ensureDir(p)
  try {
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), 'utf-8')
    fs.renameSync(tempPath, p)
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch {}
    throw error
  }
}

let cachedConfig = null

function loadConfig() {
  if (cachedConfig) return cachedConfig
  const defaults = {
    printerName: 'USBBARKOD',
    apiUrl: API_URL,
    apiKey: '',
    nurseName: ''
  }
  const stored = readConfig()
  cachedConfig = { ...defaults, ...stored, apiKey: unprotect(stored.apiKey) }
  return cachedConfig
}

function get(key) {
  return loadConfig()[key]
}

function set(key, value) {
  setMany({ [key]: value })
}

function setMany(values) {
  const nextConfig = { ...loadConfig(), ...values }
  const persistedConfig = { ...nextConfig, apiKey: protect(nextConfig.apiKey) }
  writeConfig(persistedConfig)
  cachedConfig = nextConfig
}

function reload() {
  cachedConfig = null
  return loadConfig()
}

function getAll() {
  const cfg = loadConfig()
  return { ...cfg, apiKey: '', apiKeyConfigured: Boolean(cfg.apiKey) }
}

module.exports = { get, set, setMany, reload, getAll, loadConfig }
