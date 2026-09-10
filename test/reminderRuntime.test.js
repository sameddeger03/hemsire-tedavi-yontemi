const {
  createWindowsTaskScheduler,
  findNextFutureReminder,
  findOldestDueReminder,
  markReminderDelivered,
  normalizeReminders
} = require('../electron/reminderRuntime')

describe('Electron reminder runtime', () => {
  const now = new Date(2026, 7, 6, 10, 0, 0)

  test('normalizes legacy reminders with stable ids and chronological order', () => {
    let id = 0
    const reminders = normalizeReminders([
      { datetime: '2026-08-06T12:00', text: ' İkinci ' },
      { id: 'known', datetime: '2026-08-06T11:00', text: 'Birinci' },
      { datetime: 'invalid', text: 'Geçersiz' }
    ], () => `generated-${++id}`)

    expect(reminders).toEqual([
      { id: 'known', datetime: '2026-08-06T11:00', text: 'Birinci', deliveredAt: null },
      { id: 'generated-1', datetime: '2026-08-06T12:00', text: 'İkinci', deliveredAt: null }
    ])
  })

  test('finds overdue and future reminders on opposite sides of now', () => {
    const reminders = [
      { id: 'past', datetime: '2026-08-06T09:00', text: 'Geçmiş' },
      { id: 'future', datetime: '2026-08-06T10:30', text: 'Gelecek' }
    ]

    expect(findOldestDueReminder(reminders, now)?.id).toBe('past')
    expect(findNextFutureReminder(reminders, now)?.id).toBe('future')
  })

  test('keeps delivered reminders in history but never selects them again', () => {
    const reminders = [
      { id: 'delivered-past', datetime: '2026-08-06T09:00', text: 'Tamamlandı', deliveredAt: '2026-08-06T09:01:00+03:00' },
      { id: 'pending-past', datetime: '2026-08-06T09:30', text: 'Bekliyor' },
      { id: 'delivered-future', datetime: '2026-08-06T10:15', text: 'İptal edilmeyecek kayıt', deliveredAt: '2026-08-06T09:45:00+03:00' },
      { id: 'pending-future', datetime: '2026-08-06T10:30', text: 'Sıradaki' }
    ]

    expect(normalizeReminders(reminders)).toHaveLength(4)
    expect(findOldestDueReminder(reminders, now)?.id).toBe('pending-past')
    expect(findNextFutureReminder(reminders, now)?.id).toBe('pending-future')
  })

  test('acknowledging a reminder marks it delivered without deleting it', () => {
    const reminders = [
      { id: 'keep', datetime: '2026-08-06T09:00', text: 'Hatırlatma' },
      { id: 'other', datetime: '2026-08-06T11:00', text: 'Diğer' }
    ]

    const saved = markReminderDelivered(reminders, 'keep', new Date('2026-08-06T10:01:00+03:00'))

    expect(saved).toHaveLength(2)
    expect(saved.find(reminder => reminder.id === 'keep').deliveredAt).toBe('2026-08-06T07:01:00.000Z')
    expect(saved.find(reminder => reminder.id === 'other').deliveredAt).toBeNull()
  })

  test('registers only the nearest future reminder as a one-shot Windows task', async () => {
    const calls = []
    const runner = (file, args, options, callback) => {
      calls.push({ file, args, options })
      callback(null, '', '')
    }
    const scheduler = createWindowsTaskScheduler({
      enabled: true,
      executablePath: 'C:\\Program Files\\Hemşire Tedavi Yönetimi\\Hemşire Tedavi Yönetimi.exe',
      runner
    })

    const next = await scheduler.sync([
      { id: 'later', datetime: '2026-08-06T12:00', text: 'Sonra' },
      { id: 'nearest', datetime: '2026-08-06T10:30', text: 'Önce' }
    ], now)

    expect(next.id).toBe('nearest')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toContain('-EncodedCommand')
    const encoded = calls[0].args[calls[0].args.length - 1]
    const script = Buffer.from(encoded, 'base64').toString('utf16le')
    expect(script).toContain('New-ScheduledTaskTrigger -Once')
    expect(script).toContain('--background-reminder')
    expect(script).toContain('StartWhenAvailable')
    expect(script).not.toContain('WakeToRun')
  })

  test('does not duplicate the same registered task', async () => {
    const runner = jest.fn((file, args, options, callback) => callback(null, '', ''))
    const scheduler = createWindowsTaskScheduler({ enabled: true, executablePath: 'app.exe', runner })
    const reminders = [{ id: 'one', datetime: '2026-08-06T10:30', text: 'Test' }]

    await scheduler.sync(reminders, now)
    await scheduler.sync(reminders, now)

    expect(runner).toHaveBeenCalledTimes(1)
  })

  test('removes a stale Windows task when there is no future reminder', async () => {
    const runner = jest.fn((file, args, options, callback) => callback(null, '', ''))
    const scheduler = createWindowsTaskScheduler({ enabled: true, executablePath: 'app.exe', runner })

    await scheduler.sync([], now)

    expect(runner).toHaveBeenCalledTimes(1)
    const encoded = runner.mock.calls[0][1].at(-1)
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toContain('Unregister-ScheduledTask')
  })

  test('does not leak an unhandled rejection when task cleanup is unavailable', async () => {
    const logger = { warn: jest.fn() }
    const runner = (file, args, options, callback) => callback(new Error('access denied'), '', '')
    const scheduler = createWindowsTaskScheduler({ enabled: true, executablePath: 'app.exe', runner, logger })

    await expect(scheduler.sync([], now)).resolves.toBeNull()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})
