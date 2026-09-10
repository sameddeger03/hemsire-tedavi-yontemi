function normalize(value) {
  const replacements = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, char => replacements[char])
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findColumn(headers, aliases) {
  return headers.findIndex(header => aliases.includes(normalize(header)))
}

function parseBirthDate(value) {
  const match = String(value || '').trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (!match) return ''

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseGender(value) {
  const normalized = normalize(value)
  if (normalized === 'kadin') return 'Kadın'
  if (normalized === 'erkek') return 'Erkek'
  return ''
}

function parsePatients(clipboardText) {
  const lines = String(clipboardText || '').split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length < 2) return { error: 'Geçersiz pano: Hasta bilgisi bulunamadı.', patients: [] }

  const headers = lines[0].split('\t')
  const columns = {
    name: findColumn(headers, ['hasta adi']),
    patientNo: findColumn(headers, ['hasta no', 'hasta numarasi']),
    gender: findColumn(headers, ['cinsiyet']),
    birthDate: findColumn(headers, ['dogum tarihi'])
  }

  if (Object.values(columns).every(index => index === -1)) {
    return { error: 'Geçersiz pano: Hasta bilgisi bulunamadı.', patients: [] }
  }

  const patients = []
  for (const line of lines.slice(1)) {
    const cells = line.split('\t')
    const patient = {}
    const name = columns.name >= 0 ? (cells[columns.name] || '').trim() : ''
    const patientNo = columns.patientNo >= 0 ? (cells[columns.patientNo] || '').trim() : ''
    const gender = columns.gender >= 0 ? parseGender(cells[columns.gender]) : ''
    const birthDate = columns.birthDate >= 0 ? parseBirthDate(cells[columns.birthDate]) : ''

    if (name) patient.name = name
    if (patientNo) patient.patientNo = patientNo
    if (gender) patient.gender = gender
    if (birthDate) patient.birthDate = birthDate
    if (Object.keys(patient).length) patients.push(patient)
  }

  if (!patients.length) return { error: 'Geçersiz pano: Hasta bilgisi bulunamadı.', patients: [] }
  return { error: null, patients }
}

module.exports = { parsePatients }
