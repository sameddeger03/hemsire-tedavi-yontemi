const fs = require('fs')
const os = require('os')
const path = require('path')

jest.mock('electron', () => ({
  app: { getPath: () => process.env.APPDATA },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`),
    decryptString: value => value.toString().replace(/^encrypted:/, '')
  }
}))

describe('atomik config yazımı', () => {
  let appData
  let config

  beforeEach(() => {
    appData = fs.mkdtempSync(path.join(os.tmpdir(), 'client-config-test-'))
    process.env.APPDATA = appData
    jest.resetModules()
    config = require('../electron/config')
  })

  afterEach(() => {
    fs.rmSync(appData, { recursive: true, force: true })
  })

  test('API adresi ve anahtarını tek config sürümünde birlikte kaydeder', () => {
    config.setMany({ apiUrl: 'https://old.example.com', apiKey: 'old-secret' })
    config.setMany({ apiUrl: 'https://example.com', apiKey: 'secret' })

    const stored = JSON.parse(fs.readFileSync(
      path.join(appData, 'config.json'),
      'utf8'
    ))
    expect(stored.apiUrl).toBe('https://example.com')
    expect(stored.apiKey).toMatch(/^safe:/)
    expect(stored.apiKey).not.toContain('secret')
    expect(config.get('apiUrl')).toBe('https://example.com')
    expect(config.getAll()).toMatchObject({ apiUrl: 'https://example.com', apiKey: '', apiKeyConfigured: true })
  })

  test('kalıcı dosya değiştirilemezse diski ve önbelleği eski halinde tutar', () => {
    config.setMany({ apiUrl: 'https://old.example.com', apiKey: 'old-secret' })
    const configPath = path.join(appData, 'config.json')
    const before = fs.readFileSync(configPath, 'utf8')
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('rename failed')
    })

    try {
      expect(() => config.setMany({
        apiUrl: 'https://new.example.com',
        apiKey: 'new-secret'
      })).toThrow('rename failed')
    } finally {
      renameSpy.mockRestore()
    }

    expect(fs.readFileSync(configPath, 'utf8')).toBe(before)
    expect(fs.existsSync(`${configPath}.tmp`)).toBe(false)
    expect(config.get('apiUrl')).toBe('https://old.example.com')
  })
})
