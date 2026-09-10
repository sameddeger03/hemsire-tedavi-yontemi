import { ref, reactive } from 'vue'

const api = () => window.electronAPI

export function useWindow() {
  const isMaximized = ref(false)
  const printerName = ref('')
  const printerList = ref([])
  const apiUrl = ref('https://tedavi.dislek.com')
  const nurseName = ref('')
  const settingsOpen = ref(false)

  function onKeyDown(e) {
    if (e.key === 'Tab') { e.preventDefault(); return }
    if (e.key === 'F11') {
      e.preventDefault()
      api()?.toggleDevTools()
    }
  }

  async function openSettings() {
    settingsOpen.value = true
    if (api()) {
      printerName.value = await api().getPrinterName()
      printerList.value = await api().getPrinters()
      const cfg = await api().configGetAll()
      apiUrl.value = 'https://tedavi.dislek.com'
      nurseName.value = cfg.nurseName || ''
    }
  }

  async function saveSettings() {
    if (api()) {
      await api().setPrinterName(printerName.value.trim() || 'USBBARKOD')
      await api().configSet('nurseName', nurseName.value.trim())
    }
    settingsOpen.value = false
  }

  function windowMinimize() { api()?.minimize() }
  function windowMaximize() { api()?.maximize() }
  function windowClose() { api()?.close() }

  function reloadPage() {
    if (api()) api().reloadApp()
    else location.reload()
  }

  function setupMaximizedListener() {
    if (api()) api().onMaximizedChange(v => isMaximized.value = v)
  }

  return {
    isMaximized,
    printerName,
    printerList,
    apiUrl,
    nurseName,
    settingsOpen,
    openSettings,
    saveSettings,
    windowMinimize,
    windowMaximize,
    windowClose,
    reloadPage,
    onKeyDown,
    setupMaximizedListener
  }
}
