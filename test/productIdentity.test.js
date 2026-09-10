const identity = require('../electron/productIdentity')
const { isCompatibleServer } = require('../electron/clientProtocol')

describe('tedavi ürün kimliği', () => {
  test('yerel depolama ve çalışma zamanı adlarını tedavi kimliğiyle üretir', () => {
    expect(identity.USER_DATA_DIRECTORY).toBe('HemsireTedaviYonetimi')
    expect(identity.DATABASE_FILENAME).toBe('tedavi.db')
    expect(identity.BACKUP_FILENAME_PREFIX).toBe('tedavi-')
    expect(identity.BACKUP_FILENAME_PATTERN.test('tedavi-2026.db')).toBe(true)
    expect(identity.BACKUP_FILENAME_PATTERN.test('etiket-2026.db')).toBe(false)
    expect(identity.ENCRYPTED_DATABASE_HEADER).toEqual(Buffer.from('TEDAVIENC1\n'))
    expect(identity.LOG_PREFIX).toBe('TEDAVI')
    expect(identity.REPORT_TEMP_DIRECTORY).toBe('tedavi-reports')
  })

  test('yalnızca tedavi-server protokol kimliğini kabul eder', () => {
    expect(isCompatibleServer({
      success: true,
      service: 'tedavi-server',
      protocolVersion: 1
    })).toBe(true)
    expect(isCompatibleServer({
      success: true,
      service: 'etiket-rest-api',
      protocolVersion: 1
    })).toBe(false)
    expect(isCompatibleServer({
      success: true,
      service: 'tedavi-server',
      protocolVersion: 2
    })).toBe(false)
  })

  test('geliştirme logunu TEDAVI ürün önekiyle yazar', () => {
    const previousDevServer = process.env.VITE_DEV_SERVER_URL
    process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

    try {
      const devLog = require('../electron/devLogger')
      devLog.info('TEST', 'mesaj')

      expect(logSpy).toHaveBeenCalledTimes(1)
      expect(logSpy.mock.calls[0][0]).toMatch(/^\[TEDAVI .+\] \[TEST\] mesaj$/)
    } finally {
      logSpy.mockRestore()
      if (previousDevServer === undefined) delete process.env.VITE_DEV_SERVER_URL
      else process.env.VITE_DEV_SERVER_URL = previousDevServer
    }
  })
})
