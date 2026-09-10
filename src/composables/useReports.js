import { ref, reactive, computed } from 'vue'

const api = () => window.electronAPI

export function useReports() {
  const reportOpen = ref(false)

  const reportTopics = [
    { val: 'eksik-ilaç', label: 'Eksik İlaç' },
    { val: 'yazılımsal-hata', label: 'Yazılımsal Hata' },
    { val: 'öneri', label: 'Öneri' }
  ]

  const reportModal = reactive({
    topic: 'öneri',
    nurseName: '',
    message: '',
    drugQuery: '',
    drugResults: [],
    drugSelected: null,
    sending: false,
    sent: false
  })

  const reportError = ref('')
  const reportCooldown = ref(0)

  let _lastReportSend = 0
  let _reportCooldownTimer = null

  const reportPlaceholder = computed(() => {
    const map = {
      'eksik-ilaç': 'Eksik olduğunu düşündüğünüz ilacın adını ve bilgilerini yazın...',
      'yanlış-ilaç-bilgisi': 'Hatalı olan bilgiyi açıklayın...',
      'yazılımsal-hata': 'Karşılaştığınız hatayı ve nasıl oluştuğunu açıklayın...',
      'öneri': 'Önerinizi yazın...'
    }
    return map[reportModal.topic] || 'Mesajınızı yazın...'
  })

  function initReport() {
    _lastReportSend = Number(localStorage.getItem('lastReportSend')) || 0
  }

  function openReportModal(drug = null) {
    if (_reportCooldownTimer) { clearInterval(_reportCooldownTimer); _reportCooldownTimer = null }
    reportCooldown.value = 0
    reportModal.topic = drug ? 'yanlış-ilaç-bilgisi' : 'eksik-ilaç'
    reportModal.nurseName = ''
    reportModal.message = ''
    reportModal.drugQuery = ''
    reportModal.drugResults = []
    reportModal.drugSelected = drug ? { ...drug } : null
    reportModal.sending = false
    reportModal.sent = false
    reportError.value = ''
    reportOpen.value = true
  }

  function closeReportModal() {
    if (_reportCooldownTimer) { clearInterval(_reportCooldownTimer); _reportCooldownTimer = null }
    reportCooldown.value = 0
    reportOpen.value = false
  }

  async function sendReport() {
    if (reportCooldown.value > 0) return
    const now = Date.now()
    if (_lastReportSend && now - _lastReportSend < 60000) {
      const remain = Math.ceil((60000 - (now - _lastReportSend)) / 1000)
      reportModal.sent = false
      reportCooldown.value = remain
      reportError.value = ''
      if (_reportCooldownTimer) clearInterval(_reportCooldownTimer)
      _reportCooldownTimer = setInterval(() => {
        reportCooldown.value--
        if (reportCooldown.value <= 0) {
          reportCooldown.value = 0
          clearInterval(_reportCooldownTimer)
          _reportCooldownTimer = null
        }
      }, 1000)
      return
    }
    reportError.value = ''
    reportModal.sending = true
    try {
      const systemInfo = api() ? await api().getSystemInfo() : {}
      const body = {
        topic: reportModal.topic,
        nurseName: reportModal.nurseName.trim(),
        message: reportModal.message.trim(),
        systemInfo,
        drugInfo: reportModal.topic === 'yanlış-ilaç-bilgisi' && reportModal.drugSelected
          ? {
              label: reportModal.drugSelected.label,
              activeIngredient: reportModal.drugSelected.active_ingredient,
              form: reportModal.drugSelected.form
            }
          : null
      }
      const result = await api().sendReport(body)
      if (result.savedLocally) {
        _lastReportSend = Date.now()
        localStorage.setItem('lastReportSend', String(_lastReportSend))
        reportModal.sent = true
        reportModal.topic = 'eksik-ilaç'
        reportModal.nurseName = ''
        reportModal.message = ''
        reportModal.drugQuery = ''
        reportModal.drugResults = []
        reportModal.drugSelected = null
        reportError.value = ''
        reportModal.sending = false
        return
      }
      if (!result.success) throw new Error(result.error || 'Bilinmeyen hata')
      _lastReportSend = Date.now()
      localStorage.setItem('lastReportSend', String(_lastReportSend))
      reportModal.sent = true
      reportModal.topic = 'eksik-ilaç'
      reportModal.nurseName = ''
      reportModal.message = ''
      reportModal.drugQuery = ''
      reportModal.drugResults = []
      reportModal.drugSelected = null
    } catch (e) {
      reportError.value = 'Gönderilemedi: ' + e.message
    }
    reportModal.sending = false
  }

  function disposeReport() {
    if (_reportCooldownTimer) { clearInterval(_reportCooldownTimer); _reportCooldownTimer = null }
  }

  return {
    reportOpen,
    reportTopics,
    reportModal,
    reportError,
    reportCooldown,
    reportPlaceholder,
    sendReport,
    closeReportModal,
    openReportModal,
    initReport,
    disposeReport
  }
}
