import { findTextBands } from './ocrTextBands'
import { findCardBodyPixels } from './cardDetailOcr'
export type ArtifactField = 'name' | 'slot' | 'mainName' | 'mainValue' | 'level' | 'sub0' | 'sub1' | 'sub2' | 'sub3' | 'set'
export type ArtifactFieldBox = { field: ArtifactField; x: number; y: number; width: number; height: number }
export type ArtifactFieldLayout = { layoutId: 'inventory-card' | 'equipment-panel'; width: number; height: number; fields: ArtifactFieldBox[] }

export function findArtifactFieldLayoutPixels(pixels: Uint8ClampedArray, width: number, height: number): ArtifactFieldLayout | null {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 160 || height < 200 || width > 4096 || height > 4096 || width * height > 8388608 || pixels.length !== width * height * 4) return null
  const body = findCardBodyPixels(pixels, width, height)
  const header = new Uint8ClampedArray(pixels.length).fill(255), text = new Uint8ClampedArray(pixels.length).fill(255), green = new Uint8ClampedArray(pixels.length).fill(255)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], low = Math.min(r, g, b), high = Math.max(r, g, b)
    if ((body === null || y < body) && low > (body === null ? 180 : 110) && high - low < 65) header[i] = 0
    if (body !== null && y >= body && high < 165 && high - low < 65) text[i] = 0
    if (g > 170 && g > r * 1.15 && g > b * 1.1) green[i] = 0
  }
  const set = findTextBands(green, width, height)[0]
  if (!set) return null
  const head = findTextBands(header, width, height, .28).filter(row => row.y + row.height < set.y)
  const rows = body === null ? head : findTextBands(text, width, height, .28).filter(row => row.y + row.height < set.y)
  if (body === null ? rows.length < 7 || rows.length > 8 : head.length < 4 || head.length > 5 || rows.length < 4 || rows.length > 6) return null
  const fields: ArtifactFieldBox[] = []
  const add = (field: ArtifactField, row: { y: number; height: number }, x = 0, span = width, pad = 0) => {
    const y = Math.max(0, row.y - pad)
    fields.push({ field, x, y, width: Math.min(span, width - x), height: Math.min(height - y, row.height + pad * 2) })
  }
  add('name', head[0]); add('slot', head[1])
  if (body === null) {
    const split = Math.round(width * .6), padding = Math.ceil(rows[2].height * .6)
    add('mainName', rows[2], 0, split, padding)
    add('mainValue', rows[2], split, width - split, padding)
    add('level', rows[3], 0, Math.round(width * .35))
    rows.slice(4).forEach((row, index) => add(`sub${index}` as ArtifactField, row))
  } else {
    add('mainName', head[2], 0, Math.round(width * .45))
    add('mainValue', head[3], 0, Math.round(width * .65))
    add('level', rows[0], 0, Math.round(width * .35))
    rows.slice(1, 5).forEach((row, index) => add(`sub${index}` as ArtifactField, row))
  }
  add('set', set)
  return { layoutId: body === null ? 'equipment-panel' : 'inventory-card', width, height, fields }
}
export async function detectArtifactFieldLayout(detail: Blob): Promise<ArtifactFieldLayout | null> {
  const bitmap = await createImageBitmap(detail)
  try {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    context.drawImage(bitmap, 0, 0)
    return findArtifactFieldLayoutPixels(context.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height)
  } finally { bitmap.close() }
}
