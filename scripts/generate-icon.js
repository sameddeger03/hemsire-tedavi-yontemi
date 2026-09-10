const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const ICON_SIZES = [32, 64, 128, 256, 512]
const RUNTIME_ICON_SIZE = 128
const APPX_ASSETS = {
  'StoreLogo.png': [50, 50],
  'Square44x44Logo.png': [44, 44],
  'Square150x150Logo.png': [150, 150],
  'Wide310x150Logo.png': [310, 150]
}

function createIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries = images.map(({ size, buffer }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size === 256 ? 0 : size, 0)
    entry.writeUInt8(size === 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(buffer.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += buffer.length
    return entry
  })

  return Buffer.concat([
    header,
    ...entries,
    ...images.map(({ buffer }) => buffer)
  ])
}

async function generateIcons(projectRoot = path.resolve(__dirname, '..')) {
  const sourcePath = path.join(projectRoot, 'public', 'icon.png')
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`İkon kaynağı bulunamadı: ${sourcePath}`)
  }
  let sourceBuffer
  let metadata
  try {
    sourceBuffer = await fs.promises.readFile(sourcePath)
    metadata = await sharp(sourceBuffer).metadata()
  } catch (error) {
    throw new Error(`İkon kaynağı geçerli bir PNG değil: ${sourcePath}`, { cause: error })
  }
  if (metadata.format !== 'png') {
    throw new Error(`İkon kaynağı geçerli bir PNG değil: ${sourcePath}`)
  }

  const resizedIcons = new Map(await Promise.all(ICON_SIZES.map(async size => [
    size,
    await sharp(sourceBuffer).resize(size, size).png().toBuffer()
  ])))
  const appxAssets = new Map(await Promise.all(Object.entries(APPX_ASSETS).map(async ([name, [width, height]]) => [
    name,
    await sharp(sourceBuffer).resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }).png().toBuffer()
  ])))
  const ico = createIco([32, 64, 128, 256].map(size => ({
    size,
    buffer: resizedIcons.get(size)
  })))

  const buildDir = path.join(projectRoot, 'build')
  const appxDir = path.join(buildDir, 'appx')
  const electronDir = path.join(projectRoot, 'electron')
  await Promise.all([
    fs.promises.mkdir(buildDir, { recursive: true }),
    fs.promises.mkdir(appxDir, { recursive: true }),
    fs.promises.mkdir(electronDir, { recursive: true })
  ])

  const electronIconPath = path.join(electronDir, 'icon.png')
  const runtimeIconPath = path.join(projectRoot, 'public', 'icon-runtime.png')
  const sizedIconPaths = ICON_SIZES.map(size => path.join(buildDir, `icon-${size}.png`))
  const buildIconPath = path.join(buildDir, 'icon.png')
  const icoPath = path.join(buildDir, 'icon.ico')
  const appxAssetPaths = [...appxAssets.keys()].map(name => path.join(appxDir, name))
  const outputPaths = [electronIconPath, runtimeIconPath, ...sizedIconPaths, buildIconPath, icoPath, ...appxAssetPaths]
  await Promise.all([
    fs.promises.writeFile(electronIconPath, resizedIcons.get(256)),
    fs.promises.writeFile(runtimeIconPath, resizedIcons.get(RUNTIME_ICON_SIZE)),
    ...ICON_SIZES.map((size, index) => fs.promises.writeFile(sizedIconPaths[index], resizedIcons.get(size))),
    fs.promises.writeFile(buildIconPath, resizedIcons.get(256)),
    fs.promises.writeFile(icoPath, ico),
    ...appxAssetPaths.map((assetPath, index) => fs.promises.writeFile(assetPath, [...appxAssets.values()][index]))
  ])

  return outputPaths
}

async function runCli({
  projectRoot = path.resolve(__dirname, '..'),
  stdout = process.stdout,
  stderr = process.stderr,
  processObject = process
} = {}) {
  try {
    const outputPaths = await generateIcons(projectRoot)
    stdout.write(`İkonlar üretildi (${outputPaths.length} dosya).\n`)
    return true
  } catch (error) {
    stderr.write(`İkon üretimi durduruldu: ${error.message}\n`)
    processObject.exitCode = 1
    return false
  }
}

if (require.main === module) {
  runCli()
}

module.exports = { generateIcons, runCli }
