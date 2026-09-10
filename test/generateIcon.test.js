const fs = require('fs')
const os = require('os')
const path = require('path')
const sharp = require('sharp')

const { generateIcons, runCli } = require('../scripts/generate-icon')

describe('generateIcons', () => {
  let projectRoot

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'client-icon-test-'))
    fs.mkdirSync(path.join(projectRoot, 'public'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  })

  test('public/icon.png kaynağından bütün ikonları üretir', async () => {
    const sourcePath = path.join(projectRoot, 'public', 'icon.png')
    await sharp({
      create: {
        width: 700,
        height: 700,
        channels: 4,
        background: '#2563eb'
      }
    }).png().toFile(sourcePath)

    await generateIcons(projectRoot)

    for (const size of [32, 64, 128, 256, 512]) {
      const metadata = await sharp(
        path.join(projectRoot, 'build', `icon-${size}.png`)
      ).metadata()
      expect(metadata).toMatchObject({ format: 'png', width: size, height: size })
    }

    await expect(sharp(path.join(projectRoot, 'electron', 'icon.png')).metadata())
      .resolves.toMatchObject({ format: 'png', width: 256, height: 256 })

    await expect(sharp(path.join(projectRoot, 'public', 'icon-runtime.png')).metadata())
      .resolves.toMatchObject({ format: 'png', width: 128, height: 128 })

    await expect(sharp(path.join(projectRoot, 'build', 'icon.png')).metadata())
      .resolves.toMatchObject({ format: 'png', width: 256, height: 256 })

    for (const [name, width, height] of [
      ['StoreLogo.png', 50, 50],
      ['Square44x44Logo.png', 44, 44],
      ['Square150x150Logo.png', 150, 150],
      ['Wide310x150Logo.png', 310, 150]
    ]) {
      await expect(sharp(path.join(projectRoot, 'build', 'appx', name)).metadata())
        .resolves.toMatchObject({ format: 'png', width, height })
    }

    expect(fs.readFileSync(path.join(projectRoot, 'build', 'icon.ico')).subarray(0, 6))
      .toEqual(Buffer.from([0, 0, 1, 0, 4, 0]))
  })

  test('kaynak eksikse hiçbir çıktı yazmadan anlaşılır hata verir', async () => {
    await expect(generateIcons(projectRoot)).rejects.toThrow('İkon kaynağı bulunamadı')

    expect(fs.existsSync(path.join(projectRoot, 'build'))).toBe(false)
    expect(fs.existsSync(path.join(projectRoot, 'electron'))).toBe(false)
    expect(fs.existsSync(path.join(projectRoot, 'public', 'icon-runtime.png'))).toBe(false)
  })

  test('kaynak bozuksa hiçbir çıktı yazmadan anlaşılır hata verir', async () => {
    fs.writeFileSync(path.join(projectRoot, 'public', 'icon.png'), 'bozuk-png')

    await expect(generateIcons(projectRoot)).rejects.toThrow('geçerli bir PNG')

    expect(fs.existsSync(path.join(projectRoot, 'build'))).toBe(false)
    expect(fs.existsSync(path.join(projectRoot, 'electron'))).toBe(false)
  })

  test('CLI üretim hatasında sonraki komutları durduracak çıkış kodunu ayarlar', async () => {
    const processObject = { exitCode: 0 }
    const errors = []

    const result = await runCli({
      projectRoot,
      processObject,
      stdout: { write: () => true },
      stderr: { write: message => errors.push(message) }
    })

    expect(result).toBe(false)
    expect(processObject.exitCode).toBe(1)
    expect(errors.join('')).toContain('İkon üretimi durduruldu')
  })
})
