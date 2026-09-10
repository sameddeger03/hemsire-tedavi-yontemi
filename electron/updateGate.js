const title = document.getElementById('title')
const detail = document.getElementById('detail')
const progress = document.getElementById('progress')
const percent = document.getElementById('percent')
const speed = document.getElementById('speed')
const initialVersion = new URLSearchParams(window.location.search).get('version')
if (initialVersion) {
  title.textContent = `Yeni sürüm ${initialVersion}`
  detail.textContent = 'Güncelleme indiriliyor. Bu pencereyi kapatmadan bekleyin.'
}

function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond) return ''
  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/sn`
}

window.updateGateAPI.onChecking(() => {
  title.textContent = 'Güncelleme kontrol ediliyor'
})
window.updateGateAPI.onAvailable((info) => {
  title.textContent = `Yeni sürüm ${info.version}`
  detail.textContent = 'Güncelleme indiriliyor. Bu pencereyi kapatmadan bekleyin.'
})
window.updateGateAPI.onProgress((value) => {
  const current = Math.max(0, Math.min(100, value.percent || 0))
  progress.style.width = `${current}%`
  percent.textContent = `${current.toFixed(0)}%`
  speed.textContent = formatSpeed(value.bytesPerSecond)
})
window.updateGateAPI.onDownloaded((info) => {
  progress.style.width = '100%'
  percent.textContent = '100%'
  title.textContent = `${info.version} kuruluyor`
  detail.textContent = 'Uygulama kapanacak ve kurulum otomatik başlayacak.'
})
window.updateGateAPI.onNotAvailable(() => {
  title.textContent = 'Uygulama güncel'
  detail.textContent = 'Ana uygulama açılıyor.'
})
window.updateGateAPI.onError((error) => {
  title.textContent = 'Güncelleme kontrolü tamamlanamadı'
  detail.textContent = `${error.message || 'Bilinmeyen hata'} Ana uygulama açılıyor.`
})
