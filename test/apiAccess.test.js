const { normalizeApiUrl, normalizeApiAddressInput, activateApiAccess } = require('../electron/apiAccess')

describe('API erişim kurulumu', () => {
  test('HTTPS ve yalnız yerel HTTP adreslerini normalleştirir', () => {
    expect(normalizeApiUrl(' https://example.com/api/ ')).toBe('https://example.com/api')
    expect(normalizeApiUrl('tedavi.dislek.com')).toBe('https://tedavi.dislek.com')
    expect(normalizeApiUrl('tedavi.dislek.com:8443/api/')).toBe('https://tedavi.dislek.com:8443/api')
    expect(normalizeApiUrl('http://localhost:3000/')).toBe('http://localhost:3000')
    expect(normalizeApiUrl('http://127.0.0.1:3000/')).toBe('http://127.0.0.1:3000')
    expect(normalizeApiUrl('http://[::1]:3000/')).toBe('http://[::1]:3000')
  })

  test.each([
    ['ftp://example.com', 'Geçerli bir API adresi'],
    ['http://example.com:3000', 'HTTPS'],
    ['http://192.168.1.20:3000', 'HTTPS'],
    ['https://user:pass@example.com', 'kullanıcı bilgisi'],
    ['https://', 'Geçerli bir API adresi']
  ])('güvensiz veya geçersiz adresi reddeder: %s', (value, message) => {
    expect(() => normalizeApiUrl(value)).toThrow(message)
  })

  test.each([
    ['tedavi.dislek.com', 'https://tedavi.dislek.com'],
    ['api-2.dislek.com:8443', 'https://api-2.dislek.com:8443'],
    ['localhost:3000', 'http://localhost:3000'],
    ['192.168.1.20:443', 'https://192.168.1.20']
  ])('kullanici API adresini dogrular ve HTTPS ekler: %s', (value, expected) => {
    expect(normalizeApiAddressInput(value)).toBe(expected)
  })

  test.each([
    'ftp://example.com',
    'http://example.com',
    'https://example.com',
    'example.com/api',
    'example.com?x=1',
    'example.com:0',
    'example.com:65536',
    '-api.example.com',
    'api..example.com',
    'api_example.com'
  ])('protokol, yol veya gecersiz karakter iceren kullanici girdisini reddeder: %s', value => {
    expect(() => normalizeApiAddressInput(value)).toThrow('protokol veya yol olmadan')
  })

  test('HTTP uzak adresinde ağa çıkmaz ve açık HTTPS hatası döndürür', async () => {
    const validateAddress = jest.fn()
    const verifyKey = jest.fn()
    const saveCredentials = jest.fn()

    const result = await activateApiAccess(
      { apiUrl: 'http://example.com:3000', apiKey: 'secret' },
      { validateAddress, verifyKey, saveCredentials }
    )

    expect(result.error).toContain('protokol veya yol olmadan')
    expect(validateAddress).not.toHaveBeenCalled()
    expect(verifyKey).not.toHaveBeenCalled()
    expect(saveCredentials).not.toHaveBeenCalled()
  })

  test('boş anahtarda ağa çıkmaz ve kayıt yapmaz', async () => {
    const validateAddress = jest.fn()
    const verifyKey = jest.fn()
    const saveCredentials = jest.fn()

    const result = await activateApiAccess(
      { apiUrl: 'example.com', apiKey: '  ' },
      { validateAddress, verifyKey, saveCredentials }
    )

    expect(result).toEqual({ success: false, error: 'API anahtarı zorunludur.' })
    expect(validateAddress).not.toHaveBeenCalled()
    expect(verifyKey).not.toHaveBeenCalled()
    expect(saveCredentials).not.toHaveBeenCalled()
  })

  test('adres doğrulanamazsa anahtarı sınamaz ve kayıt yapmaz', async () => {
    const verifyKey = jest.fn()
    const saveCredentials = jest.fn()

    const result = await activateApiAccess(
      { apiUrl: 'example.com', apiKey: 'secret' },
      { validateAddress: async () => false, verifyKey, saveCredentials }
    )

    expect(result).toEqual({ success: false, error: 'API adresi doğrulanamadı.' })
    expect(verifyKey).not.toHaveBeenCalled()
    expect(saveCredentials).not.toHaveBeenCalled()
  })

  test('anahtar reddedilirse hiçbir ayarı kaydetmez', async () => {
    const saveCredentials = jest.fn()

    const result = await activateApiAccess(
      { apiUrl: 'example.com', apiKey: 'wrong' },
      {
        validateAddress: async () => true,
        verifyKey: async () => ({ success: false, error: 'Geçersiz API anahtarı.' }),
        saveCredentials
      }
    )

    expect(result).toEqual({ success: false, error: 'Geçersiz API anahtarı.' })
    expect(saveCredentials).not.toHaveBeenCalled()
  })

  test('ikisi de doğrulanınca normalleştirilmiş adresi ve anahtarı bir kez kaydeder', async () => {
    const calls = []
    const saveCredentials = jest.fn(credentials => calls.push(['save', credentials]))

    const result = await activateApiAccess(
      { apiUrl: 'example.com', apiKey: ' secret ' },
      {
        validateAddress: async apiUrl => { calls.push(['address', apiUrl]); return true },
        verifyKey: async (apiUrl, apiKey) => { calls.push(['key', apiUrl, apiKey]); return { success: true } },
        saveCredentials
      }
    )

    expect(result).toEqual({ success: true })
    expect(calls).toEqual([
      ['address', 'https://example.com'],
      ['key', 'https://example.com', 'secret'],
      ['save', { apiUrl: 'https://example.com', apiKey: 'secret' }]
    ])
    expect(saveCredentials).toHaveBeenCalledTimes(1)
  })

  test('config yazımı başarısızsa güvenli hata döndürür', async () => {
    const result = await activateApiAccess(
      { apiUrl: 'example.com', apiKey: 'secret-value' },
      {
        validateAddress: async () => true,
        verifyKey: async () => ({ success: true }),
        saveCredentials: async () => { throw new Error('secret-value diske yazılamadı') }
      }
    )

    expect(result).toEqual({ success: false, error: 'Kurulum ayarları kaydedilemedi.' })
    expect(result.error).not.toContain('secret-value')
  })
})
