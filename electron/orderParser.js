const { formatDose, parseDose } = require('../shared/doseUnits')

function normalize(value) {
  const replacements = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, char => replacements[char])
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchHeader(header, aliases) {
  const normalizedHeader = normalize(header)
  return aliases.some(alias => normalizedHeader.includes(normalize(alias)))
}

function parseTime(value) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function generateStandardTimes(count) {
  if (count === 1) return '10:00'
  if (count === 2) return '10:00, 22:00'
  if (count < 1) return ''

  const interval = 24 / count
  const times = []
  for (let i = 0; i < count; i++) {
    const totalMinutes = Math.round((6 + i * interval) * 60)
    const hour = Math.floor(totalMinutes / 60) % 24
    const minute = totalMinutes % 60
    times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)
  }
  return times.join(', ')
}

function parseOrders(clipboardText) {
  const lines = String(clipboardText || '').split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length < 2) return { error: 'En az 2 satır gerekli (başlık + veri)', orders: [] }

  const headers = lines[0].split('\t')
  const columns = {
    name: -1,
    dose: -1,
    doseUnit: -1,
    route: -1,
    times: -1,
    note: -1,
    orderType: -1
  }

  headers.forEach((header, index) => {
    const normalizedHeader = normalize(header)
    if (columns.name === -1 && matchHeader(header, ['hizmet adı'])) columns.name = index
    if (columns.dose === -1 && matchHeader(header, ['o. dozu'])) columns.dose = index
    if (columns.doseUnit === -1 && matchHeader(header, ['doz birimi'])) columns.doseUnit = index
    if (columns.route === -1 && matchHeader(header, ['kul. şek.', 'kullanım şekli'])) columns.route = index
    if (columns.times === -1 && matchHeader(header, ['order saatleri', 'saatler'])) columns.times = index
    if (columns.note === -1 && matchHeader(header, ['açıklama', 'order metni'])) columns.note = index
    if (columns.orderType === -1 && normalizedHeader.includes('order tipi')) columns.orderType = index
  })

  if (columns.name === -1) {
    return { error: 'İlaç adı sütunu bulunamadı (Hizmet Adı)', orders: [] }
  }

  const orders = []
  for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
    const cells = lines[rowIndex].split('\t')
    while (cells.length < headers.length) cells.push('')

    const name = (cells[columns.name] || '').trim()
    if (!name || normalize(name) === 'hizmet adi') continue

    const orderType = columns.orderType >= 0 ? normalize(cells[columns.orderType]) : ''
    if (orderType === 'hizmet') continue

    const rawTimes = columns.times >= 0 ? (cells[columns.times] || '') : ''
    const parsedTimes = (rawTimes.match(/\d{1,2}:\d{2}/g) || [])
      .map(parseTime)
      .filter(Boolean)
      .filter((time, index, allTimes) => allTimes.indexOf(time) === index)
    const times = parsedTimes.length ? generateStandardTimes(parsedTimes.length) : '10:00'

    let rawDose = columns.dose >= 0 ? (cells[columns.dose] || '') : ''
    rawDose = rawDose.replace(/^[\d.,]+\s*X\s*/i, '').trim()
    const rawDoseUnit = columns.doseUnit >= 0 ? (cells[columns.doseUnit] || '').trim() : ''
    const parsedDose = parseDose(rawDose, normalize(rawDoseUnit) === 'bilinmiyor' ? '' : rawDoseUnit, 'adet')
    const doseValue = parsedDose.value == null || parsedDose.value <= 0 ? 1 : parsedDose.value
    const doseUnit = parsedDose.unit || 'adet'
    const dose = formatDose(doseValue, doseUnit)

    const rawRoute = columns.route >= 0 ? (cells[columns.route] || '').trim() : ''
    const routeMap = {
      'iv intravenoz': 'IV',
      iv: 'IV',
      'im intramuskuler': 'IM',
      im: 'IM',
      'po agizdan': 'PO',
      po: 'PO',
      'sc subkutan': 'SC',
      subkutan: 'SC',
      sc: 'SC',
      'inh inhalasyon': 'INH',
      inhalasyon: 'INH',
      inh: 'INH',
      topikal: 'TOP'
    }
    const route = routeMap[normalize(rawRoute)] || rawRoute.replace(/\(.*?\)/g, '').trim() || 'DGR'

    let note = columns.note >= 0 ? (cells[columns.note] || '') : ''
    note = note.replace(/[\u0000-\u001F]/g, ' ').trim()

    orders.push({
      name,
      dose,
      doseValue,
      doseUnit,
      route,
      times,
      note,
      startDate: ''
    })
  }

  return { error: null, orders }
}

module.exports = { parseOrders }
