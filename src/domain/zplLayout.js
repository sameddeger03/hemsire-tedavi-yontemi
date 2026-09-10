export function normalizeLabelOffset(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(-100, Math.min(100, Math.round(number))) : fallback
}

export function buildLabelHome(isLarge, smallX = 45, smallY = 15, largeX = 0, largeY = 0, smallXOffset = 0, smallYOffset = 0) {
  const x = isLarge
    ? normalizeLabelOffset(largeX, 0)
    : normalizeLabelOffset(normalizeLabelOffset(smallX, 45) + smallXOffset, 45)
  const y = isLarge
    ? normalizeLabelOffset(largeY, 0)
    : normalizeLabelOffset(normalizeLabelOffset(smallY, 15) + smallYOffset, 15)
  return `^LH${x},${y}`
}

export function buildMultilineZplFields(text, options = {}) {
  const { maxLines = 4, x = 10, y = 10, lineHeight = 48, font = '^CF0,48' } = options

  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .slice(0, maxLines)
    .map((line, index) => {
      const value = line.trim()
      return value ? `${font}^FO${x},${y + (index * lineHeight)}^FD${value}^FS` : ''
    })
    .filter(Boolean)
    .join('\n')
}
