import { sanitize, LARGE_LABEL } from './utils.js'

export function generateAcilisLabel(urun, dateStr, timeStr, nurse, note, labelSize) {
  const isLarge = labelSize === LARGE_LABEL
  const pw = isLarge ? '450' : '380'
  const ll = isLarge ? 250 : 170

  const urunLine = isLarge
    ? `^CFU^FO10,10^FD${sanitize(urun)}^FS`
    : `^CFT^FO25,10^FD${sanitize(urun)}^FS`

  const tarihLabelLine = isLarge
    ? `^CF0,30^FO10,90^FDAcilma Tarihi:^FS`
    : ''

  const dateLine = isLarge
    ? `^CF0,40^FO10,120^FD${sanitize(dateStr)}^FS`
    : `^CFS,28^FO25,60^FD${sanitize(dateStr)}^FS`

  const saatLabelLine = isLarge
    ? `^CF0,30^FO260,90^FDAcilma Saati:^FS`
    : ''

  const timeLine = isLarge
    ? `^CF0,40^FO260,120^FD${sanitize(timeStr)}^FS`
    : `^CFS,28^FO205,60^FD${sanitize(timeStr)}^FS`

  const nurseLine = isLarge
    ? `^CF0,20^FO10,160^FDHemsire: ${sanitize(nurse)}^FS`
    : `^CFS,20^FO25,100^FD${sanitize(nurse)}^FS`

  const noteLine = isLarge
    ? `^CF0,30^FO10,200^FD${sanitize(note)}^FS`
    : `^CFS,25^FO25,130^FD${sanitize(note)}^FS`

  const parts = [urunLine]
  if (tarihLabelLine) parts.push(tarihLabelLine)
  parts.push(dateLine)
  if (saatLabelLine) parts.push(saatLabelLine)
  parts.push(timeLine)
  parts.push(nurseLine)
  parts.push(noteLine)

  return `^XA\n^PW${pw}\n^LL${ll}\n^LH0,0\n^LS0\n^LT0\n${parts.join('\n')}\n^XZ`
}

export function generateSetTarihLabel(dateStr, timeStr, labelSize) {
  const isLarge = labelSize === LARGE_LABEL
  const pw = isLarge ? '450' : '380'
  const ll = isLarge ? 230 : 160

  const titleLine = isLarge
    ? `^CF0,40^FO0,20^FDSet Tarihi:^FS`
    : `^CFT^FO25,10^FDSet Tarihi:^FS`

  const dateLine = isLarge
    ? `^CF0,50^FO0,80^FD${sanitize(dateStr)}^FS`
    : `^CFT^FO25,60^FD${sanitize(dateStr)}^FS`

  const timeLine = isLarge
    ? `^CF0,40^FO0,140^FD${sanitize(timeStr)}^FS`
    : `^CFT^FO25,110^FD${sanitize(timeStr)}^FS`

  return `^XA\n^PW${pw}\n^LL${ll}\n^LH0,0\n^LS0\n^LT0\n${titleLine}\n${dateLine}\n${timeLine}\n^XZ`
}
