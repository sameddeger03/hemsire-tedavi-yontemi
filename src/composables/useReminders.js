import { ref, reactive } from 'vue'

const api = () => window.electronAPI

export function useReminders() {
  const reminders = ref(JSON.parse(localStorage.getItem('reminders') || '[]'))
  const reminderModal = reactive({ open: false })
  const reminderDatetime = ref('')
  const reminderText = ref('')
  const activeReminder = ref(null)
  let _alarm = null

  function openReminderModal() {
    reminderDatetime.value = ''
    reminderText.value = ''
    reminderModal.open = true
  }

  function saveReminder() {
    const dt = reminderDatetime.value
    const txt = reminderText.value.trim()
    if (!dt || !txt) return
    reminders.value.push({ datetime: dt, text: txt })
    localStorage.setItem('reminders', JSON.stringify(reminders.value))
    reminderDatetime.value = ''
    reminderText.value = ''
  }

  function removeReminder(idx) {
    reminders.value.splice(idx, 1)
    localStorage.setItem('reminders', JSON.stringify(reminders.value))
  }

  function checkReminders() {
    if (!reminders.value.length || activeReminder.value) return
    const now = new Date()
    const y = now.getFullYear()
    const mo = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const mi = String(now.getMinutes()).padStart(2, '0')
    const cur = `${y}-${mo}-${d}T${h}:${mi}`
    const matchIdx = reminders.value.findIndex(r => r.datetime === cur)
    if (matchIdx > -1) {
      const match = reminders.value[matchIdx]
      reminders.value.splice(matchIdx, 1)
      localStorage.setItem('reminders', JSON.stringify(reminders.value))
      activeReminder.value = { text: match.text, datetime: match.datetime }
      beep()
      if (api()) {
        api().showNotification('Tedavi Hatırlatıcı', match.text)
        api().focusWindow()
      }
    }
  }

  function dismissReminder() {
    activeReminder.value = null
    if (_alarm) {
      _alarm.pause()
      _alarm = null
    }
  }

  function beep() {
    try {
      _alarm = new Audio('/alarm.wav')
      _alarm.loop = true
      _alarm.volume = 0.7
      _alarm.play()
    } catch (_) {}
  }

  function formatReminderDate(iso) {
    if (!iso) return ''
    const [date, time] = iso.split('T')
    const [y, m, d] = date.split('-')
    return `${m}/${d}/${y} ${time}`
  }

  return {
    reminders,
    reminderModal,
    reminderDatetime,
    reminderText,
    activeReminder,
    openReminderModal,
    saveReminder,
    removeReminder,
    checkReminders,
    dismissReminder,
    beep,
    formatReminderDate
  }
}
