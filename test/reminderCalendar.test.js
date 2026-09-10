const fs = require('fs')
const path = require('path')
const Module = require('module')
const { transformSync } = require('esbuild')

function loadViteModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const compiled = transformSync(source, { format: 'cjs', loader: 'js' }).code
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(compiled, filename)
  return loaded.exports
}

const { buildCalendarMonth, combineReminderDateTime, findDueReminderIndex, localDateKey } = loadViteModule('../src/domain/reminderCalendar.js')

describe('reminder calendar', () => {
  test('builds a Monday-first six-week calendar', () => {
    const days = buildCalendarMonth(2026, 7, new Date(2026, 7, 6, 12))

    expect(days).toHaveLength(42)
    expect(days[0]).toMatchObject({ dateKey: '2026-07-27', inCurrentMonth: false })
    expect(days.find(day => day.dateKey === '2026-08-06')).toMatchObject({ day: 6, isToday: true })
  })

  test('uses local date parts without UTC date shifts', () => {
    expect(localDateKey(new Date(2026, 7, 6, 1, 30))).toBe('2026-08-06')
  })

  test('combines a selected calendar day with the required time', () => {
    expect(combineReminderDateTime('2026-08-08', '14:30')).toBe('2026-08-08T14:30')
    expect(combineReminderDateTime('2026-08-08', '')).toBe('')
  })

  test('returns the oldest due reminder and catches reminders missed while app was closed', () => {
    const reminders = [
      { datetime: '2026-08-06T10:15', text: 'İkinci' },
      { datetime: '2026-08-06T09:00', text: 'Birinci' },
      { datetime: '2026-08-06T11:00', text: 'Gelecek' }
    ]

    expect(findDueReminderIndex(reminders, new Date(2026, 7, 6, 10, 30))).toBe(1)
  })
})
