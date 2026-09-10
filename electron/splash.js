const status = document.getElementById('status')
const actions = document.getElementById('actions')
const retry = document.getElementById('retry')
const close = document.getElementById('close')

window.splashAPI.onStatus(({ message, error }) => {
  status.textContent = message
  document.body.classList.toggle('error', Boolean(error))
  actions.hidden = !error
  retry.disabled = false
})

retry.addEventListener('click', () => {
  retry.disabled = true
  actions.hidden = true
  document.body.classList.remove('error')
  status.textContent = 'Sunucu bağlantısı tekrar kontrol ediliyor...'
  window.splashAPI.retry()
})

close.addEventListener('click', () => window.splashAPI.close())
