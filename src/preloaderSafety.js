const closeButton = document.getElementById('app-loading-close')

closeButton?.addEventListener('click', () => {
  window.electronAPI?.close()
})
