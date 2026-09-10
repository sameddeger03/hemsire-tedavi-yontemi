// electron:dev başlatılmadan önce çalışan paketli uygulamayı ve tray süreçlerini kapatır.
const { execSync } = require('child_process')

const TARGETS = ['Hemşire Tedavi Yönetimi.exe', 'Tedavi Yönetimi.exe']

for (const target of TARGETS) {
  try {
    execSync(`taskkill /F /IM "${target}" /T 2>nul`, { stdio: 'ignore' })
  } catch {
    // Süreç zaten çalışmıyorsa hata yok sayılır.
  }
}
