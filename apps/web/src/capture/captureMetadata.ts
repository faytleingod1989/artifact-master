import { GAME_DATA } from '../artifacts/gameData'
export function parseEquippedCharacter(text: string): number | undefined {
  const compact = text.replace(/\s/g, '')
  const match = compact.match(/^([^\d]{1,24})已装备$/u)
  if (!match) return undefined
  const choices = Object.entries(GAME_DATA.characters).filter(([, value]) => value.name === match[1])
  return choices.length === 1 ? Number(choices[0][0]) : undefined
}
export function hasEquippedBannerInk(pixels: Uint8ClampedArray, width: number, height: number): boolean {
  if (width < 16 || height < 12 || pixels.length !== width * height * 4) return false
  const yStart = Math.floor(height * 0.18), yEnd = Math.ceil(height * 0.82)
  const xStart = Math.floor(width * 0.06), xEnd = Math.ceil(width * 0.94)
  const threshold = Math.max(18, Math.floor(width * height * 0.006))
  let transitions = 0
  for (let y = yStart; y < yEnd; y++) {
    let prevLuma = -1
    for (let x = xStart; x < xEnd; x++) {
      const i = (y * width + x) * 4
      const luma = (pixels[i] * 77 + pixels[i + 1] * 150 + pixels[i + 2] * 29) >> 8
      if (prevLuma >= 0 && Math.abs(luma - prevLuma) >= 26) {
        transitions++
        if (transitions >= threshold) return true
      }
      prevLuma = luma
    }
  }
  return false
}

export async function prepareEquippedFooter(image: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(image)
  try {
    if (bitmap.width / bitmap.height < 1.3) return null
    const x = Math.floor(bitmap.width * .70), y = Math.floor(bitmap.height * .78)
    const width = bitmap.width - x, height = Math.floor(bitmap.height * .12)
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true }) ?? canvas.getContext('2d'); if (!context) return null
    context.drawImage(bitmap, x, y, width, height, 0, 0, width, height)
    if (typeof context.getImageData === 'function' && !hasEquippedBannerInk(context.getImageData(0, 0, width, height).data, width, height)) {
      return null
    }
    return await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  } finally { bitmap.close() }
}
