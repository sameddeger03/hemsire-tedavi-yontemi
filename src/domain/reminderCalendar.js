export function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildCalendarMonth(year, month, today = new Date()) {
  const firstDay = new Date(year, month, 1)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - mondayOffset)
  const todayKey = localDateKey(today)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    const dateKey = localDateKey(date)
    return {
      dateKey,
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month,
      isToday: dateKey === todayKey
    }
  })
}

export function combineReminderDateTime(dateKey, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return ''
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return ''
  return `${dateKey}T${time}`
}

export function findDueReminderIndex(reminders, now = new Date()) {
  const nowTime = now.getTime()
  let dueIndex = -1
  let dueTime = Number.POSITIVE_INFINITY

  reminders.forEach((reminder, index) => {
    const reminderTime = new Date(reminder?.datetime || '').getTime()
    if (Number.isNaN(reminderTime) || reminderTime > nowTime || reminderTime >= dueTime) return
    dueIndex = index
    dueTime = reminderTime
  })

  return dueIndex
}
