export function buildSmallTreatmentLabelName(name) {
  return String(name || '').trim().substring(0, 10)
}

export function buildTreatmentLabelDetailField(value, isLarge, isEnabled = true) {
  if (!isEnabled) return ''
  const text = String(value || '')
    .replace(/[\^~\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 20)
  if (!text) return ''
  return isLarge
    ? `^ADN,18,10^FO0,215^FB450,1,0,L,0^FD${text}^FS`
    : `^ADN,18,9^FO0,121^FB190,1,0,L,0^FD${text}^FS`
}
