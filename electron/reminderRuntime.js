const crypto = require('crypto')
const path = require('path')
const { execFile } = require('child_process')

const TASK_NAME = 'Tedavi Yonetimi Hatirlatici'

function reminderTimestamp(reminder) {
  return new Date(String(reminder?.datetime || '')).getTime()
}

function normalizeReminders(reminders, idFactory = () => crypto.randomUUID()) {
  if (!Array.isArray(reminders)) return []
  return reminders
    .map((reminder) => ({
      id: String(reminder?.id || idFactory()),
      datetime: String(reminder?.datetime || ''),
      text: String(reminder?.text || '').trim(),
      deliveredAt: Number.isFinite(new Date(String(reminder?.deliveredAt || '')).getTime())
        ? String(reminder.deliveredAt)
        : null
    }))
    .filter((reminder) => reminder.text && Number.isFinite(reminderTimestamp(reminder)))
    .sort((a, b) => reminderTimestamp(a) - reminderTimestamp(b))
}

function findOldestDueReminder(reminders, now = new Date()) {
  const nowTime = now.getTime()
  return normalizeReminders(reminders, () => '')
    .find((reminder) => !reminder.deliveredAt && reminderTimestamp(reminder) <= nowTime) || null
}

function findNextFutureReminder(reminders, now = new Date()) {
  const nowTime = now.getTime()
  return normalizeReminders(reminders, () => '')
    .find((reminder) => !reminder.deliveredAt && reminderTimestamp(reminder) > nowTime) || null
}

function markReminderDelivered(reminders, reminderId, deliveredAt = new Date()) {
  const id = String(reminderId || '')
  const timestamp = deliveredAt instanceof Date ? deliveredAt.toISOString() : String(deliveredAt || '')
  return normalizeReminders(reminders).map((reminder) => (
    reminder.id === id ? { ...reminder, deliveredAt: timestamp } : reminder
  ))
}

function powershellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function encodedPowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function runPowerShell(script, runner = execFile) {
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return new Promise((resolve, reject) => {
    runner(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedPowerShell(script)], {
      windowsHide: true,
      timeout: 15000
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}${stderr ? `: ${String(stderr).trim()}` : ''}`
        reject(error)
        return
      }
      resolve(String(stdout || '').trim())
    })
  })
}

function createWindowsTaskScheduler({
  enabled = process.platform === 'win32',
  executablePath = process.execPath,
  runner = execFile,
  logger = console
} = {}) {
  let scheduledKey

  async function unregister() {
    if (!enabled) return false
    const script = `Unregister-ScheduledTask -TaskName ${powershellLiteral(TASK_NAME)} -Confirm:$false -ErrorAction SilentlyContinue`
    await runPowerShell(script, runner)
    scheduledKey = null
    return true
  }

  async function sync(reminders, now = new Date()) {
    if (!enabled) return null
    const next = findNextFutureReminder(reminders, now)
    if (!next) {
      if (scheduledKey !== null) {
        try {
          await unregister()
        } catch (error) {
          logger.warn?.('Eski Windows hatırlatma görevi kaldırılamadı', error)
        }
      }
      return null
    }

    const nextTime = new Date(next.datetime)
    const key = `${next.id}:${nextTime.toISOString()}:${executablePath}`
    if (key === scheduledKey) return next

    const script = [
      `$action = New-ScheduledTaskAction -Execute ${powershellLiteral(executablePath)} -Argument ${powershellLiteral('--background-reminder')}`,
      `$trigger = New-ScheduledTaskTrigger -Once -At ([DateTimeOffset]::Parse(${powershellLiteral(nextTime.toISOString())})).LocalDateTime`,
      '$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew',
      `Register-ScheduledTask -TaskName ${powershellLiteral(TASK_NAME)} -Action $action -Trigger $trigger -Settings $settings -Description ${powershellLiteral('Hemşire Tedavi Yönetimi en yakın hatırlatmasını çalıştırır.')} -Force | Out-Null`
    ].join('; ')

    try {
      await runPowerShell(script, runner)
      scheduledKey = key
      return next
    } catch (error) {
      logger.warn?.('Windows hatırlatma görevi oluşturulamadı', error)
      return null
    }
  }

  return { sync, unregister }
}

module.exports = {
  TASK_NAME,
  createWindowsTaskScheduler,
  findNextFutureReminder,
  findOldestDueReminder,
  markReminderDelivered,
  normalizeReminders,
  reminderTimestamp
}
