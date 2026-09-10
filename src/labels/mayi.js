import { sanitize, LARGE_LABEL } from './utils.js'

export function generateMayiLabel(fluid, contents, patientName, dateStr, timeStr, labelSize) {
  const isLarge = labelSize === LARGE_LABEL
  const pw = isLarge ? '450' : '380'
  const topFont = isLarge ? 60 : 40
  const midFont = isLarge ? 40 : 28
  const botFont = isLarge ? 24 : 18
  const topY = 10
  const midY = topY + (isLarge ? 60 : 44)
  const midRowH = isLarge ? 38 : 28
  const nonEmpty = (contents || []).filter(Boolean)
  const botY = midY + nonEmpty.length * midRowH + (isLarge ? 20 : 14)
  const ll = botY + (isLarge ? 40 : 30)
  const dateXO = isLarge ? 280 : 240

  let zpl = `^XA\n^PW${pw}\n^LL${ll}\n^LH0,0\n^LS0\n^LT0\n`
  zpl += `^CF0,${topFont}^FO0,${topY}^FD${sanitize(fluid)}^FS\n`
  nonEmpty.forEach((line, i) => {
    zpl += `^CF0,${midFont}^FO0,${midY + i * midRowH}^FD${sanitize(line)}^FS\n`
  })
  zpl += `^CF0,${botFont}^FO0,${botY}^FD${sanitize(patientName)}^FS\n`
  zpl += `^CF0,${botFont}^FO${dateXO},${botY}^FD${sanitize(dateStr + ' ' + timeStr)}^FS\n`
  zpl += `^XZ`

  return zpl
}
