const title = document.getElementById('title')
const detail = document.getElementById('detail')
const progress = document.getElementById('progress')
const percent = document.getElementById('percent')

title.textContent = 'Veri güncelleniyor'
detail.textContent = 'İlaç kataloğu ve güvenlik bilgileri hazırlanıyor. Lütfen bekleyin.'
progress.classList.add('indeterminate')
percent.textContent = ''

window.dataUpdateGateAPI.onResult((result) => {
  progress.classList.remove('indeterminate')
  progress.style.width = result.ok ? '100%' : '0%'
  if (result.ok) {
    title.textContent = result.changed ? 'Veri güncellendi' : 'Veriler güncel'
    detail.textContent = 'Ana uygulama açılıyor.'
  } else {
    title.textContent = 'Veri güncellemesi yapılamadı'
    detail.textContent = `${result.error || 'Sunucuya ulaşılamadı'} Mevcut yerel verilerle devam ediliyor.`
  }
})
