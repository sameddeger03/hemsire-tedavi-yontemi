import { sanitize, LARGE_LABEL } from './utils.js'

export function generateOzelLabel(textLines, labelSize) {
  const lines = textLines.filter(Boolean)
  const isLarge = labelSize === LARGE_LABEL
  const pw = isLarge ? '450' : '380'
  const topFont = isLarge ? 50 : 36
  const rowH = isLarge ? 48 : 34
  const ll = isLarge ? 60 + lines.length * rowH : 40 + lines.length * rowH

  let zpl = `^XA\n^PW${pw}\n^LL${ll}\n^LH0,0\n^LS0\n^LT0\n`
  lines.forEach((line, i) => {
    zpl += `^CF0,${topFont}^FO0,${10 + i * rowH}^FD${sanitize(line)}^FS\n`
  })
  zpl += `^XZ`

  return zpl
}
