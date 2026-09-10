import { sanitize, LARGE_LABEL } from './utils.js'

export function generateEnjektorLabel(label, dateStr, timeStr, labelSize) {
  const isLarge = labelSize === LARGE_LABEL
  const pw = isLarge ? '450' : '380'
  const ll = isLarge ? 250 : 150

  const labelLine = isLarge
    ? `^CFU^FO10,40^FD${sanitize(label)}^FS`
    : `^CFT^FO25,10^FD${sanitize(label)}^FS`

  const enjLine = isLarge
    ? `^CFU^FO10,100^FDEnjektörü^FS`
    : `^CFT^FO25,55^FDEnjektörü^FS`

  const timeLine = isLarge
    ? `^CFE^FO340,210^FD${sanitize(timeStr)}^FS`
    : `^CFS^FO205,115^FD${sanitize(timeStr)}^FS`

  const dateLine = isLarge
    ? `^CFE^FO100,210^FD${sanitize(dateStr)}^FS`
    : `^CFS^FO25,115^FD${sanitize(dateStr)}^FS`

  return `^XA\n^PW${pw}\n^LL${ll}\n^LH0,0\n^LS0\n^LT0\n${labelLine}\n${enjLine}\n${timeLine}\n${dateLine}\n^XZ`
}
