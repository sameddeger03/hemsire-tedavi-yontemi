export function sanitize(s) {
  const map = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' }
  return s.replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => map[ch])
}

export const LARGE_LABEL = 'buyuk'
export const SMALL_LABEL = 'kucuk'
