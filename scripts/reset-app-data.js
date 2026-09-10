const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { DATABASE_FILENAME, USER_DATA_DIRECTORY } = require('../electron/productIdentity')

const appData = process.env.APPDATA
if (!appData) {
  console.error('APPDATA bulunamadı; sıfırlama yapılmadı.')
  process.exit(1)
}

const dataDir = path.resolve(appData, USER_DATA_DIRECTORY)
const expectedParent = path.resolve(appData) + path.sep
if (!dataDir.startsWith(expectedParent) || path.basename(dataDir) !== USER_DATA_DIRECTORY) {
  console.error(`Güvenli olmayan hedef reddedildi: ${dataDir}`)
  process.exit(1)
}

const databaseFiles = [
  path.join(dataDir, DATABASE_FILENAME),
  path.join(dataDir, `${DATABASE_FILENAME}.tmp`)
]
const backupDir = path.join(dataDir, 'backups')
const configPath = path.join(dataDir, 'config.json')

function stopRunningElectron() {
  const projectDir = path.resolve(__dirname, '..')
  const script = [
    "$project = $env:RESET_PROJECT_DIR",
    "$userData = $env:RESET_USER_DATA",
    "$all = Get-CimInstance Win32_Process",
    "$processes = @($all | Where-Object {",
    "  ($_.Name -eq 'electron.exe' -or $_.Name -eq 'Hemşire Tedavi Yönetimi.exe' -or $_.Name -eq 'Tedavi Yönetimi.exe') -and",
    "  ($_.CommandLine -like ('*' + $project + '*') -or $_.CommandLine -like ('*' + $userData + '*'))",
    "})",
    "$pending = @($processes)",
    "while ($pending.Count -gt 0) {",
    "  $parentIds = @($pending | ForEach-Object { $_.ParentProcessId } | Select-Object -Unique)",
    "  $parents = @($all | Where-Object { $parentIds -contains $_.ProcessId -and $_.Name -eq 'electron.exe' })",
    "  $newParents = @($parents | Where-Object { $processes.ProcessId -notcontains $_.ProcessId })",
    "  if ($newParents.Count -eq 0) { break }",
    "  $processes += $newParents",
    "  $pending = $newParents",
    "}",
    "$processes | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    "if ($processes) { Start-Sleep -Milliseconds 1200 }",
    "$processes.Count"
  ].join('\n')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, RESET_PROJECT_DIR: projectDir, RESET_USER_DATA: dataDir }
  })
  if (result.status !== 0) throw new Error(`Çalışan uygulama kapatılamadı: ${(result.stderr || '').trim()}`)
  const count = Number((result.stdout || '').trim()) || 0
  if (count) console.log(`${count} Electron süreci kapatıldı.`)
}

try {
  stopRunningElectron()

  for (const file of databaseFiles) {
    if (!fs.existsSync(file)) continue
    fs.rmSync(file)
    console.log(`Silindi: ${file}`)
  }

  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true })
    console.log(`Silindi: ${backupDir}`)
  }

  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    config.apiKey = ''
    config.apiUrl = 'https://tedavi.dislek.com'
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
    console.log(`API anahtarı temizlendi: ${configPath}`)
  } else {
    console.log('Yapılandırma dosyası bulunamadı; API anahtarı zaten yok.')
  }

  if (databaseFiles.some(file => fs.existsSync(file)) || fs.existsSync(backupDir)) {
    throw new Error('Veritabanı çalışan bir süreç tarafından yeniden oluşturuldu')
  }
  const savedConfig = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
  if (savedConfig.apiKey) throw new Error('API anahtarı temizlenemedi')

  console.log('Uygulama verileri sıfırlandı. Bir sonraki açılışta boş veritabanı oluşturulacak.')
} catch (error) {
  console.error(`Sıfırlama başarısız: ${error.message}`)
  console.error('Electron uygulamasını tamamen kapatıp komutu yeniden çalıştırın.')
  process.exit(1)
}
