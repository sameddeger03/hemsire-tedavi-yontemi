jest.mock('../electron/config', () => ({
  get: jest.fn(() => 'USBBARKOD'),
  set: jest.fn()
}))

jest.mock('child_process', () => ({
  execFile: jest.fn()
}))

const childProcess = require('child_process')
const config = require('../electron/config')
const { printZPL, setPrinterName, validatePrinterName } = require('../printer')

describe('printer command safety', () => {
  let stdin
  beforeEach(() => {
    jest.clearAllMocks()
    stdin = { on: jest.fn(), end: jest.fn() }
    childProcess.execFile.mockImplementation((command, args, options, callback) => {
      callback(null, '{"jobId":123}', '')
      return { stdin }
    })
  })

  test('rejects names that can escape a printer path', () => {
    expect(() => validatePrinterName('printer" & calc.exe')).toThrow('Geçersiz yazıcı adı')
    expect(() => validatePrinterName('host\\printer')).toThrow('Geçersiz yazıcı adı')
  })

  test('stores only a validated printer name', () => {
    setPrinterName(' Zebra ZD220 ')
    expect(config.set).toHaveBeenCalledWith('printerName', 'Zebra ZD220')
  })

  test('submits RAW data without a share or executable user input', async () => {
    expect(await printZPL('^XA^XZ', "Zebra Çocuk ' $(whoami)")).toEqual({ success: true, jobId: 123 })

    expect(childProcess.execFile).toHaveBeenCalledWith(
      expect.stringMatching(/WindowsPowerShell.*powershell\.exe$/),
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', expect.any(String)],
      { timeout: 15000, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 },
      expect.any(Function)
    )
    const script = Buffer.from(childProcess.execFile.mock.calls[0][1][3], 'base64').toString('utf16le')
    expect(script).toContain('OpenPrinterW')
    expect(script).not.toContain('whoami')
    expect(JSON.parse(stdin.end.mock.calls[0][0])).toEqual({
      printerName: "Zebra Çocuk ' $(whoami)", data: Buffer.from('^XA^XZ').toString('base64')
    })
  })

  test('rejects empty or oversized jobs before launching the helper', () => {
    expect(() => printZPL('')).toThrow('Geçersiz')
    expect(() => printZPL('x'.repeat(1048577))).toThrow('Geçersiz')
    expect(childProcess.execFile).not.toHaveBeenCalled()
  })

  test('returns Windows errors and can print again after a failure', async () => {
    childProcess.execFile.mockImplementationOnce((command, args, options, callback) => {
      callback(new Error('failed'), '', 'OpenPrinter (Windows 1801): Invalid printer name.')
      return { stdin }
    })
    expect(await printZPL('^XA^XZ')).toEqual({ success: false, error: 'OpenPrinter (Windows 1801): Invalid printer name.' })
    expect((await printZPL('^XA^XZ')).success).toBe(true)
  })

  test('does not report a timeout or malformed acknowledgement as success', async () => {
    childProcess.execFile.mockImplementationOnce((command, args, options, callback) => {
      callback({ killed: true }, '', '')
      return { stdin }
    })
    expect((await printZPL('^XA^XZ')).success).toBe(false)
    childProcess.execFile.mockImplementationOnce((command, args, options, callback) => {
      callback(null, '{}', '')
      return { stdin }
    })
    expect((await printZPL('^XA^XZ')).success).toBe(false)
  })

  test('sends multiple labels to the printer sequentially', async () => {
    const callbacks = []
    childProcess.execFile.mockImplementation((command, args, options, callback) => {
      callbacks.push(callback)
      return { stdin }
    })

    const first = printZPL('^XA^FDFIRST^FS^XZ', 'Zebra ZD220')
    const second = printZPL('^XA^FDSECOND^FS^XZ', 'Zebra ZD220')
    await Promise.resolve()

    expect(childProcess.execFile).toHaveBeenCalledTimes(1)
    callbacks.shift()(null, '{"jobId":1}', '')
    await first
    await Promise.resolve()

    expect(childProcess.execFile).toHaveBeenCalledTimes(2)
    callbacks.shift()(null, '{"jobId":2}', '')
    await second
  })

  ;(process.platform === 'win32' ? test : test.skip)('real Windows helper compiles and reports an unknown printer without printing', async () => {
    const fs = require('fs')
    const path = require('path')
    const { randomUUID } = require('crypto')
    const script = fs.readFileSync(path.join(__dirname, '../printer/raw-print.ps1'), 'utf8')
    const command = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
    const result = await new Promise(resolve => {
      const child = jest.requireActual('child_process').execFile(command,
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        { windowsHide: true, timeout: 15000, encoding: 'utf8' },
        (error, stdout, stderr) => resolve({ error, stderr }))
      child.stdin.on('error', () => {})
      child.stdin.end(JSON.stringify({ printerName: 'Tedavi-missing-' + randomUUID(), data: Buffer.from('^XA^XZ').toString('base64') }))
    })
    expect(result.error).toBeTruthy()
    expect(result.stderr).toMatch(/OpenPrinter \(Windows \d+\)/)
  }, 20000)
})
