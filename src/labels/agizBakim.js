import { sanitize, LARGE_LABEL } from './utils.js'

export function generateAgizBakimLabel(dateStr, labelSize) {
  const isLarge = labelSize === LARGE_LABEL
  const pw = isLarge ? '450' : '380'
  const ll = isLarge ? 200 : 130

  const line1 = isLarge
    ? `^CF0,50^FO0,15^FDSodyum Bikarbonatli^FS`
    : `^CFS,25^FO25,10^FDSodyum Bikarbonatli^FS`

  const line2 = isLarge
    ? `^CF0,50^FO0,75^FDAgiz Bakim Suyu^FS`
    : `^CFT^FO25,55^FDAgiz Bakim Suyu^FS`

  const dateLine = isLarge
    ? `^CF0,50^FO0,135^FD${sanitize(dateStr)}^FS`
    : `^CFS^FO25,110^FD${sanitize(dateStr)}^FS`

  return `^XA\n^PW${pw}\n^LL${ll}\n^LH0,0\n^LS0\n^LT0\n${line1}\n${line2}\n${dateLine}\n^XZ`
}
