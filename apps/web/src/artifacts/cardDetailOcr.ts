import { findTextBands } from './ocrTextBands'
import type { DetailOcrImage } from './artifactOcrImage'

export function findCardBodyPixels(pixels: Uint8ClampedArray, width: number, height: number): number | null {
  const column = Math.floor(width * .6), from = Math.floor(width * .04)
  let lightRows = 0
  for (let y = 0; y < height; y++) {
    let light = 0
    for (let x = from; x < column; x++) {
      const i = (y * width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
      // Cream card background is warm; a long pale text row on the blue
      // equipment panel must not be mistaken for the start of a card body.
      if (Math.min(r, g, b) > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 55 && r >= g && g >= b && r - b > 5) light++
    }
    if (light / (column - from) > .7) { if (++lightRows >= 8) { const body = y - 7; return body >= height * .2 && body <= height * .8 ? body : null } } else lightRows = 0
  }
  return null
}

// Inventory cards use a colored header, a left-aligned main value and dark
// substats on cream. Their row order differs from the blue equipment panel.
export async function prepareCardDetailImages(image: HTMLImageElement | HTMLCanvasElement, width: number, height: number): Promise<DetailOcrImage[] | null> {
  const source = document.createElement('canvas'); source.width = width; source.height = height
  const context = source.getContext('2d', { willReadFrequently: true })
  if (!context) throw Error('无法分析详情卡片。')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, width, height).data
  const column = Math.floor(width * .6), body = findCardBodyPixels(pixels, width, height)
  if (body === null) return null
  // The general locator extends to the screen edge. A card can end earlier:
  // locate that cream-background edge before its icon/neighbor pollutes rows.
  let gap = 0
  for (let x = column; x < width; x++) {
    let light = 0
    for (let y = body; y < Math.min(height, body + 8); y++) {
      const i = (y * width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
      if (Math.min(r, g, b) > 175 && Math.max(r, g, b) - Math.min(r, g, b) < 55) light++
    }
    if (light < 4) gap++; else gap = 0
    if (gap === 8 && x - 7 < width * .98) return prepareCardDetailImages(source, x - 7, height)
  }
  const header = new Uint8ClampedArray(pixels.length).fill(255), text = new Uint8ClampedArray(pixels.length).fill(255), green = new Uint8ClampedArray(pixels.length).fill(255)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], low = Math.min(r, g, b), high = Math.max(r, g, b)
    if (y < body && low > 110 && high - low < 65) header[i] = 0
    if (y >= body && high < 165 && high - low < 65) text[i] = 0
    if (y >= body && g > 150 && g > r * 1.15 && g > b * 1.1) green[i] = 0
  }
  const head = findTextBands(header, width, height), sets = findTextBands(green, width, height)
  const set = sets[0]
  const rows = findTextBands(text, width, height).filter(row => !set || row.y + row.height < set.y)
  // Fail closed on incomplete layouts instead of assigning an arbitrary row to
  // +level or fabricating missing fields. The caller's existing path can report it.
  if (head.length !== 4 || !set || rows.length < 4 || rows.length > 5) return null
  const lines = [
    ...head.slice(0, 2).map(row => ({ ...row, id: 'title' as const, numeric: false, join: false, width: width * .96 })),
    { ...head[2], id: 'stats' as const, numeric: false, join: false, width: width * .35 },
    { ...head[3], id: 'stats' as const, numeric: true, join: true, width: width * .6 },
    ...rows.map((row, index) => ({ ...row, id: 'stats' as const, numeric: index === 0, join: false, width: width * (index === 0 ? .35 : .85) })),
    { ...set, id: 'set' as const, numeric: false, join: false, width: width * .96 },
  ]
  const result: DetailOcrImage[] = []
  const inkCanvas = (mask: Uint8ClampedArray) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const ctx = canvas.getContext('2d')!; const data = ctx.createImageData(width, height)
    for (let i = 0; i < mask.length; i += 4) { const ink = mask[i] < 128 ? 0 : 255; data.data[i] = ink; data.data[i + 1] = ink; data.data[i + 2] = ink; data.data[i + 3] = 255 }
    ctx.putImageData(data, 0, 0); return canvas
  }
  const headerImage = inkCanvas(header), setImage = inkCanvas(green)
  for (const line of lines) {
    let x = line.y >= body ? Math.round(width * .025) : 0, lineWidth = line.width - x
    const level = line.numeric && !line.join
    if (level) {
      let left = column, right = 0
      for (let y = line.y; y < line.y + line.height; y++) for (let col = 0; col < lineWidth; col++) if (text[(y * width + col) * 4] < 128) { left = Math.min(left, col); right = Math.max(right, col) }
      if (right > left) { x = Math.max(0, left - 4); lineWidth = Math.min(width - x, right - x + 5) }
    }
    const scale = Math.min(2.5, Math.max(1, 1000 / lineWidth)), pad = 12
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(lineWidth * scale) + pad * 2; canvas.height = Math.ceil(line.height * scale) + pad * 2
    const ctx = canvas.getContext('2d'); if (!ctx) throw Error('无法准备详情卡片文字。')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    const ink = level || (line.id === 'stats' && line.y >= body) ? source : line.id === 'set' ? setImage : headerImage
    ctx.drawImage(ink, x, line.y, lineWidth, line.height, pad, pad, lineWidth * scale, line.height * scale)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error('无法编码详情卡片。')), 'image/png'))
    result.push({ id: line.id, numeric: line.numeric, join: line.join, image: blob, width: canvas.width, height: canvas.height })
  }
  return result
}
