import { sanitize, LARGE_LABEL } from './utils.js'

export function generateYatisLabel(line1, line2, labelSize) {
  const isLarge = labelSize === LARGE_LABEL
  const pw = isLarge ? '450' : '380'
  const ll = isLarge ? 200 : 130

  const line1Zpl = isLarge
    ? `^CF0,80^FO10,20^FD${sanitize(line1)}^FS`
    : `^CFV^FO20,30^FD${sanitize(line1)}^FS`

  const line2Zpl = isLarge
    ? `^CF0,70^FO10,110^FD${sanitize(line2)}^FS`
    : `^CFV^FO20,90^FD${sanitize(line2)}^FS`

  return `^XA\n^PW${pw}\n^LL${ll}\n^LH0,0\n^LS0\n^LT0\n${line1Zpl}\n${line2Zpl}\n^XZ`
}

export function generateYatisCustomLabel(text, labelSize) {
  const isLarge = labelSize === LARGE_LABEL
  const pw = isLarge ? '450' : '380'
  const ll = isLarge ? 200 : 130

  const textZpl = isLarge
    ? `^CF0,80^FO10,20^FD${sanitize(text)}^FS`
    : `^CFV^FO20,30^FD${sanitize(text)}^FS`

  return `^XA\n^PW${pw}\n^LL${ll}\n^LH0,0\n^LS0\n^LT0\n${textZpl}\n^XZ`
}
